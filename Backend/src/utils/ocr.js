import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import pdfParse from 'pdf-parse';
import { createWorker } from 'tesseract.js';

const runCommand = (cmd, args) => new Promise((resolve, reject) => {
  const child = spawn(cmd, args, { stdio: 'ignore' });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`${cmd} exited with code ${code}`));
  });
});

const pdftoppmCandidates = () => {
  const candidates = [];
  if (process.env.PDFTOPPM_PATH) candidates.push(process.env.PDFTOPPM_PATH);
  if (process.env.POPPLER_PATH) {
    candidates.push(path.join(process.env.POPPLER_PATH, 'pdftoppm.exe'));
    candidates.push(path.join(process.env.POPPLER_PATH, 'Library', 'bin', 'pdftoppm.exe'));
    candidates.push(path.join(process.env.POPPLER_PATH, 'bin', 'pdftoppm.exe'));
  }
  candidates.push('pdftoppm');
  return candidates;
};

export const runPdfToImages = async (pdfPath, outDir, options = {}) => {
  const outPrefix = path.join(outDir, 'page');
  const args = ['-r', '150'];
  if (options.firstPageOnly) {
    args.push('-f', '1', '-l', '1');
  }
  args.push('-jpeg', pdfPath, outPrefix);
  let lastError;
  for (const cmd of pdftoppmCandidates()) {
    try {
      await runCommand(cmd, args);
      return;
    } catch (err) {
      lastError = err;
      if (err.code === 'ENOENT') continue;
    }
  }
  throw lastError || new Error('pdftoppm not available');
};

export const extractTextFromImage = async (filePath) => {
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(filePath);
    return data?.text || '';
  } finally {
    await worker.terminate();
  }
};

export const extractTextFromScannedPdf = async (filePath, options = {}) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dms-ocr-'));
  try {
    await runPdfToImages(filePath, tempDir, { firstPageOnly: Boolean(options.firstPageOnly) });
    const files = (await fs.readdir(tempDir))
      .filter(f => /^page-\d+\.jpg$/i.test(f))
      .sort();

    if (files.length === 0) return '';

    const worker = await createWorker('eng');
    try {
      let text = '';
      for (const f of files) {
        const { data } = await worker.recognize(path.join(tempDir, f));
        if (data?.text) text += `\n${data.text}`;
      }
      return text.trim();
    } finally {
      await worker.terminate();
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

export const extractTextFromPdf = async (filePath, options = {}) => {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  const text = (data?.text || '').trim();
  if (text.length >= 30) return text;
  try {
    const ocrText = await extractTextFromScannedPdf(filePath, options);
    return ocrText || text;
  } catch {
    return text;
  }
};

export const deriveFieldsFromText = (text, fallbackName = 'New Document') => {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 4);

  const subject = lines.find(l => /[a-zA-Z]/.test(l)) || fallbackName;

  const lower = text.toLowerCase();
  let noteType = 'Financial';
  if (lower.includes('note for information') || lower.includes('information')) {
    noteType = 'Note for Information';
  } else if (lower.includes('non-financial') || lower.includes('non financial')) {
    noteType = 'Non-Financial';
  } else if (lower.includes('administrative')) {
    noteType = 'Administrative';
  }

  const comment = `Auto-extracted summary: ${subject}`;

  return {
    subject,
    note_type: noteType,
    comment_text: comment
  };
};
