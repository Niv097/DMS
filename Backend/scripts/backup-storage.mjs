import path from 'node:path';
import {
  archiveDirectory,
  buildTimestamp,
  ensureDir,
  getStorageSourceRoot,
  normalizeTimestamp,
  resolveStorageBackupOutputDir
} from './backup-runtime.mjs';

const args = process.argv.slice(2);

const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const main = async () => {
  const sourceDir = path.resolve(getArgValue('--source', '') || getStorageSourceRoot());
  const outputDir = resolveStorageBackupOutputDir(getArgValue('--outputDir', ''));
  const timestamp = normalizeTimestamp(getArgValue('--timestamp', buildTimestamp()));

  await ensureDir(outputDir);
  const outputFile = path.join(outputDir, `dms_storage_${timestamp}.tar.gz`);
  await archiveDirectory({ sourceDir, outputFile });
  console.log(`Storage backup created at ${outputFile}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
