import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPackagePaths,
  buildTimestamp,
  ensureDir,
  getStorageSourceRoot,
  normalizeTimestamp,
  readJsonIfPresent,
  resolveDatabaseUrl,
  writeJsonFile,
  runCommand
} from './backup-runtime.mjs';

const args = process.argv.slice(2);
const __filename = fileURLToPath(import.meta.url);
const scriptRoot = path.dirname(__filename);

const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const main = async () => {
  const timestamp = normalizeTimestamp(getArgValue('--timestamp', buildTimestamp()));
  const packagePaths = buildPackagePaths(timestamp);

  await ensureDir(packagePaths.dbOutputDir);
  await ensureDir(packagePaths.storageOutputDir);
  await ensureDir(packagePaths.catalogOutputDir);

  await runCommand('node', [path.join(scriptRoot, 'backup-db.mjs'), '--outputDir', packagePaths.dbOutputDir, '--timestamp', packagePaths.timestamp]);
  await runCommand('node', [path.join(scriptRoot, 'backup-storage.mjs'), '--outputDir', packagePaths.storageOutputDir, '--timestamp', packagePaths.timestamp]);
  await runCommand('node', [path.join(scriptRoot, 'export-backup-ledger.mjs'), '--outputDir', packagePaths.catalogOutputDir, '--timestamp', packagePaths.timestamp]);

  const dbFile = `dms_backup_${packagePaths.timestamp}.dump`;
  const storageFile = `dms_storage_${packagePaths.timestamp}.tar.gz`;
  const catalogSummary = await readJsonIfPresent(path.join(packagePaths.catalogOutputDir, 'backup-ledger-summary.json'));

  const manifest = {
    customer_code: packagePaths.customerCode,
    deployment_label: packagePaths.label,
    deployment_site_role: packagePaths.deploymentSiteRole,
    exported_at: new Date().toISOString(),
    timestamp: packagePaths.timestamp,
    database_backup: dbFile,
    storage_backup: storageFile,
    document_catalog_dir: 'catalog',
    document_catalog_files: [
      'backup-ledger-summary.json',
      'dms-document-ledger.csv',
      'fms-document-ledger.csv'
    ],
    document_summary: catalogSummary ? {
      dms_total_notes: catalogSummary.dms?.total_notes ?? 0,
      dms_latest_versions: catalogSummary.dms?.latest_versions ?? 0,
      fms_total_documents: catalogSummary.fms?.total_documents ?? 0,
      fms_latest_versions: catalogSummary.fms?.latest_versions ?? 0
    } : null,
    source_database: resolveDatabaseUrl(),
    storage_root: getStorageSourceRoot()
  };

  await writeJsonFile(packagePaths.manifestPath, manifest);
  console.log(`DR package exported at ${packagePaths.packageDir}`);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
