export const availableFmsPermissions = ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_DOWNLOAD_ALL', 'FMS_UPLOAD', 'FMS_SHARE', 'FMS_REVOKE', 'FMS_PUBLISH'];

export const fmsRoleProfiles = [
  {
    key: 'VIEW_ONLY',
    label: 'Shared Records Viewer',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL'],
    description: 'For users who should search and open the full released FMS library across the bank without download or upload rights.',
    shortDescription: 'Bank-wide viewing of released records.',
    hierarchySummary: 'Sees the full released FMS library across bank folders without being tied to one upload department.',
    bankingUse: 'Best for readers, support staff, auditors-in-view mode, and officers who should only open records.',
    downloadPolicy: 'Download stays separately controlled and is not part of this role.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'grant' },
      { label: 'Upload new records', state: 'inactive' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'RECORD_INTAKE',
    label: 'Branch Records Uploader',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_UPLOAD'],
    description: 'For users who own one banking desk like KYC or Loans for upload, while still being able to open the wider released FMS library.',
    shortDescription: 'Department-owned intake plus bank-wide released-library view.',
    hierarchySummary: 'Uploads only inside the assigned owned desk, but can still see the wider released FMS library across folders.',
    bankingUse: 'Best for desk owners like KYC, loans, operations, or makers capturing non-workflow records.',
    downloadPolicy: 'Can open the wider released library; controlled download still depends on download rights.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'grant' },
      { label: 'Upload new records', state: 'active' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'LIBRARY_VIEWER',
    label: 'FMS Library Viewer',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL'],
    description: 'For users who should search and open the full released FMS library across bank folders without upload or governance rights.',
    shortDescription: 'Bank-wide FMS viewing across all released folders.',
    hierarchySummary: 'Sees the released FMS library across the bank instead of being restricted to one intake department.',
    bankingUse: 'Best for records readers, retrieval desks, audit counters, and users who must search every released FMS folder.',
    downloadPolicy: 'Can open the full FMS library. Download still needs the downloader preset or an explicit record grant.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'grant' },
      { label: 'Upload new records', state: 'inactive' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'LIBRARY_DOWNLOADER',
    label: 'FMS Library Viewer + Downloader',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_DOWNLOAD_ALL'],
    description: 'For users who should search, open, and download the full released FMS library across bank folders.',
    shortDescription: 'Bank-wide FMS viewing and controlled download.',
    hierarchySummary: 'Sees the released FMS library across the bank and can take controlled downloads from every released folder.',
    bankingUse: 'Best for central retrieval desks, records counters, HO support, or officers who need full FMS retrieval visibility.',
    downloadPolicy: 'Download remains employee-ID controlled and every released copy is stamped and audit logged.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'active' },
      { label: 'Upload new records', state: 'inactive' },
      { label: 'Share or revoke access', state: 'inactive' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'ACCESS_CONTROLLER',
    label: 'Records Recommender / Access Controller',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_UPLOAD', 'FMS_SHARE', 'FMS_REVOKE'],
    description: 'For officers who intake records, recommend who may view or download them, and control visibility within the permitted bank scope.',
    shortDescription: 'Controls release, view, and download access inside the bank scope.',
    hierarchySummary: 'Operates across the assigned bank, department, sub-department, or branch hierarchy.',
    bankingUse: 'Best for recommenders, records controllers, or branch/department officers who manage visibility.',
    downloadPolicy: 'Can decide which users get view-only or view-plus-download access.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'grant' },
      { label: 'Upload new records', state: 'active' },
      { label: 'Share or revoke access', state: 'active' },
      { label: 'Publish to bank register', state: 'inactive' }
    ]
  },
  {
    key: 'PUBLISHING_CONTROLLER',
    label: 'Records Approver / Publishing Controller',
    permissions: ['FMS_VIEW', 'FMS_VIEW_ALL', 'FMS_UPLOAD', 'FMS_SHARE', 'FMS_REVOKE', 'FMS_PUBLISH'],
    description: 'For approvers who intake, govern, and finally publish records into the visible bank register with full operational control.',
    shortDescription: 'Full FMS operational control including publish authority.',
    hierarchySummary: 'Controls records across the assigned bank scope and can release them into the searchable register.',
    bankingUse: 'Best for approvers, bank records administrators, or final controlling officers.',
    downloadPolicy: 'Can grant view or download access and can finalize records for broad searchable use.',
    accessMatrix: [
      { label: 'Search / open shared records', state: 'active' },
      { label: 'Download shared records', state: 'grant' },
      { label: 'Upload new records', state: 'active' },
      { label: 'Share or revoke access', state: 'active' },
      { label: 'Publish to bank register', state: 'active' }
    ]
  }
];

export const fmsRoleExamples = [
  {
    title: 'Uploader Example',
    summary: 'If the bank wants this user to lodge only KYC or desk-owned records, use the uploader profile with the user department mapping.',
    mapping: 'KYC / branch uploader -> Branch Records Uploader',
    note: 'Department ownership still controls which FMS folders and intake types appear.'
  },
  {
    title: 'Library Viewer Example',
    summary: 'If the bank wants this user to search the full FMS library without uploading, use the library viewer profile.',
    mapping: 'Records reader / retrieval desk -> FMS Library Viewer',
    note: 'Good when the user should open KYC, circular, and other released folders across the bank.'
  },
  {
    title: 'Library Downloader Example',
    summary: 'If the bank wants this user to search and download from the full FMS library, use the library downloader profile.',
    mapping: 'View + download user -> FMS Library Viewer + Downloader',
    note: 'Download is still employee-ID controlled and audit logged per file.'
  },
  {
    title: 'Recommender Example',
    summary: 'If the bank wants the recommender to view and recommend release, use the access-controller role and then grant download only when required.',
    mapping: 'Recommender -> Records Recommender / Access Controller',
    note: 'Download is a controlled grant, not a blanket role right.'
  },
  {
    title: 'Approver Example',
    summary: 'If the bank wants the approver to control everything, use the publishing controller preset.',
    mapping: 'Approver -> Records Approver / Publishing Controller',
    note: 'This is the closest match to full FMS operational access.'
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

  return {
    key: 'CUSTOM',
    label: 'Custom Banking Access',
    description: 'This user has a custom mix outside the standard bank role presets.'
  };
};

export const expandFmsRoleProfile = (profileKey) => (
  fmsRoleProfiles.find((profile) => profile.key === profileKey)?.permissions || ['FMS_VIEW']
);

export const getFmsRoleProfile = (profileKey, fallbackKey = 'VIEW_ONLY') => (
  fmsRoleProfiles.find((profile) => profile.key === profileKey)
  || fmsRoleProfiles.find((profile) => profile.key === fallbackKey)
  || fmsRoleProfiles[0]
);

export const permissionDisplayLabel = (permission) => {
  const cleaned = String(permission || '').replace('FMS_', '');
  if (cleaned === 'VIEW') return 'Search And Open Shared Records';
  if (cleaned === 'VIEW_ALL') return 'See Full FMS Library';
  if (cleaned === 'DOWNLOAD_ALL') return 'Download Full FMS Library';
  if (cleaned === 'UPLOAD') return 'Lodge Manual Records';
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
