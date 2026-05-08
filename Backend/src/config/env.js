import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');

const parseBoolean = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const parseNumber = (value, fallback) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseList = (value, fallback = []) => {
  if (!value) return fallback;
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const parseChoice = (value, allowed, fallback) => {
  const normalized = String(value || '').trim().toUpperCase();
  return allowed.includes(normalized) ? normalized : fallback;
};

const clampNumber = (value, min, max, fallback) => {
  const parsed = parseNumber(value, fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const appEnv = process.env.NODE_ENV || process.env.APP_ENV || 'development';
export const isProduction = appEnv === 'production';
export const brandDisplayName = String(process.env.BRAND_DISPLAY_NAME || process.env.DEPLOYMENT_BANK_NAME || 'DMS').trim() || 'DMS';
export const brandShortCode = String(process.env.BRAND_SHORT_CODE || process.env.DEPLOYMENT_BANK_CODE || 'DMS').trim().toUpperCase() || 'DMS';
export const brandLogoUrl = String(process.env.BRAND_LOGO_URL || '').trim();
export const brandWatermarkText = String(process.env.BRAND_WATERMARK_TEXT || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd').trim() || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd';
export const brandSubtitle = String(process.env.BRAND_SUBTITLE || 'Document Management System').trim() || 'Document Management System';
export const appPublicBaseUrl = String(process.env.APP_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
export const deploymentSiteRole = parseChoice(process.env.DEPLOYMENT_SITE_ROLE, ['PRIMARY', 'MIRROR'], 'PRIMARY');
export const deploymentCustomerCode = String(process.env.DEPLOYMENT_CUSTOMER_CODE || 'dms').trim().toLowerCase();
export const deploymentLabel = String(process.env.DEPLOYMENT_LABEL || deploymentCustomerCode || 'dms').trim();
export const mirrorSyncEnabled = parseBoolean(process.env.MIRROR_SYNC_ENABLED, false);
export const mirrorSourceLabel = String(process.env.MIRROR_SOURCE_LABEL || '').trim();
export const supportAccessToken = String(process.env.SUPPORT_ACCESS_TOKEN || '').trim();
export const supportOverviewEnabled = parseBoolean(process.env.SUPPORT_OVERVIEW_ENABLED, Boolean(supportAccessToken));
export const enableDemoFeatures = parseBoolean(
  process.env.ENABLE_DEMO ?? process.env.ENABLE_DEMO_FEATURES,
  !isProduction
);
export const enforceSecureAuth = parseBoolean(process.env.ENFORCE_SECURE_AUTH, isProduction);
export const trustProxy = parseBoolean(process.env.TRUST_PROXY, isProduction);
export const requireHttps = parseBoolean(process.env.REQUIRE_HTTPS, isProduction);
const defaultStorageRoot = isProduction ? '/opt/dms/shared/uploads' : path.resolve(backendRoot, 'uploads');
export const uploadRoot = path.resolve(process.env.STORAGE_ROOT || defaultStorageRoot);
export const loginRateLimitWindowMs = parseNumber(
  process.env.LOGIN_RATE_LIMIT_WINDOW_MS,
  enableDemoFeatures ? 120000 : 900000
);
export const loginRateLimitMax = parseNumber(
  process.env.LOGIN_RATE_LIMIT_MAX,
  enableDemoFeatures ? 30 : 10
);
export const failedLoginWindowMs = parseNumber(
  process.env.FAILED_LOGIN_WINDOW_MS,
  15 * 60 * 1000
);
export const failedLoginThreshold = parseNumber(
  process.env.FAILED_LOGIN_THRESHOLD,
  5
);
export const failedLoginLockDurationMs = parseNumber(
  process.env.FAILED_LOGIN_LOCK_DURATION_MS,
  failedLoginWindowMs
);
export const otpLoginEnabled = parseBoolean(process.env.OTP_LOGIN_ENABLED, true);
export const otpFallbackThreshold = parseNumber(
  process.env.OTP_FALLBACK_THRESHOLD,
  failedLoginThreshold
);
export const otpCodeLength = parseNumber(process.env.OTP_CODE_LENGTH, 6);
export const otpTtlMs = parseNumber(process.env.OTP_TTL_MS, 10 * 60 * 1000);
export const otpResendCooldownMs = parseNumber(process.env.OTP_RESEND_COOLDOWN_MS, 60 * 1000);
export const otpMaxVerifyAttempts = parseNumber(process.env.OTP_MAX_VERIFY_ATTEMPTS, 5);
export const otpPreviewInResponse = parseBoolean(
  process.env.OTP_PREVIEW_IN_RESPONSE,
  !isProduction
);
export const otpDeliveryWebhookUrl = process.env.OTP_DELIVERY_WEBHOOK_URL || '';
export const otpDeliveryAllowedHosts = parseList(process.env.OTP_DELIVERY_ALLOWED_HOSTS, []);
export const mobileDeliveryMode = parseChoice(
  process.env.MOBILE_DELIVERY_MODE,
  ['WEBHOOK', 'PROVIDER', 'PREVIEW', 'MANUAL', 'DISABLED'],
  isProduction ? 'DISABLED' : 'PREVIEW'
);
export const mobileDeliveryWebhookUrl = process.env.MOBILE_DELIVERY_WEBHOOK_URL || otpDeliveryWebhookUrl || '';
export const mobileDeliveryAllowedHosts = parseList(
  process.env.MOBILE_DELIVERY_ALLOWED_HOSTS,
  otpDeliveryAllowedHosts
);
export const mobileDeliveryProvider = parseChoice(
  process.env.MOBILE_DELIVERY_PROVIDER,
  ['GENERIC_WEBHOOK', 'TWILIO'],
  'GENERIC_WEBHOOK'
);
export const mobileDeliveryInternalToken = String(
  process.env.MOBILE_DELIVERY_INTERNAL_TOKEN || supportAccessToken || ''
).trim();
export const mobilePreviewDir = path.resolve(
  backendRoot,
  process.env.MOBILE_PREVIEW_DIR || path.join('logs', 'mobile-previews')
);
export const mobileManualDir = path.resolve(
  backendRoot,
  process.env.MOBILE_MANUAL_DIR || path.join('logs', 'mobile-manual')
);
export const twilioAccountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
export const twilioAuthToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
export const twilioFromNumber = String(process.env.TWILIO_FROM_NUMBER || '').trim();
const derivedEmailDeliveryMode = (() => {
  const explicit = parseChoice(process.env.EMAIL_DELIVERY_MODE, ['SMTP', 'PREVIEW', 'DISABLED'], '');
  if (explicit) return explicit;
  if (process.env.SMTP_HOST) return 'SMTP';
  return isProduction ? 'DISABLED' : 'PREVIEW';
})();
export const emailDeliveryMode = derivedEmailDeliveryMode;
export const emailPreviewDir = path.resolve(backendRoot, process.env.EMAIL_PREVIEW_DIR || path.join('logs', 'email-previews'));
export const smtpHost = String(process.env.SMTP_HOST || '').trim();
export const smtpPort = parseNumber(process.env.SMTP_PORT, 587);
export const smtpSecure = parseBoolean(process.env.SMTP_SECURE, smtpPort === 465);
export const smtpUser = String(process.env.SMTP_USER || '').trim();
export const smtpPass = String(process.env.SMTP_PASS || '').trim();
export const smtpFromEmail = String(process.env.SMTP_FROM_EMAIL || '').trim();
export const smtpFromName = String(process.env.SMTP_FROM_NAME || brandDisplayName).trim() || brandDisplayName;
export const smtpReplyTo = String(process.env.SMTP_REPLY_TO || '').trim();
export const apiRateLimitWindowMs = parseNumber(process.env.API_RATE_LIMIT_WINDOW_MS, 60000);
export const apiRateLimitMax = parseNumber(process.env.API_RATE_LIMIT_MAX, 240);
export const criticalRateLimitWindowMs = parseNumber(process.env.CRITICAL_RATE_LIMIT_WINDOW_MS, 60000);
export const criticalRateLimitMax = parseNumber(process.env.CRITICAL_RATE_LIMIT_MAX, 30);
export const passwordResetRateLimitWindowMs = parseNumber(process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);
export const passwordResetRateLimitMax = parseNumber(process.env.PASSWORD_RESET_RATE_LIMIT_MAX, 5);
export const passwordRotationDays = parseNumber(process.env.PASSWORD_ROTATION_DAYS, 45);
export const requiredJwtSecret = process.env.JWT_SECRET || '';
export const jwtExpiresIn = process.env.JWT_EXPIRES_IN || '8h';
export const sessionInactivityTimeoutMs = parseNumber(
  process.env.SESSION_INACTIVITY_TIMEOUT_MS,
  30 * 60 * 1000
);
export const sessionCleanupIntervalMs = parseNumber(
  process.env.SESSION_CLEANUP_INTERVAL_MS,
  10 * 60 * 1000
);
export const authCookieName = process.env.AUTH_COOKIE_NAME || 'dms_auth';
export const authCookieDomain = process.env.AUTH_COOKIE_DOMAIN || '';
export const authCookieMaxAgeMs = parseNumber(process.env.AUTH_COOKIE_MAX_AGE_MS, 8 * 60 * 60 * 1000);
export const csrfCookieName = process.env.CSRF_COOKIE_NAME || 'dms_csrf';
export const csrfHeaderName = process.env.CSRF_HEADER_NAME || 'x-csrf-token';
export const cookieSameSite = process.env.COOKIE_SAME_SITE || (isProduction ? 'strict' : 'lax');
const configuredCorsOrigins = parseList(process.env.CORS_ORIGIN, []);
const defaultDevCorsOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003'
];
export const corsOrigins = isProduction
  ? configuredCorsOrigins
  : Array.from(new Set([...(configuredCorsOrigins.length ? configuredCorsOrigins : []), ...defaultDevCorsOrigins]));
export const uploadMaxFileSizeBytes = parseNumber(process.env.UPLOAD_MAX_FILE_SIZE_BYTES, 50 * 1024 * 1024);
export const allowedUploadMimeTypes = parseList(
  process.env.ALLOWED_UPLOAD_MIME_TYPES,
  [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/tiff'
  ]
);
export const allowedUploadExtensions = parseList(
  process.env.ALLOWED_UPLOAD_EXTENSIONS,
  ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']
);
export const passwordMinLength = parseNumber(process.env.PASSWORD_MIN_LENGTH, 10);
export const passwordRequireUppercase = parseBoolean(process.env.PASSWORD_REQUIRE_UPPERCASE, true);
export const passwordRequireLowercase = parseBoolean(process.env.PASSWORD_REQUIRE_LOWERCASE, true);
export const passwordRequireDigit = parseBoolean(process.env.PASSWORD_REQUIRE_DIGIT, true);
export const passwordRequireSpecial = parseBoolean(process.env.PASSWORD_REQUIRE_SPECIAL, true);
export const uploadScanEnabled = parseBoolean(process.env.UPLOAD_SCAN_ENABLED, false);
export const uploadScanCommand = process.env.UPLOAD_SCAN_COMMAND || '';
export const uploadScanTimeoutMs = parseNumber(process.env.UPLOAD_SCAN_TIMEOUT_MS, 120000);
export const useWindowsDefenderScan = parseBoolean(process.env.USE_WINDOWS_DEFENDER_SCAN, false);
export const logRetentionDays = parseNumber(process.env.LOG_RETENTION_DAYS, 90);
export const backupOutputRoot = path.resolve(backendRoot, process.env.BACKUP_OUTPUT_ROOT || 'backups');
export const backupArchivePrefix = String(process.env.BACKUP_ARCHIVE_PREFIX || deploymentLabel || deploymentCustomerCode || 'dms').trim();
export const backupTransferRoot = path.resolve(backendRoot, process.env.BACKUP_TRANSFER_ROOT || path.join('backups', 'transfer'));
export const defaultDatabaseUrl = process.env.DATABASE_URL || '';
export const autoBackupEnabled = parseBoolean(process.env.AUTO_BACKUP_ENABLED, true);
export const autoBackupHour = clampNumber(process.env.AUTO_BACKUP_HOUR, 0, 23, 1);
export const autoBackupMinute = clampNumber(process.env.AUTO_BACKUP_MINUTE, 0, 59, 30);
export const autoBackupTimezone = String(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC').trim() || 'UTC';
export const autoBackupCheckIntervalMinutes = clampNumber(process.env.AUTO_BACKUP_CHECK_INTERVAL_MINUTES, 5, 180, 15);
export const autoBackupMirrorExportEnabled = parseBoolean(process.env.AUTO_BACKUP_MIRROR_EXPORT_ENABLED, true);
export const autoBackupRetentionPruneEnabled = parseBoolean(process.env.AUTO_BACKUP_RETENTION_PRUNE_ENABLED, true);
export const autoBackupRunOnStartup = parseBoolean(process.env.AUTO_BACKUP_RUN_ON_STARTUP, false);
export const notificationReminderEnabled = parseBoolean(process.env.NOTIFICATION_REMINDER_ENABLED, true);
export const notificationReminderIntervalMinutes = clampNumber(process.env.NOTIFICATION_REMINDER_INTERVAL_MINUTES, 5, 240, 30);
export const notificationReminderGraceMinutes = clampNumber(process.env.NOTIFICATION_REMINDER_GRACE_MINUTES, 10, 1440, 60);
export const notificationReminderRepeatHours = clampNumber(process.env.NOTIFICATION_REMINDER_REPEAT_HOURS, 1, 168, 6);

export const getCookieOptions = () => ({
  httpOnly: true,
  secure: isProduction && enforceSecureAuth,
  sameSite: cookieSameSite,
  maxAge: authCookieMaxAgeMs,
  path: '/',
  ...(authCookieDomain ? { domain: authCookieDomain } : {})
});

export const assertProductionConfig = () => {
  if (isProduction && (!requiredJwtSecret || requiredJwtSecret === 'super-secret-bank-key' || requiredJwtSecret.length < 32)) {
    throw new Error('Production mode requires a non-default JWT_SECRET with at least 32 characters.');
  }
  if (isProduction && enableDemoFeatures) {
    throw new Error('Production mode cannot run with ENABLE_DEMO=true.');
  }
  if (isProduction && corsOrigins.length === 0) {
    throw new Error('Production mode requires at least one CORS_ORIGIN value.');
  }
  if (isProduction && otpPreviewInResponse) {
    throw new Error('Production mode cannot run with OTP_PREVIEW_IN_RESPONSE=true.');
  }
  if (isProduction && otpDeliveryWebhookUrl && otpDeliveryAllowedHosts.length === 0) {
    throw new Error('Production OTP webhook delivery requires OTP_DELIVERY_ALLOWED_HOSTS.');
  }
  if (isProduction && emailDeliveryMode === 'PREVIEW') {
    throw new Error('Production mode cannot run with EMAIL_DELIVERY_MODE=PREVIEW.');
  }
  if (isProduction && mobileDeliveryMode === 'PREVIEW') {
    throw new Error('Production mode cannot run with MOBILE_DELIVERY_MODE=PREVIEW.');
  }
  if (['WEBHOOK', 'PROVIDER'].includes(mobileDeliveryMode) && mobileDeliveryProvider === 'GENERIC_WEBHOOK' && !mobileDeliveryWebhookUrl) {
    throw new Error('Webhook mobile delivery requires MOBILE_DELIVERY_WEBHOOK_URL or OTP_DELIVERY_WEBHOOK_URL.');
  }
  if (isProduction && ['WEBHOOK', 'PROVIDER'].includes(mobileDeliveryMode) && mobileDeliveryProvider === 'GENERIC_WEBHOOK' && mobileDeliveryAllowedHosts.length === 0) {
    throw new Error('Production mobile delivery webhook requires MOBILE_DELIVERY_ALLOWED_HOSTS.');
  }
  if (['WEBHOOK', 'PROVIDER'].includes(mobileDeliveryMode) && mobileDeliveryProvider === 'TWILIO' && (!twilioAccountSid || !twilioAuthToken || !twilioFromNumber)) {
    throw new Error('Twilio mobile delivery requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.');
  }
  if (emailDeliveryMode === 'SMTP' && (!smtpHost || !smtpFromEmail)) {
    throw new Error('SMTP email delivery requires SMTP_HOST and SMTP_FROM_EMAIL.');
  }
  if (emailDeliveryMode === 'SMTP' && smtpUser && !smtpPass) {
    throw new Error('SMTP email delivery requires SMTP_PASS when SMTP_USER is configured.');
  }
  if (isProduction && !trustProxy) {
    throw new Error('Production mode requires TRUST_PROXY=true behind the reverse proxy.');
  }
  if (isProduction && requireHttps && !enforceSecureAuth) {
    throw new Error('Production HTTPS enforcement requires ENFORCE_SECURE_AUTH=true.');
  }
  if (isProduction && deploymentSiteRole === 'MIRROR' && !mirrorSyncEnabled) {
    throw new Error('Production mirror deployments require MIRROR_SYNC_ENABLED=true.');
  }
};
