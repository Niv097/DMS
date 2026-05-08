import crypto from 'crypto';
import prisma from './prisma.js';
import logger from './logger.js';
import { writeSecurityAudit } from './securityAudit.js';
import { sendLoginOtpEmail } from '../services/emailService.js';
import {
  otpCodeLength,
  otpDeliveryWebhookUrl,
  otpMaxVerifyAttempts,
  otpPreviewInResponse,
  otpResendCooldownMs,
  otpTtlMs,
  requiredJwtSecret
} from '../config/env.js';
import {
  describeDeliveryDestination,
  isSyntheticUserEmail,
  maskEmail,
  normalizeMobileNumber,
  resolveDeliveryChannels
} from './userDelivery.js';

const addMilliseconds = (date, milliseconds) => new Date(date.getTime() + milliseconds);

const hashOtpCode = (code) => crypto
  .createHmac('sha256', requiredJwtSecret || 'dms-otp')
  .update(String(code))
  .digest('hex');

const generateOtpCode = () => {
  const upperBound = 10 ** otpCodeLength;
  const lowerBound = 10 ** Math.max(otpCodeLength - 1, 0);
  return String(crypto.randomInt(lowerBound, upperBound)).padStart(otpCodeLength, '0');
};

const mapChallenge = (row) => row ? {
  id: row.id,
  userId: row.user_id,
  channel: row.channel,
  destination: row.destination,
  codeHash: row.code_hash,
  expiresAt: row.expires_at ? new Date(row.expires_at) : null,
  createdAt: row.created_at ? new Date(row.created_at) : null,
  lastSentAt: row.last_sent_at ? new Date(row.last_sent_at) : null,
  consumedAt: row.consumed_at ? new Date(row.consumed_at) : null,
  attemptCount: Number(row.attempt_count || 0),
  maxAttempts: Number(row.max_attempts || otpMaxVerifyAttempts)
} : null;

const findActiveChallengeForUser = async (userId, now = new Date()) => {
  const rows = await prisma.$queryRaw`
    SELECT *
    FROM "LoginOtpChallenge"
    WHERE "user_id" = ${userId}
      AND "consumed_at" IS NULL
      AND "expires_at" > ${now}
    ORDER BY "created_at" DESC
    LIMIT 1
  `;

  return mapChallenge(rows[0]);
};

const invalidateUserChallenges = async (userId) => {
  await prisma.$executeRaw`
    DELETE FROM "LoginOtpChallenge"
    WHERE "user_id" = ${userId}
  `;
};

const deliverOtp = async ({ user, code, challengeId }) => {
  const delivery = await sendLoginOtpEmail({ user, code, challengeId });
  const primaryChannel = String(delivery?.primary_channel || 'EMAIL').toUpperCase();
  const primaryDestination = delivery?.primary_destination
    || (primaryChannel === 'MOBILE' ? describeDeliveryDestination('MOBILE', user.mobile_number) : maskEmail(user.email));

  if (!['SENT', 'PARTIAL'].includes(String(delivery?.status || '').toUpperCase()) && !delivery?.channels?.some((item) => ['SENT', 'PREVIEWED'].includes(String(item.status || '').toUpperCase()))) {
    throw new Error(delivery?.summary || 'No OTP delivery channel is configured.');
  }

  logger.info('Login OTP issued', {
    challenge_id: challengeId,
    channel: primaryChannel,
    destination: primaryDestination,
    preview_available: otpPreviewInResponse || delivery?.channels?.some((item) => item.status === 'PREVIEWED')
  });

  writeSecurityAudit('LOGIN_OTP_SENT', {
    user_id: user.id,
    challenge_id: challengeId,
    channel: primaryChannel,
    destination: primaryDestination,
    delivery_summary: delivery?.summary || null,
    webhook_delivery_enabled: Boolean(otpDeliveryWebhookUrl || normalizeMobileNumber(user.mobile_number))
  });

  return delivery;
};

export const buildOtpRequestResponse = ({ previewCode, delivery }) => ({
  message: 'A one-time passcode has been sent if the account is eligible.',
  otpFallbackAvailable: true,
  delivery: {
    channel: String(delivery?.primary_channel || 'EMAIL').toUpperCase(),
    destination: delivery?.primary_destination || null,
    summary: delivery?.summary || null
  },
  ...(previewCode ? { otpPreviewCode: previewCode } : {})
});

export const createLoginOtpChallenge = async ({ user, now = new Date() }) => {
  const contactEmail = isSyntheticUserEmail(user.email) ? '' : String(user.email || '').trim().toLowerCase();
  const configuredChannels = resolveDeliveryChannels({
    email: contactEmail,
    mobileNumber: user.mobile_number,
    deliveryMode: user.credential_delivery_mode
  });
  const primaryConfiguredChannel = configuredChannels[0] || (normalizeMobileNumber(user.mobile_number) ? 'MOBILE' : 'EMAIL');
  const primaryConfiguredDestination = primaryConfiguredChannel === 'MOBILE'
    ? normalizeMobileNumber(user.mobile_number)
    : contactEmail;

  const existingChallenge = await findActiveChallengeForUser(user.id, now);
  if (existingChallenge?.lastSentAt) {
    const resendAvailableAt = addMilliseconds(existingChallenge.lastSentAt, otpResendCooldownMs);
    if (resendAvailableAt > now) {
      return {
        status: 'COOLDOWN',
        retryAvailableAt: resendAvailableAt,
        response: buildOtpRequestResponse({
          delivery: {
            primary_channel: primaryConfiguredChannel,
            primary_destination: primaryConfiguredChannel === 'MOBILE'
              ? describeDeliveryDestination('MOBILE', primaryConfiguredDestination)
              : maskEmail(primaryConfiguredDestination),
            summary: primaryConfiguredChannel === 'MOBILE'
              ? `Code already issued to mobile ${describeDeliveryDestination('MOBILE', primaryConfiguredDestination)}.`
              : `Code already issued to email ${maskEmail(primaryConfiguredDestination)}.`
          }
        })
      };
    }
  }

  await invalidateUserChallenges(user.id);

  const code = generateOtpCode();
  const challengeId = crypto.randomUUID();
  const expiresAt = addMilliseconds(now, otpTtlMs);

  await prisma.$executeRaw`
    INSERT INTO "LoginOtpChallenge"
      ("id", "user_id", "channel", "destination", "code_hash", "expires_at", "created_at", "last_sent_at", "attempt_count", "max_attempts")
    VALUES (
      CAST(${challengeId} AS uuid),
      ${user.id},
      ${primaryConfiguredChannel},
      ${primaryConfiguredDestination},
      ${hashOtpCode(code)},
      ${expiresAt},
      ${now},
      ${now},
      0,
      ${otpMaxVerifyAttempts}
    )
  `;

  const delivery = await deliverOtp({ user, code, challengeId });

  return {
    status: 'SENT',
    challengeId,
    expiresAt,
    response: buildOtpRequestResponse({
      delivery,
      previewCode: otpPreviewInResponse || delivery?.channels?.some((item) => item.status === 'PREVIEWED') ? code : undefined
    })
  };
};

export const verifyLoginOtpChallenge = async ({ user, code, now = new Date() }) => {
  const challenge = await findActiveChallengeForUser(user.id, now);

  if (!challenge) {
    return { valid: false, reason: 'OTP_NOT_FOUND', statusCode: 400, message: 'OTP expired or unavailable. Request a new code.' };
  }

  if (challenge.expiresAt <= now) {
    await invalidateUserChallenges(user.id);
    return { valid: false, reason: 'OTP_EXPIRED', statusCode: 400, message: 'OTP expired or unavailable. Request a new code.' };
  }

  if (challenge.attemptCount >= challenge.maxAttempts) {
    await invalidateUserChallenges(user.id);
    return { valid: false, reason: 'OTP_MAX_ATTEMPTS', statusCode: 423, message: 'OTP verification limit reached. Request a new code.' };
  }

  const incomingHash = hashOtpCode(code);
  if (incomingHash !== challenge.codeHash) {
    const nextAttemptCount = challenge.attemptCount + 1;
    if (nextAttemptCount >= challenge.maxAttempts) {
      await invalidateUserChallenges(user.id);
      writeSecurityAudit('LOGIN_OTP_FAILED', {
        user_id: user.id,
        challenge_id: challenge.id,
        reason: 'MAX_ATTEMPTS_REACHED'
      });
      return { valid: false, reason: 'OTP_MAX_ATTEMPTS', statusCode: 423, message: 'OTP verification limit reached. Request a new code.' };
    }

    await prisma.$executeRaw`
      UPDATE "LoginOtpChallenge"
      SET "attempt_count" = ${nextAttemptCount}
      WHERE "id" = CAST(${challenge.id} AS uuid)
    `;
    writeSecurityAudit('LOGIN_OTP_FAILED', {
      user_id: user.id,
      challenge_id: challenge.id,
      reason: 'INVALID_CODE',
      attempt_count: nextAttemptCount
    });
    return { valid: false, reason: 'INVALID_OTP', statusCode: 401, message: 'Invalid OTP. Try again.' };
  }

  await prisma.$executeRaw`
    UPDATE "LoginOtpChallenge"
    SET "consumed_at" = ${now}
    WHERE "id" = CAST(${challenge.id} AS uuid)
  `;

  writeSecurityAudit('LOGIN_OTP_VERIFIED', {
    user_id: user.id,
    challenge_id: challenge.id,
    channel: challenge.channel
  });

  return {
    valid: true,
    challenge
  };
};
