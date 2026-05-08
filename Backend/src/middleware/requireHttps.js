import { isProduction, requireHttps } from '../config/env.js';

export const requireHttpsMiddleware = (req, res, next) => {
  if (!isProduction || !requireHttps) {
    return next();
  }

  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const secure = req.secure || forwardedProto === 'https';
  if (secure) {
    return next();
  }

  return res.status(403).json({
    error: 'HTTPS is required for this environment.'
  });
};
