import express from 'express';
import bcrypt from 'bcrypt';
import prisma from '../utils/prisma.js';
import authMiddleware from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileUpdateSchema,
  requestLoginOtpSchema,
  verifyLoginOtpSchema
} from '../validation/auth.js';
import {
  enforceSecureAuth,
  otpFallbackThreshold,
  otpLoginEnabled,
  passwordRotationDays,
  passwordResetRateLimitMax,
  passwordResetRateLimitWindowMs
} from '../config/env.js';
import {
  clearAuthCookie,
  clearCsrfCookie,
  extractTokenFromRequest,
  refreshCsrfCookie,
  setAuthCookie,
  signAuthToken,
  verifyAuthToken
} from '../utils/authToken.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import logger from '../utils/logger.js';
import { clearFailedLoginAttempts, isUserLocked, normalizeLoginTracking, registerFailedLoginAttempt } from '../utils/loginSecurity.js';
import { clearAuthenticatedSession, createAuthenticatedSession, updateAuthenticatedSession } from '../utils/sessionStore.js';
import { createLoginOtpChallenge, verifyLoginOtpChallenge } from '../utils/loginOtp.js';
import { buildFmsPermissionsPayload, hasGrantedFmsAccess } from '../services/fmsService.js';
import { sendPasswordChangeConfirmationEmail } from '../services/emailService.js';
import { isSyntheticUserEmail, normalizeDeliveryMode } from '../utils/userDelivery.js';
import { isTenantCredentialDeliveryEnabled, isTenantOtpLoginEnabled } from '../utils/tenantAuthPolicy.js';

const router = express.Router();
const selfServicePasswordResetLimiter = createRateLimiter({
  keyPrefix: 'self-service-password-reset',
  windowMs: passwordResetRateLimitWindowMs,
  maxRequests: passwordResetRateLimitMax,
  message: 'Too many password reset attempts. Please try again later.'
});

const setNoStore = (res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('Unknown argument `username`')
    || message.includes('Unknown field')
    || message.includes('Unknown argument `tenant`')
    || message.includes('Unknown argument `credential_delivery_enabled`')
    || message.includes('Unknown argument `otp_login_enabled`')
    || message.includes('Unknown argument `branch`')
    || message.includes('Unknown argument `branch_accesses`')
    || message.includes('Unknown argument `is_active`')
    || message.includes('Unknown argument `is_first_login`')
    || message.includes('Unknown argument `password_changed_at`')
    || message.includes('The column `Tenant.credential_delivery_enabled` does not exist')
    || message.includes('The column `Tenant.otp_login_enabled` does not exist')
    || message.includes('does not exist in the current database')
    || message.includes('Branch.city_id');
};

const legacyUserInclude = {
  role: true,
  department: true,
  vertical: true
};

const compatibilityUserInclude = {
  role: true,
  tenant: {
    select: {
      id: true,
      tenant_name: true,
      tenant_code: true
    }
  },
  department: true,
  vertical: true,
  branch_accesses: true
};

const fullUserInclude = {
  role: true,
  tenant: {
    select: {
      id: true,
      tenant_name: true,
      tenant_code: true,
      credential_delivery_enabled: true,
      otp_login_enabled: true
    }
  },
  branch: {
    select: {
      id: true,
      branch_name: true,
      branch_code: true,
      branch_address: true,
      tenant_id: true,
      city: {
        select: {
          city_name: true,
          state_name: true
        }
      }
    }
  },
  department: true,
  vertical: true,
  branch_accesses: {
    select: {
      branch_id: true
    }
  }
};

const normalizeUserShape = (user) => ({
  ...user,
  username: user.username ?? null,
  user_id: user.user_id ?? null,
  employee_id: user.employee_id ?? null,
  mobile_number: user.mobile_number ?? null,
  credential_delivery_mode: normalizeDeliveryMode(user.credential_delivery_mode, 'EMAIL'),
  date_of_birth: user.date_of_birth ?? null,
  tenant_id: user.tenant_id ?? null,
  branch_id: user.branch_id ?? null,
  is_active: user.is_active ?? true,
  is_first_login: user.is_first_login ?? false,
  must_change_password: user.must_change_password ?? user.is_first_login ?? false,
  temp_password_hash: user.temp_password_hash ?? null,
  password_changed_at: user.password_changed_at ?? null,
  failed_attempts: user.failed_attempts ?? 0,
  lock_until: user.lock_until ?? null,
  tenant: user.tenant ?? null,
  branch: user.branch ?? null,
  branch_accesses: user.branch_accesses ?? []
});

const normalizeEmployeeId = (value) => String(value || '').trim().toUpperCase();

const formatDob = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const isPasswordRotationExpired = (value) => {
  if (!value || !passwordRotationDays) return false;
  const changedAt = new Date(value);
  if (Number.isNaN(changedAt.getTime())) return false;
  const elapsedMs = Date.now() - changedAt.getTime();
  return elapsedMs >= passwordRotationDays * 24 * 60 * 60 * 1000;
};

const readUserSensitiveState = async (userId) => {
  try {
    const rows = await prisma.$queryRaw`
      SELECT "must_change_password", "temp_password_hash", "employee_id", "mobile_number", "credential_delivery_mode", "date_of_birth", "password_changed_at"
      FROM "User"
      WHERE "id" = ${userId}
    `;
    const row = rows[0] || {};
    return {
      must_change_password: row.must_change_password ?? false,
      temp_password_hash: row.temp_password_hash ?? null,
      employee_id: row.employee_id ?? null,
      mobile_number: row.mobile_number ?? null,
      credential_delivery_mode: normalizeDeliveryMode(row.credential_delivery_mode, 'EMAIL'),
      date_of_birth: row.date_of_birth ?? null,
      password_changed_at: row.password_changed_at ?? null
    };
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('must_change_password') && !message.includes('employee_id') && !message.includes('mobile_number') && !message.includes('credential_delivery_mode') && !message.includes('date_of_birth') && !message.includes('password_changed_at')) throw error;
    return {
      must_change_password: false,
      temp_password_hash: null,
      employee_id: null,
      mobile_number: null,
      credential_delivery_mode: 'EMAIL',
      date_of_birth: null,
      password_changed_at: null
    };
  }
};

const hydratePasswordResetState = async (user) => {
  if (!user?.id) return user;
  const resetState = await readUserSensitiveState(user.id);
  return normalizeUserShape({
    ...user,
    ...resetState
  });
};

const findUserForLogin = async (identifier) => {
  const employeeIdentifier = normalizeEmployeeId(identifier);
  try {
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { employee_id: employeeIdentifier }
        ]
      },
      include: fullUserInclude
    });
    if (user) {
      return hydratePasswordResetState(normalizeUserShape(user));
    }

    if (!identifier.includes('@')) {
      return null;
    }

    const emailMatches = await prisma.user.findMany({
      where: { email: identifier },
      include: fullUserInclude,
      take: 2
    });
    if (emailMatches.length !== 1) {
      return null;
    }
    return hydratePasswordResetState(normalizeUserShape(emailMatches[0]));
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;

    try {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: identifier },
            { employee_id: employeeIdentifier }
          ]
        },
        include: compatibilityUserInclude
      });
      if (user) {
        return hydratePasswordResetState(normalizeUserShape(user));
      }

      if (!identifier.includes('@')) {
        return null;
      }

      const emailMatches = await prisma.user.findMany({
        where: { email: identifier },
        include: compatibilityUserInclude,
        take: 2
      });
      if (emailMatches.length !== 1) {
        return null;
      }
      return hydratePasswordResetState(normalizeUserShape(emailMatches[0]));
    } catch (compatibilityError) {
      if (!isSchemaCompatibilityError(compatibilityError)) throw compatibilityError;

      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: identifier },
            { employee_id: employeeIdentifier }
          ]
        },
        include: legacyUserInclude
      });
      if (user) {
        return hydratePasswordResetState(normalizeUserShape(user));
      }

      if (!identifier.includes('@')) {
        return null;
      }

      const emailMatches = await prisma.user.findMany({
        where: { email: identifier },
        include: legacyUserInclude,
        take: 2
      });
      if (emailMatches.length !== 1) {
        return null;
      }
      return hydratePasswordResetState(normalizeUserShape(emailMatches[0]));
    }
  }
};

const findUserById = async (id) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
      include: fullUserInclude
    });
    return user ? hydratePasswordResetState(normalizeUserShape(user)) : null;
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;

    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: compatibilityUserInclude
      });
      return user ? hydratePasswordResetState(normalizeUserShape(user)) : null;
    } catch (compatibilityError) {
      if (!isSchemaCompatibilityError(compatibilityError)) throw compatibilityError;

      const user = await prisma.user.findUnique({
        where: { id },
        include: legacyUserInclude
      });
      return user ? hydratePasswordResetState(normalizeUserShape(user)) : null;
    }
  }
};

const buildAuthUser = (user) => {
  const grantedFmsAccess = Boolean(user?.has_granted_fms_access);
  const fmsPayload = buildFmsPermissionsPayload({
    ...user,
    has_granted_fms_access: grantedFmsAccess
  });
  const tenantCredentialDeliveryEnabled = isTenantCredentialDeliveryEnabled(user.tenant);
  const tenantOtpLoginEnabled = isTenantOtpLoginEnabled(user.tenant);
  return ({
  id: user.id,
  user_id: user.user_id,
  name: user.name,
  username: user.username,
  email: isSyntheticUserEmail(user.email) ? null : user.email,
  employee_id: user.employee_id,
  mobile_number: user.mobile_number ?? null,
  credential_delivery_mode: user.credential_delivery_mode ?? 'EMAIL',
  date_of_birth: formatDob(user.date_of_birth),
  role: user.role.name,
  department_id: user.department_id ?? user.department?.id ?? null,
  department: user.department?.name,
  vertical: user.vertical?.name,
  tenant_id: user.tenant_id,
  tenant_name: user.tenant?.tenant_name,
  tenant_code: user.tenant?.tenant_code,
  tenant_credential_delivery_enabled: tenantCredentialDeliveryEnabled,
  tenant_otp_login_enabled: tenantOtpLoginEnabled,
  branch_id: user.branch_id,
  branch_name: user.branch?.branch_name,
  branch_code: user.branch?.branch_code,
  branch_address: user.branch?.branch_address || null,
  branch_city_name: user.branch?.city?.city_name || null,
  branch_state_name: user.branch?.city?.state_name || null,
  is_active: user.is_active,
  is_first_login: user.is_first_login,
  must_change_password: user.must_change_password,
  accessible_branch_ids: user.branch_accesses?.map((item) => item.branch_id) || [],
  password_rotation_due: isPasswordRotationExpired(user.password_changed_at),
  fms_enabled: Boolean(user.fms_enabled),
  fms_permissions: fmsPayload.permissions,
  fms_owned_department_id: fmsPayload.ownedDepartmentId,
  has_granted_fms_access: grantedFmsAccess,
  has_fms_access: fmsPayload.hasFmsAccess
});
};

const buildPublicAuthCapabilities = (tenant = null) => {
  const credential_delivery_enabled = isTenantCredentialDeliveryEnabled(tenant);
  const otp_login_enabled = otpLoginEnabled && isTenantOtpLoginEnabled(tenant);
  return {
    credential_delivery_enabled,
    otp_login_enabled
  };
};

const findTenantByBankCode = async (bankCode) => {
  const normalizedCode = String(bankCode || '').trim().toUpperCase();
  if (!normalizedCode) return null;
  try {
    return await prisma.tenant.findFirst({
      where: {
        OR: [
          { tenant_code: normalizedCode },
          { brand_short_code: normalizedCode }
        ]
      },
      select: {
        id: true,
        tenant_name: true,
        tenant_code: true,
        credential_delivery_enabled: true,
        otp_login_enabled: true
      }
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
    return null;
  }
};

const withGrantedFmsAccess = async (user) => ({
  ...user,
  has_granted_fms_access: await hasGrantedFmsAccess({
    ...user,
    department_id: user.department_id ?? user.department?.id ?? null
  }).catch(() => false)
});

const withGrantedFmsAccessSafe = async (user) => {
  try {
    return await withGrantedFmsAccess(user);
  } catch (error) {
    logger.warn('FMS access hydration fallback applied', {
      user_id: user?.id,
      message: error.message
    });
    return {
      ...user,
      has_granted_fms_access: false
    };
  }
};

const buildToken = (user) => signAuthToken(
  {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role.name,
    tenant_id: user.tenant_id,
    branch_id: user.branch_id,
    is_first_login: user.is_first_login,
    must_change_password: user.must_change_password,
    sid: user.sid
  }
);

const isOtpRecoverySession = (authSession) => authSession?.assuranceLevel === 'otp_fallback';

const isPasswordChangeRequired = ({ user, authSession, assuranceLevel }) => Boolean(
  user?.must_change_password
  || user?.is_first_login
  || isPasswordRotationExpired(user?.password_changed_at)
  || assuranceLevel === 'otp_fallback'
  || isOtpRecoverySession(authSession)
);

const buildAuthContext = ({ user, authSession, assuranceLevel, authMethods, challengeRequired = false }) => ({
  assuranceLevel: assuranceLevel || authSession?.assuranceLevel || 'password',
  authMethods: authMethods || authSession?.authMethods || ['password'],
  stepUpEligible: authSession?.stepUpEligible ?? true,
  challengeRequired,
  recoveryMode: Boolean((assuranceLevel || authSession?.assuranceLevel) === 'otp_fallback'),
  passwordChangeRequired: isPasswordChangeRequired({ user, authSession, assuranceLevel })
});

const finalizeAuthenticatedLogin = async ({
  res,
  user,
  ip,
  authMethods = ['password'],
  assuranceLevel = 'password',
  multipleFailedAttemptsDetected = false
}) => {
  await clearFailedLoginAttempts(user.id);

  const session = await createAuthenticatedSession({
    userId: user.id,
    authMethods,
    assuranceLevel,
    stepUpEligible: true,
    multipleFailedAttemptsDetected
  });
  const effectiveUser = {
    ...user,
    must_change_password: isPasswordChangeRequired({ user, assuranceLevel })
  };
  const token = buildToken({
    ...effectiveUser,
    sid: session.sid
  });

  setAuthCookie(res, token);
  refreshCsrfCookie(res);
  setNoStore(res);
  try {
    writeSecurityAudit('LOGIN_SUCCESS', {
      user_id: user.id,
      role: user.role?.name,
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
      sid: session.sid,
      auth_methods: authMethods,
      assurance_level: assuranceLevel,
      multiple_failed_attempts_detected: multipleFailedAttemptsDetected,
      ip
    });
  } catch (error) {
    logger.warn('Security audit write failed during login success', {
      user_id: user.id,
      message: error.message
    });
  }

  const authContext = buildAuthContext({
    user: effectiveUser,
    authSession: session,
    assuranceLevel,
    authMethods: session.authMethods
  });
  const responseUser = await withGrantedFmsAccessSafe(effectiveUser);

  const payload = {
    requirePasswordChange: authContext.passwordChangeRequired,
    passwordChangeRequired: authContext.passwordChangeRequired,
    user: buildAuthUser(responseUser),
    authContext
  };

  if (!enforceSecureAuth) {
    payload.token = token;
  }

  setNoStore(res);
  return res.json(payload);
};

// Login route
router.post('/login', validateBody(loginSchema), async (req, res) => {
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const { password } = req.body;
  const now = new Date();

  try {
    const loginUser = await findUserForLogin(identifier);

    if (!loginUser) {
      writeSecurityAudit('LOGIN_FAILED', {
        identifier,
        reason: 'USER_NOT_FOUND',
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = await normalizeLoginTracking(loginUser, now);

    if (user.is_active === false) {
      writeSecurityAudit('LOGIN_BLOCKED', {
        user_id: user.id,
        identifier,
        reason: 'INACTIVE_ACCOUNT',
        ip: req.ip
      });
      return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });
    }

    const isValidPrimaryPassword = await bcrypt.compare(password, user.password_hash);
    const isValidTemporaryPassword = user.temp_password_hash
      ? await bcrypt.compare(password, user.temp_password_hash)
      : false;
    const isValidPassword = isValidPrimaryPassword || isValidTemporaryPassword;

    if (!isValidPassword) {
      if (isUserLocked(user, now)) {
        writeSecurityAudit('LOGIN_BLOCKED', {
          user_id: user.id,
          identifier,
          reason: 'ACCOUNT_LOCKED',
          failed_attempts: user.failed_attempts,
          lock_until: user.lock_until,
          ip: req.ip
        });
      return res.status(423).json({
          error: 'Multiple failed attempts detected',
          otpFallbackAvailable: otpLoginEnabled && isTenantOtpLoginEnabled(user.tenant)
        });
      }

      const failedState = await registerFailedLoginAttempt(user, now);
      writeSecurityAudit('LOGIN_FAILED', {
        user_id: user.id,
        identifier,
        failure_count: failedState.failureCount,
        multiple_failed_attempts_detected: failedState.multipleFailedAttemptsDetected,
        reason: 'INVALID_PASSWORD',
        ip: req.ip
      });
      return res.status(401).json({
        error: failedState.multipleFailedAttemptsDetected
          ? 'Multiple failed attempts detected'
          : 'Invalid username or password',
        otpFallbackAvailable: otpLoginEnabled && isTenantOtpLoginEnabled(user.tenant) && failedState.failureCount >= otpFallbackThreshold
      });
    }

    const multipleFailedAttemptsDetected = Number(user.failed_attempts || 0) >= 1 || isUserLocked(user, now);
    return finalizeAuthenticatedLogin({
      res,
      user,
      ip: req.ip,
      authMethods: ['password'],
      assuranceLevel: isValidTemporaryPassword ? 'temporary_password' : 'password',
      multipleFailedAttemptsDetected
    });
  } catch (error) {
    logger.error('Login error', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/capabilities', async (req, res) => {
  try {
    const identifier = String(req.query.identifier || '').trim().toLowerCase();
    const bankCode = String(req.query.bank || '').trim();
    let tenant = null;

    if (identifier) {
      const loginUser = await findUserForLogin(identifier);
      tenant = loginUser?.tenant || null;
    } else if (bankCode) {
      tenant = await findTenantByBankCode(bankCode);
    }

    return res.json(buildPublicAuthCapabilities(tenant));
  } catch (error) {
    logger.warn('Auth capabilities lookup failed', { message: error.message });
    return res.json(buildPublicAuthCapabilities(null));
  }
});

router.post('/otp/request', validateBody(requestLoginOtpSchema), async (req, res) => {
  if (!otpLoginEnabled) {
    return res.status(404).json({ error: 'OTP sign-in is not enabled.' });
  }

  const identifier = String(req.body.identifier || '').trim().toLowerCase();

  try {
    const loginUser = await findUserForLogin(identifier);
    if (!loginUser || loginUser.is_active === false) {
      writeSecurityAudit('LOGIN_OTP_REQUESTED', {
        identifier,
        eligible: false,
        reason: loginUser ? 'INACTIVE_ACCOUNT' : 'USER_NOT_FOUND',
        ip: req.ip
      });
      return res.json({
        message: 'A one-time passcode has been sent if the account is eligible.',
        otpFallbackAvailable: true
      });
    }

    if (!isTenantOtpLoginEnabled(loginUser.tenant)) {
      return res.status(404).json({ error: 'OTP sign-in is disabled for this bank.' });
    }

    const user = await normalizeLoginTracking(loginUser, new Date());
    const otpState = await createLoginOtpChallenge({ user });
    writeSecurityAudit('LOGIN_OTP_REQUESTED', {
      user_id: user.id,
      identifier,
      eligible: true,
      otp_status: otpState.status,
      ip: req.ip
    });

    return res.json(otpState.response);
  } catch (error) {
    logger.error('OTP request error', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Unable to issue OTP right now.' });
  }
});

router.post('/otp/verify', validateBody(verifyLoginOtpSchema), async (req, res) => {
  if (!otpLoginEnabled) {
    return res.status(404).json({ error: 'OTP sign-in is not enabled.' });
  }

  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const code = String(req.body.code || '').trim();

  try {
    const loginUser = await findUserForLogin(identifier);
    if (!loginUser) {
      writeSecurityAudit('LOGIN_OTP_FAILED', {
        identifier,
        reason: 'USER_NOT_FOUND',
        ip: req.ip
      });
      return res.status(401).json({ error: 'Invalid OTP. Try again.' });
    }

    if (!isTenantOtpLoginEnabled(loginUser.tenant)) {
      return res.status(404).json({ error: 'OTP sign-in is disabled for this bank.' });
    }

    const user = await normalizeLoginTracking(loginUser, new Date());
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Account is inactive. Contact your administrator.' });
    }

    const verification = await verifyLoginOtpChallenge({ user, code });
    if (!verification.valid) {
      return res.status(verification.statusCode).json({ error: verification.message });
    }

    return finalizeAuthenticatedLogin({
      res,
      user,
      ip: req.ip,
      authMethods: ['otp'],
      assuranceLevel: 'otp_fallback',
      multipleFailedAttemptsDetected: true
    });
  } catch (error) {
    logger.error('OTP verification error', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Unable to verify OTP right now.' });
  }
});

router.post('/forgot-password/reset', selfServicePasswordResetLimiter, validateBody(forgotPasswordSchema), async (req, res) => {
  const genericError = 'Unable to reset password with the provided details.';
  const identifier = String(req.body.identifier || '').trim().toLowerCase();
  const employeeId = normalizeEmployeeId(req.body.employee_id);
  const dob = String(req.body.date_of_birth || '').trim();

  try {
    const loginUser = await findUserForLogin(identifier);
    if (!loginUser || loginUser.is_active === false) {
      writeSecurityAudit('SELF_SERVICE_PASSWORD_RESET_FAILED', {
        identifier,
        reason: loginUser ? 'INACTIVE_ACCOUNT' : 'USER_NOT_FOUND',
        ip: req.ip
      });
      return res.status(400).json({ error: genericError });
    }

    const user = await hydratePasswordResetState(loginUser);
    const employeeMatches = normalizeEmployeeId(user.employee_id) === employeeId;
    const dobMatches = formatDob(user.date_of_birth) === dob;

    if (!employeeMatches || !dobMatches) {
      writeSecurityAudit('SELF_SERVICE_PASSWORD_RESET_FAILED', {
        user_id: user.id,
        identifier,
        reason: 'IDENTITY_MISMATCH',
        ip: req.ip
      });
      return res.status(400).json({ error: genericError });
    }

    const passwordHash = await bcrypt.hash(String(req.body.new_password), 12);
    await prisma.$executeRaw`
      UPDATE "User"
      SET "password_hash" = ${passwordHash},
          "temp_password_hash" = NULL,
          "must_change_password" = FALSE,
          "is_first_login" = FALSE,
          "password_changed_at" = NOW(),
          "failed_attempts" = 0,
          "lock_until" = NULL
      WHERE "id" = ${user.id}
    `;

    await prisma.$executeRaw`
      DELETE FROM "Session"
      WHERE "user_id" = ${user.id}
    `.catch(() => {});
    writeSecurityAudit('SELF_SERVICE_PASSWORD_RESET_SUCCESS', {
      user_id: user.id,
      identifier,
      tenant_id: user.tenant_id,
      branch_id: user.branch_id,
      ip: req.ip
    });

    await sendPasswordChangeConfirmationEmail({
      user: {
        id: user.id,
        tenant_id: user.tenant_id,
        name: user.name,
        email: user.email,
        username: user.username,
        employee_id: user.employee_id
      },
      tenant: user.tenant,
      branchName: user.branch?.branch_name,
      context: 'SELF_SERVICE_RESET'
    }).catch((mailError) => {
      logger.warn('Password reset success email failed', {
        message: mailError.message,
        user_id: user.id
      });
    });

    setNoStore(res);
    return res.json({ message: 'Password reset successfully. Please sign in with your new password.' });
  } catch (error) {
    logger.error('Self-service password reset error', { message: error.message, stack: error.stack });
    return res.status(500).json({ error: 'Unable to reset password right now.' });
  }
});

// Get current user profile
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const effectiveUser = {
      ...user,
      must_change_password: isPasswordChangeRequired({ user, authSession: req.authSession })
    };
    const responseUser = await withGrantedFmsAccessSafe(effectiveUser);

    setNoStore(res);
    res.json({
      user: buildAuthUser(responseUser),
      authContext: buildAuthContext({
        user: responseUser,
        authSession: req.authSession
      })
    });
  } catch (error) {
    logger.error('Profile fetch error', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Unable to load profile.' });
  }
});

// Update current user profile
router.put('/me', authMiddleware, validateBody(profileUpdateSchema), async (req, res) => {
  const { name, email, username, password, date_of_birth } = req.body;

  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const cleanName = String(name || '').trim();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanName) return res.status(400).json({ error: 'Name is required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const cleanUsername = String(username || user.username || cleanEmail.split('@')[0]).trim().toLowerCase();
    let duplicate;

    try {
      duplicate = await prisma.user.findFirst({
        where: {
          OR: [
            { username: cleanUsername },
            { employee_id: normalizeEmployeeId(cleanUsername) }
          ],
          NOT: { id: req.user.id }
        }
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      duplicate = await prisma.user.findFirst({
        where: {
          username: cleanUsername,
          NOT: { id: req.user.id }
        }
      });
    }

    if (duplicate) return res.status(409).json({ error: 'Username is already used by another user' });

    const data = {
      name: cleanName,
      email: cleanEmail
    };

    if ('username' in user) {
      data.username = cleanUsername;
    }

    if (password) {
      return res.status(400).json({ error: 'Use the change password endpoint to update your password.' });
    }

    if (date_of_birth) {
      const currentDob = formatDob(user.date_of_birth);
      if (currentDob && currentDob !== date_of_birth) {
        return res.status(400).json({ error: 'Date of birth is already set. Contact administrator to change it.' });
      }
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data
    });

    if (date_of_birth) {
      await prisma.$executeRaw`
        UPDATE "User"
        SET "date_of_birth" = CAST(${date_of_birth} AS date)
        WHERE "id" = ${req.user.id} AND "date_of_birth" IS NULL
      `;
    }

    const updated = await findUserById(req.user.id);
    refreshCsrfCookie(res);
    const token = buildToken({
      ...updated,
      sid: req.authSession?.sid
    });
    setAuthCookie(res, token);
    setNoStore(res);
    writeSecurityAudit('PROFILE_UPDATED', {
      user_id: updated.id,
      tenant_id: updated.tenant_id,
      branch_id: updated.branch_id,
      updated_password: Boolean(password)
    });

    const payload = {
      user: buildAuthUser(await withGrantedFmsAccessSafe(updated)),
    };
    setNoStore(res);
    if (!enforceSecureAuth) {
      payload.token = token;
    }

    res.json(payload);
  } catch (error) {
    logger.error('Profile update error', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Unable to update profile.' });
  }
});

router.post('/change-password', authMiddleware, validateBody(changePasswordSchema), async (req, res) => {
  const { current_password, new_password } = req.body;

  try {
    const user = await findUserById(req.user.id);

    if (!user) return res.status(404).json({ error: 'User not found' });

    const recoverySession = isOtpRecoverySession(req.authSession) && isPasswordChangeRequired({ user, authSession: req.authSession });
    const submittedCurrentPassword = String(current_password || '');
    const validCurrent = submittedCurrentPassword
      ? await bcrypt.compare(submittedCurrentPassword, user.password_hash)
      : false;
    const validTemporary = submittedCurrentPassword && user.temp_password_hash
      ? await bcrypt.compare(submittedCurrentPassword, user.temp_password_hash)
      : false;
    const hasAcceptedRecoveryProof = recoverySession && !submittedCurrentPassword;

    if (!validCurrent && !validTemporary && !hasAcceptedRecoveryProof) {
      writeSecurityAudit('PASSWORD_CHANGE_FAILED', {
        user_id: user.id,
        reason: recoverySession ? 'RECOVERY_SESSION_REQUIRES_NEW_PASSWORD' : 'INVALID_CURRENT_OR_TEMP_PASSWORD',
        ip: req.ip
      });
      return res.status(400).json({
        error: recoverySession
          ? 'Your OTP recovery session is valid. Enter a new password to continue.'
          : 'Current or temporary password is incorrect.'
      });
    }

    const password_hash = await bcrypt.hash(String(new_password), 10);
    await prisma.$executeRaw`
      UPDATE "User"
      SET "password_hash" = ${password_hash},
          "temp_password_hash" = NULL,
          "must_change_password" = FALSE,
          "is_first_login" = FALSE,
          "password_changed_at" = NOW()
      WHERE "id" = ${user.id}
    `;

    const updatedSession = req.authSession?.sid
      ? await updateAuthenticatedSession(req.authSession.sid, {
        assuranceLevel: 'password',
        authMethods: recoverySession ? ['otp', 'password_reset'] : req.authSession.authMethods,
        multipleFailedAttemptsDetected: false
      })
      : null;

    const updated = await findUserById(user.id);
    refreshCsrfCookie(res);
    const token = buildToken({
      ...updated,
      sid: updatedSession?.sid || req.authSession?.sid
    });
    setAuthCookie(res, token);
    writeSecurityAudit('PASSWORD_CHANGED', {
      user_id: updated.id,
      tenant_id: updated.tenant_id,
      branch_id: updated.branch_id,
      first_login_completed: user.is_first_login === true,
      recovery_session_completed: recoverySession,
      ip: req.ip
    });

    await sendPasswordChangeConfirmationEmail({
      user: {
        id: updated.id,
        tenant_id: updated.tenant_id,
        name: updated.name,
        email: updated.email,
        username: updated.username,
        employee_id: updated.employee_id
      },
      tenant: updated.tenant,
      branchName: updated.branch?.branch_name,
      context: user.is_first_login === true ? 'FIRST_PASSWORD_SET' : 'PASSWORD_CHANGED'
    }).catch((mailError) => {
      logger.warn('Password change confirmation email failed', {
        message: mailError.message,
        user_id: updated.id
      });
    });

    const effectiveUser = {
      ...updated,
      must_change_password: false
    };
    const authContext = buildAuthContext({
      user: effectiveUser,
      authSession: updatedSession || req.authSession,
      assuranceLevel: updatedSession?.assuranceLevel
    });
    const responseUser = await withGrantedFmsAccessSafe(effectiveUser);
    const payload = {
      message: 'Password updated successfully.',
      user: buildAuthUser(responseUser),
      authContext
    };
    setNoStore(res);
    if (!enforceSecureAuth) {
      payload.token = token;
    }

    res.json(payload);
  } catch (error) {
    logger.error('Change password error', { message: error.message, stack: error.stack });
    res.status(500).json({ error: 'Unable to change password.' });
  }
});

router.post('/logout', (req, res) => {
  try {
    const logoutReason = String(req.body?.reason || req.query?.reason || 'manual').trim().toUpperCase();
    const token = extractTokenFromRequest(req);
    if (token) {
      const decoded = verifyAuthToken(token);
      writeSecurityAudit(logoutReason === 'INACTIVITY' ? 'SESSION_CLIENT_IDLE_LOGOUT' : 'AUTH_LOGOUT', {
        user_id: decoded?.id,
        role: decoded?.role,
        tenant_id: decoded?.tenant_id,
        branch_id: decoded?.branch_id,
        sid: decoded?.sid,
        reason: logoutReason,
        ip: req.ip
      });
      clearAuthenticatedSession(decoded?.sid).catch((error) => {
        logger.warn('Session cleanup during logout failed', { message: error.message });
      });
    }
  } catch {
    // Ignore logout token parsing errors and still clear the cookie.
  }
  clearAuthCookie(res);
  clearCsrfCookie(res);
  res.json({ message: 'Signed out successfully.' });
});

export default router;
