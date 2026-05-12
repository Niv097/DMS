export const availableFmsPermissions = ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_DOWNLOAD_ALL', 'FMS_UPLOAD', 'FMS_SHARE', 'FMS_REVOKE', 'FMS_PUBLISH'];

export const fmsRoleProfiles = [
  {
    key: 'VIEW_ONLY',
    label: 'View',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL'],
    description: 'User can open released FMS records.',
    shortDescription: 'Open released FMS records only.',
    hierarchySummary: 'Bank-wide released-library view.',
    bankingUse: 'Open only.',
    downloadPolicy: 'Download not included.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'inactive' },
      { label: 'Upload new records', state: 'inactive' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'VIEW_DOWNLOAD',
    label: 'View + Download',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_DOWNLOAD_ALL'],
    description: 'User can open and download released FMS records.',
    shortDescription: 'Open and download released FMS records.',
    hierarchySummary: 'Bank-wide released-library view with download.',
    bankingUse: 'Open and download.',
    downloadPolicy: 'Download included.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'active' },
      { label: 'Upload new records', state: 'inactive' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'VIEW_DOWNLOAD_UPLOAD',
    label: 'View + Download + Upload',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_DOWNLOAD_ALL', 'FMS_UPLOAD'],
    description: 'User can open, download, and upload FMS records.',
    shortDescription: 'Open, download, and upload FMS records.',
    hierarchySummary: 'Bank-wide released-library view with owned-desk upload.',
    bankingUse: 'Open, download, and upload.',
    downloadPolicy: 'Download and upload included.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'active' },
      { label: 'Upload new records', state: 'active' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  }
];

export const fmsRoleExamples = [
  {
    title: 'View',
    summary: 'Use this when the user should only open released FMS records.',
    mapping: 'Reader -> View',
    note: 'No download and no upload.'
  },
  {
    title: 'View + Download',
    summary: 'Use this when the user should open and download released FMS records.',
    mapping: 'Reader + downloader -> View + Download',
    note: 'No upload.'
  },
  {
    title: 'View + Download + Upload',
    summary: 'Use this when the user should open, download, and upload FMS records.',
    mapping: 'Uploader -> View + Download + Upload',
    note: 'Owned department still controls upload desk mapping.'
  }
];

export const fmsSearchModeOptions = [
  { value: 'ALL', label: 'All Search Keys' },
  { value: 'CUSTOMER', label: 'Customer Name / Customer Ref' },
  { value: 'CIF', label: 'CIF / Customer ID' },
  { value: 'ACCOUNT', label: 'Account Number / Account Ref' },
  { value: 'IDENTITY', label: 'PAN / Aadhaar / Identity Ref' },
  { value: 'DOCUMENT_REF', label: 'Document / Docket / Sanction Ref' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'BRANCH', label: 'Branch' },
  { value: 'UPLOADER', label: 'Uploaded By User' },
  { value: 'DOCUMENT_TYPE', label: 'Record Type' },
  { value: 'CATEGORY', label: 'Banking Desk' },
  { value: 'FILE', label: 'File Name / Title' },
  { value: 'TAGS', label: 'Tags / Keywords' }
];

export const normalizePermissionSet = (permissions = []) => [...new Set(
  (Array.isArray(permissions) ? permissions : [])
    .map((permission) => String(permission || '').trim().toUpperCase())
    .filter(Boolean)
)].sort();

export const getFmsRoleProfile = (profileKey, fallbackKey = 'VIEW_ONLY') => (
  fmsRoleProfiles.find((profile) => profile.key === profileKey)
  || fmsRoleProfiles.find((profile) => profile.key === fallbackKey)
  || fmsRoleProfiles[0]
);

export const inferFmsProfile = (managedUser) => {
  if (['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) {
    return {
      key: 'GOVERNANCE_AUTO',
      label: 'Bank Governance Auto',
      description: 'Admin-level users automatically receive full FMS governance rights.'
    };
  }

  if (!managedUser.has_fms_access) {
    return {
      key: 'OFF',
      label: 'No FMS Access',
      description: 'This user cannot use the file-management side of DMS.'
    };
  }

  const normalizedPermissions = normalizePermissionSet(managedUser.fms_permissions || []);
  const matchedProfile = fmsRoleProfiles.find((profile) => (
    JSON.stringify(normalizePermissionSet(profile.permissions)) === JSON.stringify(normalizedPermissions)
  ));

  if (matchedProfile) return matchedProfile;

  if (managedUser.has_granted_fms_access && normalizedPermissions.length === 0) {
    return {
      key: 'GRANTED_VIEW',
      label: 'Granted Shared View',
      description: 'This user is seeing records through direct or inherited grants only.'
    };
  }

  if (
    normalizedPermissions.includes('FMS_UPLOAD')
    || normalizedPermissions.includes('FMS_SHARE')
    || normalizedPermissions.includes('FMS_REVOKE')
    || normalizedPermissions.includes('FMS_PUBLISH')
  ) {
    return getFmsRoleProfile('VIEW_DOWNLOAD_UPLOAD');
  }

  if (normalizedPermissions.includes('FMS_DOWNLOAD_ALL')) {
    return getFmsRoleProfile('VIEW_DOWNLOAD');
  }

  if (normalizedPermissions.includes('FMS_VIEW') || normalizedPermissions.includes('FMS_VIEW_ALL')) {
    return getFmsRoleProfile('VIEW_ONLY');
  }

  return {
    key: 'VIEW_ONLY',
    label: 'View',
    description: 'This user can open released FMS records.'
  };
};

export const expandFmsRoleProfile = (profileKey) => (
  fmsRoleProfiles.find((profile) => profile.key === profileKey)?.permissions || ['FMS_VIEW', 'FMS_VIEW_ALL']
);

export const permissionDisplayLabel = (permission) => {
  const cleaned = String(permission || '').replace('FMS_', '');
  if (cleaned === 'VIEW') return 'View';
  if (cleaned === 'VIEW_ALL') return 'Full Library View';
  if (cleaned === 'DOWNLOAD_ALL') return 'Download';
  if (cleaned === 'UPLOAD') return 'Upload';
  if (cleaned === 'SHARE') return 'Share Specific Records';
  if (cleaned === 'REVOKE') return 'Withdraw Shared Access';
  if (cleaned === 'PUBLISH') return 'Publish To Bank Register';
  return cleaned.replace('_', ' ');
};

export const accessMatrixBadgeTone = (state) => {
  if (state === 'active') return 'badge-green';
  if (state === 'grant') return 'badge-blue';
  return 'badge-blue';
};

export const accessMatrixLabel = (state) => {
  if (state === 'active') return 'Included';
  if (state === 'grant') return 'Grant Based';
  return 'Not Included';
};
