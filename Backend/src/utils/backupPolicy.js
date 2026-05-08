const FREQUENCY_INTERVAL_DAYS = {
  DAILY: 1,
  WEEKLY: 7
};

export const normalizeBackupFrequency = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'WEEKLY' || normalized === 'MONTHLY') return normalized;
  return 'DAILY';
};

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const normalizeBackupWindowHour = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return 18;
  return Math.min(23, Math.max(0, parsed));
};

export const normalizeBackupWindowMinute = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed)) return 0;
  return Math.min(59, Math.max(0, parsed));
};

const applyWindowTime = (dateValue, backupWindowHour = 18, backupWindowMinute = 0) => {
  const date = toDate(dateValue);
  if (!date) return null;
  date.setHours(
    normalizeBackupWindowHour(backupWindowHour),
    normalizeBackupWindowMinute(backupWindowMinute),
    0,
    0
  );
  return date;
};

export const addBackupInterval = (baseDate, frequency) => {
  const base = toDate(baseDate);
  if (!base) return null;

  const normalizedFrequency = normalizeBackupFrequency(frequency);
  const nextDate = new Date(base);

  if (normalizedFrequency === 'MONTHLY') {
    nextDate.setMonth(nextDate.getMonth() + 1);
    return nextDate;
  }

  nextDate.setDate(nextDate.getDate() + (FREQUENCY_INTERVAL_DAYS[normalizedFrequency] || 1));
  return nextDate;
};

export const computeBackupNextDueAt = ({
  backupPolicyEnabled = true,
  backupFrequency = 'DAILY',
  backupLastCompletedAt = null,
  backupWindowHour = 18,
  backupWindowMinute = 0,
  createdAt = null,
  referenceDate = new Date()
} = {}) => {
  if (!backupPolicyEnabled) return null;

  const lastCompleted = toDate(backupLastCompletedAt);
  if (lastCompleted) {
    return applyWindowTime(addBackupInterval(lastCompleted, backupFrequency), backupWindowHour, backupWindowMinute);
  }

  const created = toDate(createdAt);
  if (created) {
    const createdWindow = applyWindowTime(created, backupWindowHour, backupWindowMinute);
    const todayWindow = applyWindowTime(referenceDate, backupWindowHour, backupWindowMinute);
    if (!createdWindow || !todayWindow) return null;
    return createdWindow > referenceDate ? createdWindow : todayWindow;
  }

  return applyWindowTime(referenceDate, backupWindowHour, backupWindowMinute);
};

export const isTenantBackupDue = (tenant, referenceDate = new Date()) => {
  if (!tenant?.backup_policy_enabled) return false;
  const nextDueAt = toDate(tenant.backup_next_due_at)
    || computeBackupNextDueAt({
      backupPolicyEnabled: tenant.backup_policy_enabled,
      backupFrequency: tenant.backup_frequency,
      backupLastCompletedAt: tenant.backup_last_completed_at,
      backupWindowHour: tenant.backup_window_hour,
      backupWindowMinute: tenant.backup_window_minute,
      createdAt: tenant.created_at,
      referenceDate
    });

  if (!nextDueAt) return false;
  return nextDueAt.getTime() <= referenceDate.getTime();
};

export const buildTenantBackupPolicySnapshot = (tenant, referenceDate = new Date()) => {
  const nextDueAt = computeBackupNextDueAt({
    backupPolicyEnabled: tenant.backup_policy_enabled,
    backupFrequency: tenant.backup_frequency,
    backupLastCompletedAt: tenant.backup_last_completed_at,
    backupWindowHour: tenant.backup_window_hour,
    backupWindowMinute: tenant.backup_window_minute,
    createdAt: tenant.created_at,
    referenceDate
  });

  return {
    backup_last_completed_at: tenant.backup_last_completed_at || null,
    backup_next_due_at: nextDueAt ? nextDueAt.toISOString() : null,
    backup_due_now: tenant.backup_policy_enabled ? isTenantBackupDue({
      ...tenant,
      backup_next_due_at: nextDueAt
    }, referenceDate) : false
  };
};
