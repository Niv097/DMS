import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs/promises';
import path from 'path';
import {
  uploadScanCommand,
  uploadScanEnabled,
  uploadScanTimeoutMs,
  useWindowsDefenderScan
} from '../config/env.js';

const execFileAsync = promisify(execFile);

const defenderPath = 'C:\\Program Files\\Windows Defender\\MpCmdRun.exe';

const FILE_SIGNATURES = {
  'application/pdf': (buffer) => buffer.slice(0, 5).toString('ascii') === '%PDF-',
  'image/png': (buffer) => buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4E
    && buffer[3] === 0x47
    && buffer[4] === 0x0D
    && buffer[5] === 0x0A
    && buffer[6] === 0x1A
    && buffer[7] === 0x0A,
  'image/jpeg': (buffer) => buffer.length >= 3
    && buffer[0] === 0xFF
    && buffer[1] === 0xD8
    && buffer[2] === 0xFF,
  'image/jpg': (buffer) => buffer.length >= 3
    && buffer[0] === 0xFF
    && buffer[1] === 0xD8
    && buffer[2] === 0xFF,
  'image/webp': (buffer) => buffer.length >= 12
    && buffer.slice(0, 4).toString('ascii') === 'RIFF'
    && buffer.slice(8, 12).toString('ascii') === 'WEBP',
  'image/tiff': (buffer) => buffer.length >= 4
    && (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2A && buffer[3] === 0x00)
      || (buffer[0] === 0x4D && buffer[1] === 0x4D && buffer[2] === 0x00 && buffer[3] === 0x2A)
    )
};

const deleteSafe = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch {
    // Ignore cleanup failures; the request will still be rejected.
  }
};

const validateFileSignature = async (file) => {
  if (!file?.path) return;
  const mimetype = String(file.mimetype || '').toLowerCase();
  const validator = FILE_SIGNATURES[mimetype];
  if (!validator) return;

  const buffer = await fs.readFile(file.path);
  if (!validator(buffer)) {
    await deleteSafe(file.path);
    const error = new Error(`File content does not match the declared ${mimetype} type.`);
    error.status = 400;
    throw error;
  }
};

const runConfiguredScanner = async (filePath) => {
  const [command, ...args] = uploadScanCommand.split(' ').filter(Boolean);
  if (!command) {
    throw new Error('Upload scanning is enabled but UPLOAD_SCAN_COMMAND is not configured.');
  }

  const finalArgs = args.map((arg) => arg === '{file}' ? filePath : arg);
  await execFileAsync(command, finalArgs, { timeout: uploadScanTimeoutMs, windowsHide: true });
};

const runWindowsDefenderScan = async (filePath) => {
  const absolute = path.resolve(filePath);
  await execFileAsync(defenderPath, ['-Scan', '-ScanType', '3', '-File', absolute], {
    timeout: uploadScanTimeoutMs,
    windowsHide: true
  });
};

class FileSecurityService {
  async scanFile(filePath) {
    if (!uploadScanEnabled) {
      return;
    }

    if (useWindowsDefenderScan) {
      await runWindowsDefenderScan(filePath);
      return;
    }

    await runConfiguredScanner(filePath);
  }

  async scanRequestFiles(req) {
    const fileList = [];
    if (req.file?.path) {
      fileList.push(req.file);
    }
    if (Array.isArray(req.files)) {
      for (const file of req.files) {
        if (file?.path) fileList.push(file);
      }
    }
    if (req.files && !Array.isArray(req.files)) {
      for (const group of Object.values(req.files)) {
        for (const file of group || []) {
          if (file?.path) fileList.push(file);
        }
      }
    }

    for (const file of fileList) {
      await validateFileSignature(file);
      if (uploadScanEnabled) {
        await this.scanFile(file.path);
      }
    }
  }
}

export default new FileSecurityService();
