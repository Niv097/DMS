import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import prisma from '../utils/prisma.js';
import {
  buildFmsFileStoredRelativePath,
  ensureStoredParentDir,
  moveFileToStoredRelativePath,
  resolveStoredPath,
  sanitizeStorageSegment
} from '../utils/storage.js';

export const FMS_PERMISSIONS = {
  VIEW: 'FMS_VIEW',
  VIEW_ALL: 'FMS_VIEW_ALL',
  DOWNLOAD_ALL: 'FMS_DOWNLOAD_ALL',
  UPLOAD: 'FMS_UPLOAD',
  SHARE: 'FMS_SHARE',
  REVOKE: 'FMS_REVOKE',
  PUBLISH: 'FMS_PUBLISH'
};

export const FMS_ACCESS_LEVELS = {
  VIEW: 'VIEW',
  DOWNLOAD: 'DOWNLOAD'
};

const FMS_PERMISSION_ORDER = Object.values(FMS_PERMISSIONS);
const FMS_ACCESS_LEVEL_ORDER = [FMS_ACCESS_LEVELS.VIEW, FMS_ACCESS_LEVELS.DOWNLOAD];
const FMS_PERMISSION_DEPENDENCIES = {
  [FMS_PERMISSIONS.VIEW_ALL]: [FMS_PERMISSIONS.VIEW],
  [FMS_PERMISSIONS.DOWNLOAD_ALL]: [FMS_PERMISSIONS.VIEW, FMS_PERMISSIONS.VIEW_ALL],
  [FMS_PERMISSIONS.UPLOAD]: [FMS_PERMISSIONS.VIEW],
  [FMS_PERMISSIONS.SHARE]: [FMS_PERMISSIONS.VIEW],
  [FMS_PERMISSIONS.REVOKE]: [FMS_PERMISSIONS.VIEW],
  [FMS_PERMISSIONS.PUBLISH]: [FMS_PERMISSIONS.VIEW]
};

export const DOCUMENT_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];
export const DEFAULT_FMS_RECORD_TYPES = [
  {
    value: 'PAN_CARD',
    label: 'PAN Card',
    department_codes: ['KYC'],
    default_desk: 'KYC',
    required_fields: ['customer_name', 'id_proof_number'],
    visible_fields: ['customer_name', 'cif_reference', 'id_proof_number'],
    field_labels: {
      id_proof_number: 'PAN Number'
    }
  },
  {
    value: 'AADHAAR_CARD',
    label: 'Aadhaar Card',
    department_codes: ['KYC'],
    default_desk: 'KYC',
    required_fields: ['customer_name', 'id_proof_number'],
    visible_fields: ['customer_name', 'cif_reference', 'id_proof_number'],
    field_labels: {
      id_proof_number: 'Aadhaar Number'
    }
  },
  {
    value: 'KYC_PACK',
    label: 'KYC Pack',
    department_codes: ['KYC'],
    default_desk: 'KYC',
    required_fields: ['customer_name', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'identity_reference', 'id_proof_number', 'document_reference'],
    field_labels: {
      identity_reference: 'Identity Proof Type',
      document_reference: 'KYC Reference'
    }
  },
  {
    value: 'ACCOUNT_OPENING_FORM',
    label: 'Account Opening Form',
    department_codes: ['RETAIL', 'DEPOSITS'],
    default_desk: 'Retail',
    required_fields: ['customer_name', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'identity_reference', 'document_reference'],
    field_labels: {
      identity_reference: 'Applicant Identity Type',
      document_reference: 'Application Reference'
    }
  },
  {
    value: 'SANCTION_COPY',
    label: 'Sanction Copy',
    department_codes: ['LOANS'],
    default_desk: 'Loans',
    required_fields: ['customer_name', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'account_reference', 'document_reference'],
    field_labels: {
      account_reference: 'Loan Account Number',
      document_reference: 'Sanction Reference'
    }
  },
  {
    value: 'CUSTOMER_PHOTOGRAPH',
    label: 'Customer Photograph',
    department_codes: ['KYC'],
    default_desk: 'KYC',
    required_fields: ['customer_name', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'document_reference'],
    field_labels: {
      document_reference: 'Photo Record Reference'
    }
  },
  {
    value: 'ADDRESS_PROOF',
    label: 'Address Proof',
    department_codes: ['KYC'],
    default_desk: 'KYC',
    required_fields: ['customer_name', 'identity_reference', 'id_proof_number'],
    visible_fields: ['customer_name', 'cif_reference', 'identity_reference', 'id_proof_number'],
    field_labels: {
      identity_reference: 'Address Proof Type',
      id_proof_number: 'Address Document Number'
    }
  },
  {
    value: 'SIGNATURE_CARD',
    label: 'Signature Card',
    department_codes: ['RETAIL'],
    default_desk: 'Retail',
    required_fields: ['customer_name', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'account_reference', 'document_reference'],
    field_labels: {
      account_reference: 'Linked Account Number',
      document_reference: 'Signature Card Reference'
    }
  },
  {
    value: 'LOAN_FILE',
    label: 'Loan File',
    department_codes: ['LOANS'],
    default_desk: 'Loans',
    required_fields: ['customer_name', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'cif_reference', 'account_reference', 'document_reference'],
    field_labels: {
      account_reference: 'Loan Account Number',
      document_reference: 'Loan File Reference'
    }
  },
  {
    value: 'TERM_DEPOSIT_INSTRUCTION',
    label: 'Term Deposit Instruction',
    department_codes: ['DEPOSITS'],
    default_desk: 'Deposits',
    required_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Deposit Customer Reference',
      account_reference: 'Deposit Account Number',
      document_reference: 'Deposit Instruction Reference'
    }
  },
  {
    value: 'DEPOSIT_CLOSURE_REQUEST',
    label: 'Deposit Closure Request',
    department_codes: ['DEPOSITS'],
    default_desk: 'Deposits',
    required_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Deposit Customer Reference',
      account_reference: 'Deposit Account Number',
      document_reference: 'Closure Request Reference'
    }
  },
  {
    value: 'TREASURY_DEAL_TICKET',
    label: 'Treasury Deal Ticket',
    department_codes: ['TREASURY'],
    default_desk: 'Treasury',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: {
      document_reference: 'Deal Ticket Reference',
      document_category: 'Deal Type'
    }
  },
  {
    value: 'INVESTMENT_CONFIRMATION',
    label: 'Investment Confirmation',
    department_codes: ['TREASURY'],
    default_desk: 'Treasury',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: {
      document_reference: 'Investment Confirmation Reference',
      document_category: 'Instrument Type'
    }
  },
  {
    value: 'OPERATIONS_MEMO',
    label: 'Operations Memo',
    department_codes: ['OPERATIONS'],
    default_desk: 'Operations',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Operations Memo Reference'
    }
  },
  {
    value: 'RECONCILIATION_SHEET',
    label: 'Reconciliation Sheet',
    department_codes: ['OPERATIONS'],
    default_desk: 'Operations',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Reconciliation Reference'
    }
  },
  {
    value: 'AUDIT_OBSERVATION',
    label: 'Audit Observation',
    department_codes: ['AUDIT'],
    default_desk: 'Audit',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Audit Observation Reference'
    }
  },
  {
    value: 'AUDIT_WORKING_PAPER',
    label: 'Audit Working Paper',
    department_codes: ['AUDIT'],
    default_desk: 'Audit',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Working Paper Reference'
    }
  },
  {
    value: 'COMPLIANCE_CERTIFICATE',
    label: 'Compliance Certificate',
    department_codes: ['COMPLIANCE'],
    default_desk: 'Compliance',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Compliance Certificate Reference'
    }
  },
  {
    value: 'REGULATORY_FILING',
    label: 'Regulatory Filing',
    department_codes: ['COMPLIANCE'],
    default_desk: 'Compliance',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'notes'],
    field_labels: {
      document_reference: 'Regulatory Filing Reference'
    }
  },
  {
    value: 'LEGAL_NOTICE',
    label: 'Legal Notice',
    department_codes: ['LEGAL'],
    default_desk: 'Legal',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Case / Customer Reference',
      document_reference: 'Legal Notice Reference'
    }
  },
  {
    value: 'CASE_FILE',
    label: 'Case File',
    department_codes: ['LEGAL'],
    default_desk: 'Legal',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Case / Customer Reference',
      document_reference: 'Case File Reference'
    }
  },
  {
    value: 'LC_DOCUMENT_SET',
    label: 'LC Document Set',
    department_codes: ['TRADE_FINANCE'],
    default_desk: 'Trade Finance',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Trade Customer Reference',
      account_reference: 'Trade Account Number',
      document_reference: 'LC Reference'
    }
  },
  {
    value: 'BG_ISSUANCE_FILE',
    label: 'BG Issuance File',
    department_codes: ['TRADE_FINANCE'],
    default_desk: 'Trade Finance',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Trade Customer Reference',
      account_reference: 'Trade Account Number',
      document_reference: 'Bank Guarantee Reference'
    }
  },
  {
    value: 'RECOVERY_CASE_FILE',
    label: 'Recovery Case File',
    department_codes: ['RECOVERY'],
    default_desk: 'Recovery',
    required_fields: ['customer_reference', 'account_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Recovery Customer Reference',
      account_reference: 'Linked Account Number',
      document_reference: 'Recovery Case Reference'
    }
  },
  {
    value: 'DEMAND_NOTICE',
    label: 'Demand Notice',
    department_codes: ['RECOVERY'],
    default_desk: 'Recovery',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Recovery Customer Reference',
      document_reference: 'Demand Notice Reference'
    }
  },
  {
    value: 'CORPORATE_ACCOUNT_FILE',
    label: 'Corporate Account File',
    department_codes: ['CORPORATE_BANKING'],
    default_desk: 'Corporate Banking',
    required_fields: ['customer_name', 'customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Corporate Client Reference',
      account_reference: 'Corporate Account Number',
      document_reference: 'Corporate File Reference'
    }
  },
  {
    value: 'FACILITY_SANCTION_PACK',
    label: 'Facility Sanction Pack',
    department_codes: ['CORPORATE_BANKING'],
    default_desk: 'Corporate Banking',
    required_fields: ['customer_name', 'customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'Corporate Client Reference',
      account_reference: 'Facility Account Number',
      document_reference: 'Facility Sanction Reference'
    }
  },
  {
    value: 'RISK_ASSESSMENT_NOTE',
    label: 'Risk Assessment Note',
    department_codes: ['RISK_MANAGEMENT'],
    default_desk: 'Risk Management',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'customer_reference', 'notes'],
    field_labels: {
      customer_reference: 'Risk Subject Reference',
      document_reference: 'Risk Assessment Reference'
    }
  },
  {
    value: 'POLICY_EXCEPTION_NOTE',
    label: 'Policy Exception Note',
    department_codes: ['RISK_MANAGEMENT'],
    default_desk: 'Risk Management',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'customer_reference', 'notes'],
    field_labels: {
      customer_reference: 'Exception Subject Reference',
      document_reference: 'Policy Exception Reference'
    }
  },
  {
    value: 'SYSTEM_ACCESS_REQUEST',
    label: 'System Access Request',
    department_codes: ['IT_SERVICES'],
    default_desk: 'IT Services',
    required_fields: ['customer_reference', 'document_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'document_reference', 'notes'],
    field_labels: {
      customer_reference: 'User / Employee Reference',
      document_reference: 'Access Request Reference'
    }
  },
  {
    value: 'CHANGE_REQUEST',
    label: 'Change Request',
    department_codes: ['IT_SERVICES'],
    default_desk: 'IT Services',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: {
      document_reference: 'Change Request Reference',
      document_category: 'Application / Service'
    }
  },
  {
    value: 'INCIDENT_REPORT',
    label: 'Incident Report',
    department_codes: ['IT_SERVICES'],
    default_desk: 'IT Services',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: {
      document_reference: 'Incident Reference',
      document_category: 'System / Channel'
    }
  },
  {
    value: 'CIRCULAR',
    label: 'Circular',
    department_codes: ['CIRCULARS'],
    default_desk: 'Circulars',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: {
      document_reference: 'Circular Number'
    }
  },
  {
    value: 'MANUAL_RECORD',
    label: 'Manual Record',
    department_codes: ['MANUAL'],
    default_desk: 'Manual',
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'customer_name', 'notes'],
    field_labels: {
      document_reference: 'Manual Register Reference'
    }
  },
  {
    value: 'OTHER',
    label: 'Other Record Type',
    required_fields: ['customer_reference'],
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'identity_reference', 'id_proof_number', 'document_reference'],
    field_labels: {
      customer_reference: 'Primary Record Reference',
      account_reference: 'Linked Account Number'
    }
  }
];
export const DEFAULT_FMS_RECORD_DESKS = [
  'Retail',
  'Corporate Banking',
  'Loans',
  'KYC',
  'Manual',
  'Circulars',
  'Deposits',
  'Treasury',
  'Operations',
  'Risk Management',
  'Audit',
  'Compliance',
  'Legal',
  'IT Services',
  'Trade Finance',
  'Recovery'
];
export const DEFAULT_FMS_CLASSIFICATION_MASTER = [
  { value: 'PUBLIC', label: 'Public Record' },
  { value: 'INTERNAL', label: 'Internal Record' },
  { value: 'CONFIDENTIAL', label: 'Confidential Record' },
  { value: 'RESTRICTED', label: 'Restricted Record' }
];
export const FMS_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff'
]);
export const FMS_ALLOWED_EXTENSIONS = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.tif', '.tiff']);
const PUBLISH_REQUIRES_ELEVATION = new Set(['CONFIDENTIAL', 'RESTRICTED']);
const supportsBranchAppendGrantModel = Boolean(prisma.fmsBranchAppendGrant);
const APPEND_ACCESS_SCHEMA_MESSAGES = [
  'Unknown field `cross_branch_append_enabled`',
  'Unknown argument `cross_branch_append_enabled`',
  'column "cross_branch_append_enabled" does not exist',
  'The column `Tenant.cross_branch_append_enabled` does not exist',
  'relation "FmsBranchAppendGrant" does not exist',
  'table `public.FmsBranchAppendGrant` does not exist'
];

const normalizePermissionValue = (value) => String(value || '').trim().toUpperCase();
export const parseFmsPermissionEnvelope = (raw) => {
  if (Array.isArray(raw)) {
    return {
      permissions: raw,
      ownedDepartmentId: null
    };
  }

  if (typeof raw === 'string') {
    try {
      return parseFmsPermissionEnvelope(JSON.parse(raw));
    } catch {
      return {
        permissions: [],
        ownedDepartmentId: null
      };
    }
  }

  if (raw && typeof raw === 'object') {
    return {
      permissions: Array.isArray(raw.permissions) ? raw.permissions : [],
      ownedDepartmentId: Number(raw.owned_department_id || raw.ownedDepartmentId || 0) || null
    };
  }

  return {
    permissions: [],
    ownedDepartmentId: null
  };
};
const normalizeMasterCode = (value, fallback = '') => String(value || fallback)
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_ -]/g, '')
  .replace(/\s+/g, '_');
const normalizeGrantTargetType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized.startsWith('BRANCH')) return 'BRANCH';
  if (normalized.startsWith('DEPARTMENT')) return 'DEPARTMENT';
  if (normalized === 'GLOBAL' || normalized === 'BANK' || normalized === 'GLOBAL_BANK') return 'GLOBAL';
  return 'USER';
};
const normalizeNodeCode = (value, fallback = 'BANK') => String(value || fallback)
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9_-]/g, '') || fallback;
const normalizeDepartmentMatchCode = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');
const normalizeRecordTypeFieldList = (fields) => Array.isArray(fields)
  ? [...new Set(fields.map((field) => String(field || '').trim()).filter(Boolean))]
  : [];
const normalizeRecordTypeFieldLabels = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).reduce((acc, [key, label]) => {
      const normalizedKey = String(key || '').trim();
      const normalizedLabel = String(label || '').trim();
      if (normalizedKey && normalizedLabel) {
        acc[normalizedKey] = normalizedLabel;
      }
      return acc;
    }, {})
    : {}
);
const normalizeRecordTypeDefinition = (item = {}, fallback = {}) => ({
  value: normalizeMasterCode(item?.value || item?.label || fallback?.value || ''),
  label: String(item?.label || item?.value || fallback?.label || '').trim(),
  department_codes: Array.from(new Set(
    [...(Array.isArray(fallback?.department_codes) ? fallback.department_codes : []), ...(Array.isArray(item?.department_codes) ? item.department_codes : [])]
      .map((entry) => normalizeDepartmentMatchCode(entry))
      .filter(Boolean)
  )),
  default_desk: String(item?.default_desk || fallback?.default_desk || '').trim() || null,
  required_fields: normalizeRecordTypeFieldList(item?.required_fields).length
    ? normalizeRecordTypeFieldList(item?.required_fields)
    : normalizeRecordTypeFieldList(fallback?.required_fields),
  visible_fields: normalizeRecordTypeFieldList(item?.visible_fields).length
    ? normalizeRecordTypeFieldList(item?.visible_fields)
    : normalizeRecordTypeFieldList(fallback?.visible_fields),
  field_labels: {
    ...normalizeRecordTypeFieldLabels(fallback?.field_labels),
    ...normalizeRecordTypeFieldLabels(item?.field_labels)
  }
});
const RECORD_TYPE_DEFAULT_MAP = new Map(
  DEFAULT_FMS_RECORD_TYPES.map((item) => [normalizeMasterCode(item.value), normalizeRecordTypeDefinition(item, item)])
);
const normalizeRuntimeRecordTypeDefinition = (item = {}) => {
  const value = normalizeMasterCode(item?.value || item?.label || '');
  const systemDefault = RECORD_TYPE_DEFAULT_MAP.get(value);
  if (!systemDefault) {
    return normalizeRecordTypeDefinition(item, {});
  }
  return {
    ...systemDefault,
    label: String(item?.label || systemDefault.label || '').trim() || systemDefault.label,
    department_codes: Array.from(new Set(
      [...(Array.isArray(systemDefault.department_codes) ? systemDefault.department_codes : []), ...(Array.isArray(item?.department_codes) ? item.department_codes : [])]
        .map((entry) => normalizeDepartmentMatchCode(entry))
        .filter(Boolean)
    )),
    default_desk: String(item?.default_desk || systemDefault.default_desk || '').trim() || systemDefault.default_desk || null,
    field_labels: {
      ...normalizeRecordTypeFieldLabels(systemDefault.field_labels),
      ...normalizeRecordTypeFieldLabels(item?.field_labels)
    }
  };
};

export const normalizeFmsSourceMode = (value, fallback = 'ALL') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  if (normalized === 'MANUAL_ONLY') return 'MANUAL_ONLY';
  if (normalized === 'DMS_ONLY') return 'DMS_ONLY';
  return 'ALL';
};

export const buildFmsSourceFilter = (value, fallback = 'ALL') => {
  const sourceMode = normalizeFmsSourceMode(value, fallback);
  if (sourceMode === 'MANUAL_ONLY') {
    return { source_note_id: null };
  }
  if (sourceMode === 'DMS_ONLY') {
    return { source_note_id: { not: null } };
  }
  return {};
};

export const normalizeTenantFmsLibraryStandards = (tenant = {}) => {
  const classificationMaster = Array.isArray(tenant?.fms_classification_master_json)
    ? tenant.fms_classification_master_json
    : DEFAULT_FMS_CLASSIFICATION_MASTER;
  const recordTypeMaster = Array.isArray(tenant?.fms_record_type_master_json)
    ? tenant.fms_record_type_master_json
    : DEFAULT_FMS_RECORD_TYPES;
  const recordDeskMaster = Array.isArray(tenant?.fms_record_desk_master_json)
    ? tenant.fms_record_desk_master_json
    : DEFAULT_FMS_RECORD_DESKS;

  const normalizedClassifications = DOCUMENT_CLASSIFICATIONS.map((value) => {
    const matched = classificationMaster.find((item) => String(item?.value || '').trim().toUpperCase() === value);
    return {
      value,
      label: String(matched?.label || DEFAULT_FMS_CLASSIFICATION_MASTER.find((item) => item.value === value)?.label || value)
        .trim() || value
    };
  });

  const recordTypeMap = new Map();
  for (const item of DEFAULT_FMS_RECORD_TYPES) {
    const normalized = normalizeRuntimeRecordTypeDefinition(item);
    if (normalized.value && normalized.label) {
      recordTypeMap.set(normalized.value, normalized);
    }
  }
  for (const item of recordTypeMaster) {
    const value = normalizeMasterCode(item?.value || item?.label || '');
    if (!value) continue;
    const merged = normalizeRuntimeRecordTypeDefinition({
      ...(recordTypeMap.get(value) || {}),
      ...(item || {})
    });
    if (merged.value && merged.label) {
      recordTypeMap.set(merged.value, merged);
    }
  }

  const dedupedRecordTypes = Array.from(recordTypeMap.values());

  const normalizedRecordDesks = Array.from(new Set(
    [...recordDeskMaster, ...DEFAULT_FMS_RECORD_DESKS]
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  ));

  return {
    classifications: normalizedClassifications,
    record_types: dedupedRecordTypes,
    record_desks: normalizedRecordDesks
  };
};

export const resolveFmsRecordTypeDefinition = (recordTypes = [], recordTypeValue = '') => {
  const normalizedValue = normalizeMasterCode(recordTypeValue);
  if (!normalizedValue) return null;
  const matched = (Array.isArray(recordTypes) ? recordTypes : [])
    .find((item) => normalizeMasterCode(item?.value || item?.label || '') === normalizedValue);
  return matched
    ? normalizeRuntimeRecordTypeDefinition(matched)
    : (RECORD_TYPE_DEFAULT_MAP.get(normalizedValue) || null);
};

const buildNodeDepartmentTokens = (node = {}) => {
  const tokens = new Set();
  const pushTokens = (value) => {
    const normalized = normalizeDepartmentMatchCode(value);
    if (normalized) tokens.add(normalized);
  };

  pushTokens(node?.department_master?.code);
  pushTokens(node?.department_master?.name);
  pushTokens(node?.department_master?.path_key);
  for (const segment of String(node?.department_master?.path_key || '').split('/')) {
    pushTokens(segment);
  }
  return [...tokens];
};

export const isFmsRecordTypeAllowedForNode = (recordTypeDefinition, node = {}) => {
  if (!recordTypeDefinition) return true;
  const requiredDepartments = Array.isArray(recordTypeDefinition.department_codes)
    ? recordTypeDefinition.department_codes.map((entry) => normalizeDepartmentMatchCode(entry)).filter(Boolean)
    : [];
  if (requiredDepartments.length === 0) return true;

  const nodeTokens = buildNodeDepartmentTokens(node);
  if (nodeTokens.length === 0) return false;

  return requiredDepartments.some((code) => (
    nodeTokens.includes(code)
    || nodeTokens.some((token) => token.includes(code) || code.includes(token))
  ));
};

export const listScopedFmsRecordTypes = (recordTypes = [], node = null) => {
  const source = Array.isArray(recordTypes) ? recordTypes : [];
  if (!node) return source.map((item) => normalizeRuntimeRecordTypeDefinition(item));
  return source
    .map((item) => normalizeRuntimeRecordTypeDefinition(item))
    .filter((item) => isFmsRecordTypeAllowedForNode(item, node));
};

const readFileSignature = async (absolutePath) => {
  const handle = await fs.open(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
};

const detectFileSignature = (buffer) => {
  if (!buffer || buffer.length < 4) return null;

  if (
    buffer[0] === 0x25
    && buffer[1] === 0x50
    && buffer[2] === 0x44
    && buffer[3] === 0x46
  ) {
    return { mime: 'application/pdf', kind: 'PDF' };
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', kind: 'IMAGE' };
  }

  if (
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff
  ) {
    return { mime: 'image/jpeg', kind: 'IMAGE' };
  }

  if (
    buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return { mime: 'image/webp', kind: 'IMAGE' };
  }

  if (
    buffer.length >= 4
    && (
      (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00)
      || (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)
    )
  ) {
    return { mime: 'image/tiff', kind: 'IMAGE' };
  }

  return null;
};

const isSignatureCompatibleWithExtension = (signatureMime, extension) => {
  const ext = String(extension || '').toLowerCase();
  if (!signatureMime || !ext) return false;
  if (signatureMime === 'application/pdf') return ext === '.pdf';
  if (signatureMime === 'image/png') return ext === '.png';
  if (signatureMime === 'image/jpeg') return ['.jpg', '.jpeg'].includes(ext);
  if (signatureMime === 'image/webp') return ext === '.webp';
  if (signatureMime === 'image/tiff') return ['.tif', '.tiff'].includes(ext);
  return false;
};

const isSameTenantScope = (user, tenantId) => isSuperAdmin(user) || Number(user?.tenant_id) === Number(tenantId);
const isAppendAccessCompatibilityError = (error) => APPEND_ACCESS_SCHEMA_MESSAGES.some((snippet) => String(error?.message || '').includes(snippet));

const hasAnyDirectPermission = (user, permissions = []) => {
  const normalizedPermissions = new Set(getUserFmsPermissions(user));
  return permissions.some((permission) => normalizedPermissions.has(permission));
};

const getStoredFmsPermissions = (user) => {
  const direct = user?.fms_permissions ?? user?.fmsPermissions ?? [];
  const envelope = parseFmsPermissionEnvelope(direct);
  const normalizeList = (values = []) => values.map(normalizePermissionValue).filter(Boolean);

  if (Array.isArray(direct)) return normalizeList(direct);
  if (envelope.permissions.length > 0) return normalizeList(envelope.permissions);

  if (typeof direct === 'string') {
    try {
      const parsed = JSON.parse(direct);
      return Array.isArray(parsed) ? normalizeList(parsed) : [];
    } catch {
      return [];
    }
  }

  return [];
};

const hasDirectFmsRoleAccess = (user) => Boolean(
  isSuperAdmin(user)
  || isBankAdmin(user)
  || user?.fms_enabled
  || getStoredFmsPermissions(user).length > 0
);

const buildGrantAccessCondition = (user) => {
  const accessibleBranchIds = getAccessibleBranchIds(user);
  const activeGrantClause = {
    revoked_at: null,
    OR: [
      { expires_at: null },
      { expires_at: { gt: new Date() } }
    ]
  };

  const grants = [
    {
      access_grants: {
        some: {
          ...activeGrantClause,
          user_id: user?.id || 0,
          grant_type: { in: listGrantTypeAliases('USER') }
        }
      }
    }
  ];

  if (accessibleBranchIds.length > 0) {
    grants.push({
      access_grants: {
        some: {
          ...activeGrantClause,
          branch_id: { in: accessibleBranchIds },
          grant_type: { in: listGrantTypeAliases('BRANCH') }
        }
      }
    });
  }

  return grants;
};

export const isSuperAdmin = (user) => user?.role?.name === 'SUPER_ADMIN' || user?.role === 'SUPER_ADMIN';
export const isBankAdmin = (user) => user?.role?.name === 'ADMIN' || user?.role === 'ADMIN';
export const isHeadOfficeUser = (user) => {
  const branchCode = String(user?.branch?.branch_code ?? user?.branch_code ?? '').trim().toUpperCase();
  const branchName = String(user?.branch?.branch_name ?? user?.branch_name ?? '').trim().toUpperCase();
  return branchCode === 'HO' || branchName.includes('HEAD OFFICE');
};

export const normalizeFmsAccessLevel = (value, fallback = FMS_ACCESS_LEVELS.VIEW) => {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized === FMS_ACCESS_LEVELS.DOWNLOAD ? FMS_ACCESS_LEVELS.DOWNLOAD : FMS_ACCESS_LEVELS.VIEW;
};

export const encodeGrantType = (targetType, accessLevel = FMS_ACCESS_LEVELS.VIEW) => (
  `${normalizeGrantTargetType(targetType)}_${normalizeFmsAccessLevel(accessLevel)}`
);

export const parseGrantType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (['USER', 'BRANCH', 'DEPARTMENT', 'GLOBAL', 'BANK', 'GLOBAL_BANK'].includes(normalized)) {
    return {
      targetType: normalizeGrantTargetType(normalized),
      accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD
    };
  }

  const [targetType, accessLevel] = normalized.split('_');
  return {
    targetType: normalizeGrantTargetType(targetType),
    accessLevel: normalizeFmsAccessLevel(accessLevel)
  };
};

export const listGrantTypeAliases = (targetType) => {
  const normalizedTargetType = normalizeGrantTargetType(targetType);
  return [
    normalizedTargetType,
    `${normalizedTargetType}_${FMS_ACCESS_LEVELS.VIEW}`,
    `${normalizedTargetType}_${FMS_ACCESS_LEVELS.DOWNLOAD}`
  ];
};

const getFmsAccessRank = (value) => FMS_ACCESS_LEVEL_ORDER.indexOf(normalizeFmsAccessLevel(value));
export const hasRequiredAccessLevel = (currentLevel, requestedLevel = FMS_ACCESS_LEVELS.VIEW) => (
  getFmsAccessRank(currentLevel) >= getFmsAccessRank(requestedLevel)
);

export const getUserFmsPermissions = (user) => {
  if (!user) return [];
  if (isSuperAdmin(user) || isBankAdmin(user)) {
    return [...FMS_PERMISSION_ORDER];
  }

  const direct = user.fms_permissions ?? user.fmsPermissions ?? [];
  const parsedEnvelope = parseFmsPermissionEnvelope(direct);
  const withGrantedView = (permissions = []) => {
    const normalized = permissions.map(normalizePermissionValue).filter(Boolean);
    if (user?.has_granted_fms_access && !normalized.includes(FMS_PERMISSIONS.VIEW)) {
      normalized.unshift(FMS_PERMISSIONS.VIEW);
    }
    if (
      user?.fms_enabled
      && (
        normalized.includes(FMS_PERMISSIONS.VIEW)
        || normalized.includes(FMS_PERMISSIONS.UPLOAD)
        || normalized.includes(FMS_PERMISSIONS.SHARE)
        || normalized.includes(FMS_PERMISSIONS.REVOKE)
        || normalized.includes(FMS_PERMISSIONS.PUBLISH)
      )
      && !normalized.includes(FMS_PERMISSIONS.VIEW_ALL)
    ) {
      normalized.push(FMS_PERMISSIONS.VIEW_ALL);
    }
    const deduped = new Set(normalized.filter((value) => FMS_PERMISSION_ORDER.includes(value)));
    for (const permission of [...deduped]) {
      for (const dependency of FMS_PERMISSION_DEPENDENCIES[permission] || []) {
        deduped.add(dependency);
      }
    }
    return FMS_PERMISSION_ORDER.filter((permission) => deduped.has(permission));
  };
  if (Array.isArray(direct)) {
    return withGrantedView(direct);
  }

  if (parsedEnvelope.permissions.length > 0) {
    return withGrantedView(parsedEnvelope.permissions);
  }

  if (typeof direct === 'string') {
    try {
      const parsed = JSON.parse(direct);
      return Array.isArray(parsed)
        ? withGrantedView(parsed)
        : [];
    } catch {
      return user?.has_granted_fms_access ? [FMS_PERMISSIONS.VIEW] : [];
    }
  }

  return user?.has_granted_fms_access ? [FMS_PERMISSIONS.VIEW] : [];
};

export const getUserOwnedFmsDepartmentId = (user, { fallbackToUserDepartment = true } = {}) => {
  if (isSuperAdmin(user) || isBankAdmin(user)) return null;
  const envelope = parseFmsPermissionEnvelope(user?.fms_permissions ?? user?.fmsPermissions ?? []);
  if (envelope.ownedDepartmentId) return envelope.ownedDepartmentId;
  if (!fallbackToUserDepartment) return null;

  const permissions = getUserFmsPermissions({
    ...user,
    fms_permissions: envelope.permissions
  });
  const usesOwnedDesk = permissions.some((permission) => (
    permission === FMS_PERMISSIONS.UPLOAD
    || permission === FMS_PERMISSIONS.SHARE
    || permission === FMS_PERMISSIONS.REVOKE
    || permission === FMS_PERMISSIONS.PUBLISH
  ));
  if (!usesOwnedDesk) return null;
  return Number(user?.department_id || user?.department?.id || 0) || null;
};

export const hasFmsFeatureAccess = (user) => Boolean(
  isSuperAdmin(user)
  || isBankAdmin(user)
  || user?.fms_enabled
  || user?.has_granted_fms_access
);
export const hasFmsPermission = (user, permission) => (
  (isSuperAdmin(user) || isBankAdmin(user))
  || (
    hasFmsFeatureAccess(user)
    && getUserFmsPermissions(user).includes(normalizePermissionValue(permission))
  )
);

export const isFmsGovernanceOperator = (user) => (
  isSuperAdmin(user)
  || isBankAdmin(user)
  || hasAnyDirectPermission(user, [FMS_PERMISSIONS.SHARE, FMS_PERMISSIONS.REVOKE, FMS_PERMISSIONS.PUBLISH])
);

export const assertFmsFeatureAccess = (user) => {
  if (!hasFmsFeatureAccess(user)) {
    const error = new Error('FMS access is not enabled for this user.');
    error.status = 403;
    throw error;
  }
};

export const assertFmsPermission = (user, permission) => {
  assertFmsFeatureAccess(user);
  if (!hasFmsPermission(user, permission)) {
    const error = new Error('FMS permission denied.');
    error.status = 403;
    throw error;
  }
};

export const getAccessibleBranchIds = (user) => {
  const ids = new Set();
  if (user?.branch_id) ids.add(Number(user.branch_id));
  for (const access of user?.branch_accesses || []) {
    if (access?.branch_id) ids.add(Number(access.branch_id));
  }
  for (const id of user?.accessible_branch_ids || []) {
    if (id) ids.add(Number(id));
  }
  return [...ids].filter(Boolean);
};

export const getAccessibleDepartmentIds = (user) => {
  const ids = new Set();
  if (user?.department_id) ids.add(Number(user.department_id));
  for (const access of user?.department_accesses || []) {
    if (access?.department_id) ids.add(Number(access.department_id));
    if (access?.department_master_id) ids.add(Number(access.department_master_id));
  }
  for (const id of user?.accessible_department_ids || []) {
    if (id) ids.add(Number(id));
  }
  return [...ids].filter(Boolean);
};

const getDefaultScopedAccessLevel = (user) => (
  hasAnyDirectPermission(user, [
    FMS_PERMISSIONS.DOWNLOAD_ALL,
    FMS_PERMISSIONS.SHARE,
    FMS_PERMISSIONS.REVOKE,
    FMS_PERMISSIONS.PUBLISH
  ])
    ? FMS_ACCESS_LEVELS.DOWNLOAD
    : FMS_ACCESS_LEVELS.VIEW
);
const isCircularDocumentScope = (document) => (
  String(document?.document_type || '').trim().toUpperCase() === 'CIRCULAR'
  || normalizeDepartmentToken(document?.document_category || '') === 'CIRCULARS'
);

const buildDefaultVisibleScopeConditions = (user) => {
  if (!hasDirectFmsRoleAccess(user)) {
    return [];
  }
  if (hasAnyDirectPermission(user, [FMS_PERMISSIONS.VIEW_ALL, FMS_PERMISSIONS.DOWNLOAD_ALL])) {
    return [{}];
  }
  const conditions = [];
  const accessibleBranchIds = getAccessibleBranchIds(user);
  const accessibleDepartmentIds = getAccessibleDepartmentIds(user);

  conditions.push({ document_type: 'CIRCULAR' });
  conditions.push({ document_category: 'Circulars' });

  if (accessibleBranchIds.length > 0) {
    conditions.push({ owner_node: { branch_id: { in: accessibleBranchIds } } });
    conditions.push({ branch_id: { in: accessibleBranchIds } });
  }

  if (accessibleDepartmentIds.length > 0) {
    conditions.push({ owner_node: { department_master_id: { in: accessibleDepartmentIds } } });
    conditions.push({ department_master_id: { in: accessibleDepartmentIds } });
  }

  if (isHeadOfficeUser(user)) {
    conditions.push({ owner_node: { node_type: 'HO' } });
  }

  return conditions;
};

const resolveDefaultScopedDocumentAccess = (user, document) => {
  const defaultScopedAccessLevel = getDefaultScopedAccessLevel(user);
  const defaultScopedCanDownload = hasRequiredAccessLevel(defaultScopedAccessLevel, FMS_ACCESS_LEVELS.DOWNLOAD);
  if (hasAnyDirectPermission(user, [FMS_PERMISSIONS.VIEW_ALL, FMS_PERMISSIONS.DOWNLOAD_ALL])) {
    return {
      accessLevel: defaultScopedAccessLevel,
      canDownload: defaultScopedCanDownload,
      via: 'LIBRARY_SCOPE'
    };
  }
  if (isCircularDocumentScope(document)) {
    return {
      accessLevel: defaultScopedAccessLevel,
      canDownload: defaultScopedCanDownload,
      via: 'CIRCULAR_SCOPE'
    };
  }
  const accessibleBranchIds = getAccessibleBranchIds(user);
  const accessibleDepartmentIds = getAccessibleDepartmentIds(user);

  if (!document?.owner_node?.branch_id && isHeadOfficeUser(user)) {
    return {
      accessLevel: defaultScopedAccessLevel,
      canDownload: defaultScopedCanDownload,
      via: 'HO_SCOPE'
    };
  }

  if (
    (document?.owner_node?.branch_id && accessibleBranchIds.includes(Number(document.owner_node.branch_id)))
    || (document?.branch_id && accessibleBranchIds.includes(Number(document.branch_id)))
  ) {
    return {
      accessLevel: defaultScopedAccessLevel,
      canDownload: defaultScopedCanDownload,
      via: 'BRANCH_SCOPE'
    };
  }

  if (
    (document?.owner_node?.department_master_id && accessibleDepartmentIds.includes(Number(document.owner_node.department_master_id)))
    || (document?.department_master_id && accessibleDepartmentIds.includes(Number(document.department_master_id)))
  ) {
    return {
      accessLevel: defaultScopedAccessLevel,
      canDownload: defaultScopedCanDownload,
      via: 'DEPARTMENT_SCOPE'
    };
  }

  return null;
};

export const assertValidClassification = (classification) => {
  const normalized = String(classification || '').trim().toUpperCase();
  if (!DOCUMENT_CLASSIFICATIONS.includes(normalized)) {
    const error = new Error(`Classification must be one of: ${DOCUMENT_CLASSIFICATIONS.join(', ')}`);
    error.status = 400;
    throw error;
  }
  return normalized;
};

export const buildFmsPermissionsPayload = (user) => ({
  hasFmsAccess: hasFmsFeatureAccess(user),
  permissions: getUserFmsPermissions(user),
  ownedDepartmentId: getUserOwnedFmsDepartmentId(user)
});

export const hasGrantedFmsAccess = async (user, tenantId = user?.tenant_id) => {
  if (!user || !tenantId) return false;

  const accessibleBranchIds = getAccessibleBranchIds(user);
  const accessibleDepartmentIds = getAccessibleDepartmentIds(user);
  const activeGrantClause = {
    revoked_at: null,
    OR: [
      { expires_at: null },
      { expires_at: { gt: new Date() } }
    ]
  };

  let hasDirectGrant = false;
  try {
    const directGrantCount = await prisma.fmsDocument.count({
      where: {
        tenant_id: tenantId,
        access_grants: {
          some: {
            ...activeGrantClause,
            OR: [
              user?.id ? {
                user_id: user.id,
                grant_type: { in: listGrantTypeAliases('USER') }
              } : null,
              accessibleBranchIds.length > 0 ? {
                branch_id: { in: accessibleBranchIds },
                grant_type: { in: listGrantTypeAliases('BRANCH') }
              } : null
            ].filter(Boolean)
          }
        }
      }
    });
    hasDirectGrant = directGrantCount > 0;
  } catch (error) {
    const message = String(error?.message || '');
    if (
      !message.includes('does not exist')
      && !message.includes('Unknown field `identity_reference`')
      && !message.includes('The column `FmsDocument.identity_reference` does not exist')
    ) {
      throw error;
    }
  }

  if (hasDirectGrant) return true;

  let hasDistributionRecipient = false;
  try {
    const directDepartmentId = Number(user?.department_id || 0);
    const distributionRecipientCount = await prisma.fmsDistributionRecipient.count({
      where: {
        distribution: {
          tenant_id: tenantId,
          status: 'ACTIVE'
        },
        OR: [
          user?.id ? { target_user_id: user.id } : null,
          accessibleBranchIds.length > 0 ? { target_branch_id: { in: accessibleBranchIds } } : null,
          accessibleDepartmentIds.length > 0 ? { target_department_master_id: { in: accessibleDepartmentIds } } : null,
          directDepartmentId ? {
            target_department_master: {
              legacy_department_id: directDepartmentId
            }
          } : null
        ].filter(Boolean)
      }
    });
    hasDistributionRecipient = distributionRecipientCount > 0;
  } catch (error) {
    const message = String(error?.message || '');
    if (
      !message.includes('does not exist')
      && !message.includes('Unknown field')
      && !message.includes('The column')
    ) {
      throw error;
    }
  }

  if (hasDistributionRecipient) return true;

  const appendAccess = await listActiveAppendGrantAccess(user, tenantId).catch(() => ({
    sourceBranchIds: [],
    downloadBranchIds: [],
    grants: []
  }));
  if ((appendAccess.grants || []).length > 0) {
    return true;
  }

  const nodeGrantAccess = await listActiveNodeGrantAccess(user, tenantId).catch(() => ({
    exactNodeIds: [],
    downloadNodeIds: [],
    viewPrefixes: [],
    downloadPrefixes: [],
    grants: []
  }));

  return (nodeGrantAccess.grants || []).length > 0;
};

export const assertValidFmsFile = async ({ absolutePath, fileName, mimeType }) => {
  const normalizedMime = String(mimeType || '').toLowerCase();
  const extension = path.extname(String(fileName || '')).toLowerCase();
  if (!FMS_ALLOWED_MIME_TYPES.has(normalizedMime) || !FMS_ALLOWED_EXTENSIONS.has(extension)) {
    const error = new Error('Only PDF and approved banking image formats are allowed in FMS.');
    error.status = 400;
    throw error;
  }

  const signature = detectFileSignature(await readFileSignature(absolutePath));
  if (!signature || !isSignatureCompatibleWithExtension(signature.mime, extension)) {
    const error = new Error('File signature validation failed. Only genuine PDF or approved image files can enter FMS.');
    error.status = 400;
    throw error;
  }

  if (normalizedMime && signature.mime.startsWith('image/') && !normalizedMime.startsWith('image/')) {
    const error = new Error('MIME type does not match the uploaded image content.');
    error.status = 400;
    throw error;
  }

  if (normalizedMime && signature.mime === 'application/pdf' && normalizedMime !== 'application/pdf') {
    const error = new Error('MIME type does not match the uploaded PDF content.');
    error.status = 400;
    throw error;
  }

  return { mime: signature.mime, extension, file_kind: signature.kind };
};

const RECORD_TYPE_FIELD_LABELS = {
  customer_name: 'Customer Name',
  customer_reference: 'Customer / Account Reference',
  cif_reference: 'CIF / Customer ID',
  account_reference: 'Account Reference',
  identity_reference: 'Identity Reference',
  id_proof_number: 'ID Proof Number',
  document_reference: 'Document Reference'
};

export const normalizeFmsMetadata = (payload = {}, recordTypeDefinition = null) => {
  const documentType = String(payload.document_type || '').trim();
  if (!documentType) {
    const error = new Error('Document type is required.');
    error.status = 400;
    throw error;
  }

  const metadata = {
    customer_name: String(payload.customer_name || '').trim() || null,
    customer_reference: String(payload.customer_reference || '').trim() || null,
    cif_reference: String(payload.cif_reference || '').trim() || null,
    account_reference: String(payload.account_reference || '').trim() || null,
    identity_reference: String(payload.identity_reference || '').trim() || null,
    id_proof_number: String(payload.id_proof_number || '').trim() || null,
    document_reference: String(payload.document_reference || '').trim() || null,
    document_type: documentType,
    document_category: String(payload.document_category || '').trim() || null,
    tags: Array.isArray(payload.tags)
      ? payload.tags.map((item) => String(item || '').trim()).filter(Boolean)
      : String(payload.tags || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    custom_index_json: payload.custom_index_json && typeof payload.custom_index_json === 'object'
      ? payload.custom_index_json
      : null,
    access_scope: String(payload.access_scope || 'NODE_ONLY').trim().toUpperCase(),
    notes: String(payload.notes || '').trim() || null
  };

  const requiredFields = Array.isArray(recordTypeDefinition?.required_fields) && recordTypeDefinition.required_fields.length
    ? recordTypeDefinition.required_fields
    : ['customer_reference'];
  const fieldLabels = {
    ...RECORD_TYPE_FIELD_LABELS,
    ...(recordTypeDefinition?.field_labels || {})
  };

  if (!metadata.customer_reference) {
    metadata.customer_reference = metadata.document_reference
      || metadata.account_reference
      || String(payload.title || '').trim()
      || metadata.document_type;
  }

  for (const field of requiredFields) {
    const value = String(metadata[field] || '').trim();
    if (!value) {
      const error = new Error(`${fieldLabels[field] || RECORD_TYPE_FIELD_LABELS[field] || field} is required.`);
      error.status = 400;
      throw error;
    }
  }

  return metadata;
};

export const buildFmsSearchText = (document) => [
  document.title,
  document.document_type,
  document.document_category,
  document.customer_name,
  document.customer_reference,
  document.cif_reference,
  document.account_reference,
  document.identity_reference,
  document.id_proof_number,
  document.document_reference,
  document.file_name,
  document.note_id,
  document.document_code,
  document.branch_name,
  document.department_name,
  document.node_path_key,
  document.classification,
  document.notes,
  document.identity_reference,
  ...(Array.isArray(document.tags) ? document.tags : []),
  ...(Array.isArray(document.custom_index_values) ? document.custom_index_values : [])
].filter(Boolean).join(' ').toLowerCase();

const buildReferenceSearchVariants = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return [];
  const withoutDocPrefix = normalized.replace(/^DOC\//i, '');
  const withDocPrefix = normalized.startsWith('DOC/')
    ? normalized
    : `DOC/${withoutDocPrefix}`;

  return Array.from(new Set([normalized, withoutDocPrefix, withDocPrefix].filter(Boolean)));
};

export const buildStoredDocumentKey = ({ documentType, customerReference, fileName, idHint = '' }) => {
  const pieces = [
    sanitizeStorageSegment(documentType, 'document'),
    sanitizeStorageSegment(customerReference, 'reference'),
    sanitizeStorageSegment(idHint || Date.now(), 'file'),
    path.basename(String(fileName || ''), path.extname(String(fileName || '')))
  ].filter(Boolean);
  return pieces.join('-');
};

export const copyFileToFmsStorage = async ({
  sourcePath,
  tenantCode,
  nodePathKey,
  documentKey,
  fileName,
  fallbackBase = 'file'
}) => {
  const storedRelativePath = buildFmsFileStoredRelativePath({
    tenantCode,
    nodePathKey,
    documentKey,
    bucket: 'files',
    fileName,
    fallbackBase
  });
  const absoluteTarget = await ensureStoredParentDir(storedRelativePath);
  await fs.copyFile(resolveStoredPath(sourcePath), absoluteTarget);
  return storedRelativePath;
};

export const moveUploadedFileToFmsStorage = async ({
  tempPath,
  tenantCode,
  nodePathKey,
  documentKey,
  fileName,
  fallbackBase = 'file'
}) => {
  const storedRelativePath = buildFmsFileStoredRelativePath({
    tenantCode,
    nodePathKey,
    documentKey,
    bucket: 'files',
    fileName,
    fallbackBase
  });
  await moveFileToStoredRelativePath(tempPath, storedRelativePath);
  return storedRelativePath;
};

export const computeFileHash = async (storedOrAbsolutePath) => {
  const buffer = await fs.readFile(
    path.isAbsolute(storedOrAbsolutePath) ? storedOrAbsolutePath : resolveStoredPath(storedOrAbsolutePath)
  );
  return crypto.createHash('sha256').update(buffer).digest('hex');
};

export const ensureDefaultFmsRootNode = async ({
  tenantId,
  branchId = null,
  tenantCode = 'BANK'
}) => {
  const existingRoot = await prisma.fmsNode.findFirst({
    where: {
      tenant_id: tenantId,
      parent_id: null
    },
    orderBy: { created_at: 'asc' }
  });
  if (existingRoot) return existingRoot;

  const code = `${normalizeNodeCode(tenantCode, 'BANK').slice(0, 12)}-HO`;
  return prisma.fmsNode.create({
    data: {
      tenant_id: tenantId,
      branch_id: branchId || null,
      parent_id: null,
      name: 'Head Office',
      code,
      node_type: 'HO',
      path_key: code
    }
  });
};

export const resolveDefaultFmsOwnerNode = async ({
  tenantId,
  branchId = null,
  tenantCode = 'BANK'
}) => {
  if (branchId) {
    const branchNode = await prisma.fmsNode.findFirst({
      where: {
        tenant_id: tenantId,
        branch_id: branchId,
        is_active: true
      },
      orderBy: [
        { parent_id: 'desc' },
        { created_at: 'asc' }
      ]
    });
    if (branchNode) return branchNode;
  }

  const existingNode = await prisma.fmsNode.findFirst({
    where: {
      tenant_id: tenantId,
      is_active: true
    },
    orderBy: [
      { parent_id: 'asc' },
      { created_at: 'asc' }
    ]
  });
  if (existingNode) return existingNode;

  return ensureDefaultFmsRootNode({ tenantId, branchId, tenantCode });
};

export const getActiveAppendGrantWhere = () => ({
  revoked_at: null,
  OR: [
    { expires_at: null },
    { expires_at: { gt: new Date() } }
  ]
});

export const getActiveNodeGrantWhere = () => ({
  revoked_at: null,
  OR: [
    { expires_at: null },
    { expires_at: { gt: new Date() } }
  ]
});

export const isCrossBranchAppendEnabledForTenant = async (tenantId) => {
  if (!tenantId) return false;
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { cross_branch_append_enabled: true }
    });
    return Boolean(tenant?.cross_branch_append_enabled);
  } catch (error) {
    if (isAppendAccessCompatibilityError(error)) {
      return false;
    }
    throw error;
  }
};

export const listActiveAppendGrantAccess = async (user, tenantId = user?.tenant_id) => {
  if (!supportsBranchAppendGrantModel) {
    return {
      sourceBranchIds: [],
      downloadBranchIds: [],
      grants: []
    };
  }
  const accessibleBranchIds = getAccessibleBranchIds(user);
  if (!tenantId || accessibleBranchIds.length === 0) {
    return {
      sourceBranchIds: [],
      downloadBranchIds: [],
      grants: []
    };
  }

  try {
    const grants = await prisma.fmsBranchAppendGrant.findMany({
      where: {
        tenant_id: tenantId,
        target_branch_id: { in: accessibleBranchIds },
        ...getActiveAppendGrantWhere()
      },
      select: {
        id: true,
        source_branch_id: true,
        target_branch_id: true,
        access_level: true,
        expires_at: true
      }
    });

    const sourceBranchIds = new Set();
    const downloadBranchIds = new Set();
    for (const grant of grants) {
      const sourceBranchId = Number(grant.source_branch_id);
      if (!sourceBranchId) continue;
      sourceBranchIds.add(sourceBranchId);
      if (normalizeFmsAccessLevel(grant.access_level) === FMS_ACCESS_LEVELS.DOWNLOAD) {
        downloadBranchIds.add(sourceBranchId);
      }
    }

    return {
      sourceBranchIds: [...sourceBranchIds],
      downloadBranchIds: [...downloadBranchIds],
      grants
    };
  } catch (error) {
    if (isAppendAccessCompatibilityError(error)) {
      return {
        sourceBranchIds: [],
        downloadBranchIds: [],
        grants: []
      };
    }
    throw error;
  }
};

export const listActiveNodeGrantAccess = async (user, tenantId = user?.tenant_id) => {
  if (!tenantId) {
    return {
      exactNodeIds: [],
      downloadNodeIds: [],
      viewPrefixes: [],
      downloadPrefixes: [],
      grants: []
    };
  }

  const accessibleBranchIds = getAccessibleBranchIds(user);
  if (!user?.id && accessibleBranchIds.length === 0) {
    return {
      exactNodeIds: [],
      downloadNodeIds: [],
      viewPrefixes: [],
      downloadPrefixes: [],
      grants: []
    };
  }

  const grants = await prisma.fmsNodeAccessGrant.findMany({
    where: {
      tenant_id: tenantId,
      ...getActiveNodeGrantWhere(),
      OR: [
        user?.id ? {
          user_id: user.id,
          grant_type: { in: listGrantTypeAliases('USER') }
        } : null,
        accessibleBranchIds.length > 0 ? {
          branch_id: { in: accessibleBranchIds },
          grant_type: { in: listGrantTypeAliases('BRANCH') }
        } : null,
        {
          grant_type: { in: listGrantTypeAliases('DEPARTMENT') }
        },
        {
          grant_type: { in: listGrantTypeAliases('GLOBAL') }
        }
      ].filter(Boolean)
    },
    include: {
      node: { select: { id: true, path_key: true } },
      department_master: {
        select: {
          id: true,
          name: true,
          legacy_department_id: true,
          branch_mappings: { select: { branch_id: true } }
        }
      }
    }
  }).catch((error) => {
    if (
      String(error?.message || '').includes('relation "FmsNodeAccessGrant" does not exist')
      || String(error?.message || '').includes('table `public.FmsNodeAccessGrant` does not exist')
      || String(error?.message || '').includes('Unknown field `identity_reference`')
      || String(error?.message || '').includes('The column `FmsDocument.identity_reference` does not exist')
    ) {
      return [];
    }
    throw error;
  });

  const exactNodeIds = new Set();
  const downloadNodeIds = new Set();
  const viewPrefixes = new Set();
  const downloadPrefixes = new Set();
  const branchIds = new Set(accessibleBranchIds);

  for (const grant of grants) {
    const accessLevel = normalizeFmsAccessLevel(grant.access_level);
    const targetType = normalizeGrantTargetType(grant.grant_type);
    if (targetType === 'DEPARTMENT') {
      const mappedBranchIds = (grant.department_master?.branch_mappings || []).map((mapping) => Number(mapping.branch_id));
      const matchesLegacyDepartment = grant.department_master?.legacy_department_id
        && Number(grant.department_master.legacy_department_id) === Number(user?.department_id);
      const matchesMappedBranch = mappedBranchIds.some((branchId) => branchIds.has(branchId));
      if (!matchesLegacyDepartment && !matchesMappedBranch) {
        continue;
      }
    }
    if (grant.include_descendants && grant.node?.path_key) {
      viewPrefixes.add(grant.node.path_key);
      if (hasRequiredAccessLevel(accessLevel, FMS_ACCESS_LEVELS.DOWNLOAD)) {
        downloadPrefixes.add(grant.node.path_key);
      }
      continue;
    }

    if (grant.node_id) {
      exactNodeIds.add(Number(grant.node_id));
      if (hasRequiredAccessLevel(accessLevel, FMS_ACCESS_LEVELS.DOWNLOAD)) {
        downloadNodeIds.add(Number(grant.node_id));
      }
    }
  }

  return {
    exactNodeIds: [...exactNodeIds],
    downloadNodeIds: [...downloadNodeIds],
    viewPrefixes: [...viewPrefixes],
    downloadPrefixes: [...downloadPrefixes],
    grants
  };
};

export const buildAccessibleFmsWhere = (user, filters = {}, appendAccess = null, nodeGrantAccess = null) => {
  const scopedTenantId = isSuperAdmin(user)
    ? (filters.tenant_id ? Number(filters.tenant_id) : null)
    : user?.tenant_id;
  const requestedStatus = String(filters.status || '').trim().toUpperCase();
  const canInspectNonActive = isSuperAdmin(user) || isBankAdmin(user) || isFmsGovernanceOperator(user);
  const hasBankWideLibraryView = hasAnyDirectPermission(user, [FMS_PERMISSIONS.VIEW_ALL, FMS_PERMISSIONS.DOWNLOAD_ALL]);

  const where = {
    ...(scopedTenantId ? { tenant_id: scopedTenantId } : {})
  };
  Object.assign(where, buildFmsSourceFilter(filters.source_mode));

  if (requestedStatus && requestedStatus !== 'ALL' && canInspectNonActive) {
    where.status = requestedStatus;
  } else if (requestedStatus === 'ALL' && canInspectNonActive) {
    // keep all statuses visible for governance views
  } else {
    where.status = 'ACTIVE';
  }

  if (filters.include_history === 'true' || filters.include_history === true) {
    // explicit history view
  } else {
    where.is_latest_version = true;
  }

  if (filters.document_type) where.document_type = String(filters.document_type).trim();
  if (filters.document_category) where.document_category = String(filters.document_category).trim();
  if (filters.classification) where.classification = String(filters.classification).trim().toUpperCase();
  if (filters.department_master_id) where.department_master_id = Number(filters.department_master_id);
  if (filters.branch_id) where.branch_id = Number(filters.branch_id);
  if (filters.owner_node_id && !filters.owner_node_path_prefix) where.owner_node_id = Number(filters.owner_node_id);
  if (filters.owner_node_path_prefix) {
    where.owner_node = {
      ...(where.owner_node || {}),
      path_key: { startsWith: String(filters.owner_node_path_prefix) }
    };
  }
  if (filters.uploaded_by) where.uploaded_by = { name: { contains: String(filters.uploaded_by).trim(), mode: 'insensitive' } };
  if (filters.file_type) where.file_extension = String(filters.file_type).trim().toLowerCase();
  if (filters.from_date || filters.to_date) {
    where.created_at = {};
    if (filters.from_date) where.created_at.gte = new Date(`${String(filters.from_date).slice(0, 10)}T00:00:00.000Z`);
    if (filters.to_date) where.created_at.lte = new Date(`${String(filters.to_date).slice(0, 10)}T23:59:59.999Z`);
  }

  const q = String(filters.q || '').trim();
  const searchBy = String(filters.search_by || 'ALL').trim().toUpperCase();
  if (q) {
    const referenceVariants = buildReferenceSearchVariants(q);
    const buildContainsConditions = (field) => referenceVariants.map((variant) => ({
      [field]: { contains: variant, mode: 'insensitive' }
    }));

    const allSearchConditions = [
      { title: { contains: q, mode: 'insensitive' } },
      { document_type: { contains: q, mode: 'insensitive' } },
      { document_category: { contains: q, mode: 'insensitive' } },
      { customer_name: { contains: q, mode: 'insensitive' } },
      ...buildContainsConditions('customer_reference'),
      { cif_reference: { contains: q, mode: 'insensitive' } },
      { account_reference: { contains: q, mode: 'insensitive' } },
      { identity_reference: { contains: q, mode: 'insensitive' } },
      { id_proof_number: { contains: q, mode: 'insensitive' } },
      ...buildContainsConditions('document_reference'),
      ...buildContainsConditions('version_group_key'),
      { file_name: { contains: q, mode: 'insensitive' } },
      { department_master: { name: { contains: q, mode: 'insensitive' } } },
      { branch: { branch_name: { contains: q, mode: 'insensitive' } } },
      { uploaded_by: { name: { contains: q, mode: 'insensitive' } } },
      { search_text: { contains: q.toLowerCase() } }
    ];

    switch (searchBy) {
      case 'CUSTOMER':
        where.OR = [{ customer_name: { contains: q, mode: 'insensitive' } }];
        break;
      case 'CIF':
        where.OR = [{ cif_reference: { contains: q, mode: 'insensitive' } }];
        break;
      case 'IDENTITY':
        where.OR = [
          { identity_reference: { contains: q, mode: 'insensitive' } },
          { id_proof_number: { contains: q, mode: 'insensitive' } },
          { search_text: { contains: q.toLowerCase() } }
        ];
        break;
      case 'ACCOUNT':
        where.OR = [
          { account_reference: { contains: q, mode: 'insensitive' } },
          ...buildContainsConditions('customer_reference')
        ];
        break;
      case 'DOCUMENT_REF':
        where.OR = [
          ...buildContainsConditions('document_reference'),
          ...buildContainsConditions('customer_reference'),
          ...buildContainsConditions('version_group_key'),
          { title: { contains: q, mode: 'insensitive' } },
          { search_text: { contains: q.toLowerCase() } }
        ];
        break;
      case 'DOCUMENT_TYPE':
        where.OR = [{ document_type: { contains: q, mode: 'insensitive' } }];
        break;
      case 'CATEGORY':
        where.OR = [{ document_category: { contains: q, mode: 'insensitive' } }];
        break;
      case 'DEPARTMENT':
        where.OR = [{ department_master: { name: { contains: q, mode: 'insensitive' } } }];
        break;
      case 'BRANCH':
        where.OR = [{ branch: { branch_name: { contains: q, mode: 'insensitive' } } }];
        break;
      case 'UPLOADER':
        where.OR = [{ uploaded_by: { name: { contains: q, mode: 'insensitive' } } }];
        break;
      case 'TAGS':
        where.OR = [{ search_text: { contains: q.toLowerCase() } }];
        break;
      case 'FILE':
        where.OR = [
          { file_name: { contains: q, mode: 'insensitive' } },
          { title: { contains: q, mode: 'insensitive' } }
        ];
        break;
      case 'ALL':
      default:
        where.OR = allSearchConditions;
        break;
    }
  }

  if (isSuperAdmin(user) || isBankAdmin(user)) {
    return where;
  }

  if (hasBankWideLibraryView) {
    return where;
  }

  const appendBranchIds = appendAccess?.sourceBranchIds || [];
  const downloadNodeIds = nodeGrantAccess?.downloadNodeIds || [];
  const viewPrefixes = nodeGrantAccess?.viewPrefixes || [];
  const downloadPrefixes = nodeGrantAccess?.downloadPrefixes || [];
  const exactNodeIds = nodeGrantAccess?.exactNodeIds || [];
  const accessScope = [
    { uploaded_by_user_id: user?.id || 0 },
    ...buildGrantAccessCondition(user)
  ];

  if (appendBranchIds.length > 0) {
    accessScope.push({ owner_node: { branch_id: { in: appendBranchIds } } });
  }

  if (exactNodeIds.length > 0) {
    accessScope.push({ owner_node_id: { in: exactNodeIds } });
  }

  if (downloadNodeIds.length > 0) {
    accessScope.push({ owner_node_id: { in: downloadNodeIds } });
  }

  for (const prefix of [...new Set([...viewPrefixes, ...downloadPrefixes])]) {
    accessScope.push({ owner_node: { path_key: { startsWith: prefix } } });
  }

  // Banking default:
  // Once a user is given FMS access, released records inside that user's
  // valid bank scope (HO / branch / department) should be visible without
  // one-off manual sharing on every single record.
  accessScope.push(...buildDefaultVisibleScopeConditions(user));

  where.AND = [
    ...(where.AND || []),
    { OR: accessScope }
  ];

  return where;
};

export const canPublishClassification = (classification, user) => {
  if (!PUBLISH_REQUIRES_ELEVATION.has(classification)) return true;
  return isSuperAdmin(user) || isBankAdmin(user) || isHeadOfficeUser(user);
};

export const assertNodeBelongsToUserTenant = (user, node) => {
  if (isSuperAdmin(user)) return;
  if (!node || !user?.tenant_id || Number(node.tenant_id) !== Number(user.tenant_id)) {
    const error = new Error('FMS node access denied.');
    error.status = 403;
    throw error;
  }
};

export const canUserUploadToNode = (user, node) => {
  if (!user || !node) return false;
  if (isSuperAdmin(user) || isBankAdmin(user)) return true;

  const ownedDepartmentId = getUserOwnedFmsDepartmentId(user);
  const accessibleBranchIds = getAccessibleBranchIds(user);
  if (!node?.branch_id || !accessibleBranchIds.includes(Number(node.branch_id))) {
    return false;
  }

  if (!node?.department_master_id && !node?.department_master?.legacy_department_id) {
    return !ownedDepartmentId;
  }

  if (!ownedDepartmentId) {
    return !node?.department_master_id;
  }

  return Number(node.department_master_id || 0) === Number(ownedDepartmentId)
    || Number(node?.department_master?.legacy_department_id || 0) === Number(ownedDepartmentId);
};

export const assertCanUploadToNode = (user, node) => {
  assertFmsPermission(user, FMS_PERMISSIONS.UPLOAD);
  assertNodeBelongsToUserTenant(user, node);

  if (isSuperAdmin(user) || isBankAdmin(user)) return;

  if (!canUserUploadToNode(user, node)) {
    const error = new Error('Upload is only allowed inside your permitted FMS branch and department scope.');
    error.status = 403;
    throw error;
  }
};

export const assertCanGovernNodeAccess = (user, node, actionLabel = 'manage FMS access') => {
  assertNodeBelongsToUserTenant(user, node);
  if (isSuperAdmin(user) || isBankAdmin(user)) return;

  const canGovern = hasAnyDirectPermission(user, [FMS_PERMISSIONS.SHARE, FMS_PERMISSIONS.REVOKE]);
  if (!canGovern) {
    const error = new Error('FMS governance permission denied.');
    error.status = 403;
    throw error;
  }

  const accessibleBranchIds = getAccessibleBranchIds(user);
  if (node?.branch_id && accessibleBranchIds.includes(Number(node.branch_id))) return;
  if (!node?.branch_id && isHeadOfficeUser(user)) return;

  const error = new Error(`You are not allowed to ${actionLabel} for this owner node.`);
  error.status = 403;
  throw error;
};

export const assertCanPublishToNode = (user, node, classification) => {
  assertFmsPermission(user, FMS_PERMISSIONS.PUBLISH);
  assertNodeBelongsToUserTenant(user, node);

  if (isSuperAdmin(user)) return;
  if (!isBankAdmin(user)) {
    const error = new Error('Only owner-node admin, HO admin, or super admin support can publish DMS documents into FMS.');
    error.status = 403;
    throw error;
  }

  const accessibleBranchIds = getAccessibleBranchIds(user);
  const canReachNode = isHeadOfficeUser(user)
    || (!node?.branch_id)
    || accessibleBranchIds.includes(Number(node.branch_id));

  if (!canReachNode) {
    const error = new Error('Publish is restricted to your owner-node or HO admin scope.');
    error.status = 403;
    throw error;
  }

  if (!canPublishClassification(classification, user)) {
    const error = new Error('Confidential and restricted documents require HO admin or super admin publishing approval.');
    error.status = 403;
    throw error;
  }
};

export const writeFmsAuditLog = async ({
  tenantId = null,
  ownerNodeId = null,
  documentId = null,
  requestId = null,
  actorUserId = null,
  action,
  remarks = null,
  metadata = null
}) => prisma.fmsAuditLog.create({
  data: {
    tenant_id: tenantId,
    owner_node_id: ownerNodeId,
    document_id: documentId,
    request_id: requestId,
    actor_user_id: actorUserId,
    action,
    remarks,
    metadata_json: metadata || undefined
  }
});

export const getDefaultFmsPermissions = (enabled) => enabled ? [FMS_PERMISSIONS.VIEW] : [];

export const normalizeFmsPermissionsInput = (permissions = [], { ownedDepartmentId = null } = {}) => {
  const envelope = parseFmsPermissionEnvelope(permissions);
  const requested = Array.isArray(permissions)
    ? permissions.map(normalizePermissionValue).filter(Boolean)
    : envelope.permissions.map(normalizePermissionValue).filter(Boolean);

  const deduped = new Set(requested.filter((value) => FMS_PERMISSION_ORDER.includes(value)));
  for (const permission of [...deduped]) {
    for (const dependency of FMS_PERMISSION_DEPENDENCIES[permission] || []) {
      deduped.add(dependency);
    }
  }

  return {
    permissions: FMS_PERMISSION_ORDER.filter((permission) => deduped.has(permission)),
    owned_department_id: Number(ownedDepartmentId || envelope.ownedDepartmentId || 0) || null
  };
};

const getDocumentActiveGrantAccessLevels = (user, document) => {
  const grants = document?.access_grants || [];
  const accessibleBranchIds = getAccessibleBranchIds(user);
  const now = Date.now();
  const matchedLevels = [];

  for (const grant of grants) {
    if (grant?.revoked_at) continue;
    if (grant?.expires_at && new Date(grant.expires_at).getTime() <= now) continue;

    const parsedGrant = parseGrantType(grant.grant_type);
    if (grant.user_id && Number(grant.user_id) === Number(user?.id)) {
      matchedLevels.push(parsedGrant.accessLevel);
      continue;
    }

    if (grant.branch_id && accessibleBranchIds.includes(Number(grant.branch_id))) {
      matchedLevels.push(parsedGrant.accessLevel);
    }
  }

  return matchedLevels;
};

export const resolveFmsDocumentAccess = (user, document, appendAccess = null, nodeGrantAccess = null) => {
  if (!user || !document) {
    return {
      accessLevel: null,
      canDownload: false,
      via: null
    };
  }
  if (isSuperAdmin(user) || isBankAdmin(user)) {
    return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'ADMIN_SCOPE' };
  }
  if (Number(document.uploaded_by_user_id) === Number(user.id)) {
    return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'UPLOADER' };
  }
  if (Number(document.published_by_user_id) === Number(user.id)) {
    return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'PUBLISHER' };
  }

  const directLevels = getDocumentActiveGrantAccessLevels(user, document);
  if (directLevels.some((level) => hasRequiredAccessLevel(level, FMS_ACCESS_LEVELS.DOWNLOAD))) {
    return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'DIRECT_GRANT' };
  }

  const ownerPath = String(document.owner_node?.path_key || '');
  const ownerNodeId = Number(document.owner_node_id || document.owner_node?.id || 0);
  const inheritedDownload = (nodeGrantAccess?.downloadNodeIds || []).includes(ownerNodeId)
    || (nodeGrantAccess?.downloadPrefixes || []).some((prefix) => ownerPath.startsWith(prefix));
  if (inheritedDownload) {
    return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'NODE_GRANT' };
  }
  const inheritedView = ((ownerNodeId && (nodeGrantAccess?.exactNodeIds || []).includes(ownerNodeId))
    || (nodeGrantAccess?.viewPrefixes || []).some((prefix) => ownerPath.startsWith(prefix)));
  if (inheritedView) {
    return { accessLevel: FMS_ACCESS_LEVELS.VIEW, canDownload: false, via: 'NODE_GRANT' };
  }

  const ownerBranchId = Number(document.owner_node?.branch_id || 0);
  if (ownerBranchId) {
    if ((appendAccess?.downloadBranchIds || []).includes(ownerBranchId)) {
      return { accessLevel: FMS_ACCESS_LEVELS.DOWNLOAD, canDownload: true, via: 'BRANCH_APPEND' };
    }
    if ((appendAccess?.sourceBranchIds || []).includes(ownerBranchId)) {
      return { accessLevel: FMS_ACCESS_LEVELS.VIEW, canDownload: false, via: 'BRANCH_APPEND' };
    }
  }

  const defaultScopedAccess = resolveDefaultScopedDocumentAccess(user, document);
  if (defaultScopedAccess) {
    return defaultScopedAccess;
  }

  if (directLevels.some((level) => hasRequiredAccessLevel(level, FMS_ACCESS_LEVELS.VIEW))) {
    return { accessLevel: FMS_ACCESS_LEVELS.VIEW, canDownload: false, via: 'DIRECT_GRANT' };
  }

  return {
    accessLevel: null,
    canDownload: false,
    via: null
  };
};

export const hasFmsDownloadAccess = (user, document, appendAccess = null, nodeGrantAccess = null) => resolveFmsDocumentAccess(user, document, appendAccess, nodeGrantAccess).canDownload;

export const listOwnerAdminUsersForNode = async (node) => prisma.user.findMany({
  where: {
    tenant_id: node.tenant_id,
    role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } },
    OR: [
      node.branch_id ? { branch_id: node.branch_id } : null,
      { branch_accesses: { some: { branch_id: node.branch_id || 0 } } },
      { fms_enabled: true }
    ].filter(Boolean)
  },
  select: { id: true, name: true, email: true }
});

export const isTenantScopedUser = (user, tenantId) => isSameTenantScope(user, tenantId);
