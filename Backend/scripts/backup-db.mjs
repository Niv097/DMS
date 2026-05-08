import path from 'node:path';
import {
  buildTimestamp,
  ensureDir,
  normalizeTimestamp,
  resolveBackupOutputDir,
  resolveDatabaseUrl,
  resolvePostgresToolPath,
  runCommand
} from './backup-runtime.mjs';

const args = process.argv.slice(2);

const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const main = async () => {
  const outputDir = resolveBackupOutputDir(getArgValue('--outputDir', ''));
  const timestamp = normalizeTimestamp(getArgValue('--timestamp', buildTimestamp()));
  const databaseUrl = resolveDatabaseUrl();
  const pgDumpPath = await resolvePostgresToolPath('pg_dump');

  await ensureDir(outputDir);
  const outputFile = path.join(outputDir, `dms_backup_${timestamp}.dump`);
  const result = await runCommand(pgDumpPath, ['-Fc', '-d', databaseUrl, '-f', outputFile]);

  console.log(`Database backup created at ${outputFile}`);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
