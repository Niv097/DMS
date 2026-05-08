export const getDefaultHomePath = (user) => {
  switch (user?.role) {
    case 'ADMIN':
      return '/admin/dashboard';
    case 'SUPER_ADMIN':
      return '/admin/dashboard';
    case 'AUDITOR':
      return '/admin/audit';
    default:
      return '/dashboard';
  }
};

export const isAdminConsoleUser = (user) => ['ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(user?.role);
