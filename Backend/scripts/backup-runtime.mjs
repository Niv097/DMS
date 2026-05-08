import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import dotenv from 'dotenv';
import {
  backupArchivePrefix,
  backupOutputRoot,
  backupTransferRoot,
  defaultDatabaseUrl,
  deploymentCustomerCode,
  deploymentLabel,
  deploymentSiteRole,
  uploadRoot
} from '../src/config/env.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const execFileAsync = promisify(execFile);
const isWindows = process.platform === 'win32';

const timestampPattern = /^[A-Za-z0-9_-]+$/;

export const buildTimestamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');

export const normalizeTimestamp = (value) => (
  timestampPattern.test(String(value || '').trim()) ? String(value).trim() : buildTimestamp()
);

export const resolveDatabaseUrl = () => {
  const databaseUrl = String(process.env.DATABASE_URL || defaultDatabaseUrl || '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not available in environment.');
  }
  return databaseUrl;
};

export const ensureDir = async (dirPath) => {
  await fs.mkdir(dirPath, { recursive: true });
  return dirPath;
};

export const resolveBackupOutputDir = (customDir = '') => path.resolve(process.cwd(), customDir || path.join(backupOutputRoot, 'db'));
export const resolveStorageBackupOutputDir = (customDir = '') => path.resolve(process.cwd(), customDir || path.join(backupOutputRoot, 'storage'));
export const resolveCatalogOutputDir = (customDir = '') => path.resolve(process.cwd(), customDir || path.join(backupOutputRoot, 'catalog'));

const splitPathEntries = (value = '') => String(value || '')
  .split(path.delimiter)
  .map((item) => item.trim())
  .filter(Boolean);

const canAccess = async (targetPath) => fs.access(targetPath).then(() => true).catch(() => false);

const buildCandidateExecutableNames = (toolName) => (
  isWindows ? [`${toolName}.exe`, toolName] : [toolName]
);

const buildPostgresSearchDirs = () => {
  const dirs = [];
  if (isWindows) {
    dirs.push(
      ...[
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        'C:\\Program Files\\PostgreSQL',
        'C:\\Program Files (x86)\\PostgreSQL'
      ].filter(Boolean)
    );
  } else {
    dirs.push(
      '/usr/bin',
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/local/bin',
      '/usr/lib/postgresql',
      '/usr/local/pgsql/bin'
    );
  }
  return [...new Set(dirs.map((item) => path.resolve(item)))];
};

const collectVersionedPostgresBins = async (rootDir, executableNames) => {
  const matches = [];
  const visit = async (currentDir, depth = 0) => {
    if (depth > 3) return;
    const entries = await fs.readdir(currentDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath, depth + 1);
        continue;
      }
      if (executableNames.includes(entry.name) && await canAccess(fullPath)) {
        matches.push(fullPath);
      }
    }
  };
  await visit(rootDir);
  return matches;
};

export const resolvePostgresToolPath = async (toolName) => {
  const envVarName = toolName === 'pg_dump' ? 'PG_DUMP_PATH' : toolName === 'pg_restore' ? 'PG_RESTORE_PATH' : '';
  const explicitPath = envVarName ? String(process.env[envVarName] || '').trim() : '';
  if (explicitPath && await canAccess(explicitPath)) {
    return path.resolve(explicitPath);
  }

  const executableNames = buildCandidateExecutableNames(toolName);
  for (const searchDir of splitPathEntries(process.env.PATH || '')) {
    for (const executableName of executableNames) {
      const candidate = path.join(searchDir, executableName);
      if (await canAccess(candidate)) {
        return candidate;
      }
    }
  }

  for (const rootDir of buildPostgresSearchDirs()) {
    const matches = await collectVersionedPostgresBins(rootDir, executableNames);
    if (matches.length > 0) {
      return matches.sort().reverse()[0];
    }
  }

  const hint = envVarName
    ? `Set ${envVarName} to the full executable path.`
    : 'Install PostgreSQL client tools and add them to PATH.';
  throw new Error(`${toolName} was not found on this server. ${hint}`);
};

export const runCommand = async (command, args, options = {}) => {
  const { cwd = process.cwd(), timeout = 15 * 60 * 1000 } = options;
  const result = await execFileAsync(command, args, {
    cwd,
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 16,
    env: process.env
  });

  return {
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim()
  };
};

export const archiveDirectory = async ({ sourceDir, outputFile }) => {
  const resolvedSourceDir = path.resolve(sourceDir);
  const resolvedOutputFile = path.resolve(outputFile);
  if (!await canAccess(resolvedSourceDir)) {
    throw new Error(`Storage source not found: ${resolvedSourceDir}`);
  }

  await ensureDir(path.dirname(resolvedOutputFile));
  await fs.rm(resolvedOutputFile, { force: true }).catch(() => undefined);

  const baseName = path.basename(resolvedSourceDir);
  const parentDir = path.dirname(resolvedSourceDir);
  await runCommand('tar', ['-czf', resolvedOutputFile, '-C', parentDir, baseName]);
  return resolvedOutputFile;
};

export const extractArchive = async ({ archiveFile, destinationDir }) => {
  const resolvedArchiveFile = path.resolve(archiveFile);
  const resolvedDestinationDir = path.resolve(destinationDir);
  if (!await canAccess(resolvedArchiveFile)) {
    throw new Error(`Storage archive not found: ${resolvedArchiveFile}`);
  }

  await ensureDir(resolvedDestinationDir);
  await runCommand('tar', ['-xzf', resolvedArchiveFile, '-C', resolvedDestinationDir]);

  const entries = await fs.readdir(resolvedDestinationDir, { withFileTypes: true }).catch(() => []);
  if (entries.length === 1 && entries[0].isDirectory()) {
    const nestedRoot = path.join(resolvedDestinationDir, entries[0].name);
    const nestedEntries = await fs.readdir(nestedRoot, { withFileTypes: true }).catch(() => []);
    await Promise.all(nestedEntries.map(async (entry) => {
      const sourcePath = path.join(nestedRoot, entry.name);
      const targetPath = path.join(resolvedDestinationDir, entry.name);
      await fs.rm(targetPath, { recursive: true, force: true }).catch(() => undefined);
      await fs.rename(sourcePath, targetPath);
    }));
    await fs.rm(nestedRoot, { recursive: true, force: true }).catch(() => undefined);
  }
};

export const getStorageSourceRoot = () => path.resolve(process.env.STORAGE_ROOT || uploadRoot);

export const buildPackagePaths = (timestamp) => {
  const safeTimestamp = normalizeTimestamp(timestamp);
  const customerCode = String(process.env.DEPLOYMENT_CUSTOMER_CODE || deploymentCustomerCode || 'dms').trim().toLowerCase() || 'dms';
  const label = String(process.env.DEPLOYMENT_LABEL || deploymentLabel || `${customerCode}-primary`).trim() || `${customerCode}-primary`;
  const archivePrefix = String(process.env.BACKUP_ARCHIVE_PREFIX || backupArchivePrefix || customerCode).trim() || customerCode;
  const packageDir = path.resolve(backupTransferRoot, `${archivePrefix}-${safeTimestamp}`);
  return {
    timestamp: safeTimestamp,
    customerCode,
    label,
    archivePrefix,
    packageDir,
    dbOutputDir: path.join(packageDir, 'db'),
    storageOutputDir: path.join(packageDir, 'storage'),
    catalogOutputDir: path.join(packageDir, 'catalog'),
    manifestPath: path.join(packageDir, 'manifest.json'),
    deploymentSiteRole: String(process.env.DEPLOYMENT_SITE_ROLE || deploymentSiteRole || '').trim()
  };
};

export const readJsonIfPresent = async (filePath) => {
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const writeJsonFile = async (filePath, payload) => {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

export const getPlatformSummary = () => ({
  platform: process.platform,
  arch: process.arch,
  hostname: os.hostname()
});
