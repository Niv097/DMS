import fs from 'fs/promises';
import path from 'path';
import nodemailer from 'nodemailer';
import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import {
  appEnv,
  appPublicBaseUrl,
  brandDisplayName,
  brandLogoUrl,
  brandShortCode,
  brandSubtitle,
  emailDeliveryMode,
  emailPreviewDir,
  otpTtlMs,
  smtpFromEmail,
  smtpFromName,
  smtpHost,
  smtpPass,
  smtpPort,
  smtpReplyTo,
  smtpSecure,
  smtpUser
} from '../config/env.js';
import {
  isSyntheticUserEmail,
  maskEmail,
  maskMobileNumber,
  normalizeDeliveryMode,
  resolveDeliveryChannels,
  summarizeDeliveryResults
} from '../utils/userDelivery.js';
import { buildTenantCredentialDeliverySummary, isTenantCredentialDeliveryEnabled } from '../utils/tenantAuthPolicy.js';
import { deliverMobileMessage } from './mobileDeliveryService.js';

const tenantBrandSelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  brand_display_name: true,
  brand_short_code: true,
  brand_logo_path: true,
  brand_subtitle: true,
  email_from_name: true,
  email_from_address: true,
  email_reply_to: true,
  credential_delivery_enabled: true,
  otp_login_enabled: true
};

let transportPromise = null;

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const slugify = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 64) || 'mail';

const formatMinutes = (milliseconds) => Math.max(1, Math.round(milliseconds / 60000));
const isDeliverySuccess = (status) => ['SENT', 'PREVIEWED'].includes(String(status || '').toUpperCase());

const resolveTenantBranding = async ({ tenantId = null, tenant = null } = {}) => {
  let resolvedTenant = tenant || null;

  if ((!resolvedTenant || !resolvedTenant.id) && tenantId) {
    resolvedTenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantBrandSelect
    }).catch(() => null);
  }

  const tenantLabel = String(
    resolvedTenant?.brand_display_name
    || resolvedTenant?.tenant_name
    || brandDisplayName
  ).trim() || brandDisplayName;

  const shortCode = String(
    resolvedTenant?.brand_short_code
    || resolvedTenant?.tenant_code
    || brandShortCode
  ).trim().toUpperCase() || brandShortCode;

  const subtitle = String(
    resolvedTenant?.brand_subtitle
    || brandSubtitle
  ).trim() || brandSubtitle;

  const logoUrl = resolvedTenant?.brand_logo_path && appPublicBaseUrl
    ? `${appPublicBaseUrl}/api/branding/logo/${resolvedTenant.id}`
    : (brandLogoUrl || '');
  const senderName = String(
    resolvedTenant?.email_from_name
    || smtpFromName
    || tenantLabel
  ).trim() || tenantLabel;
  const senderEmail = String(
    resolvedTenant?.email_from_address
    || smtpFromEmail
  ).trim();
  const replyTo = String(
    resolvedTenant?.email_reply_to
    || smtpReplyTo
    || ''
  ).trim();

  return {
    tenant: resolvedTenant,
    bankName: tenantLabel,
    shortCode,
    subtitle,
    logoUrl,
    senderName,
    senderEmail,
    replyTo
  };
};

const getTransport = async () => {
  if (emailDeliveryMode !== 'SMTP') return null;
  if (!transportPromise) {
    transportPromise = Promise.resolve(nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: smtpUser ? {
        user: smtpUser,
        pass: smtpPass
      } : undefined
    }));
  }
  return transportPromise;
};

const renderHtml = ({ branding, preheader, headline, greeting, intro, sections = [], footerNote = '' }) => {
  const sectionHtml = sections.map((section) => {
    const itemsHtml = (section.items || [])
      .map((item) => `
        <tr>
          <td style="padding:8px 0;color:#7184a0;font-size:13px;width:220px;vertical-align:top;">${escapeHtml(item.label)}</td>
          <td style="padding:8px 0;color:#17355e;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(item.value)}</td>
        </tr>
      `)
      .join('');

    return `
      <div style="margin:0 0 20px 0;padding:18px 20px;border:1px solid #d7e3f4;border-radius:12px;background:#f9fbff;">
        <div style="font-size:12px;letter-spacing:0.12em;font-weight:700;text-transform:uppercase;color:#6f82a0;margin:0 0 12px 0;">${escapeHtml(section.title)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${itemsHtml}</table>
      </div>
    `;
  }).join('');

  const logoBlock = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.bankName)}" style="max-height:40px;max-width:160px;display:block;margin:0 0 12px 0;object-fit:contain;" />`
    : '';

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(headline)}</title>
      </head>
      <body style="margin:0;padding:0;background:#f3f7fc;font-family:Segoe UI,Arial,sans-serif;color:#17355e;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || headline)}</div>
        <div style="max-width:720px;margin:0 auto;padding:28px 18px;">
          <div style="background:#ffffff;border:1px solid #d7e3f4;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(16,44,84,0.08);">
            <div style="background:linear-gradient(135deg,#153d78 0%,#234f97 100%);padding:26px 28px;color:#ffffff;">
              ${logoBlock}
              <div style="font-size:30px;font-weight:700;line-height:1.2;margin:0 0 6px 0;">${escapeHtml(branding.bankName)}</div>
              <div style="font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;">${escapeHtml(branding.subtitle)}</div>
            </div>
            <div style="padding:28px;">
              <div style="font-size:28px;font-weight:700;line-height:1.2;margin:0 0 10px 0;">${escapeHtml(headline)}</div>
              <div style="font-size:16px;line-height:1.6;margin:0 0 8px 0;">${escapeHtml(greeting)}</div>
              <div style="font-size:15px;line-height:1.7;color:#4f6483;margin:0 0 24px 0;">${escapeHtml(intro)}</div>
              ${sectionHtml}
              <div style="font-size:13px;line-height:1.7;color:#6c7d95;">${escapeHtml(footerNote)}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
};

const renderText = ({ branding, headline, greeting, intro, sections = [], footerNote = '' }) => {
  const sectionText = sections.map((section) => {
    const lines = (section.items || []).map((item) => `${item.label}: ${item.value}`);
    return `${section.title}\n${lines.join('\n')}`;
  }).join('\n\n');

  return [
    branding.bankName,
    branding.subtitle,
    '',
    headline,
    '',
    greeting,
    intro,
    '',
    sectionText,
    '',
    footerNote
  ].filter(Boolean).join('\n');
};

const writePreviewMail = async ({ subject, html, text, to, metadata }) => {
  await fs.mkdir(emailPreviewDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseName = `${stamp}-${slugify(subject)}-${slugify(Array.isArray(to) ? to.join('-') : to)}`;
  const targetPath = path.join(emailPreviewDir, `${baseName}.json`);
  await fs.writeFile(targetPath, JSON.stringify({
    app_env: appEnv,
    subject,
    to,
    metadata,
    text,
    html
  }, null, 2), 'utf8');
  return targetPath;
};

const sendMail = async ({ to, subject, html, text, metadata = {}, branding = null }) => {
  if (emailDeliveryMode === 'PREVIEW') {
    const previewPath = await writePreviewMail({ subject, html, text, to, metadata });
    logger.info('Email preview generated', { subject, to, preview_path: previewPath, ...metadata });
    return { status: 'PREVIEWED', previewPath };
  }

  if (emailDeliveryMode === 'DISABLED') {
    logger.warn('Email delivery skipped because mode is disabled', { subject, to, ...metadata });
    return { status: 'SKIPPED' };
  }

  const transport = await getTransport();
  const resolvedFromEmail = String(branding?.senderEmail || smtpFromEmail || '').trim();
  const resolvedFromName = String(branding?.senderName || smtpFromName || '').trim();
  const resolvedReplyTo = String(branding?.replyTo || smtpReplyTo || '').trim();
  const info = await transport.sendMail({
    from: resolvedFromName ? `"${resolvedFromName}" <${resolvedFromEmail}>` : resolvedFromEmail,
    to,
    replyTo: resolvedReplyTo || undefined,
    subject,
    text,
    html
  });

  logger.info('Email sent', { subject, to, message_id: info.messageId, ...metadata });
  return { status: 'SENT', messageId: info.messageId };
};

const sendMobileMessage = async ({ to, subject, message, metadata = {}, payload = {} }) => {
  return deliverMobileMessage({
    to,
    subject,
    message,
    metadata,
    payload
  });
};

const buildCredentialItems = ({ user, roleName, temporaryPassword, branchName }) => {
  const items = [
    { label: 'Name', value: user.name || user.email || 'User' },
    { label: 'Role', value: roleName || 'User' },
    { label: 'Temporary password', value: temporaryPassword },
    { label: 'Branch', value: branchName || 'Bank workspace' }
  ];

  if (user.username) items.splice(2, 0, { label: 'Username', value: user.username });
  if (user.employee_id) items.splice(user.username ? 3 : 2, 0, { label: 'Employee ID', value: user.employee_id });
  if (user.email) items.push({ label: 'Registered email', value: user.email });
  if (user.mobile_number) items.push({ label: 'Registered mobile', value: user.mobile_number });
  return items;
};

const buildDeliveryEnvelope = async ({
  user,
  tenant = null,
  subject,
  emailFactory = null,
  mobileFactory = null,
  metadata = {}
}) => {
  const branding = await resolveTenantBranding({ tenantId: user.tenant_id, tenant });
  if (!isTenantCredentialDeliveryEnabled(branding.tenant || tenant)) {
    return {
      branding,
      status: 'DISABLED',
      summary: buildTenantCredentialDeliverySummary(branding.tenant || tenant),
      channels: []
    };
  }
  const deliveryMode = normalizeDeliveryMode(user.credential_delivery_mode, 'EMAIL');
  const contactEmail = isSyntheticUserEmail(user.email) ? '' : String(user.email || '').trim().toLowerCase();
  const channels = resolveDeliveryChannels({
    email: contactEmail,
    mobileNumber: user.mobile_number,
    deliveryMode
  });

  if (!channels.length) {
    return {
      branding,
      status: 'FAILED',
      summary: 'No registered email or mobile number is available for this user.',
      channels: []
    };
  }

  const results = [];
  for (const channel of channels) {
    if (channel === 'EMAIL' && emailFactory && contactEmail) {
      const emailPayload = emailFactory(branding);
      const emailResult = await sendMail({
        to: contactEmail,
        subject: emailPayload.subject || subject,
        html: emailPayload.html,
        text: emailPayload.text,
        branding,
        metadata: {
          ...metadata,
          channel: 'EMAIL'
        }
      });
      results.push({
        channel: 'EMAIL',
        destination: maskEmail(contactEmail),
        status: emailResult.status,
        previewPath: emailResult.previewPath || null,
        messageId: emailResult.messageId || null
      });
      continue;
    }

    if (channel === 'MOBILE' && mobileFactory && user.mobile_number) {
      const mobilePayload = mobileFactory(branding);
      const mobileResult = await sendMobileMessage({
        to: user.mobile_number,
        subject: mobilePayload.subject || subject,
        message: mobilePayload.message,
        payload: mobilePayload.payload || {},
        metadata: {
          ...metadata,
          channel: 'MOBILE'
        }
      });
      results.push({
        channel: 'MOBILE',
        destination: maskMobileNumber(user.mobile_number),
        status: mobileResult.status,
        previewPath: mobileResult.previewPath || null
      });
    }
  }

  const deliveredCount = results.filter((item) => isDeliverySuccess(item.status)).length;
  const failedCount = results.filter((item) => item.status === 'FAILED').length;
  const status = deliveredCount > 0
    ? (failedCount > 0 ? 'PARTIAL' : 'SENT')
    : (results.some((item) => item.status === 'SKIPPED') ? 'SKIPPED' : 'FAILED');

  return {
    branding,
    status,
    summary: summarizeDeliveryResults(results),
    channels: results,
    primary_channel: results[0]?.channel || null,
    primary_destination: results[0]?.destination || null
  };
};

export const sendUserProvisioningEmail = async ({ user, tenant = null, roleName, temporaryPassword, branchName, createdByName = '' }) => {
  const metadata = { mail_type: 'USER_PROVISIONED', tenant_id: user.tenant_id, user_id: user.id };
  const emailIntro = 'Your administrator created your access profile. Use the temporary password below to sign in and complete your first password update.';
  return buildDeliveryEnvelope({
    user,
    tenant,
    subject: 'Banking workspace sign-in details',
    metadata,
    emailFactory: (branding) => ({
      subject: `${branding.bankName} sign-in details`,
      html: renderHtml({
        branding,
        preheader: `${branding.bankName} sign-in details`,
        headline: 'Your banking workspace credentials are ready',
        greeting: `Hello ${user.name || 'User'},`,
        intro: emailIntro,
        sections: [
          {
            title: 'Access details',
            items: buildCredentialItems({ user, roleName, temporaryPassword, branchName })
          }
        ],
        footerNote: createdByName
          ? `This access profile was issued by ${createdByName}. For security, update the password immediately after first sign-in.`
          : 'For security, update the password immediately after first sign-in.'
      }),
      text: renderText({
        branding,
        headline: 'Your banking workspace credentials are ready',
        greeting: `Hello ${user.name || 'User'},`,
        intro: emailIntro,
        sections: [
          {
            title: 'Access details',
            items: buildCredentialItems({ user, roleName, temporaryPassword, branchName })
          }
        ],
        footerNote: createdByName
          ? `Issued by ${createdByName}. Update the password immediately after first sign-in.`
          : 'Update the password immediately after first sign-in.'
      })
    }),
    mobileFactory: (branding) => ({
      subject: `${branding.bankName} sign-in details`,
      message: `${branding.bankName}: username ${user.username || user.employee_id || user.email}, temp password ${temporaryPassword}. Change it immediately after first sign-in.`,
      payload: {
        type: 'USER_PROVISIONED',
        bankName: branding.bankName,
        userName: user.name,
        username: user.username || user.employee_id || null,
        employeeId: user.employee_id || null,
        temporaryPassword,
        roleName: roleName || null,
        branchName: branchName || null,
        createdByName: createdByName || null
      }
    })
  });
};

export const sendTemporaryPasswordResetEmail = async ({ user, tenant = null, roleName, temporaryPassword, branchName, resetByName = '' }) => {
  const metadata = { mail_type: 'TEMP_PASSWORD_RESET', tenant_id: user.tenant_id, user_id: user.id };
  const emailIntro = 'A bank administrator reset your password. Sign in using the temporary password below and change it immediately.';
  return buildDeliveryEnvelope({
    user,
    tenant,
    subject: 'Banking workspace temporary password issued',
    metadata,
    emailFactory: (branding) => ({
      subject: `${branding.bankName} temporary password issued`,
      html: renderHtml({
        branding,
        preheader: `${branding.bankName} temporary password issued`,
        headline: 'Your password has been reset',
        greeting: `Hello ${user.name || 'User'},`,
        intro: emailIntro,
        sections: [
          {
            title: 'Temporary sign-in details',
            items: buildCredentialItems({ user, roleName, temporaryPassword, branchName })
          }
        ],
        footerNote: resetByName
          ? `The reset was performed by ${resetByName}. If you did not expect this action, contact your bank administrator immediately.`
          : 'If you did not expect this action, contact your bank administrator immediately.'
      }),
      text: renderText({
        branding,
        headline: 'Your password has been reset',
        greeting: `Hello ${user.name || 'User'},`,
        intro: emailIntro,
        sections: [
          {
            title: 'Temporary sign-in details',
            items: buildCredentialItems({ user, roleName, temporaryPassword, branchName })
          }
        ],
        footerNote: resetByName
          ? `Reset performed by ${resetByName}. If you did not expect this action, contact your bank administrator immediately.`
          : 'If you did not expect this action, contact your bank administrator immediately.'
      })
    }),
    mobileFactory: (branding) => ({
      subject: `${branding.bankName} temporary password issued`,
      message: `${branding.bankName}: your temporary password is ${temporaryPassword}. Username ${user.username || user.employee_id || user.email}. Change it immediately after sign-in.`,
      payload: {
        type: 'TEMP_PASSWORD_RESET',
        bankName: branding.bankName,
        userName: user.name,
        username: user.username || user.employee_id || null,
        employeeId: user.employee_id || null,
        temporaryPassword,
        roleName: roleName || null,
        branchName: branchName || null,
        resetByName: resetByName || null
      }
    })
  });
};

export const sendPasswordChangeConfirmationEmail = async ({
  user,
  tenant = null,
  branchName = '',
  context = 'PASSWORD_CHANGED'
}) => {
  const branding = await resolveTenantBranding({ tenantId: user.tenant_id, tenant });
  if (!isTenantCredentialDeliveryEnabled(branding.tenant || tenant)) {
    return {
      status: 'DISABLED',
      summary: buildTenantCredentialDeliverySummary(branding.tenant || tenant)
    };
  }
  if (!user?.email || isSyntheticUserEmail(user.email)) {
    return { status: 'SKIPPED' };
  }
  const isWelcome = context === 'FIRST_PASSWORD_SET';
  const subject = isWelcome
    ? `Welcome to ${branding.bankName}`
    : `${branding.bankName} password updated`;
  const html = renderHtml({
    branding,
    preheader: subject,
    headline: isWelcome ? 'Welcome to your banking workspace' : 'Your password has been updated',
    greeting: `Hello ${user.name || 'User'},`,
    intro: isWelcome
      ? 'Your access is now active. You successfully completed your first password update and can continue using the banking workspace.'
      : 'This confirms that your banking workspace password was updated successfully.',
    sections: [
      {
        title: 'Account summary',
        items: [
          { label: 'Name', value: user.name || user.email || 'User' },
          ...(user.username ? [{ label: 'Username', value: user.username }] : []),
          ...(user.employee_id ? [{ label: 'Employee ID', value: user.employee_id }] : []),
          { label: 'Branch', value: branchName || 'Bank workspace' }
        ]
      }
    ],
    footerNote: 'If you did not perform this action, contact your bank administrator immediately.'
  });
  const text = renderText({
    branding,
    headline: isWelcome ? 'Welcome to your banking workspace' : 'Your password has been updated',
    greeting: `Hello ${user.name || 'User'},`,
    intro: isWelcome
      ? 'Your access is now active. You successfully completed your first password update and can continue using the banking workspace.'
      : 'This confirms that your banking workspace password was updated successfully.',
    sections: [
      {
        title: 'Account summary',
        items: [
          { label: 'Name', value: user.name || user.email || 'User' },
          ...(user.username ? [{ label: 'Username', value: user.username }] : []),
          ...(user.employee_id ? [{ label: 'Employee ID', value: user.employee_id }] : []),
          { label: 'Branch', value: branchName || 'Bank workspace' }
        ]
      }
    ],
    footerNote: 'If you did not perform this action, contact your bank administrator immediately.'
  });
  return sendMail({
    to: user.email,
    subject,
    html,
    text,
    branding,
    metadata: { mail_type: context, tenant_id: user.tenant_id, user_id: user.id }
  });
};

export const sendLoginOtpEmail = async ({ user, tenant = null, code, challengeId }) => {
  const expiryMinutes = formatMinutes(otpTtlMs);
  return buildDeliveryEnvelope({
    user,
    tenant,
    subject: 'Banking workspace sign-in OTP',
    metadata: { mail_type: 'LOGIN_OTP', tenant_id: user.tenant_id, user_id: user.id, challenge_id: challengeId },
    emailFactory: (branding) => ({
      subject: `${branding.bankName} sign-in OTP`,
      html: renderHtml({
        branding,
        preheader: `${branding.bankName} sign-in OTP`,
        headline: 'Your one-time sign-in code',
        greeting: `Hello ${user.name || 'User'},`,
        intro: `Use the one-time passcode below to continue signing in. The code stays valid for ${expiryMinutes} minutes.`,
        sections: [
          {
            title: 'OTP details',
            items: [
              { label: 'One-time passcode', value: code },
              { label: 'Validity', value: `${expiryMinutes} minutes` },
              { label: 'Challenge reference', value: challengeId }
            ]
          }
        ],
        footerNote: 'If you request another OTP, only the latest code will continue to work.'
      }),
      text: renderText({
        branding,
        headline: 'Your one-time sign-in code',
        greeting: `Hello ${user.name || 'User'},`,
        intro: `Use the one-time passcode below to continue signing in. The code stays valid for ${expiryMinutes} minutes.`,
        sections: [
          {
            title: 'OTP details',
            items: [
              { label: 'One-time passcode', value: code },
              { label: 'Validity', value: `${expiryMinutes} minutes` },
              { label: 'Challenge reference', value: challengeId }
            ]
          }
        ],
        footerNote: 'If you request another OTP, only the latest code will continue to work.'
      })
    }),
    mobileFactory: (branding) => ({
      subject: `${branding.bankName} sign-in OTP`,
      message: `${branding.bankName}: OTP ${code} for secure sign-in. Valid for ${expiryMinutes} minutes. Ref ${challengeId}.`,
      payload: {
        type: 'LOGIN_OTP',
        bankName: branding.bankName,
        userName: user.name,
        code,
        challengeId,
        validityMinutes: expiryMinutes
      }
    })
  });
};

export const sendOperationalNotificationEmail = async ({
  user,
  tenant = null,
  subject,
  headline,
  intro,
  sections = [],
  footerNote = '',
  preheader = '',
  mailType = 'OPERATIONAL_ALERT'
}) => {
  const branding = await resolveTenantBranding({ tenantId: user.tenant_id, tenant });
  if (!isTenantCredentialDeliveryEnabled(branding.tenant || tenant)) {
    return {
      status: 'DISABLED',
      summary: buildTenantCredentialDeliverySummary(branding.tenant || tenant)
    };
  }
  if (!user?.email || isSyntheticUserEmail(user.email)) {
    return { status: 'SKIPPED' };
  }
  const resolvedSubject = String(subject || `${branding.bankName} operational alert`).trim();
  const resolvedHeadline = String(headline || 'Operational alert').trim();
  const resolvedIntro = String(intro || 'A new banking workspace update needs your attention.').trim();

  const html = renderHtml({
    branding,
    preheader: preheader || resolvedSubject,
    headline: resolvedHeadline,
    greeting: `Hello ${user.name || 'User'},`,
    intro: resolvedIntro,
    sections,
    footerNote: footerNote || 'Sign in to the banking workspace to review the latest action items.'
  });
  const text = renderText({
    branding,
    headline: resolvedHeadline,
    greeting: `Hello ${user.name || 'User'},`,
    intro: resolvedIntro,
    sections,
    footerNote: footerNote || 'Sign in to the banking workspace to review the latest action items.'
  });

  return sendMail({
    to: user.email,
    subject: resolvedSubject,
    html,
    text,
    branding,
    metadata: { mail_type: mailType, tenant_id: user.tenant_id, user_id: user.id }
  });
};

export const sendRoleAccessUpdatedEmail = async ({
  user,
  tenant = null,
  roleName = '',
  branchName = '',
  departmentName = '',
  verticalName = '',
  fmsEnabled = false,
  fmsPermissions = [],
  assignedByName = ''
}) => {
  const accessItems = [
    { label: 'Assigned role', value: roleName || 'User' },
    { label: 'Bank branch', value: branchName || 'Head Office' },
    { label: 'Department', value: departmentName || '-' },
    { label: 'Vertical', value: verticalName || '-' },
    { label: 'File management access', value: fmsEnabled ? 'Enabled' : 'Disabled' },
    { label: 'File permissions', value: Array.isArray(fmsPermissions) && fmsPermissions.length > 0 ? fmsPermissions.join(', ') : 'No explicit file permissions' }
  ];

  return sendOperationalNotificationEmail({
    user,
    tenant,
    subject: `${tenant?.brand_display_name || tenant?.tenant_name || brandDisplayName} role and access updated`,
    headline: 'Your banking role or access scope has changed',
    intro: 'A bank administrator updated your role, branch scope, or file-management permissions. Review the latest access profile below before continuing your work.',
    sections: [
      {
        title: 'Updated access profile',
        items: accessItems
      }
    ],
    footerNote: assignedByName
      ? `This access update was issued by ${assignedByName}. Sign in again if you do not see the latest menu, desk, or permissions.`
      : 'Sign in again if you do not see the latest menu, desk, or permissions.',
    mailType: 'ROLE_ACCESS_UPDATED'
  });
};

export const sendPendingWorkReminderEmail = async ({
  user,
  tenant = null,
  workflowItems = [],
  circularItems = [],
  unreadCount = 0,
  repeatWindowHours = 0
}) => {
  const sections = [];

  if (workflowItems.length > 0) {
    sections.push({
      title: 'Pending workflow actions',
      items: workflowItems.slice(0, 6).map((item) => ({
        label: item.note_id || item.reference || 'Workflow item',
        value: `${item.subject || 'Untitled file'} | ${item.workflow_state_label || item.workflow_state || 'Pending'} | ${item.queue_label || item.queue_code || 'Incoming'}`
      }))
    });
  }

  if (circularItems.length > 0) {
    sections.push({
      title: 'Pending circular actions',
      items: circularItems.slice(0, 6).map((item) => ({
        label: item.title || item.document_title || 'Controlled circular',
        value: `${item.instruction_type_label || item.instruction_type || 'For information'} | ${item.access_level_label || item.access_level || 'View'} | ${item.reference || item.document_reference || '-'}`
      }))
    });
  }

  if (unreadCount > 0) {
    sections.push({
      title: 'Unread alerts',
      items: [
        { label: 'Unread notifications', value: `${unreadCount} alert(s) are still waiting in your DMS alerts tray.` }
      ]
    });
  }

  return sendOperationalNotificationEmail({
    user,
    tenant,
    subject: `${tenant?.brand_display_name || tenant?.tenant_name || brandDisplayName} pending work reminder`,
    headline: 'Pending banking work still needs your attention',
    intro: repeatWindowHours > 0
      ? `Your pending items have remained open beyond the configured reminder window of ${repeatWindowHours} hour(s).`
      : 'Your pending banking workspace items still need your attention.',
    sections,
    footerNote: 'This reminder covers workflow files, controlled circular actions, and unread alerts that remain pending in your current bank scope.',
    mailType: 'PENDING_WORK_REMINDER'
  });
};
