import crypto from 'crypto';
import prisma from './prisma.js';
import { sessionCleanupIntervalMs, sessionInactivityTimeoutMs } from '../config/env.js';

const addMilliseconds = (date, milliseconds) => new Date(date.getTime() + milliseconds);
const isSessionSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('auth_methods')
    || message.includes('assurance_level')
    || message.includes('step_up_eligible')
    || message.includes('multiple_failed_attempts_detected')
    || message.includes('does not exist in the current database')
    || message.includes('Unknown argument')
    || message.includes('Unknown field');
};

const parseAuthMethods = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : ['password'];
    } catch {
      return ['password'];
    }
  }
  return ['password'];
};

const mapSession = (session) => ({
  sid: session.id,
  userId: session.user_id,
  createdAt: session.created_at,
  lastActivityAt: session.last_activity,
  expiresAt: session.expires_at,
  authMethods: parseAuthMethods(session.auth_methods),
  assuranceLevel: session.assurance_level || 'password',
  stepUpEligible: session.step_up_eligible ?? true,
  multipleFailedAttemptsDetected: session.multiple_failed_attempts_detected ?? false
});

export const createAuthenticatedSession = async ({
  userId,
  authMethods = ['password'],
  assuranceLevel = 'password',
  stepUpEligible = true,
  multipleFailedAttemptsDetected = false,
  now = new Date()
}) => {
  const session = {
    id: crypto.randomUUID(),
    user_id: userId,
    created_at: now,
    last_activity: now,
    expires_at: addMilliseconds(now, sessionInactivityTimeoutMs),
    auth_methods: authMethods,
    assurance_level: assuranceLevel,
    step_up_eligible: stepUpEligible,
    multiple_failed_attempts_detected: multipleFailedAttemptsDetected
  };

  try {
    await prisma.$executeRaw`
      INSERT INTO "Session"
        ("id", "user_id", "last_activity", "expires_at", "created_at", "auth_methods", "assurance_level", "step_up_eligible", "multiple_failed_attempts_detected")
      VALUES (
        CAST(${session.id} AS uuid),
        ${session.user_id},
        ${session.last_activity},
        ${session.expires_at},
        ${session.created_at},
        CAST(${JSON.stringify(authMethods)} AS jsonb),
        ${session.assurance_level},
        ${session.step_up_eligible},
        ${session.multiple_failed_attempts_detected}
      )
    `;
  } catch (error) {
    if (!isSessionSchemaCompatibilityError(error)) throw error;

    await prisma.$executeRaw`
      INSERT INTO "Session"
        ("id", "user_id", "last_activity", "expires_at", "created_at")
      VALUES (
        CAST(${session.id} AS uuid),
        ${session.user_id},
        ${session.last_activity},
        ${session.expires_at},
        ${session.created_at}
      )
    `;
  }

  return mapSession(session);
};

export const touchAuthenticatedSession = async (sid, now = new Date()) => {
  if (!sid) {
    return { valid: false, reason: 'MISSING_SESSION' };
  }

  const existingRows = await prisma.$queryRaw`
    SELECT *
    FROM "Session"
    WHERE "id" = CAST(${String(sid)} AS uuid)
  `;
  const existing = existingRows[0];

  if (!existing) {
    return { valid: false, reason: 'SESSION_NOT_FOUND' };
  }

  if (new Date(existing.expires_at) <= now) {
    await prisma.$executeRaw`
      DELETE FROM "Session"
      WHERE "id" = CAST(${String(sid)} AS uuid)
    `;
    return { valid: false, reason: 'SESSION_IDLE_TIMEOUT' };
  }

  const updatedRows = await prisma.$queryRaw`
    UPDATE "Session"
    SET "last_activity" = ${now}, "expires_at" = ${addMilliseconds(now, sessionInactivityTimeoutMs)}
    WHERE "id" = CAST(${String(sid)} AS uuid)
    RETURNING *
  `;
  const updated = updatedRows[0];

  return { valid: true, session: mapSession(updated) };
};

export const clearAuthenticatedSession = async (sid) => {
  if (!sid) return;

  await prisma.$executeRaw`
    DELETE FROM "Session"
    WHERE "id" = CAST(${String(sid)} AS uuid)
  `;
};

export const updateAuthenticatedSession = async (sid, updates = {}) => {
  if (!sid) return null;

  const nextAuthMethods = Array.isArray(updates.authMethods) ? updates.authMethods : undefined;
  const nextAssuranceLevel = typeof updates.assuranceLevel === 'string' ? updates.assuranceLevel : undefined;
  const nextStepUpEligible = typeof updates.stepUpEligible === 'boolean' ? updates.stepUpEligible : undefined;
  const nextMultipleFailedAttemptsDetected = typeof updates.multipleFailedAttemptsDetected === 'boolean'
    ? updates.multipleFailedAttemptsDetected
    : undefined;
  const now = updates.now instanceof Date ? updates.now : new Date();

  let rows;
  try {
    rows = await prisma.$queryRaw`
      UPDATE "Session"
      SET
        "last_activity" = ${now},
        "expires_at" = ${addMilliseconds(now, sessionInactivityTimeoutMs)},
        "auth_methods" = CASE
          WHEN ${nextAuthMethods ? JSON.stringify(nextAuthMethods) : null} IS NULL THEN "auth_methods"
          ELSE CAST(${nextAuthMethods ? JSON.stringify(nextAuthMethods) : null} AS jsonb)
        END,
        "assurance_level" = COALESCE(${nextAssuranceLevel ?? null}, "assurance_level"),
        "step_up_eligible" = COALESCE(${nextStepUpEligible ?? null}, "step_up_eligible"),
        "multiple_failed_attempts_detected" = COALESCE(${nextMultipleFailedAttemptsDetected ?? null}, "multiple_failed_attempts_detected")
      WHERE "id" = CAST(${String(sid)} AS uuid)
      RETURNING *
    `;
  } catch (error) {
    if (!isSessionSchemaCompatibilityError(error)) throw error;
    rows = await prisma.$queryRaw`
      UPDATE "Session"
      SET
        "last_activity" = ${now},
        "expires_at" = ${addMilliseconds(now, sessionInactivityTimeoutMs)}
      WHERE "id" = CAST(${String(sid)} AS uuid)
      RETURNING *
    `;
  }

  return rows[0] ? mapSession(rows[0]) : null;
};

export const cleanupExpiredSessions = async (now = new Date()) => {
  const count = await prisma.$executeRaw`
    DELETE FROM "Session"
    WHERE "expires_at" <= ${now}
  `;

  return { count: Number(count || 0) };
};

export const startSessionCleanupJob = (logger) => {
  const timer = setInterval(async () => {
    try {
      const result = await cleanupExpiredSessions();
      if (result.count > 0) {
        logger.info('Expired sessions removed', { count: result.count });
      }
    } catch (error) {
      logger.error('Session cleanup failed', { message: error.message, stack: error.stack });
    }
  }, sessionCleanupIntervalMs);

  timer.unref?.();
  return timer;
};
