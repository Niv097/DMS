import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { Prisma } from '@prisma/client';
import prisma from '../utils/prisma.js';
import { createNotification } from '../services/notificationService.js';
import {
  sendRoleAccessUpdatedEmail,
  sendTemporaryPasswordResetEmail,
  sendUserProvisioningEmail
} from '../services/emailService.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import { getUserFmsPermissions, getUserOwnedFmsDepartmentId, hasGrantedFmsAccess, normalizeFmsPermissionsInput } from '../services/fmsService.js';
import { ensureStoredParentDir, resolveStoredPath, sanitizeStorageFileName, sanitizeStorageSegment, toStoredRelativePath } from '../utils/storage.js';
import { brandWatermarkText, deploymentLabel, deploymentSiteRole, requiredJwtSecret } from '../config/env.js';
import {
  computeBackupNextDueAt,
  normalizeBackupFrequency,
  normalizeBackupWindowHour,
  normalizeBackupWindowMinute
} from '../utils/backupPolicy.js';
import {
  buildSyntheticUserEmail,
  isValidMobileNumber,
  isSyntheticUserEmail,
  normalizeDeliveryMode,
  normalizeMobileNumber
} from '../utils/userDelivery.js';
import { buildTenantCredentialDeliverySummary } from '../utils/tenantAuthPolicy.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');
const RECOVERY_TIMEOUT_MS = 15 * 60 * 1000;
const REMOTE_OVERVIEW_TIMEOUT_MS = 8000;
const MANAGED_ROLES = ['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR'];
const DEPLOYMENT_MODES = ['SHARED', 'DEDICATED'];
const SUPPORT_ACCESS_MODES = ['REMOTE_API', 'ANYDESK', 'VPN', 'BANK_ESCALATION'];
const supportsEnterpriseModels = Boolean(prisma.tenant && prisma.branch && prisma.userBranchAccess);
const supportsCityModel = Boolean(prisma.city);
const supportSecretKey = crypto.createHash('sha256')
  .update(requiredJwtSecret || 'dms-local-support-secret')
  .digest();

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('Unknown argument `username`')
    || message.includes('Unknown argument `tenant`')
    || message.includes('Unknown argument `branch`')
    || message.includes('Unknown argument `branch_accesses`')
    || message.includes('Unknown argument `tenant_id`')
    || message.includes('Unknown argument `branch_id`')
    || message.includes('Unknown argument `is_active`')
    || message.includes('Unknown argument `is_first_login`')
    || message.includes('Unknown field `tenant`')
    || message.includes('Unknown field `branch`')
    || message.includes('Unknown field `branch_accesses`')
    || message.includes('Unknown field `tenant_id`')
    || message.includes('Unknown field `branch_id`')
    || message.includes('Unknown field `is_active`')
    || message.includes('Unknown field `is_first_login`')
    || message.includes('does not exist in the current database')
    || message.includes('Branch.city_id')
    || message.includes('relation \"City\" does not exist')
    || message.includes('table `public.City` does not exist')
    || message.includes('Unknown field `cross_branch_append_enabled`')
    || message.includes('Unknown argument `cross_branch_append_enabled`')
    || message.includes('The column `Tenant.cross_branch_append_enabled` does not exist')
    || message.includes('Unknown field `backup_policy_enabled`')
    || message.includes('Unknown argument `backup_policy_enabled`')
    || message.includes('Unknown field `backup_frequency`')
    || message.includes('Unknown argument `backup_frequency`')
    || message.includes('Unknown field `backup_retention_days`')
    || message.includes('Unknown argument `backup_retention_days`')
    || message.includes('Unknown field `backup_window_hour`')
    || message.includes('Unknown argument `backup_window_hour`')
    || message.includes('Unknown field `backup_window_minute`')
    || message.includes('Unknown argument `backup_window_minute`')
    || message.includes('Unknown field `vendor_mirror_enabled`')
    || message.includes('Unknown argument `vendor_mirror_enabled`')
    || message.includes('Unknown field `backup_last_completed_at`')
    || message.includes('Unknown argument `backup_last_completed_at`')
    || message.includes('Unknown field `backup_next_due_at`')
    || message.includes('Unknown argument `backup_next_due_at`')
    || message.includes('The column `Tenant.backup_policy_enabled` does not exist')
    || message.includes('The column `Tenant.backup_frequency` does not exist')
    || message.includes('The column `Tenant.backup_retention_days` does not exist')
    || message.includes('The column `Tenant.backup_window_hour` does not exist')
    || message.includes('The column `Tenant.backup_window_minute` does not exist')
    || message.includes('The column `Tenant.vendor_mirror_enabled` does not exist')
    || message.includes('The column `Tenant.backup_last_completed_at` does not exist')
    || message.includes('The column `Tenant.backup_next_due_at` does not exist')
    || message.includes('Unknown field `email_from_name`')
    || message.includes('Unknown argument `email_from_name`')
    || message.includes('Unknown field `email_from_address`')
    || message.includes('Unknown argument `email_from_address`')
    || message.includes('Unknown field `email_reply_to`')
    || message.includes('Unknown argument `email_reply_to`')
    || message.includes('Unknown field `credential_delivery_enabled`')
    || message.includes('Unknown argument `credential_delivery_enabled`')
    || message.includes('Unknown field `otp_login_enabled`')
    || message.includes('Unknown argument `otp_login_enabled`')
    || message.includes('The column `Tenant.credential_delivery_enabled` does not exist')
    || message.includes('The column `Tenant.otp_login_enabled` does not exist')
    || message.includes('The column `Tenant.email_from_name` does not exist')
    || message.includes('The column `Tenant.email_from_address` does not exist')
    || message.includes('The column `Tenant.email_reply_to` does not exist')
    || message.includes('Unknown field `deployment_mode`')
    || message.includes('Unknown argument `deployment_mode`')
    || message.includes('Unknown field `support_base_url`')
    || message.includes('Unknown argument `support_base_url`')
    || message.includes('Unknown field `support_access_mode`')
    || message.includes('Unknown argument `support_access_mode`')
    || message.includes('Unknown field `support_login_username`')
    || message.includes('Unknown argument `support_login_username`')
    || message.includes('Unknown field `support_contact_name`')
    || message.includes('Unknown argument `support_contact_name`')
    || message.includes('Unknown field `support_contact_email`')
    || message.includes('Unknown argument `support_contact_email`')
    || message.includes('Unknown field `support_contact_phone`')
    || message.includes('Unknown argument `support_contact_phone`')
    || message.includes('Unknown field `support_api_key_ciphertext`')
    || message.includes('Unknown argument `support_api_key_ciphertext`')
    || message.includes('Unknown field `support_last_checked_at`')
    || message.includes('Unknown argument `support_last_checked_at`')
    || message.includes('Unknown field `support_last_success_at`')
    || message.includes('Unknown argument `support_last_success_at`')
    || message.includes('Unknown field `support_last_status`')
    || message.includes('Unknown argument `support_last_status`')
    || message.includes('Unknown field `support_last_error`')
    || message.includes('Unknown argument `support_last_error`')
    || message.includes('Unknown field `license_plan`')
    || message.includes('Unknown argument `license_plan`')
    || message.includes('Unknown field `license_valid_until`')
    || message.includes('Unknown argument `license_valid_until`')
    || message.includes('The column `Tenant.deployment_mode` does not exist')
    || message.includes('The column `Tenant.support_base_url` does not exist')
    || message.includes('The column `Tenant.support_access_mode` does not exist')
    || message.includes('The column `Tenant.support_login_username` does not exist')
    || message.includes('The column `Tenant.support_contact_name` does not exist')
    || message.includes('The column `Tenant.support_contact_email` does not exist')
    || message.includes('The column `Tenant.support_contact_phone` does not exist')
    || message.includes('The column `Tenant.support_api_key_ciphertext` does not exist')
    || message.includes('The column `Tenant.support_last_checked_at` does not exist')
    || message.includes('The column `Tenant.support_last_success_at` does not exist')
    || message.includes('The column `Tenant.support_last_status` does not exist')
    || message.includes('The column `Tenant.support_last_error` does not exist')
    || message.includes('The column `Tenant.license_plan` does not exist')
    || message.includes('The column `Tenant.license_valid_until` does not exist');
};

const parseId = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const normalizeCode = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const normalizeUsername = (value, fallbackEmail) => {
  const raw = String(value || fallbackEmail || '')
    .trim()
    .toLowerCase();
  return raw.replace(/\s+/g, '.');
};

const normalizeEmployeeId = (value) => String(value || '').trim().toUpperCase();
const buildManagedLoginUsername = (employeeId) => normalizeEmployeeId(employeeId).toLowerCase();
const buildManagedStoredEmail = (email, employeeId, tenantCode) => {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized || buildSyntheticUserEmail(employeeId, tenantCode);
};
const normalizeCityCode = (value, fallbackName = '') => {
  const normalized = normalizeCode(value || fallbackName);
  return normalized.slice(0, 12);
};
const normalizeHost = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;
  try {
    const candidate = /^https?:\/\//.test(raw) ? raw : `https://${raw}`;
    return new URL(candidate).hostname.toLowerCase();
  } catch {
    return raw
      .replace(/^https?:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .trim()
      .toLowerCase() || null;
  }
};
const normalizeChoice = (value, allowedValues, fallback) => {
  const normalized = String(value || '').trim().toUpperCase();
  return allowedValues.includes(normalized) ? normalized : fallback;
};
const normalizeSupportBaseUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(candidate);
    return parsed.origin.replace(/\/+$/, '');
  } catch {
    return null;
  }
};
const normalizeNullableText = (value) => {
  const raw = String(value || '').trim();
  return raw || null;
};
const normalizeNullableEmail = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  return raw || null;
};
const normalizeNullablePhone = (value) => {
  const raw = String(value || '').trim();
  return raw || null;
};
const normalizeNullableDate = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
};
const pickTenantBrandName = (tenant) => String(tenant?.brand_display_name || tenant?.tenant_name || 'Bank').trim() || 'Bank';
const pickTenantBrandCode = (tenant) => normalizeCode(tenant?.brand_short_code || tenant?.tenant_code || 'BANK').slice(0, 8) || 'BANK';
const pickTenantWatermark = () => String(brandWatermarkText || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd').trim() || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd';
const pickTenantSubtitle = (tenant) => String(tenant?.brand_subtitle || 'Document Management System').trim() || 'Document Management System';
const buildRemoteLoginUrl = (tenant) => {
  const supportBaseUrl = tenant?.support_base_url || null;
  if (supportBaseUrl) {
    return `${supportBaseUrl.replace(/\/+$/, '')}/login`;
  }
  if (tenant?.deployment_host) {
    return `https://${tenant.deployment_host}/login`;
  }
  return null;
};
const getLicenseStatus = (tenant) => {
  if (!tenant?.license_valid_until) return 'Not Recorded';
  const now = Date.now();
  const expiresAt = new Date(tenant.license_valid_until).getTime();
  if (Number.isNaN(expiresAt)) return 'Not Recorded';
  if (expiresAt < now) return 'Expired';
  const daysRemaining = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
  if (daysRemaining <= 30) return `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  return 'Active';
};
const encryptTenantSecret = (plainText) => {
  const normalized = String(plainText || '').trim();
  if (!normalized) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', supportSecretKey, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
};
const decryptTenantSecret = (cipherText) => {
  const raw = String(cipherText || '').trim();
  if (!raw) return null;
  try {
    const payload = Buffer.from(raw, 'base64url');
    const iv = payload.subarray(0, 12);
    const authTag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', supportSecretKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
};
const maskSecret = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.length <= 8) return `${raw.slice(0, 2)}${'*'.repeat(Math.max(raw.length - 2, 0))}`;
  return `${raw.slice(0, 4)}${'*'.repeat(Math.max(raw.length - 8, 0))}${raw.slice(-4)}`;
};
const buildCompactLocationCode = (value = '') => {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .map((word) => normalizeCode(word).replace(/\d/g, ''))
    .filter(Boolean)
    .filter((word) => !['CITY', 'DISTRICT', 'BRANCH', 'OFFICE', 'BANK'].includes(word));

  if (words.length >= 2) {
    return words.slice(0, 3).map((word) => word[0]).join('').slice(0, 3) || 'BRN';
  }

  const token = words[0] || normalizeCode(value).replace(/\d/g, '');
  if (!token) return 'BRN';

  const first = token[0];
  const consonants = token.slice(1).replace(/[AEIOU]/g, '');
  const candidate = `${first}${consonants}${token.slice(1)}`;
  return candidate.slice(0, 3) || 'BRN';
};
const buildBranchCodeSeed = (tenantCode, cityName, cityCode) => {
  const bankPrefix = pickTenantBrandCode({ brand_short_code: tenantCode }).slice(0, 6);
  const locationPrefix = buildCompactLocationCode(cityCode || cityName);
  return `${bankPrefix}${locationPrefix}`.slice(0, 10) || bankPrefix || 'BANK';
};
const generateBranchCode = async (tx, tenant, city) => {
  const baseCode = buildBranchCodeSeed(tenant?.brand_short_code || tenant?.tenant_code, city?.city_name, city?.city_code);
  const existing = await tx.branch.findMany({
    where: {
      tenant_id: tenant.id,
      branch_code: {
        startsWith: baseCode
      }
    },
    select: { branch_code: true }
  });
  const used = new Set(existing.map((item) => String(item.branch_code || '').trim().toUpperCase()));
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${baseCode}${String(index).padStart(3, '0')}`.slice(0, 12);
    if (!used.has(candidate)) {
      return candidate;
    }
  }
  return `${baseCode}${Date.now()}`.slice(0, 12);
};
const formatDob = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

const isSuperAdmin = (user) => user?.role?.name === 'SUPER_ADMIN';
const isBankAdmin = (user) => user?.role?.name === 'ADMIN';
const isAdminLevelRole = (roleName) => ['ADMIN', 'SUPER_ADMIN'].includes(String(roleName || '').trim().toUpperCase());

const assertAdminAccess = (user) => {
  if (!isSuperAdmin(user) && !isBankAdmin(user)) {
    const error = new Error('Forbidden');
    error.status = 403;
    throw error;
  }
};

const assertNotSelfTarget = (actor, targetId, actionLabel) => {
  if (actor?.id === targetId) {
    const error = new Error(`You cannot ${actionLabel} your own account.`);
    error.status = 400;
    throw error;
  }
};

const assertTenantAccess = (user, tenantId) => {
  if (isSuperAdmin(user)) return;
  if (!tenantId || user.tenant_id !== tenantId) {
    const error = new Error('Tenant access denied.');
    error.status = 403;
    throw error;
  }
};

const validateManagedUserDelivery = ({
  email,
  mobileNumber,
  deliveryMode
}) => {
  const normalizedDeliveryMode = normalizeDeliveryMode(deliveryMode, 'EMAIL');
  const normalizedMobile = normalizeMobileNumber(mobileNumber);

  if (normalizedMobile && !isValidMobileNumber(normalizedMobile)) {
    const error = new Error('Enter a valid mobile number for controlled delivery.');
    error.status = 400;
    throw error;
  }

  if (normalizedDeliveryMode === 'MOBILE' && !normalizedMobile) {
    const error = new Error('Mobile number is required when delivery mode is mobile.');
    error.status = 400;
    throw error;
  }

  if (normalizedDeliveryMode === 'BOTH' && (!normalizedMobile || !email)) {
    const error = new Error('Both email and mobile number are required when delivery mode is both.');
    error.status = 400;
    throw error;
  }

  return {
    mobile_number: normalizedMobile,
    credential_delivery_mode: normalizedDeliveryMode
  };
};

const persistUserIdentityEnvelope = async (tx, {
  userId,
  employeeId,
  dateOfBirth,
  mobileNumber,
  credentialDeliveryMode,
  tempPasswordHash = null,
  updatePasswordFlags = false
}) => {
  try {
    await tx.$executeRaw`
      UPDATE "User"
      SET "employee_id" = ${employeeId},
          "mobile_number" = ${mobileNumber},
          "credential_delivery_mode" = ${credentialDeliveryMode},
          "date_of_birth" = CAST(${dateOfBirth} AS date)
          ${updatePasswordFlags ? Prisma.sql`,
          "temp_password_hash" = ${tempPasswordHash},
          "must_change_password" = TRUE,
          "password_changed_at" = NOW()` : Prisma.empty}
      WHERE "id" = ${userId}
    `;
  } catch (error) {
    const message = String(error?.message || '');
    if (!message.includes('mobile_number') && !message.includes('credential_delivery_mode')) {
      throw error;
    }
    await tx.$executeRaw`
      UPDATE "User"
      SET "employee_id" = ${employeeId},
          "date_of_birth" = CAST(${dateOfBirth} AS date)
          ${updatePasswordFlags ? Prisma.sql`,
          "temp_password_hash" = ${tempPasswordHash},
          "must_change_password" = TRUE,
          "password_changed_at" = NOW()` : Prisma.empty}
      WHERE "id" = ${userId}
    `;
  }
};

const buildBackupTimestamp = (tenantCode = 'BANK') => {
  const compact = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
  const safeCode = normalizeCode(tenantCode).slice(0, 8) || 'BANK';
  return `${safeCode}_${compact}`;
};

const runRecoveryScript = async (scriptName, args = []) => {
  const scriptPath = path.join(backendRoot, 'scripts', scriptName);
  const { stdout, stderr } = await execFileAsync(
    process.execPath || 'node',
    [scriptPath, ...args],
    {
      cwd: backendRoot,
      timeout: RECOVERY_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8,
      env: process.env
    }
  );

  return {
    stdout: String(stdout || '').trim(),
    stderr: String(stderr || '').trim()
  };
};

const persistTenantBackupRun = async (tenant) => {
  const completedAt = new Date();
  const data = {
    backup_last_completed_at: completedAt,
    backup_next_due_at: computeBackupNextDueAt({
      backupPolicyEnabled: tenant.backup_policy_enabled ?? true,
      backupFrequency: tenant.backup_frequency || 'DAILY',
      backupWindowHour: tenant.backup_window_hour ?? 18,
      backupWindowMinute: tenant.backup_window_minute ?? 0,
      backupLastCompletedAt: completedAt,
      createdAt: tenant.created_at
    })
  };

  try {
    return await prisma.tenant.update({
      where: { id: tenant.id },
      data,
      select: tenantSelect
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
    try {
      return await prisma.tenant.update({
        where: { id: tenant.id },
        data,
        select: tenantCompatSelect
      });
    } catch (compatError) {
      if (!isSchemaCompatibilityError(compatError)) throw compatError;
      return prisma.tenant.update({
        where: { id: tenant.id },
        data,
        select: tenantLegacySelect
      });
    }
  }
};

const persistTenantSupportCheck = async (tenantId, payload = {}) => prisma.tenant.update({
  where: { id: tenantId },
  data: payload,
  select: tenantSelect
});

const buildLocalTenantOverview = async (tenant) => {
  const tenantId = Number(tenant?.id || 0);
  if (!tenantId) {
    return {
      status: 'NOT_CONFIGURED',
      mode: 'SHARED',
      message: 'Bank record is not available for this deployment.'
    };
  }

  const [branchCount, userCount, noteCount, pendingNoteCount, unreadNotificationCount] = await Promise.all([
    prisma.branch.count({ where: { tenant_id: tenantId } }).catch(() => 0),
    prisma.user.count({ where: { tenant_id: tenantId } }).catch(() => 0),
    prisma.note.count({ where: { tenant_id: tenantId, is_latest_version: true } }).catch(() => 0),
    prisma.note.count({
      where: {
        tenant_id: tenantId,
        is_latest_version: true,
        queue_code: { in: ['INCOMING', 'RETURNED_WITH_REMARKS'] }
      }
    }).catch(() => 0),
    prisma.notification.count({
      where: {
        tenant_id: tenantId,
        is_read: false
      }
    }).catch(() => 0)
  ]);

  return {
    status: 'ONLINE',
    mode: 'SHARED',
    checked_at: new Date().toISOString(),
    instance: {
      deployment_label: deploymentLabel,
      site_role: deploymentSiteRole,
      support_mode: normalizeChoice(tenant.support_access_mode, SUPPORT_ACCESS_MODES, 'REMOTE_API')
    },
    bank: {
      tenant_id: tenant.id,
      tenant_name: pickTenantBrandName(tenant),
      tenant_code: pickTenantBrandCode(tenant),
      login_url: buildRemoteLoginUrl(tenant)
    },
    stats: {
      branches: branchCount,
      users: userCount,
      notes: noteCount,
      pending_items: pendingNoteCount,
      unread_notifications: unreadNotificationCount
    },
    backup: {
      enabled: tenant.backup_policy_enabled ?? true,
      frequency: tenant.backup_frequency || 'DAILY',
      last_completed_at: tenant.backup_last_completed_at ?? null,
      next_due_at: tenant.backup_next_due_at ?? null
    },
    license: {
      plan: tenant.license_plan ?? null,
      valid_until: tenant.license_valid_until ?? null,
      status: getLicenseStatus(tenant)
    }
  };
};

const fetchTenantRemoteOverview = async (tenant) => {
  const supportBaseUrl = normalizeSupportBaseUrl(tenant?.support_base_url) || buildRemoteLoginUrl(tenant)?.replace(/\/login$/, '') || null;
  if (!supportBaseUrl) {
    const updatedTenant = await persistTenantSupportCheck(tenant.id, {
      support_last_checked_at: new Date(),
      support_last_status: 'NOT_CONFIGURED',
      support_last_error: 'Support API base URL is not configured for this bank.'
    });
    return {
      tenant: updatedTenant,
      overview: {
        status: 'NOT_CONFIGURED',
        mode: 'DEDICATED',
        message: 'Support API base URL is not configured for this bank.'
      }
    };
  }

  const supportKey = decryptTenantSecret(tenant.support_api_key_ciphertext);
  if (!supportKey) {
    const updatedTenant = await persistTenantSupportCheck(tenant.id, {
      support_last_checked_at: new Date(),
      support_last_status: 'KEY_REQUIRED',
      support_last_error: 'Support API key is not configured for this bank.'
    });
    return {
      tenant: updatedTenant,
      overview: {
        status: 'KEY_REQUIRED',
        mode: 'DEDICATED',
        message: 'Support API key is not configured for this bank.'
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REMOTE_OVERVIEW_TIMEOUT_MS);

  try {
    const response = await fetch(`${supportBaseUrl}/api/support/overview`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${supportKey}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(payload?.error || `Support overview request failed with status ${response.status}.`);
    }

    const checkedAt = new Date();
    const updatedTenant = await persistTenantSupportCheck(tenant.id, {
      support_last_checked_at: checkedAt,
      support_last_success_at: checkedAt,
      support_last_status: 'ONLINE',
      support_last_error: null
    });

    return {
      tenant: updatedTenant,
      overview: {
        ...payload,
        status: payload?.status || 'ONLINE',
        mode: payload?.mode || 'DEDICATED',
        checked_at: checkedAt.toISOString()
      }
    };
  } catch (error) {
    const checkedAt = new Date();
    const updatedTenant = await persistTenantSupportCheck(tenant.id, {
      support_last_checked_at: checkedAt,
      support_last_status: 'OFFLINE',
      support_last_error: error.name === 'AbortError'
        ? 'Support overview timed out while contacting the bank deployment.'
        : error.message
    });
    return {
      tenant: updatedTenant,
      overview: {
        status: 'OFFLINE',
        mode: 'DEDICATED',
        checked_at: checkedAt.toISOString(),
        message: updatedTenant.support_last_error || 'Unable to reach the bank deployment.'
      }
    };
  } finally {
    clearTimeout(timeout);
  }
};

const loadManagedBranch = async (branchId, tenantId) => {
  if (!branchId) return null;
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      id: true,
      tenant_id: true,
      branch_name: true,
      branch_code: true
    }
  });
  if (!branch || (tenantId && Number(branch.tenant_id) !== Number(tenantId))) {
    const error = new Error('Branch not found for tenant.');
    error.status = 404;
    throw error;
  }
  return branch;
};

const assertManagedCityAccess = async (user, cityId, tenantId) => {
  if (!cityId) return null;
  if (!supportsCityModel) {
    const error = new Error('City management requires the latest schema to be applied.');
    error.status = 400;
    throw error;
  }
  const city = await prisma.city.findUnique({
    where: { id: cityId },
    select: { id: true, tenant_id: true, city_name: true, city_code: true, state_name: true, state_code: true }
  });
  if (!city || Number(city.tenant_id) !== Number(tenantId)) {
    const error = new Error('City not found for tenant.');
    error.status = 404;
    throw error;
  }
  if (!isSuperAdmin(user) && Number(city.tenant_id) !== Number(user.tenant_id)) {
    const error = new Error('City access denied.');
    error.status = 403;
    throw error;
  }
  return city;
};

const assertAccessibleBranchesWithinTenant = async (tenantId, branchIds) => {
  if (!Array.isArray(branchIds) || branchIds.length === 0) {
    return [];
  }
  const normalizedIds = [...new Set(branchIds.map(parseId).filter(Boolean))];
  const branches = await prisma.branch.findMany({
    where: {
      tenant_id: tenantId,
      id: { in: normalizedIds }
    },
    select: { id: true }
  });
  if (branches.length !== normalizedIds.length) {
    const error = new Error('One or more accessible branches are outside the selected bank scope.');
    error.status = 400;
    throw error;
  }
  return normalizedIds;
};

const assertManageableTarget = (actor, target, actionLabel = 'manage') => {
  if (isSuperAdmin(actor)) return;
  if (isAdminLevelRole(target?.role?.name)) {
    const error = new Error(`Bank admin cannot ${actionLabel} admin-level accounts.`);
    error.status = 403;
    throw error;
  }
};

const FMS_DEPARTMENT_CONTROL_PERMISSIONS = new Set(['FMS_UPLOAD', 'FMS_SHARE', 'FMS_REVOKE', 'FMS_PUBLISH']);
const hasDepartmentLevelFmsOwnership = (enabled, permissions = []) => (
  Boolean(enabled) && getUserFmsPermissions({ fms_enabled: enabled, fms_permissions: permissions }).some((permission) => FMS_DEPARTMENT_CONTROL_PERMISSIONS.has(String(permission || '').trim().toUpperCase()))
);

const findDepartmentAssignmentConflicts = async ({
  tenantId,
  departmentId,
  excludeUserId = null
}) => {
  if (!tenantId || !departmentId) return [];

  const rows = await prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      is_active: true,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {})
    },
    select: {
      id: true,
      name: true,
      employee_id: true,
      fms_enabled: true,
      fms_permissions: true,
      branch: { select: { branch_name: true } }
    }
  });

  return rows.filter((user) => (
    hasDepartmentLevelFmsOwnership(user.fms_enabled, user.fms_permissions)
    && Number(getUserOwnedFmsDepartmentId(user, { fallbackToUserDepartment: true }) || 0) === Number(departmentId)
  ));
};

const userSelect = {
  id: true,
  user_id: true,
  name: true,
  username: true,
  email: true,
  is_active: true,
  is_first_login: true,
  fms_enabled: true,
  fms_permissions: true,
  created_at: true,
  tenant_id: true,
  branch_id: true,
  role: { select: { name: true } },
  tenant: { select: { tenant_name: true, tenant_code: true } },
  branch: {
    select: {
      branch_name: true,
      branch_code: true
    }
  },
  department: { select: { id: true, name: true } },
  vertical: { select: { name: true } },
  branch_accesses: {
    include: {
      branch: {
        select: { id: true, branch_name: true, branch_code: true }
      }
    }
  }
};

const toUserResponse = (user) => ({
  id: user.id,
  user_id: user.user_id,
  name: user.name,
  username: user.username,
  email: isSyntheticUserEmail(user.email) ? null : user.email,
  employee_id: user.employee_id ?? null,
  mobile_number: user.mobile_number ?? null,
  credential_delivery_mode: user.credential_delivery_mode ?? 'EMAIL',
  date_of_birth: formatDob(user.date_of_birth),
  role: user.role?.name,
  tenant_id: user.tenant_id,
  tenant_name: user.tenant?.tenant_name,
  tenant_code: user.tenant?.tenant_code,
  branch_id: user.branch_id,
  branch_name: user.branch?.branch_name,
  branch_code: user.branch?.branch_code,
  branch_city_name: user.branch_city_name ?? null,
  branch_city_code: user.branch_city_code ?? null,
  branch_state_name: user.branch_state_name ?? null,
  department_id: user.department?.id ?? null,
  department: user.department?.name,
  vertical: user.vertical?.name,
  is_active: user.is_active,
  is_first_login: user.is_first_login,
  must_change_password: user.must_change_password ?? user.is_first_login ?? false,
  accessible_branches: (user.branch_accesses || []).map((access) => access.branch)
  ,
  fms_enabled: Boolean(user.fms_enabled),
  has_granted_fms_access: Boolean(user.has_granted_fms_access),
  has_fms_access: Boolean(user.fms_enabled || isAdminLevelRole(user.role?.name)),
  fms_permissions: getUserFmsPermissions(user),
  fms_owned_department_id: getUserOwnedFmsDepartmentId(user)
});

const legacyUserSelect = {
  id: true,
  name: true,
  email: true,
  created_at: true,
  role: { select: { name: true } },
  department: { select: { name: true } },
  vertical: { select: { name: true } }
};

const toLegacyUserResponse = (user) => ({
  id: user.id,
  user_id: null,
  name: user.name,
  username: null,
  email: isSyntheticUserEmail(user.email) ? null : user.email,
  role: user.role?.name,
  tenant_id: null,
  tenant_name: null,
  tenant_code: null,
  branch_id: null,
  branch_name: null,
  branch_code: null,
  department: user.department?.name,
  vertical: user.vertical?.name,
  is_active: true,
  is_first_login: false,
  accessible_branches: []
});

const resetMailLegacyUserSelect = {
  id: true,
  name: true,
  email: true,
  tenant_id: true,
  branch_id: true,
  username: true,
  role: { select: { name: true } }
};

const parseCsv = (raw) => {
  const rows = [];
  let current = '';
  let record = [];
  let insideQuotes = false;

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      record.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1;
      }
      record.push(current.trim());
      if (record.some((value) => value !== '')) rows.push(record);
      current = '';
      record = [];
    } else {
      current += char;
    }
  }

  if (current || record.length) {
    record.push(current.trim());
    if (record.some((value) => value !== '')) rows.push(record);
  }

  return rows;
};

const normalizeHeaderToken = (value) => normalizeCode(value).toLowerCase();
const toImportLabel = (value) => String(value || '').trim();
const toImportText = (value) => String(value || '').trim();
const slugifyName = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '.')
  .replace(/^\.+|\.+$/g, '');

const bulkImportAliases = {
  name: ['name', 'fullname', 'employeename', 'username', 'staffname'],
  email: ['email', 'emailaddress', 'mail', 'mailid', 'officialemail'],
  username: ['username', 'userid', 'loginid', 'userlogin'],
  employee_id: ['employeeid', 'employeecode', 'empid', 'empcode', 'staffid', 'staffcode'],
  date_of_birth: ['dateofbirth', 'dob', 'birthdate', 'birthdt'],
  role: ['role', 'usertype', 'designationrole', 'workflowrole'],
  branch_code: ['branchcode', 'branchifsc', 'branchid', 'sol', 'solid'],
  branch_name: ['branch', 'branchname', 'branchoffice', 'officebranch'],
  tenant_code: ['tenantcode', 'bankcode', 'bankshortcode', 'bankid'],
  tenant_name: ['tenant', 'bank', 'bankname', 'institution'],
  department: ['department', 'dept', 'division'],
  vertical: ['vertical', 'businessline', 'segment']
};

const detectImportColumns = (headers = []) => {
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    token: normalizeHeaderToken(header)
  }));

  const detected = {};
  Object.entries(bulkImportAliases).forEach(([field, aliases]) => {
    const hit = normalizedHeaders.find((header) => aliases.includes(header.token));
    if (hit) {
      detected[field] = hit.original;
    }
  });

  return detected;
};

const getImportedValue = (row, detectedColumns, field) => {
  const header = detectedColumns[field];
  return header ? toImportText(row[header]) : '';
};

const normalizeImportedRole = (value) => {
  const token = normalizeHeaderToken(value);
  const roleMap = {
    initiator: 'INITIATOR',
    uploader: 'INITIATOR',
    maker: 'INITIATOR',
    creator: 'INITIATOR',
    recommender: 'RECOMMENDER',
    checker: 'RECOMMENDER',
    reviewer: 'RECOMMENDER',
    approver: 'APPROVER',
    authorizer: 'APPROVER',
    admin: 'ADMIN',
    bankadmin: 'ADMIN',
    auditor: 'AUDITOR'
  };
  return roleMap[token] || String(value || '').trim().toUpperCase();
};

const normalizeImportedDateOfBirth = (value) => {
  const raw = toImportText(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw;
};

const deriveImportedUsername = ({ username, email, name, employee_id }) => {
  const employeeUsername = buildManagedLoginUsername(employee_id);
  if (employeeUsername) return employeeUsername;
  const explicitUsername = toImportText(username);
  if (explicitUsername) return explicitUsername;
  const normalizedEmail = toImportText(email).toLowerCase();
  if (normalizedEmail.includes('@')) return normalizedEmail.split('@')[0];
  return slugifyName(name) || '';
};

const buildBulkImportBranchLabel = (branch) => {
  if (!branch) return 'Unknown Branch';
  const cityLabel = branch.city?.city_name ? ` · ${branch.city.city_name}` : '';
  return `${branch.branch_name} (${branch.branch_code})${cityLabel}`;
};

const resolveBulkImportTenant = async (actor, item, detectedColumns, fallbackTenantId) => {
  const importedTenantCode = normalizeCode(getImportedValue(item, detectedColumns, 'tenant_code') || getImportedValue(item, detectedColumns, 'tenant_name'));
  if (importedTenantCode) {
    const tenant = await prisma.tenant.findFirst({
      where: {
        OR: [
          { tenant_code: importedTenantCode },
          { brand_short_code: importedTenantCode }
        ]
      },
      select: { id: true, tenant_name: true, tenant_code: true, brand_short_code: true }
    });
    if (!tenant) return null;
    assertTenantAccess(actor, tenant.id);
    return tenant;
  }

  const fallbackTenant = await findTenantById(fallbackTenantId || actor.tenant_id || 0);
  if (fallbackTenant) {
    assertTenantAccess(actor, fallbackTenant.id);
  }
  return fallbackTenant;
};

const resolveBulkImportBranch = async ({
  tenant,
  item,
  detectedColumns,
  forcedBranchId,
  fallbackBranchId
}) => {
  const importedBranchCode = normalizeCode(getImportedValue(item, detectedColumns, 'branch_code'));
  const importedBranchName = toImportText(getImportedValue(item, detectedColumns, 'branch_name'));
  const targetBranchId = parseId(forcedBranchId) || parseId(fallbackBranchId);

  if (targetBranchId) {
    return prisma.branch.findFirst({
      where: {
        id: targetBranchId,
        tenant_id: tenant.id
      },
      select: {
        id: true,
        tenant_id: true,
        branch_name: true,
        branch_code: true,
        city: { select: { city_name: true } }
      }
    });
  }

  if (importedBranchCode || importedBranchName) {
    return prisma.branch.findFirst({
      where: {
        tenant_id: tenant.id,
        OR: [
          importedBranchCode ? { branch_code: importedBranchCode } : null,
          importedBranchName ? { branch_name: importedBranchName } : null
        ].filter(Boolean)
      },
      select: {
        id: true,
        tenant_id: true,
        branch_name: true,
        branch_code: true,
        city: { select: { city_name: true } }
      }
    });
  }

  const tenantBranches = await prisma.branch.findMany({
    where: { tenant_id: tenant.id },
    select: {
      id: true,
      tenant_id: true,
      branch_name: true,
      branch_code: true,
      city: { select: { city_name: true } }
    },
    orderBy: { branch_name: 'asc' }
  });

  if (tenantBranches.length === 1) {
    return tenantBranches[0];
  }

  return null;
};

const prepareBulkImportRows = async ({
  actor,
  items,
  detectedColumns,
  fallbackTenantId,
  fallbackBranchId,
  forcedBranchId
}) => {
  const prepared = [];

  for (const item of items) {
    const name = toImportText(getImportedValue(item, detectedColumns, 'name'));
    const email = toImportText(getImportedValue(item, detectedColumns, 'email')).toLowerCase();
    const employee_id = normalizeEmployeeId(getImportedValue(item, detectedColumns, 'employee_id'));
    const date_of_birth = normalizeImportedDateOfBirth(getImportedValue(item, detectedColumns, 'date_of_birth'));
    const role = normalizeImportedRole(getImportedValue(item, detectedColumns, 'role'));
    const username = deriveImportedUsername({
      username: getImportedValue(item, detectedColumns, 'username'),
      email,
      name,
      employee_id
    });

    const normalized = {
      name,
      email,
      username,
      employee_id,
      mobile_number: null,
      credential_delivery_mode: 'EMAIL',
      date_of_birth,
      role
    };

    if (!name || !employee_id || !date_of_birth || !role) {
      prepared.push({
        status: 'FAILED',
        row: item,
        reason: 'Name, employee ID, date of birth, and role must be detected for every row.'
      });
      continue;
    }

    let tenant;
    try {
      tenant = await resolveBulkImportTenant(actor, item, detectedColumns, fallbackTenantId);
    } catch (error) {
      prepared.push({ status: 'FAILED', row: item, reason: error.message });
      continue;
    }

    if (!tenant) {
      prepared.push({ status: 'FAILED', row: item, reason: 'Bank scope could not be resolved for this row.' });
      continue;
    }

    const branch = await resolveBulkImportBranch({
      tenant,
      item,
      detectedColumns,
      forcedBranchId,
      fallbackBranchId
    });

    if (!branch) {
      prepared.push({
        status: 'FAILED',
        row: item,
        reason: 'Branch could not be resolved. Select a branch once for this import or include branch details in the file.'
      });
      continue;
    }

    prepared.push({
      status: 'READY',
      row: item,
      tenant,
      branch,
      payload: {
        ...normalized,
        tenant_id: tenant.id,
        branch_id: branch.id,
        department_id: undefined,
        vertical_id: undefined
      }
    });
  }

  return prepared;
};

const summarizeBulkImportPreview = (preparedRows, detectedColumns) => {
  const readyRows = preparedRows.filter((item) => item.status === 'READY');
  const failedRows = preparedRows.filter((item) => item.status === 'FAILED');
  const branchSummary = Array.from(readyRows.reduce((map, item) => {
    const key = String(item.branch.id);
    const current = map.get(key) || {
      branch_id: item.branch.id,
      branch_name: item.branch.branch_name,
      branch_code: item.branch.branch_code,
      branch_label: buildBulkImportBranchLabel(item.branch),
      count: 0
    };
    current.count += 1;
    map.set(key, current);
    return map;
  }, new Map()).values());

  return {
    ready: readyRows.length,
    failed: failedRows.length,
    detected_columns: detectedColumns,
    branch_summary: branchSummary,
    sample_failures: failedRows.slice(0, 6).map((item, index) => ({
      row_number: index + 2,
      reason: item.reason,
      row: item.row
    }))
  };
};

const buildScopedUserWhere = (req) => {
  if (isSuperAdmin(req.user)) {
    const where = {};
    if (req.query.tenant_id) where.tenant_id = parseId(req.query.tenant_id);
    if (req.query.branch_id) where.branch_id = parseId(req.query.branch_id);
    return where;
  }

  return {
    tenant_id: req.user.tenant_id,
    NOT: {
      role: { name: 'SUPER_ADMIN' }
    }
  };
};

const createUserCode = async (tx, tenantCode, branchCode) => {
  const prefix = `${tenantCode || 'GEN'}-${branchCode || 'HQ'}-USR-`;
  const existing = await tx.user.findMany({
    where: {
      user_id: {
        startsWith: prefix
      }
    },
    select: { user_id: true }
  });

  const nextNumber = existing.reduce((max, user) => {
    const suffix = String(user.user_id || '').slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number.parseInt(suffix, 10)) : max;
  }, 0) + 1;

  return `${prefix}${String(nextNumber).padStart(4, '0')}`;
};

const runTransaction = (callback) => prisma.$transaction(callback, {
  maxWait: 8000,
  timeout: 20000
});

const tenantSelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  deployment_host: true,
  deployment_mode: true,
  support_base_url: true,
  support_access_mode: true,
  support_login_username: true,
  support_contact_name: true,
  support_contact_email: true,
  support_contact_phone: true,
  support_api_key_ciphertext: true,
  support_last_checked_at: true,
  support_last_success_at: true,
  support_last_status: true,
  support_last_error: true,
  license_plan: true,
  license_valid_until: true,
  brand_display_name: true,
  brand_short_code: true,
  brand_logo_path: true,
  brand_watermark_text: true,
  brand_subtitle: true,
  email_from_name: true,
  email_from_address: true,
  email_reply_to: true,
  credential_delivery_enabled: true,
  otp_login_enabled: true,
  cross_branch_append_enabled: true,
  backup_policy_enabled: true,
  backup_frequency: true,
  backup_retention_days: true,
  backup_window_hour: true,
  backup_window_minute: true,
  vendor_mirror_enabled: true,
  backup_last_completed_at: true,
  backup_next_due_at: true,
  created_at: true
};

const toTenantResponse = (tenant) => ({
  id: tenant.id,
  tenant_name: tenant.tenant_name,
  tenant_code: tenant.tenant_code,
  deployment_host: tenant.deployment_host ?? null,
  deployment_mode: normalizeChoice(tenant.deployment_mode, DEPLOYMENT_MODES, 'SHARED'),
  support_base_url: tenant.support_base_url ?? null,
  support_access_mode: normalizeChoice(tenant.support_access_mode, SUPPORT_ACCESS_MODES, 'REMOTE_API'),
  support_login_username: tenant.support_login_username ?? null,
  support_contact_name: tenant.support_contact_name ?? null,
  support_contact_email: tenant.support_contact_email ?? null,
  support_contact_phone: tenant.support_contact_phone ?? null,
  support_api_key_configured: Boolean(tenant.support_api_key_ciphertext),
  support_api_key_masked: maskSecret(decryptTenantSecret(tenant.support_api_key_ciphertext)),
  support_last_checked_at: tenant.support_last_checked_at ?? null,
  support_last_success_at: tenant.support_last_success_at ?? null,
  support_last_status: tenant.support_last_status ?? null,
  support_last_error: tenant.support_last_error ?? null,
  support_login_url: buildRemoteLoginUrl(tenant),
  license_plan: tenant.license_plan ?? null,
  license_valid_until: tenant.license_valid_until ?? null,
  license_status: getLicenseStatus(tenant),
  brand_display_name: pickTenantBrandName(tenant),
  brand_short_code: pickTenantBrandCode(tenant),
  brand_logo_path: tenant.brand_logo_path ?? null,
  brand_logo_url: tenant.brand_logo_path ? `/api/branding/logo/${tenant.id}` : null,
  brand_watermark_text: pickTenantWatermark(tenant),
  brand_subtitle: pickTenantSubtitle(tenant),
  email_from_name: tenant.email_from_name ?? null,
  email_from_address: tenant.email_from_address ?? null,
  email_reply_to: tenant.email_reply_to ?? null,
  credential_delivery_enabled: tenant.credential_delivery_enabled === true,
  otp_login_enabled: tenant.otp_login_enabled === true,
  credential_delivery_summary: buildTenantCredentialDeliverySummary(tenant),
  cross_branch_append_enabled: Boolean(tenant.cross_branch_append_enabled),
  backup_policy_enabled: tenant.backup_policy_enabled ?? true,
  backup_frequency: normalizeBackupFrequency(tenant.backup_frequency || 'DAILY'),
  backup_retention_days: tenant.backup_retention_days ?? 30,
  backup_window_hour: tenant.backup_window_hour ?? 18,
  backup_window_minute: tenant.backup_window_minute ?? 0,
  vendor_mirror_enabled: tenant.vendor_mirror_enabled ?? true,
  backup_last_completed_at: tenant.backup_last_completed_at ?? null,
  backup_next_due_at: tenant.backup_next_due_at ?? null,
  created_at: tenant.created_at,
  _count: tenant._count
});

const tenantLegacySelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  created_at: true
};

const tenantCompatSelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  deployment_host: true,
  brand_display_name: true,
  brand_short_code: true,
  brand_logo_path: true,
  brand_watermark_text: true,
  brand_subtitle: true,
  cross_branch_append_enabled: true,
  backup_policy_enabled: true,
  backup_frequency: true,
  backup_retention_days: true,
  backup_window_hour: true,
  backup_window_minute: true,
  vendor_mirror_enabled: true,
  backup_last_completed_at: true,
  backup_next_due_at: true,
  created_at: true
};

const findTenantById = async (tenantId) => {
  try {
    return await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantSelect
    });
  } catch (error) {
    if (!isSchemaCompatibilityError(error)) throw error;
    try {
      return await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: tenantCompatSelect
      });
    } catch (compatError) {
      if (!isSchemaCompatibilityError(compatError)) throw compatError;
      return prisma.tenant.findUnique({
        where: { id: tenantId },
        select: tenantLegacySelect
      });
    }
  }
};

const enrichUsersWithIdentity = async (users) => {
  if (!users.length) return users;
  try {
    const ids = users.map((user) => Number(user.id)).filter(Boolean);
    if (!ids.length) return users;
    const rows = await prisma.$queryRaw`
      SELECT "id", "employee_id", "mobile_number", "credential_delivery_mode", "date_of_birth"
      FROM "User"
      WHERE "id" IN (${Prisma.join(ids)})
    `;
    const identityById = new Map(rows.map((row) => [row.id, row]));
    return users.map((user) => ({
      ...user,
      employee_id: identityById.get(user.id)?.employee_id ?? null,
      mobile_number: identityById.get(user.id)?.mobile_number ?? null,
      credential_delivery_mode: normalizeDeliveryMode(identityById.get(user.id)?.credential_delivery_mode, 'EMAIL'),
      date_of_birth: identityById.get(user.id)?.date_of_birth ?? null
    }));
  } catch {
    return users;
  }
};

const enrichUsersWithBranchLocation = async (users) => {
  if (!users.length) return users;
  try {
    const branchIds = [...new Set(users.map((user) => Number(user.branch_id)).filter(Boolean))];
    if (!branchIds.length) return users;
    const rows = await prisma.$queryRaw`
      SELECT b."id", c."city_name", c."city_code", c."state_name"
      FROM "Branch" b
      LEFT JOIN "City" c ON c."id" = b."city_id"
      WHERE b."id" IN (${Prisma.join(branchIds)})
    `;
    const branchMap = new Map(rows.map((row) => [row.id, row]));
    return users.map((user) => ({
      ...user,
      branch_city_name: branchMap.get(user.branch_id)?.city_name ?? null,
      branch_city_code: branchMap.get(user.branch_id)?.city_code ?? null,
      branch_state_name: branchMap.get(user.branch_id)?.state_name ?? null
    }));
  } catch {
    return users.map((user) => ({
      ...user,
      branch_city_name: user.branch_city_name ?? null,
      branch_city_code: user.branch_city_code ?? null,
      branch_state_name: user.branch_state_name ?? null
    }));
  }
};

const generateTemporaryPassword = () => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const all = `${upper}${lower}${digits}${special}`;
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    special[crypto.randomInt(special.length)]
  ];
  const remaining = Array.from({ length: 12 }, () => all[crypto.randomInt(all.length)]);
  return [...required, ...remaining]
    .sort(() => crypto.randomInt(3) - 1)
    .join('');
};

export const listTenants = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.json([]);
    }
    let tenants;
    try {
      tenants = await prisma.tenant.findMany({
        where: isSuperAdmin(req.user) ? {} : { id: req.user.tenant_id || 0 },
        orderBy: { tenant_name: 'asc' },
        select: {
          ...tenantSelect,
          _count: {
            select: { branches: true, users: true, notes: true }
          }
        }
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      try {
        tenants = await prisma.tenant.findMany({
          where: isSuperAdmin(req.user) ? {} : { id: req.user.tenant_id || 0 },
          orderBy: { tenant_name: 'asc' },
          select: {
            ...tenantCompatSelect,
            _count: {
              select: { branches: true, users: true, notes: true }
            }
          }
        });
      } catch (compatError) {
        if (!isSchemaCompatibilityError(compatError)) throw compatError;
        tenants = await prisma.tenant.findMany({
          where: isSuperAdmin(req.user) ? {} : { id: req.user.tenant_id || 0 },
          orderBy: { tenant_name: 'asc' },
          select: {
            ...tenantLegacySelect,
            _count: {
              select: { branches: true, users: true, notes: true }
            }
          }
        });
      }
    }
    res.json(tenants.map(toTenantResponse));
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Bank backup can run, but this database still needs the latest tenant schema fields applied.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const getTenantRemoteOverview = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Bank deployment overview requires the enterprise schema to be applied.' });
    }

    const tenantId = parseId(req.params.id);
    const tenant = await assertTenantBrandingAccess(req.user, tenantId);
    const deploymentMode = normalizeChoice(tenant.deployment_mode, DEPLOYMENT_MODES, 'SHARED');

    if (deploymentMode !== 'DEDICATED') {
      const overview = await buildLocalTenantOverview(tenant);
      return res.json({
        tenant: toTenantResponse(tenant),
        overview
      });
    }

    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only super admin can query dedicated bank deployments.' });
    }

    const result = await fetchTenantRemoteOverview(tenant);
    return res.json({
      tenant: toTenantResponse(result.tenant),
      overview: result.overview
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Recovery export can run, but this database still needs the latest tenant schema fields applied.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const rotateTenantSupportKey = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Support key rotation requires the enterprise schema to be applied.' });
    }
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only super admin can rotate support keys.' });
    }

    const tenantId = parseId(req.params.id);
    const tenant = await assertTenantBrandingAccess(req.user, tenantId);
    const supportApiKey = `dms_sup_${crypto.randomBytes(24).toString('base64url')}`;
    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        support_api_key_ciphertext: encryptTenantSecret(supportApiKey),
        support_last_status: 'KEY_ROTATED',
        support_last_error: null
      },
      select: tenantSelect
    });

    writeSecurityAudit('ADMIN_ROTATE_TENANT_SUPPORT_KEY', {
      actor_user_id: req.user.id,
      tenant_id: tenant.id,
      tenant_code: tenant.tenant_code
    });

    res.status(201).json({
      message: 'Support key generated. Place the same value in the dedicated bank deployment as SUPPORT_ACCESS_TOKEN.',
      support_api_key: supportApiKey,
      support_api_key_masked: maskSecret(supportApiKey),
      tenant: toTenantResponse(updatedTenant)
    });
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Support token tools need the latest tenant schema in this database.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createTenant = async (req, res) => {
  try {
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Tenant management requires the enterprise schema to be applied.' });
    }
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only super admin can create tenants.' });
    }

    const tenant_name = String(req.body.tenant_name || '').trim();
    const tenant_code = normalizeCode(req.body.tenant_code);
    const deployment_host = normalizeHost(req.body.deployment_host);
    const deployment_mode = normalizeChoice(req.body.deployment_mode, DEPLOYMENT_MODES, 'SHARED');
    const support_base_url = normalizeSupportBaseUrl(req.body.support_base_url);
    const support_access_mode = normalizeChoice(req.body.support_access_mode, SUPPORT_ACCESS_MODES, 'REMOTE_API');
    const support_login_username = normalizeNullableText(req.body.support_login_username);
    const support_contact_name = normalizeNullableText(req.body.support_contact_name);
    const support_contact_email = normalizeNullableEmail(req.body.support_contact_email);
    const support_contact_phone = normalizeNullablePhone(req.body.support_contact_phone);
    const license_plan = normalizeNullableText(req.body.license_plan);
    const license_valid_until = normalizeNullableDate(req.body.license_valid_until);
    const brand_display_name = String(req.body.brand_display_name || tenant_name).trim() || tenant_name;
    const brand_short_code = normalizeCode(req.body.brand_short_code || tenant_code) || tenant_code;
    const brand_subtitle = String(req.body.brand_subtitle || 'Document Management System').trim() || 'Document Management System';
    const email_from_name = normalizeNullableText(req.body.email_from_name);
    const email_from_address = normalizeNullableEmail(req.body.email_from_address);
    const email_reply_to = normalizeNullableEmail(req.body.email_reply_to);
    const cross_branch_append_enabled = Boolean(req.body.cross_branch_append_enabled);
  const backup_policy_enabled = req.body.backup_policy_enabled ?? true;
  const credential_delivery_enabled = Boolean(req.body.credential_delivery_enabled);
  const otp_login_enabled = credential_delivery_enabled && Boolean(req.body.otp_login_enabled);
  const backup_frequency = normalizeBackupFrequency(req.body.backup_frequency || 'DAILY');
    const backup_retention_days = Number.parseInt(String(req.body.backup_retention_days ?? 30), 10) || 30;
    const backup_window_hour = normalizeBackupWindowHour(req.body.backup_window_hour ?? 18);
    const backup_window_minute = normalizeBackupWindowMinute(req.body.backup_window_minute ?? 0);
    const vendor_mirror_enabled = req.body.vendor_mirror_enabled ?? true;
    const backup_next_due_at = computeBackupNextDueAt({
      backupPolicyEnabled: backup_policy_enabled,
      backupFrequency: backup_frequency,
      backupWindowHour: backup_window_hour,
      backupWindowMinute: backup_window_minute,
      backupLastCompletedAt: null,
      createdAt: new Date()
    });

    if (!tenant_name || !tenant_code) {
      return res.status(400).json({ error: 'Tenant name and code are required.' });
    }

    let tenant;
    try {
      tenant = await prisma.tenant.create({
        data: {
          tenant_name,
          tenant_code,
          deployment_host,
          deployment_mode,
          support_base_url,
          support_access_mode,
          support_login_username,
          support_contact_name,
          support_contact_email,
          support_contact_phone,
          license_plan,
          license_valid_until,
          brand_display_name,
          brand_short_code,
          brand_subtitle,
          brand_watermark_text: pickTenantWatermark(),
          email_from_name,
          email_from_address,
          email_reply_to,
          credential_delivery_enabled,
          otp_login_enabled,
          cross_branch_append_enabled,
          backup_policy_enabled,
          backup_frequency,
          backup_retention_days,
          backup_window_hour,
          backup_window_minute,
          vendor_mirror_enabled,
          backup_next_due_at
        },
        select: tenantSelect
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      try {
        tenant = await prisma.tenant.create({
          data: {
            tenant_name,
            tenant_code,
            deployment_host,
            brand_display_name,
            brand_short_code,
            brand_subtitle,
            brand_watermark_text: pickTenantWatermark(),
            cross_branch_append_enabled,
            backup_policy_enabled,
            backup_frequency,
            backup_retention_days,
            backup_window_hour,
            backup_window_minute,
            vendor_mirror_enabled,
            backup_next_due_at
          },
          select: tenantCompatSelect
        });
      } catch (compatError) {
        if (!isSchemaCompatibilityError(compatError)) throw compatError;
        tenant = await prisma.tenant.create({
          data: { tenant_name, tenant_code },
          select: tenantLegacySelect
        });
      }
    }
    writeSecurityAudit('ADMIN_CREATE_TENANT', {
      actor_user_id: req.user.id,
      tenant_id: tenant.id,
      tenant_code
    });

    res.status(201).json(toTenantResponse(tenant));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateTenantBackupPolicy = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Backup policy management requires the enterprise schema to be applied.' });
    }

    const tenantId = parseId(req.params.id);
    const existingTenant = await assertTenantBrandingAccess(req.user, tenantId);

    const nextBackupPolicyEnabled = Boolean(req.body.backup_policy_enabled ?? existingTenant.backup_policy_enabled ?? true);
    const nextBackupFrequency = normalizeBackupFrequency(req.body.backup_frequency || existingTenant.backup_frequency || 'DAILY');
    const nextBackupRetentionDays = Number.parseInt(String(req.body.backup_retention_days ?? existingTenant.backup_retention_days ?? 30), 10) || 30;
    const nextBackupWindowHour = normalizeBackupWindowHour(req.body.backup_window_hour ?? existingTenant.backup_window_hour ?? 18);
    const nextBackupWindowMinute = normalizeBackupWindowMinute(req.body.backup_window_minute ?? existingTenant.backup_window_minute ?? 0);

    const updatedTenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: {
        backup_policy_enabled: nextBackupPolicyEnabled,
        backup_frequency: nextBackupFrequency,
        backup_retention_days: nextBackupRetentionDays,
        backup_window_hour: nextBackupWindowHour,
        backup_window_minute: nextBackupWindowMinute,
        vendor_mirror_enabled: isSuperAdmin(req.user)
          ? Boolean(req.body.vendor_mirror_enabled ?? existingTenant.vendor_mirror_enabled ?? true)
          : Boolean(existingTenant.vendor_mirror_enabled ?? true),
        backup_next_due_at: computeBackupNextDueAt({
          backupPolicyEnabled: nextBackupPolicyEnabled,
          backupFrequency: nextBackupFrequency,
          backupWindowHour: nextBackupWindowHour,
          backupWindowMinute: nextBackupWindowMinute,
          backupLastCompletedAt: existingTenant.backup_last_completed_at,
          createdAt: existingTenant.created_at
        })
      },
      select: tenantSelect
    });

    writeSecurityAudit('ADMIN_UPDATE_TENANT_BACKUP_POLICY', {
      actor_user_id: req.user.id,
      tenant_id: updatedTenant.id,
      backup_policy_enabled: updatedTenant.backup_policy_enabled,
      backup_frequency: updatedTenant.backup_frequency,
      backup_retention_days: updatedTenant.backup_retention_days,
      backup_window_hour: updatedTenant.backup_window_hour,
      backup_window_minute: updatedTenant.backup_window_minute,
      vendor_mirror_enabled: updatedTenant.vendor_mirror_enabled
    });

    res.json(toTenantResponse(updatedTenant));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const updateTenantAuthPolicy = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Bank authentication policy requires the enterprise schema to be applied.' });
    }
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Only super admin can update bank authentication policy.' });
    }

    const tenantId = parseId(req.params.id);
    const existingTenant = await assertTenantBrandingAccess(req.user, tenantId);
    const nextCredentialDeliveryEnabled = req.body.credential_delivery_enabled != null
      ? Boolean(req.body.credential_delivery_enabled)
      : Boolean(existingTenant.credential_delivery_enabled);
    const nextOtpLoginEnabled = nextCredentialDeliveryEnabled
      ? Boolean(req.body.otp_login_enabled ?? existingTenant.otp_login_enabled)
      : false;

    const updatedTenant = await prisma.tenant.update({
      where: { id: existingTenant.id },
      data: {
        credential_delivery_enabled: nextCredentialDeliveryEnabled,
        otp_login_enabled: nextOtpLoginEnabled
      },
      select: tenantSelect
    });

    writeSecurityAudit('ADMIN_UPDATE_TENANT_AUTH_POLICY', {
      actor_user_id: req.user.id,
      tenant_id: updatedTenant.id,
      credential_delivery_enabled: updatedTenant.credential_delivery_enabled === true,
      otp_login_enabled: updatedTenant.otp_login_enabled === true
    });

    res.json(toTenantResponse(updatedTenant));
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Bank authentication policy needs the latest tenant schema in this database.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const runTenantBackupNow = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Bank backup requires the enterprise schema to be applied.' });
    }

    const tenantId = parseId(req.params.id);
    const tenant = await assertTenantBrandingAccess(req.user, tenantId);
    const timestamp = buildBackupTimestamp(tenant.tenant_code);
    const result = await runRecoveryScript('backup-all.mjs', ['--timestamp', timestamp]);
    const updatedTenant = await persistTenantBackupRun(tenant);

    writeSecurityAudit('ADMIN_TRIGGER_TENANT_BACKUP', {
      actor_user_id: req.user.id,
      tenant_id: tenant.id,
      tenant_code: tenant.tenant_code,
      backup_frequency: tenant.backup_frequency,
      backup_window_hour: tenant.backup_window_hour,
      backup_window_minute: tenant.backup_window_minute
    });

    res.status(201).json({
      message: 'Bank backup completed successfully.',
      tenant: toTenantResponse(updatedTenant),
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const exportTenantRecoveryPackage = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Recovery export requires the enterprise schema to be applied.' });
    }

    const tenantId = parseId(req.params.id);
    const tenant = await assertTenantBrandingAccess(req.user, tenantId);
    const timestamp = buildBackupTimestamp(`${tenant.tenant_code || 'BANK'}PKG`);
    const result = await runRecoveryScript('export-dr-package.mjs', ['--timestamp', timestamp]);
    const updatedTenant = await persistTenantBackupRun(tenant);

    writeSecurityAudit('ADMIN_EXPORT_TENANT_RECOVERY_PACKAGE', {
      actor_user_id: req.user.id,
      tenant_id: tenant.id,
      tenant_code: tenant.tenant_code,
      backup_frequency: tenant.backup_frequency,
      backup_window_hour: tenant.backup_window_hour,
      backup_window_minute: tenant.backup_window_minute
    });

    res.status(201).json({
      message: 'Bank recovery package exported successfully.',
      tenant: toTenantResponse(updatedTenant),
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

const assertTenantBrandingAccess = async (user, tenantId) => {
  const tenant = await findTenantById(tenantId);
  if (!tenant) {
    const error = new Error('Bank not found.');
    error.status = 404;
    throw error;
  }
  assertTenantAccess(user, tenant.id);
  return tenant;
};

const persistTenantLogo = async (tenantId, file) => {
  if (!file) return null;
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  if (!String(file.mimetype || '').toLowerCase().startsWith('image/')) {
    const error = new Error('Only image files can be used as bank logos.');
    error.status = 400;
    throw error;
  }
  const storedRelativePath = toStoredRelativePath(path.posix.join(
    'branding',
    sanitizeStorageSegment(String(tenantId), 'tenant'),
    `${Date.now()}-${sanitizeStorageFileName(file.originalname, 'logo') || `logo${extension}`}`
  ));
  const targetPath = await ensureStoredParentDir(storedRelativePath);
  await fs.writeFile(targetPath, file.buffer);
  return storedRelativePath;
};

export const updateTenantBranding = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Bank branding requires the enterprise schema to be applied.' });
    }

    const tenantId = parseId(req.params.id);
    const existingTenant = await assertTenantBrandingAccess(req.user, tenantId);

    const nextTenantName = String(req.body.tenant_name || existingTenant.tenant_name).trim() || existingTenant.tenant_name;
    const nextTenantCode = normalizeCode(req.body.tenant_code || existingTenant.tenant_code) || existingTenant.tenant_code;
    const nextDeploymentHost = isSuperAdmin(req.user)
      ? normalizeHost(req.body.deployment_host ?? existingTenant.deployment_host)
      : existingTenant.deployment_host;
    const nextDeploymentMode = isSuperAdmin(req.user)
      ? normalizeChoice(req.body.deployment_mode ?? existingTenant.deployment_mode, DEPLOYMENT_MODES, existingTenant.deployment_mode || 'SHARED')
      : normalizeChoice(existingTenant.deployment_mode, DEPLOYMENT_MODES, 'SHARED');
    const nextSupportBaseUrl = isSuperAdmin(req.user)
      ? normalizeSupportBaseUrl(req.body.support_base_url ?? existingTenant.support_base_url)
      : existingTenant.support_base_url;
    const nextSupportAccessMode = isSuperAdmin(req.user)
      ? normalizeChoice(req.body.support_access_mode ?? existingTenant.support_access_mode, SUPPORT_ACCESS_MODES, existingTenant.support_access_mode || 'REMOTE_API')
      : normalizeChoice(existingTenant.support_access_mode, SUPPORT_ACCESS_MODES, 'REMOTE_API');
    const nextSupportLoginUsername = isSuperAdmin(req.user)
      ? normalizeNullableText(req.body.support_login_username ?? existingTenant.support_login_username)
      : existingTenant.support_login_username;
    const nextSupportContactName = isSuperAdmin(req.user)
      ? normalizeNullableText(req.body.support_contact_name ?? existingTenant.support_contact_name)
      : existingTenant.support_contact_name;
    const nextSupportContactEmail = isSuperAdmin(req.user)
      ? normalizeNullableEmail(req.body.support_contact_email ?? existingTenant.support_contact_email)
      : existingTenant.support_contact_email;
    const nextSupportContactPhone = isSuperAdmin(req.user)
      ? normalizeNullablePhone(req.body.support_contact_phone ?? existingTenant.support_contact_phone)
      : existingTenant.support_contact_phone;
    const nextLicensePlan = isSuperAdmin(req.user)
      ? normalizeNullableText(req.body.license_plan ?? existingTenant.license_plan)
      : existingTenant.license_plan;
    const nextLicenseValidUntil = isSuperAdmin(req.user)
      ? normalizeNullableDate(req.body.license_valid_until ?? (existingTenant.license_valid_until ? new Date(existingTenant.license_valid_until).toISOString().slice(0, 10) : null))
      : existingTenant.license_valid_until;
    const nextBrandDisplayName = String(req.body.brand_display_name || nextTenantName).trim() || nextTenantName;
    const nextBrandShortCode = normalizeCode(req.body.brand_short_code || nextTenantCode) || nextTenantCode;
    const nextBrandSubtitle = String(req.body.brand_subtitle || existingTenant.brand_subtitle || 'Document Management System').trim() || 'Document Management System';
    const nextEmailFromName = normalizeNullableText(req.body.email_from_name ?? existingTenant.email_from_name);
    const nextEmailFromAddress = normalizeNullableEmail(req.body.email_from_address ?? existingTenant.email_from_address);
    const nextEmailReplyTo = normalizeNullableEmail(req.body.email_reply_to ?? existingTenant.email_reply_to);
    const nextAppendToggle = isSuperAdmin(req.user)
      ? Boolean(req.body.cross_branch_append_enabled ?? existingTenant.cross_branch_append_enabled)
      : Boolean(existingTenant.cross_branch_append_enabled);

    const nextLogoPath = req.file
      ? await persistTenantLogo(existingTenant.id, req.file)
      : existingTenant.brand_logo_path;

    let updatedTenant;
    try {
      updatedTenant = await prisma.tenant.update({
        where: { id: existingTenant.id },
        data: {
          tenant_name: isSuperAdmin(req.user) ? nextTenantName : existingTenant.tenant_name,
          tenant_code: isSuperAdmin(req.user) ? nextTenantCode : existingTenant.tenant_code,
          deployment_host: nextDeploymentHost,
          deployment_mode: nextDeploymentMode,
          support_base_url: nextSupportBaseUrl,
          support_access_mode: nextSupportAccessMode,
          support_login_username: nextSupportLoginUsername,
          support_contact_name: nextSupportContactName,
          support_contact_email: nextSupportContactEmail,
          support_contact_phone: nextSupportContactPhone,
          license_plan: nextLicensePlan,
          license_valid_until: nextLicenseValidUntil,
          brand_display_name: nextBrandDisplayName,
          brand_short_code: nextBrandShortCode,
          brand_subtitle: nextBrandSubtitle,
          brand_watermark_text: pickTenantWatermark(),
          brand_logo_path: nextLogoPath,
          email_from_name: nextEmailFromName,
          email_from_address: nextEmailFromAddress,
          email_reply_to: nextEmailReplyTo,
          cross_branch_append_enabled: nextAppendToggle
        },
        select: tenantSelect
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      updatedTenant = await prisma.tenant.update({
        where: { id: existingTenant.id },
        data: {
          tenant_name: isSuperAdmin(req.user) ? nextTenantName : existingTenant.tenant_name,
          tenant_code: isSuperAdmin(req.user) ? nextTenantCode : existingTenant.tenant_code,
          deployment_host: nextDeploymentHost,
          brand_display_name: nextBrandDisplayName,
          brand_short_code: nextBrandShortCode,
          brand_subtitle: nextBrandSubtitle,
          brand_watermark_text: pickTenantWatermark(),
          brand_logo_path: nextLogoPath,
          cross_branch_append_enabled: nextAppendToggle
        },
        select: tenantCompatSelect
      });
    }

    if (req.file && existingTenant.brand_logo_path && existingTenant.brand_logo_path !== nextLogoPath) {
      await fs.unlink(resolveStoredPath(existingTenant.brand_logo_path)).catch(() => {});
    }

    writeSecurityAudit('ADMIN_UPDATE_TENANT_BRANDING', {
      actor_user_id: req.user.id,
      tenant_id: updatedTenant.id,
      deployment_host: updatedTenant.deployment_host,
      deployment_mode: updatedTenant.deployment_mode,
      updated_logo: Boolean(req.file),
      cross_branch_append_enabled: updatedTenant.cross_branch_append_enabled
    });

    res.json(toTenantResponse(updatedTenant));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const listCities = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsCityModel) {
      return res.json([]);
    }

    const where = isSuperAdmin(req.user)
      ? (req.query.tenant_id ? { tenant_id: parseId(req.query.tenant_id) } : {})
      : { tenant_id: req.user.tenant_id };

    const cities = await prisma.city.findMany({
      where,
      include: {
        tenant: { select: { tenant_name: true, tenant_code: true } },
        _count: { select: { branches: true } }
      },
      orderBy: [{ tenant_id: 'asc' }, { city_name: 'asc' }]
    });

    res.json(cities);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.json([]);
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createCity = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsCityModel) {
      return res.status(400).json({ error: 'City management requires the latest schema to be applied.' });
    }

    const tenant_id = parseId(req.body.tenant_id) || req.user.tenant_id;
    const city_name = String(req.body.city_name || '').trim();
    const city_code = normalizeCityCode(req.body.city_code, city_name);
    const state_name = String(req.body.state_name || '').trim() || null;
    const state_code = normalizeCode(req.body.state_code || '') || null;

    if (!tenant_id || !city_name || !city_code) {
      return res.status(400).json({ error: 'Tenant and city name are required.' });
    }

    assertTenantAccess(req.user, tenant_id);

    const city = await prisma.city.create({
      data: {
        tenant_id,
        city_name,
        city_code,
        state_name,
        state_code
      }
    });

    writeSecurityAudit('ADMIN_CREATE_CITY', {
      actor_user_id: req.user.id,
      tenant_id,
      city_id: city.id,
      city_code
    });

    res.status(201).json(city);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Apply the latest database migration before using city management.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const listBranches = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.json([]);
    }
    const where = {};
    if (isSuperAdmin(req.user)) {
      if (req.query.tenant_id) where.tenant_id = parseId(req.query.tenant_id);
    } else {
      where.tenant_id = req.user.tenant_id;
    }

    let branches;
    try {
      branches = await prisma.branch.findMany({
        where,
        select: {
          id: true,
          tenant_id: true,
          branch_name: true,
          branch_code: true,
          branch_address: true,
          tenant: { select: { tenant_name: true, tenant_code: true } },
          city: { select: { id: true, city_name: true, city_code: true, state_name: true, state_code: true } },
          _count: { select: { users: true, notes: true } }
        },
        orderBy: [{ tenant_id: 'asc' }, { branch_name: 'asc' }]
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      branches = await prisma.branch.findMany({
        where,
        select: {
          id: true,
          tenant_id: true,
          branch_name: true,
          branch_code: true,
          branch_address: true,
          tenant: { select: { tenant_name: true, tenant_code: true } },
          _count: { select: { users: true, notes: true } }
        },
        orderBy: [{ tenant_id: 'asc' }, { branch_name: 'asc' }]
      });
      branches = branches.map((branch) => ({ ...branch, city: null }));
    }

    res.json(branches);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createBranch = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Branch management requires the enterprise schema to be applied.' });
    }

    const branch_name = String(req.body.branch_name || '').trim();
    const requestedBranchCode = normalizeCode(req.body.branch_code);
    const branch_address = String(req.body.branch_address || '').trim();
    const tenant_id = parseId(req.body.tenant_id) || req.user.tenant_id;
    const city_id = parseId(req.body.city_id);

    if (!branch_name || !tenant_id || !city_id) {
      return res.status(400).json({ error: 'Tenant, city, and branch name are required.' });
    }

    assertTenantAccess(req.user, tenant_id);
    const [tenant, city] = await Promise.all([
      findTenantById(tenant_id),
      assertManagedCityAccess(req.user, city_id, tenant_id)
    ]);

    if (!tenant) {
      return res.status(404).json({ error: 'Bank not found.' });
    }

    const branch = await runTransaction(async (tx) => {
      const branch_code = requestedBranchCode || await generateBranchCode(tx, tenant, city);
      return tx.branch.create({
        data: {
          branch_name,
          branch_code,
          branch_address: branch_address || null,
          tenant_id,
          city_id: city.id
        }
      });
    });
    writeSecurityAudit('ADMIN_CREATE_BRANCH', {
      actor_user_id: req.user.id,
      tenant_id,
      branch_id: branch.id,
      city_id: city.id,
      branch_code: branch.branch_code
    });

    res.status(201).json(branch);
  } catch (error) {
    if (isSchemaCompatibilityError(error)) {
      return res.status(400).json({ error: 'Apply the latest database migration before assigning cities to branches.' });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const listUsers = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      const users = await prisma.user.findMany({
        select: legacyUserSelect,
        orderBy: { created_at: 'desc' }
      });
      return res.json(users.map(toLegacyUserResponse));
    }
    const users = await prisma.user.findMany({
      where: buildScopedUserWhere(req),
      select: userSelect,
      orderBy: { created_at: 'desc' }
    });
    const enrichedUsers = await enrichUsersWithIdentity(users);
    const locatedUsers = await enrichUsersWithBranchLocation(enrichedUsers);
    const fmsAwareUsers = await Promise.all(locatedUsers.map(async (managedUser) => ({
      ...managedUser,
      has_granted_fms_access: await hasGrantedFmsAccess({
        ...managedUser,
        department_id: managedUser.department?.id ?? null
      }).catch(() => false)
    })));
    res.json(fmsAwareUsers.map(toUserResponse));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const createUser = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Create user with tenant and branch requires the enterprise schema to be applied.' });
    }

    const roleName = String(req.body.role || '').trim().toUpperCase();
    const name = String(req.body.name || '').trim();
    const contactEmail = String(req.body.email || '').trim().toLowerCase();
    const employee_id = normalizeEmployeeId(req.body.employee_id);
    const username = buildManagedLoginUsername(employee_id);
    const { mobile_number, credential_delivery_mode } = validateManagedUserDelivery({
      email: contactEmail,
      mobileNumber: req.body.mobile_number,
      deliveryMode: req.body.credential_delivery_mode
    });
    const date_of_birth = String(req.body.date_of_birth || '').trim();
    const tenant_id = parseId(req.body.tenant_id) || req.user.tenant_id;
    const branch_id = parseId(req.body.branch_id);
    const department_id = parseId(req.body.department_id);
    const vertical_id = parseId(req.body.vertical_id);
    const accessibleBranchIds = await assertAccessibleBranchesWithinTenant(tenant_id, req.body.accessible_branch_ids);
    const fmsEnabled = false;
    const fmsPermissions = [];

    if (!name || !employee_id || !date_of_birth || !roleName || !tenant_id || !branch_id) {
      return res.status(400).json({ error: 'Name, employee ID, date of birth, role, tenant, and branch are required.' });
    }

    const canCreateAdminRoles = isSuperAdmin(req.user);
    if (!MANAGED_ROLES.includes(roleName) && !(canCreateAdminRoles && roleName === 'SUPER_ADMIN')) {
      return res.status(400).json({ error: 'Invalid role selected.' });
    }

    if ((roleName === 'SUPER_ADMIN' || roleName === 'ADMIN') && !canCreateAdminRoles) {
      return res.status(403).json({ error: 'Only super admin can create admin-level users.' });
    }

    assertTenantAccess(req.user, tenant_id);
    const [role, tenant, branch, employeeDuplicateRows] = await Promise.all([
      prisma.role.findUnique({ where: { name: roleName } }),
      findTenantById(tenant_id),
      loadManagedBranch(branch_id, tenant_id),
      prisma.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE UPPER("employee_id") = ${employee_id}
        LIMIT 1
      `
    ]);

    if (!role) return res.status(400).json({ error: 'Role does not exist.' });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });
    if (!branch || branch.tenant_id !== tenant_id) {
      return res.status(404).json({ error: 'Branch not found for tenant.' });
    }
    if (employeeDuplicateRows.length > 0) {
      return res.status(409).json({ error: 'Employee ID already exists.' });
    }

    const email = buildManagedStoredEmail(contactEmail, employee_id, tenant.tenant_code);
    const duplicate = await prisma.user.findFirst({
      where: {
        username
      }
    });
    if (duplicate) {
      return res.status(409).json({ error: 'Generated login identity already exists.' });
    }
    const fmsOwnedDepartmentId = parseId(req.body.fms_owned_department_id);
    if (fmsOwnedDepartmentId && hasDepartmentLevelFmsOwnership(fmsEnabled, fmsPermissions)) {
      const conflicts = await findDepartmentAssignmentConflicts({
        tenantId: tenant_id,
        departmentId: fmsOwnedDepartmentId
      });
      if (conflicts.length > 0) {
        return res.status(409).json({
          code: 'FMS_DEPARTMENT_ALREADY_ASSIGNED',
          error: 'This FMS department already has an active primary assignment.',
          conflicts: conflicts.map((user) => ({
            id: user.id,
            name: user.name,
            employee_id: user.employee_id ?? null,
            branch_name: user.branch?.branch_name || null
          }))
        });
      }
    }

    const temporaryPassword = generateTemporaryPassword();
    const password_hash = await bcrypt.hash(temporaryPassword, 10);
    const created = await runTransaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          username,
          password_hash,
          role_id: role.id,
          tenant_id,
          branch_id,
          department_id,
          vertical_id,
          is_active: true,
          is_first_login: true,
          accessible_branch_ids: accessibleBranchIds,
          fms_enabled: fmsEnabled,
          fms_permissions: fmsPermissions
        }
      });

      await tx.$executeRaw`
        UPDATE "User"
        SET "temp_password_hash" = ${password_hash},
            "must_change_password" = TRUE,
            "password_changed_at" = NOW()
        WHERE "id" = ${user.id}
      `;
      await persistUserIdentityEnvelope(tx, {
        userId: user.id,
        employeeId: employee_id,
        dateOfBirth: date_of_birth,
        mobileNumber: mobile_number,
        credentialDeliveryMode: credential_delivery_mode
      });

      const user_id = await createUserCode(tx, tenant.tenant_code, branch.branch_code);
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { user_id }
      });

      if (accessibleBranchIds.length > 0) {
        await tx.userBranchAccess.createMany({
          data: [...new Set(accessibleBranchIds)].map((allowedBranchId) => ({
            user_id: updated.id,
            branch_id: allowedBranchId
          })),
          skipDuplicates: true
        });
      }

      const createdUser = await tx.user.findUnique({
        where: { id: updated.id },
        select: userSelect
      });
      return {
        ...createdUser,
        employee_id,
        mobile_number,
        credential_delivery_mode,
        date_of_birth
      };
    });

    const createdUserResponse = toUserResponse(created);
    await createNotification({
      userId: created.id,
      tenantId: created.tenant_id ?? null,
      branchId: created.branch_id ?? null,
      title: 'Banking role assigned',
      message: `Your banking workspace profile is active as ${created.role?.name || 'USER'}. Sign in with the issued credentials and review your desk access.`,
      category: 'ACCESS',
      entityType: 'USER',
      entityId: created.id
    }).catch(() => {});
    const provisioningMail = await sendUserProvisioningEmail({
      user: {
        id: created.id,
        tenant_id: created.tenant_id,
        name: created.name,
        email: isSyntheticUserEmail(created.email) ? null : created.email,
        username: created.username,
        employee_id: created.employee_id,
        mobile_number: created.mobile_number,
        credential_delivery_mode: created.credential_delivery_mode
      },
      tenant: created.tenant,
      roleName: created.role?.name,
      temporaryPassword,
      branchName: created.branch?.branch_name,
      createdByName: req.user?.name || req.user?.email || 'Bank administrator'
    }).catch((error) => {
      writeSecurityAudit('USER_PROVISIONING_EMAIL_FAILED', {
        actor_user_id: req.user.id,
        target_user_id: created.id,
        tenant_id,
        branch_id,
        reason: error.message
      });
      return {
        status: 'FAILED',
        error: error.message
      };
    });

    res.status(201).json({
      temp_password: temporaryPassword,
      delivery: provisioningMail,
      user: createdUserResponse
    });
    writeSecurityAudit('ADMIN_CREATE_USER', {
      actor_user_id: req.user.id,
      target_user_id: created.id,
      tenant_id,
      branch_id,
      role: roleName,
      credential_delivery_mode,
      mobile_number: mobile_number ?? null,
      fms_enabled: fmsEnabled,
      fms_permissions: fmsPermissions
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const updateUser = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'User activation and branch assignment require the enterprise schema to be applied.' });
    }
    const targetId = parseId(req.params.id);
    assertNotSelfTarget(req.user, targetId, 'modify');
    const targetRows = await prisma.user.findMany({ where: { id: targetId }, select: userSelect, take: 1 });
    const target = targetRows.length
      ? (await enrichUsersWithIdentity(targetRows))[0]
      : null;
    if (!target) return res.status(404).json({ error: 'User not found.' });

    assertTenantAccess(req.user, target.tenant_id);
    assertManageableTarget(req.user, target, 'modify');

    const data = {};
    const nextEmployeeId = req.body.employee_id != null
      ? normalizeEmployeeId(req.body.employee_id)
      : normalizeEmployeeId(target.employee_id);
    const shouldUpdateDeliveryIdentity = req.body.employee_id != null || req.body.mobile_number != null || req.body.credential_delivery_mode != null;
    const nextContactEmail = req.body.email != null
      ? String(req.body.email).trim().toLowerCase()
      : (isSyntheticUserEmail(target.email) ? '' : target.email);
    const nextEmail = req.body.email != null
      ? buildManagedStoredEmail(nextContactEmail, nextEmployeeId, target.tenant?.tenant_code || target.tenant_code || 'BANK')
      : target.email;
    const nextDelivery = shouldUpdateDeliveryIdentity
      ? validateManagedUserDelivery({
        email: nextContactEmail,
        mobileNumber: req.body.mobile_number != null ? req.body.mobile_number : target.mobile_number,
        deliveryMode: req.body.credential_delivery_mode != null ? req.body.credential_delivery_mode : target.credential_delivery_mode
      })
      : null;
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (req.body.email != null) data.email = nextEmail;
    if (req.body.employee_id != null || req.body.username != null) data.username = buildManagedLoginUsername(nextEmployeeId);
    if (req.body.is_active != null) data.is_active = Boolean(req.body.is_active);
    if (req.body.fms_enabled != null) data.fms_enabled = Boolean(req.body.fms_enabled);
    if (req.body.department_id != null) data.department_id = parseId(req.body.department_id);
    if (req.body.vertical_id != null) data.vertical_id = parseId(req.body.vertical_id);
    const requestedOwnedFmsDepartmentId = req.body.fms_owned_department_id != null ? parseId(req.body.fms_owned_department_id) : undefined;
    if (req.body.fms_permissions != null || req.body.fms_owned_department_id != null) {
      data.fms_permissions = normalizeFmsPermissionsInput(
        req.body.fms_permissions != null ? req.body.fms_permissions : target.fms_permissions,
        { ownedDepartmentId: requestedOwnedFmsDepartmentId !== undefined ? requestedOwnedFmsDepartmentId : getUserOwnedFmsDepartmentId(target) }
      );
    }

    const nextUsername = data.username || target.username || null;
    if (nextUsername) {
      const duplicate = await prisma.user.findFirst({
        where: {
          username: nextUsername,
          NOT: { id: targetId }
        }
      });
      if (duplicate) {
        return res.status(409).json({ error: 'Generated login identity already exists.' });
      }
    }

    if (req.body.employee_id != null) {
      const employeeDuplicateRows = await prisma.$queryRaw`
        SELECT "id"
        FROM "User"
        WHERE UPPER("employee_id") = ${nextEmployeeId}
          AND "id" <> ${targetId}
        LIMIT 1
      `;
      if (employeeDuplicateRows.length > 0) {
        return res.status(409).json({ error: 'Employee ID already exists.' });
      }
    }

    if (req.body.role) {
      const roleName = String(req.body.role).trim().toUpperCase();
      if (!MANAGED_ROLES.includes(roleName) && !(isSuperAdmin(req.user) && roleName === 'SUPER_ADMIN')) {
        return res.status(400).json({ error: 'Invalid role selected.' });
      }
      if ((roleName === 'ADMIN' || roleName === 'SUPER_ADMIN') && !isSuperAdmin(req.user)) {
        return res.status(403).json({ error: 'Only super admin can assign admin-level roles.' });
      }
      const role = await prisma.role.findUnique({ where: { name: roleName } });
      if (!role) return res.status(404).json({ error: 'Role not found.' });
      data.role_id = role.id;
    }

    if (req.body.branch_id != null) {
      const branch_id = parseId(req.body.branch_id);
      await loadManagedBranch(branch_id, target.tenant_id);
      data.branch_id = branch_id;
    }

    const accessibleBranchIds = Array.isArray(req.body.accessible_branch_ids)
      ? await assertAccessibleBranchesWithinTenant(target.tenant_id, req.body.accessible_branch_ids)
      : null;
    const nextFmsEnabled = req.body.fms_enabled != null ? Boolean(req.body.fms_enabled) : Boolean(target.fms_enabled);
    const nextFmsPermissions = req.body.fms_permissions != null || req.body.fms_owned_department_id != null
      ? normalizeFmsPermissionsInput(
        req.body.fms_permissions != null ? req.body.fms_permissions : target.fms_permissions,
        { ownedDepartmentId: requestedOwnedFmsDepartmentId !== undefined ? requestedOwnedFmsDepartmentId : getUserOwnedFmsDepartmentId(target) }
      )
      : target.fms_permissions;
    const nextOwnedDepartmentId = requestedOwnedFmsDepartmentId !== undefined
      ? requestedOwnedFmsDepartmentId
      : getUserOwnedFmsDepartmentId(target);

    if (
      nextOwnedDepartmentId
      && hasDepartmentLevelFmsOwnership(nextFmsEnabled, nextFmsPermissions)
      && req.body.override_department_assignment !== true
    ) {
      const conflicts = await findDepartmentAssignmentConflicts({
        tenantId: target.tenant_id,
        departmentId: nextOwnedDepartmentId,
        excludeUserId: targetId
      });
      if (conflicts.length > 0) {
        return res.status(409).json({
          code: 'FMS_DEPARTMENT_ALREADY_ASSIGNED',
          error: 'This FMS department already has an active primary assignment.',
          conflicts: conflicts.map((user) => ({
            id: user.id,
            name: user.name,
            employee_id: user.employee_id ?? null,
            branch_name: user.branch?.branch_name || null
          }))
        });
      }
    }

    const updated = await runTransaction(async (tx) => {
      await tx.user.update({
        where: { id: targetId },
        data: {
          ...data,
          ...(accessibleBranchIds ? { accessible_branch_ids: accessibleBranchIds } : {})
        }
      });

      if (req.body.employee_id != null || nextDelivery) {
        await persistUserIdentityEnvelope(tx, {
          userId: targetId,
          employeeId: nextEmployeeId,
          dateOfBirth: String(req.body.date_of_birth || formatDob(target.date_of_birth) || '').trim(),
          mobileNumber: nextDelivery?.mobile_number ?? target.mobile_number ?? null,
          credentialDeliveryMode: nextDelivery?.credential_delivery_mode ?? target.credential_delivery_mode ?? 'EMAIL'
        });
      }

      if (req.body.date_of_birth != null) {
        await tx.$executeRaw`
          UPDATE "User"
          SET "date_of_birth" = CAST(${String(req.body.date_of_birth)} AS date)
          WHERE "id" = ${targetId}
        `;
      }

      if (accessibleBranchIds) {
        await tx.userBranchAccess.deleteMany({ where: { user_id: targetId } });
        if (accessibleBranchIds.length > 0) {
          await tx.userBranchAccess.createMany({
            data: [...new Set(accessibleBranchIds)].map((branch_id) => ({ user_id: targetId, branch_id })),
            skipDuplicates: true
          });
        }
      }

      const updatedUser = await tx.user.findUnique({
        where: { id: targetId },
        select: userSelect
      });
      const identityRows = await tx.$queryRaw`
        SELECT "employee_id", "mobile_number", "credential_delivery_mode", "date_of_birth"
        FROM "User"
        WHERE "id" = ${targetId}
      `;
      return {
        ...updatedUser,
        employee_id: identityRows[0]?.employee_id ?? null,
        mobile_number: identityRows[0]?.mobile_number ?? null,
        credential_delivery_mode: normalizeDeliveryMode(identityRows[0]?.credential_delivery_mode, 'EMAIL'),
        date_of_birth: identityRows[0]?.date_of_birth ?? null
      };
    });

    const accessProfileChanged = (
      Number(target.role?.id || 0) !== Number(updated.role?.id || 0)
      || Number(target.branch_id || 0) !== Number(updated.branch_id || 0)
      || Number(target.department_id || 0) !== Number(updated.department_id || 0)
      || Number(target.vertical_id || 0) !== Number(updated.vertical_id || 0)
      || Boolean(target.fms_enabled) !== Boolean(updated.fms_enabled)
      || Boolean(target.is_active) !== Boolean(updated.is_active)
      || JSON.stringify(target.fms_permissions || []) !== JSON.stringify(updated.fms_permissions || [])
    );

    if (accessProfileChanged) {
      await createNotification({
        userId: updated.id,
        tenantId: updated.tenant_id ?? null,
        branchId: updated.branch_id ?? null,
        title: 'Role or bank access updated',
        message: 'Your administrator updated your role, branch scope, or file-management permissions. Review the latest banking access profile after sign-in.',
        category: 'ACCESS',
        entityType: 'USER',
        entityId: updated.id
      }).catch(() => {});

      await sendRoleAccessUpdatedEmail({
        user: {
          id: updated.id,
          tenant_id: updated.tenant_id ?? null,
          name: updated.name,
          email: isSyntheticUserEmail(updated.email) ? null : updated.email,
          username: updated.username ?? null
        },
        tenant: updated.tenant || null,
        roleName: updated.role?.name || '',
        branchName: updated.branch?.branch_name || '',
        departmentName: updated.department?.name || '',
        verticalName: updated.vertical?.name || '',
        fmsEnabled: Boolean(updated.fms_enabled),
        fmsPermissions: getUserFmsPermissions(updated),
        assignedByName: req.user?.name || req.user?.email || 'Bank administrator'
      }).catch(() => {});
    }

    res.json(toUserResponse(updated));
    writeSecurityAudit('ADMIN_UPDATE_USER', {
      actor_user_id: req.user.id,
      target_user_id: targetId,
      tenant_id: updated.tenant_id,
      branch_id: updated.branch_id
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const resetUserPassword = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    const targetId = parseId(req.params.id);
    assertNotSelfTarget(req.user, targetId, 'reset the password for');
    if (!supportsEnterpriseModels) {
      const targetBase = await prisma.user.findUnique({
        where: { id: targetId },
        select: resetMailLegacyUserSelect
      });
      const target = targetBase
        ? (await enrichUsersWithIdentity([targetBase]))[0]
        : null;
      if (!target) return res.status(404).json({ error: 'User not found.' });

      const temporaryPassword = generateTemporaryPassword();
      const temp_password_hash = await bcrypt.hash(temporaryPassword, 12);
      await prisma.$executeRaw`
        UPDATE "User"
        SET "temp_password_hash" = ${temp_password_hash},
            "must_change_password" = TRUE,
            "is_first_login" = FALSE,
            "password_changed_at" = NOW()
        WHERE "id" = ${targetId}
      `;
      await createNotification({
        userId: targetId,
        tenantId: target.tenant_id ?? null,
        branchId: target.branch_id ?? null,
        title: 'Password reset required',
        message: 'Your administrator reset your password. Please sign in with the temporary password shared through a secure channel and change it immediately.',
        category: 'SECURITY',
        entityType: 'USER',
        entityId: targetId
      }).catch(() => {});
      writeSecurityAudit('ADMIN_RESET_PASSWORD', {
        actor_user_id: req.user.id,
        target_user_id: targetId
      });
      const resetMail = await sendTemporaryPasswordResetEmail({
        user: {
          id: target.id,
          tenant_id: target.tenant_id ?? null,
          name: target.name,
          email: isSyntheticUserEmail(target.email) ? null : target.email,
          username: target.username ?? null,
          employee_id: target.employee_id ?? null,
          mobile_number: target.mobile_number ?? null,
          credential_delivery_mode: target.credential_delivery_mode ?? 'EMAIL'
        },
        roleName: target.role?.name,
        temporaryPassword,
        branchName: target.branch?.branch_name,
        resetByName: req.user?.name || req.user?.email || 'Bank administrator'
      }).catch((error) => ({
        status: 'FAILED',
        error: error.message
      }));

      return res.json({ message: 'Temporary password reset successfully.', temp_password: temporaryPassword, delivery: resetMail });
    }

    const targetRows = await prisma.user.findMany({
      where: { id: targetId },
      select: userSelect,
      take: 1
    });
    const target = targetRows.length
      ? (await enrichUsersWithIdentity(targetRows))[0]
      : null;
    if (!target) return res.status(404).json({ error: 'User not found.' });
    assertTenantAccess(req.user, target.tenant_id);
    assertManageableTarget(req.user, target, 'reset passwords for');

    const temporaryPassword = generateTemporaryPassword();
    const temp_password_hash = await bcrypt.hash(temporaryPassword, 12);
    await prisma.$executeRaw`
      UPDATE "User"
      SET "temp_password_hash" = ${temp_password_hash},
          "must_change_password" = TRUE,
          "is_first_login" = FALSE,
          "password_changed_at" = NOW()
      WHERE "id" = ${targetId}
    `;
    await createNotification({
      userId: targetId,
      tenantId: target.tenant_id ?? null,
      branchId: target.branch_id ?? null,
      title: 'Password reset required',
      message: 'Your administrator reset your password. Please sign in with the temporary password shared through a secure channel and change it immediately.',
      category: 'SECURITY',
      entityType: 'USER',
      entityId: targetId
    }).catch(() => {});
    writeSecurityAudit('ADMIN_RESET_PASSWORD', {
      actor_user_id: req.user.id,
      target_user_id: targetId,
      tenant_id: target.tenant_id,
      branch_id: target.branch_id
    });

    const resetMail = await sendTemporaryPasswordResetEmail({
      user: {
        id: target.id,
        tenant_id: target.tenant_id ?? null,
        name: target.name,
        email: isSyntheticUserEmail(target.email) ? null : target.email,
        username: target.username ?? null,
        employee_id: target.employee_id ?? null,
        mobile_number: target.mobile_number ?? null,
        credential_delivery_mode: target.credential_delivery_mode ?? 'EMAIL'
      },
      roleName: target.role?.name,
      temporaryPassword,
      branchName: target.branch?.branch_name,
      resetByName: req.user?.name || req.user?.email || 'Bank administrator'
    }).catch((error) => ({
      status: 'FAILED',
      error: error.message
    }));

    res.json({ message: 'Temporary password reset successfully.', temp_password: temporaryPassword, delivery: resetMail });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const bulkImportUsers = async (req, res) => {
  try {
    assertAdminAccess(req.user);
    if (!supportsEnterpriseModels) {
      return res.status(400).json({ error: 'Bulk import with tenant and branch mapping requires the enterprise schema to be applied.' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Upload a CSV exported from Excel.' });
    }

    const raw = req.file.buffer.toString('utf8');
    const rows = parseCsv(raw);
    if (rows.length < 2) {
      return res.status(400).json({ error: 'CSV file is empty.' });
    }

    const headers = rows[0].map((value) => toImportLabel(value));
    const detectedColumns = detectImportColumns(headers);
    const items = rows.slice(1).map((columns) => Object.fromEntries(headers.map((header, index) => [header, columns[index] || ''])));
    const fallbackTenantId = parseId(req.body.tenant_id) || req.user.tenant_id || null;
    const fallbackBranchId = parseId(req.body.default_branch_id) || null;
    const forcedBranchId = String(req.body.use_selected_branch_only || '').toLowerCase() === 'true'
      ? fallbackBranchId
      : parseId(req.body.forced_branch_id) || null;

    const preparedRows = await prepareBulkImportRows({
      actor: req.user,
      items,
      detectedColumns,
      fallbackTenantId,
      fallbackBranchId,
      forcedBranchId
    });

    const intent = String(req.body.intent || 'preview').trim().toLowerCase();
    const preview = summarizeBulkImportPreview(preparedRows, detectedColumns);

    if (intent !== 'confirm') {
      return res.json({
        mode: 'preview',
        ...preview
      });
    }

    const results = [];
    for (const preparedRow of preparedRows) {
      if (preparedRow.status !== 'READY') {
        results.push(preparedRow);
        continue;
      }

      const fakeReq = {
        user: req.user,
        body: preparedRow.payload
      };
      const fakeRes = {
        statusCode: 200,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          return this;
        }
      };

      await createUser(fakeReq, fakeRes);
      if (fakeRes.statusCode >= 400) {
        results.push({
          status: 'FAILED',
          row: preparedRow.row,
          reason: fakeRes.payload?.error || 'Import failed.'
        });
      } else {
        results.push({
          status: 'CREATED',
          row: preparedRow.row,
          user: fakeRes.payload?.user,
          branch: preparedRow.branch
        });
      }
    }

    const importedCount = results.filter((item) => item.status === 'CREATED').length;
    const failedCount = results.filter((item) => item.status === 'FAILED').length;

    res.json({
      mode: 'confirm',
      imported: importedCount,
      failed: failedCount,
      detected_columns: detectedColumns,
      branch_summary: preview.branch_summary,
      results
    });
    writeSecurityAudit('ADMIN_BULK_IMPORT_USERS', {
      actor_user_id: req.user.id,
      imported: importedCount,
      failed: failedCount
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};
