import { assertFmsFeatureAccess, assertFmsPermission } from '../services/fmsService.js';

export const requireFmsFeatureAccess = (req, res, next) => {
  try {
    assertFmsFeatureAccess(req.user);
    return next();
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const requireFmsPermission = (permission) => (req, res, next) => {
  try {
    assertFmsPermission(req.user, permission);
    return next();
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};
