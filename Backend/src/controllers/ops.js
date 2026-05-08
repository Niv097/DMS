import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import prisma from '../utils/prisma.js';
import {
  backupOutputRoot,
  backupTransferRoot,
  logRetentionDays
} from '../config/env.js';
import { securityAuditLogPath } from '../utils/securityAudit.js';
import { getBackupAutomationStatus, runAutomatedBackupCycle } from '../services/backupAutomationService.js';
import { buildTenantBackupPolicySnapshot, normalizeBackupFrequency } from '../utils/backupPolicy.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '../../');

const RECOVERY_TIMEOUT_MS = 15 * 60 * 1000;
const SECURITY_RECENT_LIMIT = 250;
const getUserRole = (user) => user?.role?.name || user?.role;

const resolveTransferPackagePath = (value) => {
  const requestedPath = path.resolve(String(value || '').trim());
  const allowedRoot = path.resolve(backupTransferRoot);
  const relative = path.relative(allowedRoot, requestedPath);

  if (!requestedPath || relative.startsWith('..') || path.isAbsolute(relative)) {
    const error = new Error('Invalid recovery package path.');
    error.status = 400;
    throw error;
  }

  return requestedPath;
};

const normalizeDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const readDirectoryEntries = async (dirPath) => {
  const entries = await fs.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  const items = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    const stats = await fs.stat(fullPath).catch(() => null);
    return stats ? {
      name: entry.name,
      full_path: fullPath,
      is_directory: entry.isDirectory(),
      size_bytes: stats.size,
      modified_at: stats.mtime.toISOString()
    } : null;
  }));
  return items.filter(Boolean).sort((left, right) => new Date(right.modified_at) - new Date(left.modified_at));
};

const readBackupArtifactEntries = async (dirPath) => {
  const rootEntries = await readDirectoryEntries(dirPath);
  const nestedEntries = await Promise.all(
    rootEntries
      .filter((item) => item.is_directory)
      .map((item) => readDirectoryEntries(item.full_path))
  );

  return [
    ...rootEntries.filter((item) => !item.is_directory),
    ...nestedEntries.flat()
  ].sort((left, right) => new Date(right.modified_at) - new Date(left.modified_at));
};

const readManifestIfPresent = async (packageDir) => {
  const manifestPath = path.join(packageDir, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf8').catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const readSecurityEvents = async () => {
  const raw = await fs.readFile(securityAuditLogPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        return parsed?.message && typeof parsed.message === 'object'
          ? { timestamp: parsed.timestamp || null, ...parsed.message }
          : parsed;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
};

const getEventBucket = (eventName = '') => {
  const event = String(eventName || '').toUpperCase();
  if (event.includes('DOWNLOADED')) return 'downloads';
  if (event.includes('VIEWED')) return 'views';
  if (event.includes('TIMEOUT') || event.includes('IDLE')) return 'idle_exits';
  if (event.includes('LOGOUT')) return 'logout_exits';
  if (event.includes('FAILED') || event.includes('BLOCKED')) return 'access_failures';
  if (event.includes('LOGIN_SUCCESS')) return 'logins';
  return 'other';
};

const toScopedEvents = (events, req) => {
  const requestedTenantId = Number.parseInt(String(req.query.tenant_id || ''), 10) || null;
  const requestedBranchId = Number.parseInt(String(req.query.branch_id || ''), 10) || null;
  const allowedBranchIds = new Set([
    ...(req.user?.branch_id ? [Number(req.user.branch_id)] : []),
    ...((req.user?.branch_accesses || []).map((item) => Number(item.branch_id)).filter(Boolean)),
    ...((req.user?.accessible_branch_ids || []).map(Number).filter(Boolean))
  ]);

  return events.filter((item) => {
    if (getUserRole(req.user) === 'SUPER_ADMIN') {
      if (requestedTenantId && Number(item.tenant_id || 0) !== requestedTenantId) return false;
      if (requestedBranchId && Number(item.branch_id || 0) !== requestedBranchId) return false;
      return true;
    }

    if (req.user?.tenant_id && Number(item.tenant_id || 0) !== Number(req.user.tenant_id)) return false;
    if (requestedBranchId && Number(item.branch_id || 0) !== requestedBranchId) return false;
    if (allowedBranchIds.size > 0 && item.branch_id && !allowedBranchIds.has(Number(item.branch_id))) return false;
    return true;
  });
};

const buildSecurityAggregates = (events, branchMap = new Map()) => {
  const userMap = new Map();
  const branchAggMap = new Map();

  for (const event of events) {
    const bucket = getEventBucket(event.event);
    const branchId = event.branch_id ? Number(event.branch_id) : null;
    const userKey = String(event.user_id || 'unknown');

    if (!userMap.has(userKey)) {
      userMap.set(userKey, {
        user_id: event.user_id || 'unknown',
        role: event.role || '-',
        branch_id: branchId,
        branch_name: branchMap.get(String(branchId || '')) || '-',
        views: 0,
        downloads: 0,
        idle_exits: 0,
        logout_exits: 0,
        access_failures: 0,
        logins: 0,
        last_event_at: event.timestamp || null
      });
    }

    if (!branchAggMap.has(String(branchId || 'unscoped'))) {
      branchAggMap.set(String(branchId || 'unscoped'), {
        branch_id: branchId,
        branch_name: branchMap.get(String(branchId || '')) || (branchId ? '-' : 'Unscoped'),
        views: 0,
        downloads: 0,
        idle_exits: 0,
        logout_exits: 0,
        access_failures: 0,
        logins: 0,
        last_event_at: event.timestamp || null
      });
    }

    const userAgg = userMap.get(userKey);
    const branchAgg = branchAggMap.get(String(branchId || 'unscoped'));
    userAgg[bucket] += 1;
    branchAgg[bucket] += 1;

    const currentTime = normalizeDate(event.timestamp)?.getTime() || 0;
    if ((normalizeDate(userAgg.last_event_at)?.getTime() || 0) < currentTime) {
      userAgg.last_event_at = event.timestamp || null;
    }
    if ((normalizeDate(branchAgg.last_event_at)?.getTime() || 0) < currentTime) {
      branchAgg.last_event_at = event.timestamp || null;
    }
  }

  return {
    users: [...userMap.values()].sort((left, right) => {
      const score = (item) => item.views + item.downloads + item.logins + item.idle_exits + item.logout_exits + item.access_failures;
      return score(right) - score(left);
    }),
    branches: [...branchAggMap.values()].sort((left, right) => {
      const score = (item) => item.views + item.downloads + item.logins + item.idle_exits + item.logout_exits + item.access_failures;
      return score(right) - score(left);
    })
  };
};

const buildWorkflowOperations = async (req) => {
  const where = {};
  if (getUserRole(req.user) === 'SUPER_ADMIN') {
    if (req.query.tenant_id) where.tenant_id = Number.parseInt(String(req.query.tenant_id), 10);
    if (req.query.branch_id) where.branch_id = Number.parseInt(String(req.query.branch_id), 10);
  } else {
    where.tenant_id = req.user?.tenant_id || undefined;
  }

  const notes = await prisma.note.findMany({
    where,
    select: {
      id: true,
      tenant_id: true,
      branch_id: true,
      workflow_state: true,
      queue_code: true,
      updated_at: true
    },
    orderBy: { updated_at: 'desc' },
    take: 2000
  }).catch(() => []);

  const branchMap = new Map();
  for (const item of notes) {
    const key = String(item.branch_id || 'unscoped');
    if (!branchMap.has(key)) {
      branchMap.set(key, {
        branch_id: item.branch_id || null,
        drafts: 0,
        incoming: 0,
        returned: 0,
        closed: 0,
        last_activity_at: item.updated_at || null
      });
    }
    const agg = branchMap.get(key);
    const queueCode = String(item.queue_code || '').toUpperCase();
    const workflowState = String(item.workflow_state || '').toUpperCase();
    if (queueCode === 'DRAFTS' || workflowState === 'DRAFT') agg.drafts += 1;
    else if (queueCode === 'INCOMING') agg.incoming += 1;
    else if (queueCode === 'RETURNED_WITH_REMARKS' || workflowState === 'RETURNED_WITH_REMARK') agg.returned += 1;
    else if (['APPROVED', 'REJECTED'].includes(workflowState) || queueCode === 'APPROVED_CLOSED_HISTORY') agg.closed += 1;

    const currentTime = normalizeDate(item.updated_at)?.getTime() || 0;
    if ((normalizeDate(agg.last_activity_at)?.getTime() || 0) < currentTime) {
      agg.last_activity_at = item.updated_at || null;
    }
  }

  return [...branchMap.values()].sort((left, right) => (
    (left.drafts + left.incoming + left.returned) < (right.drafts + right.incoming + right.returned) ? 1 : -1
  ));
};

const runScript = async (scriptName, args = []) => {
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

export const getSecurityOperationsOverview = async (req, res) => {
  try {
    const [events, branches] = await Promise.all([
      readSecurityEvents(),
      prisma.branch.findMany({
        where: getUserRole(req.user) === 'SUPER_ADMIN'
          ? (req.query.tenant_id ? { tenant_id: Number.parseInt(String(req.query.tenant_id), 10) } : {})
          : { tenant_id: req.user?.tenant_id || undefined },
        select: { id: true, branch_name: true, branch_code: true },
        orderBy: { branch_name: 'asc' }
      }).catch(() => [])
    ]);

    const branchLabelMap = new Map(branches.map((item) => [String(item.id), `${item.branch_name} (${item.branch_code})`]));
    const scopedEvents = toScopedEvents(events, req)
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0));
    const aggregates = buildSecurityAggregates(scopedEvents, branchLabelMap);
    const workflowOperations = await buildWorkflowOperations(req);

    res.json({
      summary: {
        total_events: scopedEvents.length,
        views: scopedEvents.filter((item) => getEventBucket(item.event) === 'views').length,
        downloads: scopedEvents.filter((item) => getEventBucket(item.event) === 'downloads').length,
        idle_exits: scopedEvents.filter((item) => getEventBucket(item.event) === 'idle_exits').length,
        logout_exits: scopedEvents.filter((item) => getEventBucket(item.event) === 'logout_exits').length,
        access_failures: scopedEvents.filter((item) => getEventBucket(item.event) === 'access_failures').length,
        logins: scopedEvents.filter((item) => getEventBucket(item.event) === 'logins').length
      },
      branch_activity: aggregates.branches.slice(0, 20),
      user_activity: aggregates.users.slice(0, 25),
      recent_events: scopedEvents.slice(0, SECURITY_RECENT_LIMIT),
      workflow_operations: workflowOperations.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getRecoveryVaultOverview = async (_req, res) => {
  try {
    const [backupEntries, transferEntries, securityStats, tenants] = await Promise.all([
      readBackupArtifactEntries(backupOutputRoot),
      readDirectoryEntries(backupTransferRoot),
      fs.stat(securityAuditLogPath).catch(() => null),
      prisma.tenant.findMany({
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
          created_at: true,
          _count: {
            select: { branches: true, users: true, notes: true }
          }
        }
      }).catch(() => [])
    ]);

    const transferPackages = await Promise.all(
      transferEntries
        .filter((item) => item.is_directory)
        .slice(0, 20)
        .map(async (item) => ({
          ...item,
          manifest: await readManifestIfPresent(item.full_path)
        }))
    );

    const dbBackups = backupEntries.filter((item) => item.name.includes('.dump'));
    const storageBackups = backupEntries.filter((item) => item.name.includes('.zip') || item.name.includes('.tar.gz'));

    res.json({
      backup_output_root: backupOutputRoot,
      backup_transfer_root: backupTransferRoot,
      log_retention_days: logRetentionDays,
      latest_security_audit_at: securityStats?.mtime?.toISOString() || null,
      automation_status: getBackupAutomationStatus(),
      mirror_policy: {
        frequency: 'DAILY',
        scope: 'ALL_BANKS_ALL_BRANCHES',
        vendor_mirror_required: true
      },
      tenant_backup_policies: tenants.map((tenant) => ({
        id: tenant.id,
        tenant_name: tenant.tenant_name,
        tenant_code: tenant.tenant_code,
        backup_policy_enabled: tenant.backup_policy_enabled ?? true,
        backup_frequency: normalizeBackupFrequency(tenant.backup_frequency || 'DAILY'),
        backup_retention_days: tenant.backup_retention_days ?? 30,
        backup_window_hour: tenant.backup_window_hour ?? 18,
        backup_window_minute: tenant.backup_window_minute ?? 0,
        vendor_mirror_enabled: tenant.vendor_mirror_enabled ?? true,
        branch_count: tenant._count?.branches ?? 0,
        user_count: tenant._count?.users ?? 0,
        note_count: tenant._count?.notes ?? 0,
        ...buildTenantBackupPolicySnapshot(tenant)
      })),
      db_backups: dbBackups.slice(0, 20),
      storage_backups: storageBackups.slice(0, 20),
      transfer_packages: transferPackages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const createRecoveryPackage = async (_req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 15);
    const result = await runScript('export-dr-package.mjs', ['--timestamp', timestamp]);
    res.status(201).json({
      message: 'Recovery package exported successfully.',
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const importRecoveryPackage = async (req, res) => {
  try {
    const packageDir = resolveTransferPackagePath(req.body?.package_dir || '');
    const restoreStorage = Boolean(req.body?.restore_storage ?? true);
    const args = ['--packageDir', packageDir];
    if (restoreStorage) {
      args.push('--restoreStorage');
    }

    const result = await runScript('import-dr-package.mjs', args);
    res.status(201).json({
      message: restoreStorage
        ? 'Recovery package restored successfully with database and storage.'
        : 'Recovery package restored successfully with database only.',
      stdout: result.stdout,
      stderr: result.stderr
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const runRecoveryAutomationNow = async (_req, res) => {
  try {
    const result = await runAutomatedBackupCycle('MANUAL_SUPER_ADMIN');
    res.status(201).json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const pruneRetentionArtifacts = async (_req, res) => {
  try {
    const result = await execFileAsync(
      process.execPath || 'node',
      [path.join(backendRoot, 'scripts', 'prune-retention.mjs')],
      {
        cwd: backendRoot,
        timeout: RECOVERY_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4,
        env: process.env
      }
    );
    res.json({
      message: 'Retention pruning completed successfully.',
      stdout: String(result.stdout || '').trim(),
      stderr: String(result.stderr || '').trim()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
