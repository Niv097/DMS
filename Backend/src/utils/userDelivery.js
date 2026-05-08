export const DELIVERY_MODES = ['EMAIL', 'MOBILE', 'BOTH'];
export const SYSTEM_USER_EMAIL_DOMAIN = 'dms-user.local';

export const normalizeDeliveryMode = (value, fallback = 'EMAIL') => {
  const normalized = String(value || '').trim().toUpperCase();
  return DELIVERY_MODES.includes(normalized) ? normalized : fallback;
};

export const normalizeMobileNumber = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  return hasPlus ? `+${digits}` : digits;
};

export const isValidMobileNumber = (value) => {
  const normalized = normalizeMobileNumber(value);
  if (!normalized) return false;
  const digits = normalized.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
};

export const maskEmail = (email = '') => {
  const [local = '', domain = ''] = String(email || '').split('@');
  if (!domain) return String(email || '');
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  const maskedLocal = `${visibleLocal}${'*'.repeat(Math.max(local.length - visibleLocal.length, 2))}`;
  return `${maskedLocal}@${domain}`;
};

export const maskMobileNumber = (mobileNumber = '') => {
  const normalized = normalizeMobileNumber(mobileNumber);
  if (!normalized) return String(mobileNumber || '');
  const prefix = normalized.startsWith('+') ? '+' : '';
  const digits = normalized.replace(/\D/g, '');
  if (digits.length <= 4) return `${prefix}${digits}`;
  return `${prefix}${digits.slice(0, 2)}${'*'.repeat(Math.max(digits.length - 4, 2))}${digits.slice(-2)}`;
};

export const resolveDeliveryChannels = ({
  email,
  mobileNumber,
  deliveryMode = 'EMAIL'
}) => {
  const preferredMode = normalizeDeliveryMode(deliveryMode, 'EMAIL');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedMobile = normalizeMobileNumber(mobileNumber);
  const channels = [];

  if (preferredMode === 'MOBILE') {
    if (normalizedMobile) channels.push('MOBILE');
    else if (normalizedEmail) channels.push('EMAIL');
  } else if (preferredMode === 'BOTH') {
    if (normalizedMobile) channels.push('MOBILE');
    if (normalizedEmail) channels.push('EMAIL');
    if (!channels.length && normalizedEmail) channels.push('EMAIL');
  } else if (normalizedEmail) {
    channels.push('EMAIL');
  } else if (normalizedMobile) {
    channels.push('MOBILE');
  }

  return [...new Set(channels)];
};

export const describeDeliveryDestination = (channel, destination) => {
  if (channel === 'MOBILE') return maskMobileNumber(destination);
  return maskEmail(destination);
};

export const summarizeDeliveryResults = (results = []) => {
  const delivered = results.filter((item) => item.status === 'SENT');
  const previewed = results.filter((item) => item.status === 'PREVIEWED');
  const manual = results.filter((item) => item.status === 'MANUAL_REQUIRED');
  const failed = results.filter((item) => item.status === 'FAILED');

  if (!delivered.length && !previewed.length && !manual.length && failed.length) {
    return 'Delivery failed for every configured channel.';
  }

  if (!delivered.length && !previewed.length && !manual.length) {
    return 'No delivery channel was available.';
  }

  const deliveredSummary = delivered
    .map((item) => `${item.channel === 'MOBILE' ? 'mobile' : 'email'} ${item.destination}`)
    .join(' and ');
  const previewSummary = previewed
    .map((item) => `${item.channel === 'MOBILE' ? 'mobile' : 'email'} ${item.destination}`)
    .join(' and ');
  const manualSummary = manual
    .map((item) => `${item.channel === 'MOBILE' ? 'mobile' : 'email'} ${item.destination}`)
    .join(' and ');

  if (delivered.length && !previewed.length && !failed.length) {
    return `Delivered to ${deliveredSummary}.`;
  }

  if (!delivered.length && previewed.length && !failed.length) {
    return `Preview generated for ${previewSummary}. No live SMS or email was sent.`;
  }

  if (!delivered.length && manual.length && !previewed.length && !failed.length) {
    return `Manual release required for ${manualSummary}. No live SMS or email was sent.`;
  }

  if (delivered.length && previewed.length && !failed.length) {
    return `Delivered to ${deliveredSummary}. Preview generated for ${previewSummary}.`;
  }

  if (delivered.length && manual.length && !previewed.length && !failed.length) {
    return `Delivered to ${deliveredSummary}. Manual release required for ${manualSummary}.`;
  }

  if (delivered.length && failed.length && !previewed.length) {
    return `Delivered to ${deliveredSummary}. Some configured channels still failed.`;
  }

  if (previewed.length && failed.length && !delivered.length) {
    return `Preview generated for ${previewSummary}. Some configured channels still failed.`;
  }

  if (manual.length && failed.length && !delivered.length && !previewed.length) {
    return `Manual release required for ${manualSummary}. Some configured channels still failed.`;
  }

  return `Delivered to ${deliveredSummary}. Preview generated for ${previewSummary}. Manual release required for ${manualSummary}. Some configured channels still failed.`;
};

export const buildSyntheticUserEmail = (employeeId, tenantCode = 'bank') => {
  const localEmployee = String(employeeId || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '');
  const localTenant = String(tenantCode || 'bank')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const employeeToken = localEmployee || 'user';
  const tenantToken = localTenant || 'bank';
  return `${employeeToken}@${tenantToken}.${SYSTEM_USER_EMAIL_DOMAIN}`;
};

export const isSyntheticUserEmail = (email = '') => String(email || '').trim().toLowerCase().endsWith(`.${SYSTEM_USER_EMAIL_DOMAIN}`);
