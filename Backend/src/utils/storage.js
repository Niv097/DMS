import fs from 'fs/promises';
import path from 'path';
import { uploadRoot } from '../config/env.js';

const STORAGE_DIRS = {
  incoming: 'incoming',
  workflows: 'workflows',
  previews: 'previews',
  fms: 'fms'
};

export const ensureStorageRoot = async () => {
  await fs.mkdir(uploadRoot, { recursive: true });
  await fs.access(uploadRoot);
};

export const getStorageRoot = () => uploadRoot;
export const getIncomingStorageDir = () => path.join(uploadRoot, STORAGE_DIRS.incoming);

const assertInsideStorageRoot = (resolvedPath) => {
  const relative = path.relative(uploadRoot, resolvedPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Invalid storage path.');
  }
  return resolvedPath;
};

export const resolveStoredPath = (filePath) => {
  if (!filePath) {
    throw new Error('Missing storage path.');
  }

  if (path.isAbsolute(filePath)) return assertInsideStorageRoot(path.resolve(filePath));

  const normalized = String(filePath).replace(/^[\\/]+/, '');
  if (normalized.startsWith('uploads/')) {
    return assertInsideStorageRoot(path.resolve(uploadRoot, normalized.slice('uploads/'.length)));
  }

  return assertInsideStorageRoot(path.resolve(uploadRoot, normalized));
};

export const toStoredRelativePath = (fileNameOrRelativePath) => {
  const normalized = path.posix.normalize(String(fileNameOrRelativePath || '').replace(/\\/g, '/').replace(/^\/+/, ''));
  if (!normalized) {
    throw new Error('Storage path is required.');
  }
  if (normalized.startsWith('../') || normalized === '..') {
    throw new Error('Invalid storage path.');
  }
  return normalized.startsWith('uploads/') ? normalized : path.posix.join('uploads', normalized);
};

export const sanitizeStorageSegment = (value, fallback = 'item') => {
  const normalized = String(value || '')
    .trim()
    .replace(/[/\\]+/g, '_')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_.]+|[-_.]+$/g, '');

  return normalized || fallback;
};

export const sanitizeStorageFileName = (fileName, fallbackBase = 'file') => {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  const baseName = path.basename(String(fileName || ''), extension);
  const safeBase = sanitizeStorageSegment(baseName, fallbackBase);
  return `${safeBase}${extension}`;
};

export const getWorkflowStorageRelativeDir = (documentGroupKey) => toStoredRelativePath(
  path.posix.join(STORAGE_DIRS.workflows, sanitizeStorageSegment(documentGroupKey, 'workflow'))
);

export const getFmsStorageRelativeDir = (tenantCode = 'tenant', nodePathKey = 'node', documentKey = 'document') => toStoredRelativePath(
  path.posix.join(
    STORAGE_DIRS.fms,
    sanitizeStorageSegment(tenantCode, 'tenant'),
    sanitizeStorageSegment(nodePathKey, 'node'),
    sanitizeStorageSegment(documentKey, 'document')
  )
);

export const buildFmsFileStoredRelativePath = ({
  tenantCode,
  nodePathKey,
  documentKey,
  bucket = 'files',
  fileName,
  fallbackBase = 'file',
  prefix = ''
}) => {
  const safeFileName = `${prefix}${sanitizeStorageFileName(fileName, fallbackBase)}`;
  return toStoredRelativePath(
    path.posix.join(
      STORAGE_DIRS.fms,
      sanitizeStorageSegment(tenantCode, 'tenant'),
      sanitizeStorageSegment(nodePathKey, 'node'),
      sanitizeStorageSegment(documentKey, 'document'),
      String(bucket || '').replace(/^\/+|\/+$/g, ''),
      safeFileName
    )
  );
};

export const getVersionStorageRelativeDir = (documentGroupKey, versionNumber) => toStoredRelativePath(
  path.posix.join(
    STORAGE_DIRS.workflows,
    sanitizeStorageSegment(documentGroupKey, 'workflow'),
    `v${Number(versionNumber) || 1}`
  )
);

export const getVersionArchiveSubdirs = (documentGroupKey, versionNumber) => {
  const versionDir = getVersionStorageRelativeDir(documentGroupKey, versionNumber);
  return {
    root: versionDir,
    attachmentsMain: toStoredRelativePath(path.posix.join(versionDir, 'attachments', 'main')),
    attachmentsSupporting: toStoredRelativePath(path.posix.join(versionDir, 'attachments', 'supporting')),
    approved: toStoredRelativePath(path.posix.join(versionDir, 'approved')),
    previews: toStoredRelativePath(path.posix.join(versionDir, 'previews')),
    audit: toStoredRelativePath(path.posix.join(versionDir, 'audit')),
    exports: toStoredRelativePath(path.posix.join(versionDir, 'exports')),
    metadata: toStoredRelativePath(path.posix.join(versionDir, 'metadata'))
  };
};

export const buildVersionFileStoredRelativePath = ({
  documentGroupKey,
  versionNumber,
  bucket,
  fileName,
  fallbackBase = 'file',
  prefix = ''
}) => {
  const safeFileName = `${prefix}${sanitizeStorageFileName(fileName, fallbackBase)}`;
  return toStoredRelativePath(
    path.posix.join(
      STORAGE_DIRS.workflows,
      sanitizeStorageSegment(documentGroupKey, 'workflow'),
      `v${Number(versionNumber) || 1}`,
      String(bucket || '').replace(/^\/+|\/+$/g, ''),
      safeFileName
    )
  );
};

export const ensureStoredParentDir = async (storedRelativePath) => {
  const targetPath = resolveStoredPath(storedRelativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  return targetPath;
};

export const ensureVersionArchiveDirs = async (documentGroupKey, versionNumber) => {
  const dirs = getVersionArchiveSubdirs(documentGroupKey, versionNumber);
  await Promise.all(
    Object.values(dirs).map(async (storedRelativePath) => {
      await fs.mkdir(resolveStoredPath(storedRelativePath), { recursive: true });
    })
  );
  return dirs;
};

export const moveFileToStoredRelativePath = async (sourcePath, storedRelativePath) => {
  const targetPath = await ensureStoredParentDir(storedRelativePath);
  const resolvedSourcePath = path.resolve(sourcePath);

  if (resolvedSourcePath === targetPath) {
    return targetPath;
  }

  const fallbackCopyCodes = new Set(['EXDEV', 'EPERM', 'EACCES', 'EBUSY']);
  try {
    await fs.rename(resolvedSourcePath, targetPath);
  } catch (error) {
    if (!fallbackCopyCodes.has(error?.code)) {
      throw error;
    }

    await fs.copyFile(resolvedSourcePath, targetPath);
    try {
      await fs.unlink(resolvedSourcePath);
    } catch (unlinkError) {
      if (!fallbackCopyCodes.has(unlinkError?.code) && unlinkError?.code !== 'ENOENT') {
        throw unlinkError;
      }
    }
  }

  return targetPath;
};

export const pruneEmptyStoredParents = async (storedRelativePath, stopAt = uploadRoot) => {
  let currentDir = path.dirname(resolveStoredPath(storedRelativePath));
  const resolvedStopAt = path.resolve(stopAt);

  while (currentDir.startsWith(resolvedStopAt) && currentDir !== resolvedStopAt) {
    try {
      const entries = await fs.readdir(currentDir);
      if (entries.length > 0) {
        break;
      }
      await fs.rmdir(currentDir);
      currentDir = path.dirname(currentDir);
    } catch {
      break;
    }
  }
};

export const writeStoredJsonFile = async (storedRelativePath, payload) => {
  const targetPath = await ensureStoredParentDir(storedRelativePath);
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return targetPath;
};
