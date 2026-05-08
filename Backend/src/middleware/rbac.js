const getUserRole = (user) => user?.role?.name || user?.role;

const getAccessibleBranchIds = (user) => {
  const ids = new Set();
  if (user?.branch_id) ids.add(user.branch_id);
  for (const access of user?.branch_accesses || []) {
    if (access?.branch_id) ids.add(access.branch_id);
  }
  for (const id of user?.accessible_branch_ids || []) {
    if (id) ids.add(id);
  }
  return [...ids];
};

export const requireRole = (...allowedRoles) => (req, res, next) => {
  const roles = allowedRoles.flat().filter(Boolean);
  const userRole = getUserRole(req.user);

  if (!req.user || (roles.length && !roles.includes(userRole))) {
    return res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
  }

  next();
};

export const requireTenantMatch = (getTenantId = (req) => req.params.tenant_id || req.body.tenant_id || req.query.tenant_id) => (
  req,
  res,
  next
) => {
  const userRole = getUserRole(req.user);
  if (userRole === 'SUPER_ADMIN') return next();

  const tenantId = Number.parseInt(String(getTenantId(req) || ''), 10);
  if (!tenantId || req.user?.tenant_id !== tenantId) {
    return res.status(403).json({ error: 'Tenant access denied.' });
  }

  next();
};

export const requireBranchMatch = (getBranchId = (req) => req.params.branch_id || req.body.branch_id || req.query.branch_id) => (
  req,
  res,
  next
) => {
  const userRole = getUserRole(req.user);
  if (userRole === 'SUPER_ADMIN') return next();

  const branchId = Number.parseInt(String(getBranchId(req) || ''), 10);
  if (!branchId || !getAccessibleBranchIds(req.user).includes(branchId)) {
    return res.status(403).json({ error: 'Branch access denied.' });
  }

  next();
};

export const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (req.user?.must_change_password || req.user?.is_first_login) {
      return res.status(403).json({
        error: 'Password change required before accessing the system.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
    return requireRole(roles)(req, res, next);
  };
};
