import path from 'node:path';
import {
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
  const backupFile = path.resolve(getArgValue('--backupFile', ''));
  if (!backupFile) {
    throw new Error('Backup file is required. Use --backupFile <path>.');
  }

  const databaseUrl = resolveDatabaseUrl();
  const pgRestorePath = await resolvePostgresToolPath('pg_restore');
  const result = await runCommand(pgRestorePath, ['--clean', '--if-exists', '-d', databaseUrl, backupFile]);

  console.log(`Database restore completed from ${backupFile}`);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
};

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
