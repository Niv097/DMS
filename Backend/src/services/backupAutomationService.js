import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import {
  autoBackupEnabled,
  autoBackupCheckIntervalMinutes,
  autoBackupHour,
  autoBackupMinute,
  autoBackupMirrorExportEnabled,
  autoBackupRetentionPruneEnabled,
  autoBackupRunOnStartup,
  autoBackupTimezone
} from '../config/env.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import prisma from '../utils/prisma.js';
import {
  computeBackupNextDueAt,
  isTenantBackupDue,
  normalizeBackupFrequency
} from '../utils/backupPolicy.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');
const scriptsRoot = path.join(backendRoot, 'scripts');
const RECOVERY_TIMEOUT_MS = 15 * 60 * 1000;

const automationState = {
  enabled: autoBackupEnabled,
  scheduled_time: `${String(autoBackupHour).padStart(2, '0')}:${String(autoBackupMinute).padStart(2, '0')}`,
  timezone: autoBackupTimezone,
  mirror_export_enabled: autoBackupMirrorExportEnabled,
  retention_prune_enabled: autoBackupRetentionPruneEnabled,
  run_on_startup: autoBackupRunOnStartup,
  check_interval_minutes: autoBackupCheckIntervalMinutes,
  next_run_at: null,
  last_run_started_at: null,
  last_run_finished_at: null,
  last_mirror_completed_at: null,
  last_run_status: autoBackupEnabled ? 'SCHEDULED' : 'DISABLED',
  last_run_error: null,
  last_run_trigger: null,
  last_run_summary: {
    backup_completed: false,
    mirror_completed: false,
    retention_pruned: false,
    due_tenants_count: 0,
    due_tenants: []
  },
  is_running: false
};

let schedulerTimer = null;
let activeLogger = console;

const buildTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');

const getNextRunDate = (baseDate = new Date()) => {
  const nextRun = new Date(baseDate.getTime() + (autoBackupCheckIntervalMinutes * 60 * 1000));
  nextRun.setSeconds(0, 0);
  return nextRun;
};

const hasDateChanged = (left, right) => (
  left.getFullYear() !== right.getFullYear()
  || left.getMonth() !== right.getMonth()
  || left.getDate() !== right.getDate()
);

const shouldRunMirrorExportNow = (referenceDate = new Date(), trigger = 'SCHEDULED') => {
  if (!autoBackupMirrorExportEnabled) return false;
  if (trigger !== 'SCHEDULED') return true;

  const plannedRunTime = new Date(referenceDate);
  plannedRunTime.setHours(autoBackupHour, autoBackupMinute, 0, 0);
  if (referenceDate.getTime() < plannedRunTime.getTime()) {
    return false;
  }

  if (!automationState.last_mirror_completed_at) {
    return true;
  }

  const lastMirrorCompletedAt = new Date(automationState.last_mirror_completed_at);
  if (Number.isNaN(lastMirrorCompletedAt.getTime())) {
    return true;
  }

  return hasDateChanged(lastMirrorCompletedAt, referenceDate);
};

const scheduleNextRun = () => {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  if (!autoBackupEnabled) {
    automationState.next_run_at = null;
    automationState.last_run_status = 'DISABLED';
    return;
  }

  const nextRun = getNextRunDate();
  automationState.next_run_at = nextRun.toISOString();
  automationState.last_run_status = automationState.is_running ? 'RUNNING' : 'SCHEDULED';

  const delayMs = Math.max(1000, nextRun.getTime() - Date.now());
  schedulerTimer = setTimeout(() => {
    runAutomatedBackupCycle('SCHEDULED').catch((error) => {
      activeLogger.error('Automated backup cycle failed', {
        message: error.message,
        stack: error.stack
      });
    });
  }, delayMs);
};

const runNodeScript = async (scriptName, args = []) => {
  const scriptPath = path.join(scriptsRoot, scriptName);
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

export const getBackupAutomationStatus = () => ({
  ...automationState
});

const loadTenantBackupPolicies = async () => prisma.tenant.findMany({
  orderBy: { tenant_name: 'asc' },
  select: {
    id: true,
    tenant_name: true,
    tenant_code: true,
    backup_policy_enabled: true,
    backup_frequency: true,
    backup_retention_days: true,
    backup_window_hour: true,
    backup_window_minute: true,
    vendor_mirror_enabled: true,
    backup_last_completed_at: true,
    backup_next_due_at: true,
    created_at: true
  }
}).catch(() => []);

const buildDueTenants = (tenants, referenceDate = new Date(), trigger = 'SCHEDULED') => tenants
  .filter((tenant) => tenant.backup_policy_enabled)
  .map((tenant) => ({
    ...tenant,
    backup_frequency: normalizeBackupFrequency(tenant.backup_frequency || 'DAILY'),
    computed_backup_next_due_at: computeBackupNextDueAt({
      backupPolicyEnabled: tenant.backup_policy_enabled,
      backupFrequency: tenant.backup_frequency,
      backupLastCompletedAt: tenant.backup_last_completed_at,
      backupWindowHour: tenant.backup_window_hour,
      backupWindowMinute: tenant.backup_window_minute,
      createdAt: tenant.created_at,
      referenceDate
    })
  }))
  .filter((tenant) => (
    trigger !== 'SCHEDULED'
      ? true
      : isTenantBackupDue({
    ...tenant,
    backup_next_due_at: tenant.computed_backup_next_due_at
  }, referenceDate)
  ));

export const runAutomatedBackupCycle = async (trigger = 'MANUAL') => {
  if (automationState.is_running) {
    const error = new Error('Automated backup cycle is already running.');
    error.status = 409;
    throw error;
  }

  automationState.is_running = true;
  automationState.last_run_started_at = new Date().toISOString();
  automationState.last_run_finished_at = null;
  automationState.last_run_status = 'RUNNING';
  automationState.last_run_error = null;
  automationState.last_run_trigger = trigger;
  automationState.last_run_summary = {
    backup_completed: false,
    mirror_completed: false,
    retention_pruned: false,
    due_tenants_count: 0,
    due_tenants: []
  };

  const timestamp = buildTimestamp();
  const cycleStartedAt = new Date();
  const tenants = await loadTenantBackupPolicies();
  const dueTenants = buildDueTenants(tenants, cycleStartedAt, trigger);
  const dueTenantSummaries = dueTenants.map((tenant) => ({
    id: tenant.id,
    tenant_name: tenant.tenant_name,
    tenant_code: tenant.tenant_code,
    backup_frequency: tenant.backup_frequency,
    backup_window_hour: tenant.backup_window_hour ?? 18,
    backup_window_minute: tenant.backup_window_minute ?? 0,
    backup_next_due_at: tenant.computed_backup_next_due_at?.toISOString() || null
  }));
  automationState.last_run_summary.due_tenants_count = dueTenantSummaries.length;
  automationState.last_run_summary.due_tenants = dueTenantSummaries;
  const auditDetails = {
    trigger,
    scheduled_time: automationState.scheduled_time,
    timezone: automationState.timezone,
    due_tenants_count: dueTenantSummaries.length
  };

  try {
    let backupResult = null;
    if (dueTenants.length > 0) {
      backupResult = await runNodeScript('backup-all.mjs', ['--timestamp', timestamp]);
      automationState.last_run_summary.backup_completed = true;

      const nextCompletedAt = new Date();
      await Promise.all(dueTenants.map((tenant) => prisma.tenant.update({
        where: { id: tenant.id },
        data: {
          backup_last_completed_at: nextCompletedAt,
          backup_next_due_at: computeBackupNextDueAt({
            backupPolicyEnabled: tenant.backup_policy_enabled,
            backupFrequency: tenant.backup_frequency,
            backupWindowHour: tenant.backup_window_hour,
            backupWindowMinute: tenant.backup_window_minute,
            backupLastCompletedAt: nextCompletedAt,
            createdAt: tenant.created_at,
            referenceDate: nextCompletedAt
          })
        }
      }).catch(() => null)));
    }

    let mirrorResult = null;
    if (shouldRunMirrorExportNow(cycleStartedAt, trigger)) {
      mirrorResult = await runNodeScript('export-dr-package.mjs', ['--timestamp', timestamp]);
      automationState.last_run_summary.mirror_completed = true;
      automationState.last_mirror_completed_at = new Date().toISOString();
    }

    let pruneResult = null;
    if (autoBackupRetentionPruneEnabled) {
      pruneResult = await runNodeScript('prune-retention.mjs');
      automationState.last_run_summary.retention_pruned = true;
    }

    automationState.last_run_status = 'SUCCESS';
    automationState.last_run_finished_at = new Date().toISOString();
    writeSecurityAudit('SYSTEM_AUTO_BACKUP_COMPLETED', {
      ...auditDetails,
      backup_completed: automationState.last_run_summary.backup_completed,
      due_tenants: dueTenantSummaries,
      mirror_completed: automationState.last_run_summary.mirror_completed,
      retention_pruned: automationState.last_run_summary.retention_pruned
    });

    activeLogger.info('Automated backup cycle completed', {
      ...auditDetails,
      due_tenants: dueTenantSummaries,
      backup_stdout: backupResult?.stdout || null,
      mirror_stdout: mirrorResult?.stdout || null,
      prune_stdout: pruneResult?.stdout || null
    });

    return {
      message: 'Automated backup cycle completed successfully.',
      trigger,
      summary: automationState.last_run_summary,
      outputs: {
        backup: backupResult,
        mirror: mirrorResult,
        retention: pruneResult
      }
    };
  } catch (error) {
    automationState.last_run_status = 'FAILED';
    automationState.last_run_finished_at = new Date().toISOString();
    automationState.last_run_error = error.message;
    writeSecurityAudit('SYSTEM_AUTO_BACKUP_FAILED', {
      ...auditDetails,
      due_tenants: dueTenantSummaries,
      reason: error.message
    });
    activeLogger.error('Automated backup cycle failed', {
      ...auditDetails,
      message: error.message,
      stack: error.stack
    });
    throw error;
  } finally {
    automationState.is_running = false;
    scheduleNextRun();
  }
};

export const startBackupAutomation = (logger = console) => {
  activeLogger = logger;
  scheduleNextRun();

  if (autoBackupEnabled && autoBackupRunOnStartup) {
    setTimeout(() => {
      runAutomatedBackupCycle('STARTUP').catch((error) => {
        activeLogger.error('Startup backup cycle failed', {
          message: error.message,
          stack: error.stack
        });
      });
    }, 5000);
  }

  activeLogger.info('Backup automation scheduler ready', {
    enabled: automationState.enabled,
    check_interval_minutes: automationState.check_interval_minutes,
    scheduled_time: automationState.scheduled_time,
    timezone: automationState.timezone,
    mirror_export_enabled: automationState.mirror_export_enabled,
    retention_prune_enabled: automationState.retention_prune_enabled,
    next_run_at: automationState.next_run_at
  });
};
