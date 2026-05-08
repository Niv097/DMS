import prisma from './prisma.js';
import { failedLoginLockDurationMs, failedLoginThreshold } from '../config/env.js';

const addMilliseconds = (date, milliseconds) => new Date(date.getTime() + milliseconds);
const isLoginTrackingCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('failed_attempts')
    || message.includes('lock_until')
    || message.includes('does not exist in the current database');
};

const readLoginTracking = async (userId) => {
  let rows = [];
  try {
    rows = await prisma.$queryRaw`
      SELECT "failed_attempts", "lock_until"
      FROM "User"
      WHERE "id" = ${userId}
    `;
  } catch (error) {
    if (!isLoginTrackingCompatibilityError(error)) throw error;
    return {
      failed_attempts: 0,
      lock_until: null
    };
  }

  const row = rows[0] || {};
  return {
    failed_attempts: Number(row.failed_attempts || 0),
    lock_until: row.lock_until ? new Date(row.lock_until) : null
  };
};

export const normalizeLoginTracking = async (user, now = new Date()) => {
  if (!user?.id) {
    return user;
  }

  const tracking = await readLoginTracking(user.id);
  const normalizedUser = {
    ...user,
    failed_attempts: tracking.failed_attempts,
    lock_until: tracking.lock_until
  };

  if (!normalizedUser.lock_until || normalizedUser.lock_until > now) {
    return normalizedUser;
  }

  await prisma.$executeRaw`
    UPDATE "User"
    SET "failed_attempts" = 0, "lock_until" = NULL
    WHERE "id" = ${user.id}
  `;

  return {
    ...normalizedUser,
    failed_attempts: 0,
    lock_until: null
  };
};

export const registerFailedLoginAttempt = async (user, now = new Date()) => {
  const tracking = await readLoginTracking(user.id);
  const currentAttempts = tracking.failed_attempts;
  const nextFailureCount = currentAttempts + 1;
  const shouldLock = nextFailureCount >= failedLoginThreshold;
  const lockUntil = shouldLock ? addMilliseconds(now, failedLoginLockDurationMs) : null;

  try {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "failed_attempts" = ${nextFailureCount}, "lock_until" = ${lockUntil}
      WHERE "id" = ${user.id}
    `;
  } catch (error) {
    if (!isLoginTrackingCompatibilityError(error)) throw error;
    return {
      failureCount: nextFailureCount,
      multipleFailedAttemptsDetected: shouldLock,
      isLocked: false,
      lockUntil: null
    };
  }

  return {
    failureCount: nextFailureCount,
    multipleFailedAttemptsDetected: shouldLock,
    isLocked: shouldLock,
    lockUntil
  };
};

export const clearFailedLoginAttempts = async (userId) => {
  try {
    await prisma.$executeRaw`
      UPDATE "User"
      SET "failed_attempts" = 0, "lock_until" = NULL
      WHERE "id" = ${userId}
    `;
  } catch (error) {
    if (!isLoginTrackingCompatibilityError(error)) throw error;
  }
};

export const isUserLocked = (user, now = new Date()) => Boolean(user?.lock_until && user.lock_until > now);
