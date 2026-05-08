import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getIncomingStorageDir } from '../utils/storage.js';
import { normalizeDisplayFileName } from '../utils/fileName.js';
import { allowedUploadExtensions, allowedUploadMimeTypes, uploadMaxFileSizeBytes } from '../config/env.js';
import fileSecurityService from '../services/fileSecurityService.js';

const uploadDir = getIncomingStorageDir();
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const safeFieldName = String(file.fieldname || 'file').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'file';
    cb(null, `${safeFieldName}-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(String(file.originalname || '')).toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();

  if (!allowedUploadExtensions.includes(extension) || !allowedUploadMimeTypes.includes(mime)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Only PDF and approved image formats are allowed.'));
  }

  cb(null, true);
};

const uploadOptions = {
  storage,
  fileFilter
};

if (Number.isFinite(uploadMaxFileSizeBytes) && uploadMaxFileSizeBytes > 0) {
  uploadOptions.limits = { fileSize: uploadMaxFileSizeBytes };
}

const upload = multer(uploadOptions);

const normalizeRequestFileNames = (req) => {
  const normalizeFile = (file) => {
    if (!file) return;
    file.originalname = normalizeDisplayFileName(file.originalname || file.filename || '');
  };

  if (req.file) {
    normalizeFile(req.file);
  }

  if (Array.isArray(req.files)) {
    req.files.forEach(normalizeFile);
    return;
  }

  if (req.files && typeof req.files === 'object') {
    Object.values(req.files)
      .flat()
      .forEach(normalizeFile);
  }
};

const wrapUploadMiddleware = (middleware) => async (req, res, next) => {
  middleware(req, res, async (error) => {
    if (error) {
      return next(error);
    }

    try {
      normalizeRequestFileNames(req);
      await fileSecurityService.scanRequestFiles(req);
      next();
    } catch (scanError) {
      next(scanError);
    }
  });
};

const wrappedUpload = {
  single(fieldName) {
    return wrapUploadMiddleware(upload.single(fieldName));
  },
  fields(fieldDefinitions) {
    return wrapUploadMiddleware(upload.fields(fieldDefinitions));
  },
  array(fieldName, maxCount) {
    return wrapUploadMiddleware(upload.array(fieldName, maxCount));
  }
};

export default wrappedUpload;
