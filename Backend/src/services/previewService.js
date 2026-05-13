import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { runPdfToImages } from '../utils/ocr.js';
import {
  ensureStorageRoot,
  ensureVersionArchiveDirs,
  getStorageRoot,
  getVersionArchiveSubdirs,
  resolveStoredPath,
  sanitizeStorageSegment,
  toStoredRelativePath
} from '../utils/storage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = getStorageRoot();

const resolveFilePath = (filePath) => resolveStoredPath(filePath);

const ensureDir = async (dir) => {
  await fs.mkdir(dir, { recursive: true });
};

const clearDir = async (dir) => {
  await fs.rm(dir, { recursive: true, force: true });
  await fs.mkdir(dir, { recursive: true });
};

const listPreviewPages = async (previewDir, sourceType = 'pdf', cacheBuster = Date.now()) => {
  const files = (await fs.readdir(previewDir))
    .filter((name) => sourceType === 'pdf' ? /^page-\d+\.jpg$/i.test(name) : /^page-1\.jpg$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const pages = [];
  for (const fileName of files) {
    const fullPath = path.join(previewDir, fileName);
      const metadata = await sharp(fullPath).metadata();
      pages.push({
        page_number: pages.length + 1,
        image_path: toStoredRelativePath(path.posix.join('previews', path.basename(previewDir), fileName)),
        cache_buster: cacheBuster,
        width: metadata.width || null,
        height: metadata.height || null
      });
  }
  return pages;
};

class PreviewService {
  async generateDetachedPreviewPages({
    previewKey,
    sourcePath,
    sourceBuffer = null,
    cacheBuster = Date.now()
  }) {
    await ensureStorageRoot();
    const referencePath = sourcePath || previewKey;
    const extension = path.extname(String(referencePath || '')).toLowerCase();
    const previewDir = resolveStoredPath(
      toStoredRelativePath(path.posix.join('previews', sanitizeStorageSegment(previewKey, 'preview')))
    );

    await clearDir(previewDir);

    if (extension === '.pdf') {
      const pdfPath = sourceBuffer
        ? path.join(previewDir, '__source.pdf')
        : resolveFilePath(sourcePath);

      if (sourceBuffer) {
        await fs.writeFile(pdfPath, sourceBuffer);
      }

      await runPdfToImages(pdfPath, previewDir);
      return listPreviewPages(previewDir, 'pdf', cacheBuster);
    }

    if (/\.(png|jpe?g|webp|gif|tiff?)$/i.test(extension)) {
      const targetPath = path.join(previewDir, 'page-1.jpg');
      await sharp(sourceBuffer || resolveFilePath(sourcePath))
        .jpeg({ quality: 92 })
        .toFile(targetPath);
      return listPreviewPages(previewDir, 'image', cacheBuster);
    }

    return [];
  }

  async generatePreviewPages(note, attachmentPath) {
    await ensureStorageRoot();
    const resolvedPath = resolveFilePath(attachmentPath);
    const extension = path.extname(resolvedPath).toLowerCase();
    const documentGroupKey = note.document_group_key || note.note_id || `note-${note.id}`;
    const versionNumber = note.version_number || 1;
    await ensureVersionArchiveDirs(documentGroupKey, versionNumber);
    const previewDir = resolveStoredPath(getVersionArchiveSubdirs(documentGroupKey, versionNumber).previews);
    const sourceStat = await fs.stat(resolvedPath);
    const cacheBuster = Math.trunc(sourceStat.mtimeMs);

    await clearDir(previewDir);

    if (extension === '.pdf') {
      await runPdfToImages(resolvedPath, previewDir);
      return listPreviewPages(previewDir, 'pdf', cacheBuster);
    }

    if (/\.(png|jpe?g|webp|gif|tiff?)$/i.test(extension)) {
      const targetPath = path.join(previewDir, 'page-1.jpg');
      await sharp(resolvedPath)
        .jpeg({ quality: 92 })
        .toFile(targetPath);
      return listPreviewPages(previewDir, 'image', cacheBuster);
    }

    return [];
  }
}

export default new PreviewService();
