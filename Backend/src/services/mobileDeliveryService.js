import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import {
  appEnv,
  isProduction,
  mobileDeliveryAllowedHosts,
  mobileDeliveryInternalToken,
  mobileDeliveryMode,
  mobileDeliveryProvider,
  mobileDeliveryWebhookUrl,
  mobileManualDir,
  mobilePreviewDir,
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber
} from '../config/env.js';
import { maskMobileNumber, normalizeMobileNumber } from '../utils/userDelivery.js';

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64) || 'mobile';

const writePayloadFile = async ({ directory, subject, destination, metadata, payload }) => {
  await fs.mkdir(directory, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${stamp}-${slugify(subject)}-${slugify(destination)}`;
  const targetPath = path.join(directory, `${baseName}.json`);
  await fs.writeFile(targetPath, JSON.stringify({
    app_env: appEnv,
    subject,
    destination,
    metadata,
    payload
  }, null, 2), 'utf8');
  return targetPath;
};

const validateAllowedWebhook = (url, allowedHosts) => {
  const webhookUrl = new URL(url);
  if (webhookUrl.protocol !== 'https:') {
    throw new Error('Mobile delivery webhook must use HTTPS.');
  }
  if (allowedHosts.length > 0 && !allowedHosts.includes(webhookUrl.hostname)) {
    throw new Error('Mobile delivery webhook host is not allowed.');
  }
  return webhookUrl;
};

const sendGenericWebhookMessage = async ({ to, subject, message, metadata, payload }) => {
  if (!mobileDeliveryWebhookUrl) {
    throw new Error('Mobile delivery webhook URL is not configured.');
  }

  validateAllowedWebhook(mobileDeliveryWebhookUrl, mobileDeliveryAllowedHosts);

  const response = await fetch(mobileDeliveryWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      channel: 'MOBILE',
      destination: to,
      subject,
      message,
      metadata,
      payload
    })
  });

  if (!response.ok) {
    throw new Error(`Mobile delivery webhook failed with status ${response.status}`);
  }

  return {
    status: 'SENT',
    provider: 'GENERIC_WEBHOOK'
  };
};

const sendTwilioMessage = async ({ to, message }) => {
  if (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber) {
    throw new Error('Twilio delivery requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
  }

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(twilioAccountSid)}/Messages.json`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      To: to,
      From: twilioFromNumber,
      Body: message
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Twilio delivery failed with status ${response.status}${errorText ? `: ${errorText}` : ''}`);
  }

  const payload = await response.json().catch(() => ({}));
  return {
    status: 'SENT',
    provider: 'TWILIO',
    providerMessageId: payload.sid || null
  };
};

const executeProviderDelivery = async ({ to, subject, message, metadata, payload }) => {
  if (mobileDeliveryProvider === 'TWILIO') {
    return sendTwilioMessage({ to, message, metadata, payload });
  }
  return sendGenericWebhookMessage({ to, subject, message, metadata, payload });
};

export const mobileDeliveryEndpointEnabled = () => Boolean(mobileDeliveryInternalToken);

export const deliverMobileMessage = async ({ to, subject, message, metadata = {}, payload = {} }) => {
  const normalizedMobile = normalizeMobileNumber(to);
  if (!normalizedMobile) {
    return {
      status: 'FAILED',
      channel: 'MOBILE',
      destination: String(to || ''),
      error: 'Mobile number is missing.'
    };
  }

  const maskedDestination = maskMobileNumber(normalizedMobile);

  if (mobileDeliveryMode === 'DISABLED') {
    logger.warn('Mobile delivery skipped because mode is disabled', {
      subject,
      destination: maskedDestination,
      ...metadata
    });
    return {
      status: 'SKIPPED',
      channel: 'MOBILE',
      destination: maskedDestination
    };
  }

  if (mobileDeliveryMode === 'PREVIEW') {
    const previewPath = await writePayloadFile({
      directory: mobilePreviewDir,
      subject,
      destination: normalizedMobile,
      metadata,
      payload: {
        message,
        ...payload
      }
    });
    logger.info('Mobile delivery preview generated', {
      subject,
      destination: maskedDestination,
      preview_path: previewPath,
      ...metadata
    });
    return {
      status: 'PREVIEWED',
      channel: 'MOBILE',
      destination: maskedDestination,
      previewPath
    };
  }

  if (mobileDeliveryMode === 'MANUAL') {
    const manualPath = await writePayloadFile({
      directory: mobileManualDir,
      subject,
      destination: normalizedMobile,
      metadata,
      payload: {
        message,
        ...payload
      }
    });
    logger.info('Manual mobile delivery package generated', {
      subject,
      destination: maskedDestination,
      manual_path: manualPath,
      ...metadata
    });
    return {
      status: 'MANUAL_REQUIRED',
      channel: 'MOBILE',
      destination: maskedDestination,
      manualPath
    };
  }

  const providerResult = await executeProviderDelivery({
    to: normalizedMobile,
    subject,
    message,
    metadata,
    payload
  });

  logger.info('Mobile delivery sent', {
    subject,
    destination: maskedDestination,
    provider: providerResult.provider,
    ...metadata
  });

  return {
    status: providerResult.status || 'SENT',
    channel: 'MOBILE',
    destination: maskedDestination,
    provider: providerResult.provider || mobileDeliveryProvider,
    providerMessageId: providerResult.providerMessageId || null
  };
};

export const getMobileDeliveryRuntime = () => ({
  mode: mobileDeliveryMode,
  provider: mobileDeliveryProvider,
  internal_endpoint_enabled: mobileDeliveryEndpointEnabled(),
  preview_only: mobileDeliveryMode === 'PREVIEW',
  manual_release: mobileDeliveryMode === 'MANUAL',
  live_delivery: ['WEBHOOK', 'PROVIDER'].includes(mobileDeliveryMode),
  production_safe: isProduction ? mobileDeliveryMode !== 'PREVIEW' : true
});
