import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildTimestamp,
  normalizeTimestamp,
  resolveCatalogOutputDir,
  runCommand
} from './backup-runtime.mjs';

const args = process.argv.slice(2);

const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const main = async () => {
  const timestamp = normalizeTimestamp(getArgValue('--timestamp', buildTimestamp()));
  const catalogOutputDir = resolveCatalogOutputDir(getArgValue('--catalogOutputDir', ''));
  const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

  await runCommand('node', [path.join(scriptRoot, 'backup-db.mjs'), '--timestamp', timestamp]);
  await runCommand('node', [path.join(scriptRoot, 'backup-storage.mjs'), '--timestamp', timestamp]);
  await runCommand('node', [path.join(scriptRoot, 'export-backup-ledger.mjs'), '--outputDir', catalogOutputDir, '--timestamp', timestamp]);

  console.log(`Combined backup completed for timestamp ${timestamp}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
