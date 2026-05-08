const stores = new Map();

const getClientKey = (req, keyPrefix) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
  return `${keyPrefix}:${ip}`;
};

export const createRateLimiter = ({
  keyPrefix,
  windowMs,
  maxRequests,
  message
}) => {
  return (req, res, next) => {
    const now = Date.now();
    const key = getClientKey(req, keyPrefix);
    const current = stores.get(key);

    if (!current || current.expiresAt <= now) {
      stores.set(key, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    current.count += 1;
    stores.set(key, current);

    if (current.count > maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((current.expiresAt - now) / 1000));
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.'
      });
    }

    next();
  };
};
