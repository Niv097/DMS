import logger from '../utils/logger.js';
import { isProduction } from '../config/env.js';

export const notFoundHandler = (req, res) => {
  res.status(404).json({ error: 'Resource not found.' });
};

export const errorHandler = (error, req, res, next) => {
  let status = error.status || error.statusCode || 500;
  let message = error.message || 'Request failed.';

  if (error?.name === 'MulterError' && error?.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File is too large. Maximum allowed upload size is 50 MB.';
  } else if (status === 413) {
    message = 'File is too large. Maximum allowed upload size is 50 MB.';
  }

  logger.error(error.message || 'Unhandled server error', {
    path: req.originalUrl,
    method: req.method,
    status,
    ...(isProduction ? {} : { stack: error.stack })
  });

  if (res.headersSent) {
    return next(error);
  }

  res.status(status).json({
    error: status >= 500 ? 'Internal server error.' : message
  });
};
