import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { logRetentionDays } from '../src/config/env.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const logsDir = path.resolve(process.cwd(), 'logs');
const cutoff = Date.now() - (logRetentionDays * 24 * 60 * 60 * 1000);

const pruneDirectory = async (dir) => {
  const items = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      await pruneDirectory(fullPath);
      continue;
    }

    const stats = await fs.stat(fullPath).catch(() => null);
    if (stats && stats.mtimeMs < cutoff) {
      await fs.rm(fullPath, { force: true });
      console.log(`Pruned ${fullPath}`);
    }
  }
};

await pruneDirectory(logsDir);
console.log(`Retention pruning complete for files older than ${logRetentionDays} days.`);
