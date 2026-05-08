import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ensureDir,
  extractArchive,
  getStorageSourceRoot,
  readJsonIfPresent,
  runCommand
} from './backup-runtime.mjs';

const args = process.argv.slice(2);
const __filename = fileURLToPath(import.meta.url);
const scriptRoot = path.dirname(__filename);

const hasFlag = (flagName) => args.includes(flagName);
const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const main = async () => {
  const packageDir = path.resolve(getArgValue('--packageDir', ''));
  if (!packageDir) {
    throw new Error('Package directory is required. Use --packageDir <path>.');
  }

  const manifestPath = path.join(packageDir, 'manifest.json');
  const manifest = await readJsonIfPresent(manifestPath);
  if (!manifest) {
    throw new Error('manifest.json not found in package directory.');
  }

  const dbFile = path.join(packageDir, 'db', String(manifest.database_backup || '').trim());
  await fs.access(dbFile).catch(() => {
    throw new Error(`Database backup file not found: ${dbFile}`);
  });

  await runCommand('node', [path.join(scriptRoot, 'restore-db.mjs'), '--backupFile', dbFile]);

  if (hasFlag('--restoreStorage')) {
    const storageFile = path.join(packageDir, 'storage', String(manifest.storage_backup || '').trim());
    await fs.access(storageFile).catch(() => {
      throw new Error(`Storage archive not found: ${storageFile}`);
    });

    const storageRoot = getStorageSourceRoot();
    await ensureDir(storageRoot);
    await extractArchive({ archiveFile: storageFile, destinationDir: storageRoot });
  }

  console.log(`DR package import completed from ${packageDir}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
