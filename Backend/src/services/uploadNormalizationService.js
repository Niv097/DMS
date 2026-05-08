import fs from 'fs/promises';
import sharp from 'sharp';
import path from 'path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff']);

const normalizeRotation = (rotation) => {
  const normalized = rotation % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeImageInPlace = async (filePath) => {
  const normalizedPath = `${filePath}.normalized`;
  await sharp(filePath)
    .rotate()
    .toFile(normalizedPath);

  await fs.rename(normalizedPath, filePath);
  return 0;
};

class UploadNormalizationService {
  async normalizeUploadedFile(file) {
    if (!file?.path) return file;

    const extension = path.extname(file.originalname || file.filename || '').toLowerCase();

    if (IMAGE_EXTENSIONS.has(extension)) {
      try {
        const normalizedRotation = normalizeRotation(await normalizeImageInPlace(file.path));
        return { ...file, normalizedRotation, normalizedRotationDetails: [normalizedRotation] };
      } catch {
        return { ...file, normalizedRotation: 0, normalizedRotationDetails: [], normalizationSkipped: true };
      }
    }

    if (extension === '.pdf') {
      return { ...file, normalizedRotation: 0, normalizedRotationDetails: [], normalizationSkipped: true };
    }

    return file;
  }

  async normalizeUploadedFiles(files = []) {
    const normalized = [];
    for (const file of files) {
      normalized.push(await this.normalizeUploadedFile(file));
    }
    return normalized;
  }
}

export default new UploadNormalizationService();
