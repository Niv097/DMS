export const fmsSectionItems = [
  { key: 'roles', label: 'FMS Role Desk', path: '/fms/roles' },
  { key: 'admin', label: 'Library Administration', path: '/fms/admin' },
  { key: 'upload', label: 'Record Intake', path: '/fms/upload' },
  { key: 'inbox', label: 'Circular Inbox', path: '/fms/inbox' },
  { key: 'register', label: 'Records Library', path: '/fms/register' },
  { key: 'library', label: 'Bank Departments', path: '/fms/library', hidden: true },
  { key: 'access', label: 'Library Access', path: '/fms/access' }
];

export const getFmsSectionFromPath = (pathname = '') => {
  const match = fmsSectionItems.find((item) => pathname.startsWith(item.path));
  return match?.key || 'register';
};

export const isFmsSectionPath = (pathname = '') => pathname.startsWith('/fms');

export const hasFullFmsFeatureAccess = (user) => {
  const permissions = new Set(user?.fms_permissions || []);
  const isAdminOperator = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  return Boolean(
    isAdminOperator
    || user?.fms_enabled
    || [...permissions].some((permission) => permission && permission !== 'FMS_VIEW')
  );
};

export const hasGrantedInboxOnlyAccess = (user) => {
  const isAdminOperator = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  return Boolean(
    user?.has_granted_fms_access
    && !hasFullFmsFeatureAccess(user)
    && !isAdminOperator
  );
};

export const getVisibleFmsMenuItems = (user) => {
  const permissions = new Set(user?.fms_permissions || []);
  const isAdminOperator = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const canLodgeRecords = isAdminOperator || permissions.has('FMS_UPLOAD');
  const canUseAccessDesk = permissions.has('FMS_SHARE')
    || permissions.has('FMS_REVOKE')
    || permissions.has('FMS_PUBLISH');
  if (hasGrantedInboxOnlyAccess(user)) {
    return fmsSectionItems.filter((item) => !item.hidden && item.key === 'inbox');
  }

  return fmsSectionItems.filter((item) => {
    if (item.hidden) return false;
    if (item.key === 'upload') return canLodgeRecords;
    if (item.key === 'roles') return isAdminOperator;
    if (item.key === 'admin') return isAdminOperator;
    if (item.key === 'access') return canUseAccessDesk;
    return true;
  });
};
