import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { buildFmsSearchQuery, parseFmsSearchParams } from '../utils/fmsSearch';
import { fmsSectionItems, hasFullFmsFeatureAccess as hasFullFmsFeatureAccessForUser, hasGrantedInboxOnlyAccess as hasGrantedInboxOnlyAccessForUser } from '../utils/fmsNavigation';
import { fmsSearchModeOptions } from '../utils/fmsRoles';

const accessLevelLabel = {
  VIEW: 'View Only',
  DOWNLOAD: 'View + Download'
};

const isCircularDocument = (documentItem) => (
  String(documentItem?.document_type || '').trim().toUpperCase() === 'CIRCULAR'
  || String(documentItem?.document_category || '').trim().toUpperCase() === 'CIRCULARS'
);

const classificationOptions = [
  { value: 'PUBLIC', label: 'Public Record' },
  { value: 'INTERNAL', label: 'Internal Record' },
  { value: 'CONFIDENTIAL', label: 'Confidential Record' },
  { value: 'RESTRICTED', label: 'Restricted Record' }
];

const recordTypeOptions = [
  {
    value: 'PAN_CARD',
    label: 'PAN Card',
    department_codes: ['KYC'],
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
    required_fields: ['document_reference'],
    visible_fields: ['document_reference', 'document_category', 'notes'],
    field_labels: { document_reference: 'Circular Number' }
  },
  {
    value: 'MANUAL_RECORD',
    label: 'Manual Record',
    department_codes: ['MANUAL'],
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

const recordDeskOptions = [
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

const emptyUpload = {
  owner_node_id: '',
  base_document_id: '',
  visibility_mode: 'ACTIVE',
  classification: 'INTERNAL',
  document_type: '',
  document_category: '',
  title: '',
  customer_name: '',
  customer_reference: '',
  cif_reference: '',
  account_reference: '',
  identity_reference: '',
  id_proof_number: '',
  document_reference: '',
  tags: '',
  access_scope: 'NODE_ONLY',
  notes: ''
};

const emptyNodeForm = {
  parent_id: '',
  branch_id: '',
  department_master_id: '',
  name: '',
  code: '',
  node_type: 'DEPARTMENT'
};

const emptyFilters = {
  q: '',
  search_by: 'ALL',
  owner_node_id: '',
  department_master_id: '',
  branch_id: '',
  document_type: '',
  document_category: '',
  uploaded_by: '',
  from_date: '',
  to_date: '',
  classification: '',
  status: 'ALL',
  include_history: false
};

const emptyDepartmentForm = {
  parent_department_id: '',
  legacy_department_id: '',
  name: '',
  code: '',
  branch_ids: []
};

const emptyGrantForm = {
  grant_type: 'USER',
  access_level: 'VIEW',
  user_id: '',
  branch_id: '',
  expires_at: ''
};

const emptyLibraryStandardsForm = {
  classification_master: classificationOptions,
  record_type_master: recordTypeOptions,
  record_desk_master: recordDeskOptions
};

const emptyRequestForm = {
  target_type: 'USER',
  access_level: 'VIEW',
  target_user_id: '',
  target_branch_id: '',
  reason: '',
  expires_at: ''
};

const emptyAppendForm = {
  source_branch_id: '',
  reason: '',
  expires_at: ''
};

const emptyNodeGrantForm = {
  grant_type: 'BRANCH',
  access_level: 'VIEW',
  include_descendants: true,
  user_id: '',
  branch_id: '',
  department_master_id: '',
  expires_at: ''
};

const emptyDistributionForm = {
  target_type: 'USER',
  access_level: 'VIEW',
  target_user_id: '',
  target_branch_id: '',
  target_department_master_id: '',
  title: '',
  instruction_type: 'INFORMATION',
  message: '',
  due_at: '',
  allow_redistribution: false,
  parent_distribution_id: '',
  source_recipient_id: ''
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};
const buildFmsAuditScopeLabel = (document) => {
  const pathKey = String(document?.department_master?.path_key || '').trim();
  if (pathKey) {
    return pathKey.split('/').map((item) => item.trim()).filter(Boolean).join(' / ');
  }
  const category = String(document?.document_category || '').trim();
  if (category && !['GENERAL', 'STRICT'].includes(category.toUpperCase())) {
    return category;
  }
  return document?.department_master?.name || document?.owner_node?.name || 'FMS';
};
const formatFmsAuditAction = (value = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FMS_CONTROLLED_COPY_ISSUED') return 'DOWNLOADED';
  if (normalized === 'FMS_RECORD_VIEWED') return 'OPENED';
  return normalized.replace(/^FMS_/, '').replace(/_/g, ' ').trim() || 'FMS EVENT';
};
const getDownloadName = (contentDisposition, fallbackName) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
  return match?.[1] || fallbackName;
};
const normalizeDepartmentToken = (value = '') => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
const DESK_TOKEN_ALIASES = {
  RETAILBANKING: 'RETAIL',
  RETAIL: 'RETAIL',
  CORPORATEBANKING: 'CORPORATEBANKING',
  LOAN: 'LOANS',
  LOANS: 'LOANS',
  KYC: 'KYC',
  MANUAL: 'MANUAL',
  CIRCULAR: 'CIRCULARS',
  CIRCULARS: 'CIRCULARS',
  DEPOSIT: 'DEPOSITS',
  DEPOSITS: 'DEPOSITS',
  TREASURY: 'TREASURY',
  OPERATION: 'OPERATIONS',
  OPERATIONS: 'OPERATIONS',
  RISKMANAGEMENT: 'RISKMANAGEMENT',
  AUDIT: 'AUDIT',
  COMPLIANCE: 'COMPLIANCE',
  ITSERVICES: 'ITSERVICES',
  LEGAL: 'LEGAL',
  TRADEFINANCE: 'TRADEFINANCE',
  RECOVERY: 'RECOVERY'
};
const DESK_FIELD_PROFILES = {
  RETAIL: {
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference'],
    required_fields: ['customer_reference'],
    field_labels: {
      customer_reference: 'Customer / Account Reference',
      document_reference: 'Document Reference'
    }
  },
  CORPORATEBANKING: {
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference', 'notes'],
    required_fields: ['customer_name', 'customer_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Corporate Client Reference',
      account_reference: 'Corporate Account Number',
      document_reference: 'Corporate File Reference'
    }
  },
  LOANS: {
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference'],
    required_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Customer / Loan Reference',
      document_reference: 'Loan / Sanction Reference'
    }
  },
  KYC: {
    visible_fields: ['customer_name', 'cif_reference', 'identity_reference', 'id_proof_number', 'document_reference'],
    required_fields: ['customer_name', 'document_reference'],
    field_labels: {
      identity_reference: 'Identity Proof Type',
      id_proof_number: 'Identity / Document Number',
      document_reference: 'KYC Reference'
    }
  },
  MANUAL: {
    visible_fields: ['document_reference', 'customer_name', 'customer_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Manual Register Reference',
      customer_reference: 'Primary Manual Reference'
    }
  },
  CIRCULARS: {
    visible_fields: ['document_reference', 'document_category', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Circular Number'
    }
  },
  DEPOSITS: {
    visible_fields: ['customer_name', 'customer_reference', 'cif_reference', 'account_reference', 'document_reference'],
    required_fields: ['customer_reference', 'account_reference'],
    field_labels: {
      customer_reference: 'Customer / Deposit Reference',
      document_reference: 'Deposit Reference'
    }
  },
  TREASURY: {
    visible_fields: ['document_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Treasury Reference'
    }
  },
  OPERATIONS: {
    visible_fields: ['document_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Operations Reference'
    }
  },
  RISKMANAGEMENT: {
    visible_fields: ['document_reference', 'customer_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      customer_reference: 'Risk Subject Reference',
      document_reference: 'Risk Assessment Reference'
    }
  },
  AUDIT: {
    visible_fields: ['document_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Audit Reference'
    }
  },
  COMPLIANCE: {
    visible_fields: ['document_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      document_reference: 'Compliance Reference'
    }
  },
  ITSERVICES: {
    visible_fields: ['customer_name', 'customer_reference', 'document_reference', 'document_category', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      customer_reference: 'User / Employee Reference',
      document_reference: 'IT Reference',
      document_category: 'System / Service'
    }
  },
  LEGAL: {
    visible_fields: ['customer_name', 'customer_reference', 'document_reference', 'notes'],
    required_fields: ['document_reference'],
    field_labels: {
      customer_reference: 'Case / Customer Reference',
      document_reference: 'Legal Reference'
    }
  },
  TRADEFINANCE: {
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference'],
    required_fields: ['customer_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Trade Customer Reference',
      document_reference: 'Trade Instrument Reference'
    }
  },
  RECOVERY: {
    visible_fields: ['customer_name', 'customer_reference', 'account_reference', 'document_reference', 'notes'],
    required_fields: ['customer_reference', 'account_reference', 'document_reference'],
    field_labels: {
      customer_reference: 'Recovery Customer Reference',
      document_reference: 'Recovery Case Reference'
    }
  }
};
const normalizeDeskToken = (value = '') => {
  const token = normalizeDepartmentToken(value);
  return DESK_TOKEN_ALIASES[token] || token;
};
const matchesDeskToken = (left, right) => {
  const leftToken = normalizeDeskToken(left);
  const rightToken = normalizeDeskToken(right);
  return Boolean(leftToken && rightToken && leftToken === rightToken);
};
const buildDeskFieldProfile = (recordTypes = [], deskValue = '') => {
  const deskToken = normalizeDeskToken(deskValue);
  if (!deskToken) return null;

  const staticProfile = DESK_FIELD_PROFILES[deskToken];
  if (staticProfile) {
    return {
      value: `${deskToken}_DESK_PROFILE`,
      label: String(deskValue || '').trim(),
      ...staticProfile
    };
  }

  const matchedTypes = (Array.isArray(recordTypes) ? recordTypes : []).filter((item) => {
    const defaultDeskMatch = matchesDeskToken(item?.default_desk, deskToken);
    const departmentMatch = Array.isArray(item?.department_codes)
      && item.department_codes.some((code) => matchesDeskToken(code, deskToken));
    return defaultDeskMatch || departmentMatch;
  });

  if (!matchedTypes.length) return null;

  const visibleFields = Array.from(new Set(matchedTypes.flatMap((item) => item.visible_fields || [])));
  const requiredFields = Array.from(new Set(matchedTypes.flatMap((item) => item.required_fields || [])));
  const fieldLabels = matchedTypes.reduce((acc, item) => ({ ...acc, ...(item.field_labels || {}) }), {});

  return {
    value: `${deskToken}_DESK_PROFILE`,
    label: String(deskValue || '').trim(),
    visible_fields: visibleFields,
    required_fields: requiredFields,
    field_labels: fieldLabels
  };
};
const nodeMatchesRecordType = (node, recordType) => {
  const requiredDepartments = Array.isArray(recordType?.department_codes)
    ? recordType.department_codes.map(normalizeDepartmentToken).filter(Boolean)
    : [];
  if (!requiredDepartments.length) return true;
  const nodeTokens = [
    node?.department_master?.code,
    node?.department_master?.name,
    node?.department_master?.path_key,
    ...String(node?.department_master?.path_key || '').split('/')
  ]
    .map(normalizeDepartmentToken)
    .filter(Boolean);
  if (!nodeTokens.length) return false;
  return requiredDepartments.some((code) => nodeTokens.includes(code) || nodeTokens.some((token) => token.includes(code) || code.includes(token)));
};

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;
const isDemoDownloadMode = (import.meta.env.VITE_ENABLE_DEMO ?? import.meta.env.VITE_ENABLE_DEMO_FEATURES ?? 'true') !== 'false' && !import.meta.env.PROD;
const DEMO_DOWNLOAD_EMPLOYEE_ID = '123456';
const hasSensitiveFileAdminAccess = (user) => ['ADMIN', 'SUPER_ADMIN'].includes(user?.role?.name || user?.role);

const FmsWorkspace = ({ section = 'register' }) => {
  const { user, refreshProfile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const recordDetailRef = useRef(null);
  const requestDeskRef = useRef(null);
  const [bootstrap, setBootstrap] = useState({
    permissions: { hasFmsAccess: false, permissions: [] },
    append_policy: {
      enabled: false,
      title: 'Cross-Branch Append Access',
      summary: '',
      default_access_level: 'VIEW',
      download_upgrade_allowed: true,
      approval_scope: ''
    },
    classifications: [],
    nodes: [],
    departments: [],
    branches: [],
    users: [],
    node_tree: [],
    department_tree: [],
    legacy_departments: [],
    tenants: [],
    tenant_scope_id: null,
    pending_request_count: 0,
    pending_append_request_count: 0
  });
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [appendRequests, setAppendRequests] = useState([]);
  const [appendGrants, setAppendGrants] = useState([]);
  const [nodeGrants, setNodeGrants] = useState([]);
  const [distributionInbox, setDistributionInbox] = useState([]);
  const [circularDocuments, setCircularDocuments] = useState([]);
  const [mandatoryDistributions, setMandatoryDistributions] = useState([]);
  const [documentDistributions, setDocumentDistributions] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [filters, setFilters] = useState(() => ({ ...emptyFilters, ...parseFmsSearchParams(location.search) }));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [uploadForm, setUploadForm] = useState(emptyUpload);
  const [uploadFile, setUploadFile] = useState(null);
  const [customRecordType, setCustomRecordType] = useState('');
  const [showAdditionalIndexing, setShowAdditionalIndexing] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [nodeForm, setNodeForm] = useState(emptyNodeForm);
  const [departmentForm, setDepartmentForm] = useState(emptyDepartmentForm);
  const [grantForm, setGrantForm] = useState(emptyGrantForm);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [appendForm, setAppendForm] = useState(emptyAppendForm);
  const [nodeGrantForm, setNodeGrantForm] = useState(emptyNodeGrantForm);
  const [distributionForm, setDistributionForm] = useState(emptyDistributionForm);
  const [libraryStandardsForm, setLibraryStandardsForm] = useState(emptyLibraryStandardsForm);
  const [selectedAccessCard, setSelectedAccessCard] = useState(null);
  const [forwardingRecipient, setForwardingRecipient] = useState(null);
  const [inlinePromptDocumentId, setInlinePromptDocumentId] = useState(null);
  const [tenantScopeId, setTenantScopeId] = useState(user?.tenant_id || null);
  const [libraryDesk, setLibraryDesk] = useState('tree');
  const [accessDesk, setAccessDesk] = useState('requests');
  const [expandedNodes, setExpandedNodes] = useState({});
  const [showRegisterFolders, setShowRegisterFolders] = useState(false);
  const [showRegisterAdminSummary, setShowRegisterAdminSummary] = useState(false);
  const [showRegisterCircularInbox, setShowRegisterCircularInbox] = useState(false);
  const [showRegisterMandatoryMonitoring, setShowRegisterMandatoryMonitoring] = useState(false);
  const [showCircularComposer, setShowCircularComposer] = useState(false);
  const [showDistributionModal, setShowDistributionModal] = useState(false);
  const [distributionModalAnchor, setDistributionModalAnchor] = useState(null);
  const [distributionModalPosition, setDistributionModalPosition] = useState(null);
  const canViewSensitiveFmsFiles = hasSensitiveFileAdminAccess(user);
  const [downloadPrompt, setDownloadPrompt] = useState(null);
  const [downloadEmployeeId, setDownloadEmployeeId] = useState(isDemoDownloadMode ? DEMO_DOWNLOAD_EMPLOYEE_ID : '');
  const [downloadSubmitting, setDownloadSubmitting] = useState(false);
  const downloadEmployeeInputRef = useRef(null);
  const distributionModalRef = useRef(null);
  const uploadPresetRef = useRef('');
  const circularDocumentsRouteUnavailableRef = useRef(false);

  const hasFullFmsFeatureAccess = hasFullFmsFeatureAccessForUser(user);
  const hasGrantedInboxOnlyAccess = hasGrantedInboxOnlyAccessForUser(user);
  const canAccessFms = Boolean(
    bootstrap.permissions?.hasFmsAccess
    || user?.has_fms_access
    || user?.has_granted_fms_access
  );
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const fmsPermissions = bootstrap.permissions?.permissions?.length
    ? bootstrap.permissions.permissions
    : (user?.fms_permissions || []);
  const hasPermission = (permission) => fmsPermissions.includes(permission);
  const isAdminOperator = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role) || hasPermission('FMS_SHARE') || hasPermission('FMS_REVOKE') || hasPermission('FMS_PUBLISH');
  const isBankAdminRole = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const activeSection = section;
  const canSeeDmsPublishedRecords = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role) && activeSection === 'admin';
  const documentSourceMode = canSeeDmsPublishedRecords ? 'ALL' : 'MANUAL_ONLY';
  const canUseFullLibraryExplorer = false;
  const canLodgeRecords = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role) || hasPermission('FMS_UPLOAD');
  const canRequestForOthers = isAdminOperator;
  const canReleaseBackup = hasPermission('FMS_PUBLISH');
  const canManageLibrary = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role) || hasPermission('FMS_SHARE');
  const appendPolicy = bootstrap.append_policy || {};
  const appendFeatureEnabled = Boolean(appendPolicy.enabled);
  const canManageAppend = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role) || hasPermission('FMS_SHARE') || hasPermission('FMS_REVOKE');
  const canGrantRecordAccess = Boolean(isAdminOperator || hasPermission('FMS_SHARE'));
  const canRevokeRecordAccess = Boolean(isAdminOperator || hasPermission('FMS_REVOKE'));
  const canApproveAccessRequests = Boolean(isAdminOperator || hasPermission('FMS_SHARE'));
  const hasFullLibraryVisibility = isAdminOperator || hasPermission('FMS_VIEW_ALL') || hasPermission('FMS_DOWNLOAD_ALL');
  const usesOwnedFmsDesk = !['ADMIN', 'SUPER_ADMIN'].includes(user?.role)
    && (hasPermission('FMS_UPLOAD') || hasPermission('FMS_SHARE') || hasPermission('FMS_REVOKE') || hasPermission('FMS_PUBLISH'));
  const isViewerOnlyFmsUser = canAccessFms
    && !['ADMIN', 'SUPER_ADMIN'].includes(user?.role)
    && !hasPermission('FMS_UPLOAD')
    && !hasPermission('FMS_SHARE')
    && !hasPermission('FMS_REVOKE')
    && !hasPermission('FMS_PUBLISH');
  const isStandardFmsUser = canAccessFms && !isAdminOperator && !isSuperAdmin;
  const showAdminWorkbench = activeSection === 'admin';
  const showInboxWorkbench = activeSection === 'inbox';
  const showRegisterWorkbench = activeSection === 'register';
  const showUploadWorkbench = activeSection === 'upload';
  const showLibraryWorkbench = activeSection === 'library';
  const showApprovalWorkbench = activeSection === 'access';
  const isCompactAdminRegister = showRegisterWorkbench && ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const shouldShowAppendControls = appendFeatureEnabled || isSuperAdmin;
  const canUseAdminWorkbench = isAdminOperator || hasPermission('FMS_UPLOAD') || hasPermission('FMS_SHARE') || hasPermission('FMS_REVOKE') || hasPermission('FMS_PUBLISH');
  const adminDeskCards = [
    {
      key: 'roles',
      title: 'FMS Role Desk',
      text: 'Map the correct banking FMS role before library work starts, so user visibility, upload rights, and approvals stay controlled from the beginning.',
      path: '/fms/roles',
      enabled: isAdminOperator
    },
    {
      key: 'structure',
      title: 'Bank Departments',
      text: 'Maintain the bank hierarchy in the proper order: bank, department, sub-department, branch, then records below it.',
      path: '/fms/library',
      enabled: canManageLibrary
    },
    {
      key: 'standards',
      title: 'Library Standards',
      text: 'Define the bank record types, desks, and sensitivity labels used in records intake and library search.',
      path: '/fms/library',
      enabled: canManageLibrary
    },
    {
      key: 'permissions',
      title: 'Library Access',
      text: 'Approve who can view or download records by user, branch, department, or inherited folder access.',
      path: '/fms/access',
      enabled: hasPermission('FMS_SHARE') || canManageAppend
    },
    {
      key: 'sharing',
      title: 'Branch Sharing',
      text: 'Handle branch-to-branch visibility requests when controlled cross-branch access is enabled for the bank.',
      path: '/fms/access',
      enabled: shouldShowAppendControls && (hasPermission('FMS_SHARE') || canManageAppend || isSuperAdmin)
    },
    {
      key: 'intake',
      title: 'Record Intake',
      text: 'Capture direct bank records such as PAN, Aadhaar, KYC, sanction copies, and branch scans into controlled FMS custody with customer indexing.',
      path: '/fms/upload',
      enabled: canLodgeRecords
    }
  ].filter((item) => item.enabled);
  const showMainColumn = showRegisterWorkbench || showInboxWorkbench || showUploadWorkbench || showLibraryWorkbench || showAdminWorkbench;
  const showSideColumn = showApprovalWorkbench;
  const flattenVisibleNodes = (items = [], depth = 0) => items.flatMap((item) => ([
    { ...item, depth },
    ...flattenVisibleNodes(item.children || [], depth + 1)
  ]));

  const nodeOptions = bootstrap.nodes || [];
  const branchOptions = bootstrap.branches || [];
  const userOptions = bootstrap.users || [];
  const tenantOptions = bootstrap.tenants || [];
  const pendingRequests = requests.filter((item) => item.status === 'PENDING');
  const pendingAppendRequests = appendRequests.filter((item) => item.status === 'PENDING');
  const appendSourceOptions = branchOptions.filter((item) => String(item.id) !== String(user?.branch_id));
  const nodeTree = bootstrap.node_tree || [];
  const departmentTree = bootstrap.department_tree || [];
  const departmentOptions = bootstrap.departments || [];
  const legacyDepartmentOptions = bootstrap.legacy_departments || [];
  const libraryStandards = bootstrap.library_standards || {};
  const classificationMasterOptions = useMemo(
    () => (Array.isArray(libraryStandards.classifications) && libraryStandards.classifications.length
      ? libraryStandards.classifications
      : classificationOptions),
    [libraryStandards.classifications]
  );
  const recordTypeMasterOptions = useMemo(
    () => (Array.isArray(libraryStandards.record_types) && libraryStandards.record_types.length
      ? libraryStandards.record_types
      : recordTypeOptions),
    [libraryStandards.record_types]
  );
  const uploadNodeOptions = useMemo(() => {
    const allowedNodeIds = new Set((bootstrap.upload_scope?.node_ids || []).map((item) => String(item)));
    if (allowedNodeIds.size === 0) {
      return canLodgeRecords ? nodeOptions : [];
    }
    return nodeOptions.filter((node) => allowedNodeIds.has(String(node.id)));
  }, [bootstrap.upload_scope?.node_ids, canLodgeRecords, nodeOptions]);
  const uploadScopedRecordTypeOptions = useMemo(() => {
    const scopedValues = new Set((bootstrap.upload_scope?.record_type_values || []).map((item) => String(item)));
    const baseOptions = scopedValues.size
      ? recordTypeMasterOptions.filter((item) => scopedValues.has(String(item.value)) || item.value === 'OTHER')
      : recordTypeMasterOptions;
    const activeNode = nodeOptions.find((node) => String(node.id) === String(uploadForm.owner_node_id || ''));
    if (!activeNode) {
      return baseOptions;
    }
    const nodeScoped = baseOptions.filter((item) => nodeMatchesRecordType(activeNode, item) || item.value === 'OTHER');
    return nodeScoped.length ? nodeScoped : baseOptions;
  }, [bootstrap.upload_scope?.record_type_values, nodeOptions, recordTypeMasterOptions, uploadForm.owner_node_id]);
  const recordDeskMasterOptions = useMemo(
    () => (Array.isArray(libraryStandards.record_desks) && libraryStandards.record_desks.length
      ? libraryStandards.record_desks
      : recordDeskOptions),
    [libraryStandards.record_desks]
  );
  const classificationLabelMap = useMemo(
    () => classificationMasterOptions.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {}),
    [classificationMasterOptions]
  );
  const recordTypeLabelMap = useMemo(
    () => recordTypeMasterOptions.reduce((acc, item) => ({ ...acc, [item.value]: item.label }), {}),
    [recordTypeMasterOptions]
  );
  const accessViaLabelMap = {
    ADMIN_SCOPE: 'Bank administration scope',
    LIBRARY_SCOPE: 'Full FMS library scope',
    UPLOADER: 'Uploaded by you',
    PUBLISHER: 'Published by you',
    HO_SCOPE: 'Head office scope',
    BRANCH_SCOPE: 'Your branch scope',
    DIRECT_GRANT: 'Direct share',
    NODE_GRANT: 'Inherited folder access',
    BRANCH_APPEND: 'Cross-branch visibility'
  };
  const accessViaDetailMap = {
    ADMIN_SCOPE: 'You can act on this record because you are operating as a bank administrator inside this bank scope.',
    LIBRARY_SCOPE: 'You can act on this record because your FMS role gives full released-library visibility across the bank.',
    UPLOADER: 'You can act on this record because you lodged this record into the library yourself.',
    PUBLISHER: 'You can act on this record because you published this record into the library.',
    HO_SCOPE: 'You can act on this record because it belongs to a head office folder within your working scope.',
    BRANCH_SCOPE: 'You can act on this record because it belongs to your assigned branch visibility scope.',
    DIRECT_GRANT: 'This record was explicitly shared to you by an authorized records administrator.',
    NODE_GRANT: 'This record is visible to you because access was granted at the folder level and inherited downward.',
    BRANCH_APPEND: 'This record is visible to you because controlled cross-branch visibility was approved.'
  };
  const distributionInstructionLabelMap = {
    INFORMATION: 'For Information',
    ACTION: 'Action Required',
    ACKNOWLEDGEMENT: 'Acknowledge Receipt'
  };
  const activeSectionMeta = fmsSectionItems.find((item) => item.key === activeSection) || fmsSectionItems[0];
  const sectionCopy = {
    register: {
      badge: hasFullLibraryVisibility ? 'Records Library' : 'Shared Records',
      title: hasFullLibraryVisibility ? 'Records Library' : 'Shared Records',
      description: hasFullLibraryVisibility
        ? 'Use this desk to open released FMS records across all departments and folders in the bank library.'
        : (isStandardFmsUser
          ? 'Use this desk to open shared records and search inside your allowed bank scope by customer, CIF, account, identity, document reference, department, or branch.'
          : 'This is the controlled FMS records library. Manual bank records stay searchable here under branch, department, sub-department, and inherited folder scope without mixing them into the live DMS workflow queues.')
    },
    inbox: {
      badge: 'Circular Inbox',
      title: 'Circular Inbox',
      description: 'Use this desk only for RBI instructions, circular acknowledgements, and bank-wide mandatory circulation items without mixing them into the records library page.'
    },
    upload: {
      badge: 'Record Intake',
      title: 'Branch Record Intake',
      description: 'Use this desk to place KYC, circular, account-opening, sanction, and other non-workflow bank records into controlled library custody with the right mandatory indexing for future retrieval.'
    },
    library: {
      badge: 'Bank Departments',
      title: 'Bank Department Library',
      description: 'Set up how the bank library is arranged: Bank, department, sub-department, branch, and the media folders that future records will live under.'
    },
    access: {
      badge: 'Library Access',
      title: 'Library Access Control',
      description: 'Review access requests, branch-to-branch visibility requests, and active sharing rules without mixing them into the workflow queues. Role gives the operating right; record grants decide the final visibility and download scope.'
    },
    admin: {
      badge: 'Library Administration',
      title: 'Library Administration',
      description: 'Use this desk in banking order: role control first, then library structure and permissions, then record intake, then searchable records library usage.'
    }
  }[activeSection] || {
    badge: 'FMS',
    title: activeSectionMeta.label,
    description: 'File management workspace.'
  };
  const effectiveOwnedFmsDepartmentId = usesOwnedFmsDesk
    ? (Number(user?.fms_owned_department_id || 0) || 0)
    : 0;
  const ownedFmsDeskLabel = useMemo(() => {
    if (!usesOwnedFmsDesk || !effectiveOwnedFmsDepartmentId) return '';
    const matchedDepartment = departmentOptions.find((item) => (
      Number(item.legacy_department_id || 0) === Number(effectiveOwnedFmsDepartmentId)
    ));
    return String(matchedDepartment?.name || matchedDepartment?.path_key || user?.department || '').trim();
  }, [departmentOptions, effectiveOwnedFmsDepartmentId, usesOwnedFmsDesk, user?.department]);
  const ownedFmsDeskToken = normalizeDeskToken(ownedFmsDeskLabel);
  const hasOwnedFmsDesk = Boolean(ownedFmsDeskLabel && ownedFmsDeskToken);
  const libraryGuideCards = [
    {
      title: 'What Comes Here',
      text: 'This register is for controlled FMS records and branch library custody, not for the live DMS workflow queue.'
    },
    {
      title: 'How Folders Work',
      text: 'Open folders in bank order: Bank, Department, Sub-department, Branch, then the working media folder below it.'
    },
    {
      title: 'How Search Stays Useful',
      text: 'Index records by customer, CIF, account, identity, and document reference so the library stays useful for future retrieval.'
    },
    {
      title: 'Who Can See Records',
      text: hasFullLibraryVisibility
        ? 'This role can open all released folders across the bank library while still respecting controlled download rules.'
        : 'Users only see records shared with their user, branch, department, sub-department, or inherited folder scope.'
    }
  ];
  const hierarchySummaryCards = [
    {
      title: 'Banks In Scope',
      value: String((bootstrap.hierarchy_summary?.bank_count ?? tenantOptions.length) || (tenantScopeId ? 1 : 0) || 0),
      note: 'Top-level bank entities configured for this file-management workspace.'
    },
    {
      title: 'Departments',
      value: String((bootstrap.hierarchy_summary?.department_count ?? departmentOptions.length) || 0),
      note: 'Departments and sub-departments configured under the bank.'
    },
    {
      title: 'Branches',
      value: String((bootstrap.hierarchy_summary?.branch_count ?? branchOptions.length) || 0),
      note: 'Branches available for folder mapping, grants, and record visibility.'
    },
    {
      title: 'Media Folders',
      value: String((bootstrap.hierarchy_summary?.media_folder_count ?? nodeOptions.filter((node) => String(node.node_type || '').toUpperCase() === 'MEDIA_FOLDER').length) || 0),
      note: 'Working folders or collectors where records finally live for future usage.'
    }
  ];
  const searchExamples = [
    'Search by account number or account reference',
    'Search by CIF or customer ID',
    'Search by PAN, Aadhaar, or identity reference',
    'Search by document reference, sanction ref, or docket number',
    'Search by branch, department, circular number, or uploaded-by user'
  ];
  const selectedNode = useMemo(
    () => nodeOptions.find((node) => (
      String(node.id) === String(filters.owner_node_id || '')
    )),
    [nodeOptions, filters.owner_node_id]
  );
  const uploadTargetNode = useMemo(
    () => nodeOptions.find((node) => (
      String(node.id) === String(uploadForm.owner_node_id || '')
    )),
    [nodeOptions, uploadForm.owner_node_id]
  );
  const selectedDocumentDetail = useMemo(
    () => {
      const currentDocument = documents.find((item) => item.id === selectedDocument?.id);
      return currentDocument && selectedDocument
        ? { ...currentDocument, ...selectedDocument }
        : (currentDocument || selectedDocument);
    },
    [documents, selectedDocument]
  );
  const userAlreadyHasViewAccess = Boolean(selectedDocumentDetail?.viewer_access_level);
  const userAlreadyHasDownloadAccess = Boolean(selectedDocumentDetail?.can_download);
  const selectedDocumentRequests = useMemo(
    () => requests.filter((request) => String(request.document?.id || request.document_id || '') === String(selectedDocumentDetail?.id || '')),
    [requests, selectedDocumentDetail?.id]
  );
  const selectedPendingDocumentRequests = useMemo(
    () => selectedDocumentRequests.filter((request) => String(request.status || '').toUpperCase() === 'PENDING'),
    [selectedDocumentRequests]
  );
  const selectedCurrentUserRequest = useMemo(
    () => selectedDocumentRequests.find((request) => (
      String(request.status || '').toUpperCase() === 'PENDING'
      && Number(request.requester?.id || request.requester_user_id || 0) === Number(user?.id || 0)
      && String(request.access_level || 'VIEW').toUpperCase() === (userAlreadyHasViewAccess ? 'DOWNLOAD' : 'VIEW')
    )) || null,
    [selectedDocumentRequests, user?.id, userAlreadyHasViewAccess]
  );
  const shouldShowRequestForm = Boolean(
    selectedDocumentDetail
    && !hasPermission('FMS_SHARE')
    && (!userAlreadyHasViewAccess || !userAlreadyHasDownloadAccess)
  );
  const canSeeGovernancePanels = Boolean(
    selectedDocumentDetail
    && (hasPermission('FMS_SHARE') || hasPermission('FMS_REVOKE') || ['ADMIN', 'SUPER_ADMIN'].includes(user?.role))
  );
  const requestFormHeading = !userAlreadyHasViewAccess
    ? 'Request View Access'
    : 'Request Download Upgrade';

  useEffect(() => {
    if (!selectedDocumentDetail) return;
    setRequestForm((current) => ({
      ...current,
      access_level: userAlreadyHasViewAccess ? 'DOWNLOAD' : 'VIEW',
      target_type: canRequestForOthers ? current.target_type : 'USER',
      target_user_id: canRequestForOthers ? current.target_user_id : String(user?.id || '')
    }));
  }, [selectedDocumentDetail?.id, userAlreadyHasViewAccess, canRequestForOthers, user?.id]);

  const scrollToRecordDetail = (target = 'detail') => {
    window.setTimeout(() => {
      if (target === 'request' && requestDeskRef.current) {
        requestDeskRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (recordDetailRef.current) {
        recordDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 120);
  };
  const selectedGrantTarget = useMemo(() => {
    if (!selectedDocumentDetail) return null;
    if (grantForm.grant_type === 'USER' && grantForm.user_id) {
      const matchedUser = userOptions.find((item) => String(item.id) === String(grantForm.user_id));
      const activeGrant = (selectedDocumentDetail.access_grants || []).find((grant) => (
        String(grant.user?.id || '') === String(grantForm.user_id)
      ));
      return {
        type: 'USER',
        label: matchedUser ? `${matchedUser.name} (${matchedUser.role?.name || 'User'})` : 'Selected user',
        activeGrant
      };
    }
    if (grantForm.grant_type === 'BRANCH' && grantForm.branch_id) {
      const matchedBranch = branchOptions.find((item) => String(item.id) === String(grantForm.branch_id));
      const activeGrant = (selectedDocumentDetail.access_grants || []).find((grant) => (
        String(grant.branch?.id || '') === String(grantForm.branch_id)
      ));
      return {
        type: 'BRANCH',
        label: matchedBranch ? `${matchedBranch.branch_name} (${matchedBranch.branch_code})` : 'Selected branch',
        activeGrant
      };
    }
    return null;
  }, [branchOptions, grantForm.branch_id, grantForm.grant_type, grantForm.user_id, selectedDocumentDetail, userOptions]);
  const directGrantCount = (selectedDocumentDetail?.access_grants || []).length;
  const inheritedGrantCount = (selectedDocumentDetail?.node_grants || []).length;
  const selectedGrantTargetStatus = selectedGrantTarget?.activeGrant
    ? (selectedGrantTarget.activeGrant.access_level === 'DOWNLOAD' ? 'Already shared with download' : 'Already shared with view')
    : (selectedGrantTarget ? 'No direct share yet' : 'Choose a target to review status');
  const selectedDocumentInboxItems = useMemo(
    () => distributionInbox.filter((item) => String(item.document?.id || '') === String(selectedDocumentDetail?.id || '')),
    [distributionInbox, selectedDocumentDetail?.id]
  );
  const selectedDocumentIsCircular = useMemo(() => {
    const docType = String(selectedDocumentDetail?.document_type || '').trim().toUpperCase();
    return docType === 'CIRCULAR'
      || normalizeDeskToken(selectedDocumentDetail?.document_category || '') === 'CIRCULARS';
  }, [selectedDocumentDetail?.document_type, selectedDocumentDetail?.document_category]);
  const canForwardSelectedDocument = selectedDocumentInboxItems.some((item) => item.can_forward);
  const canCreateDistribution = Boolean(canGrantRecordAccess || canForwardSelectedDocument);
  const showOperatorCircularCards = Boolean(canSeeGovernancePanels || canCreateDistribution);
  const showAdminRecordDetail = Boolean(
    selectedDocumentDetail
    && isBankAdminRole
    && (
      showRegisterWorkbench
      || (
        showInboxWorkbench
        && !selectedDocumentIsCircular
        && (shouldShowRequestForm || canSeeGovernancePanels)
      )
      || showApprovalWorkbench
      || (
        showInboxWorkbench
        && selectedDocumentIsCircular
        && (canCreateDistribution || canSeeGovernancePanels)
      )
    )
  );
  const showInlineRecordDetail = Boolean(showAdminRecordDetail || (selectedDocumentDetail && shouldShowRequestForm));
  const mandatoryDistributionInboxItems = useMemo(
    () => distributionInbox.filter((item) => item.is_bank_wide_mandatory),
    [distributionInbox]
  );
  const visibleCircularInboxItems = useMemo(
    () => (['ADMIN', 'SUPER_ADMIN'].includes(user?.role) ? [] : distributionInbox),
    [distributionInbox, user?.role]
  );
  const unreadMandatoryDistributionCount = useMemo(
    () => mandatoryDistributionInboxItems.filter((item) => !item.viewed_at).length,
    [mandatoryDistributionInboxItems]
  );
  const describeLibraryNode = (node) => {
    const rawType = String(node.node_type || node.department_type || '').toUpperCase();
    if (rawType === 'HO') {
      return { kind: 'Bank', label: node.name || 'Head Office', meta: `Head Office${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    if (rawType === 'DEPARTMENT') {
      return { kind: 'Department', label: node.name, meta: `Department${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    if (rawType === 'SUB_DEPARTMENT') {
      return { kind: 'Sub-department', label: node.name, meta: `Sub-department${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    if (rawType === 'BANK' && node.branch_id) {
      return { kind: 'Branch', label: node.name, meta: `Branch${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    if (rawType === 'BANK') {
      return { kind: 'Bank', label: node.name, meta: `Bank${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    if (rawType === 'MEDIA_FOLDER') {
      return { kind: 'Media Folder', label: node.name, meta: `Collector${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}` };
    }
    return {
      kind: rawType || 'Folder',
      label: node.name,
      meta: `${rawType || 'Folder'}${typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}`
    };
  };
  const selectedFolderLabel = selectedNode
    ? `${describeLibraryNode(selectedNode).kind} - ${describeLibraryNode(selectedNode).label}`
    : (hasFullLibraryVisibility ? 'All released records across the bank' : (isViewerOnlyFmsUser ? 'All records shared into your current scope' : 'All accessible folders'));
  const formatDepartmentFirstFolderLabel = (node, { compact = false } = {}) => {
    if (!node) return '-';
    const description = describeLibraryNode(node);
    const departmentName = String(node.department_master?.name || '').trim();
    if (!departmentName) {
      return compact ? description.label : `${description.kind} - ${description.label}`;
    }
    const sameName = normalizeDeskToken(departmentName) === normalizeDeskToken(description.label);
    if (compact) {
      return sameName ? departmentName : `${departmentName} / ${description.label}`;
    }
    return sameName
      ? `${departmentName} / ${description.kind}`
      : `${departmentName} / ${description.kind} / ${description.label}`;
  };
  const selectedFolderDisplayLabel = selectedNode
    ? formatDepartmentFirstFolderLabel(selectedNode)
    : (hasFullLibraryVisibility ? 'All released records across the bank' : (isViewerOnlyFmsUser ? 'All records shared into your current scope' : 'All accessible folders'));
  const compactVisibleFolders = useMemo(() => {
    const flattened = flattenVisibleNodes(nodeTree);
    const seen = new Set();
    const items = [];
    for (const node of flattened) {
      const aggregateCount = Number(node.aggregate_document_count ?? node.document_count ?? 0);
      if (aggregateCount <= 0) continue;
      const key = String(node.department_master?.id || '') || `node-${node.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(node);
      if (items.length >= 8) break;
    }
    return items;
  }, [nodeTree]);
  const formatLibraryFolderLabel = (node) => {
    if (!node) return '-';
    return formatDepartmentFirstFolderLabel(node);
  };
  const formatUploadFolderOptionLabel = (node) => {
    if (!node) return '-';
    const nodeType = String(node.node_type || '').toUpperCase();
    const departmentName = String(node.department_master?.name || '').trim();
    const branchName = String(node.branch?.branch_name || node.name || '').trim();

    if (nodeType === 'MEDIA_FOLDER') {
      if (departmentName && branchName) return `${departmentName} / ${branchName} / Record Folder`;
      if (departmentName) return `${departmentName} / Record Folder`;
      return 'Record Folder';
    }

    if (nodeType === 'BANK' && node.branch_id) {
      if (departmentName && branchName) return `${departmentName} / ${branchName}`;
      if (branchName) return branchName;
    }

    return formatLibraryFolderLabel(node);
  };
  const preferredUploadNode = useMemo(() => {
    const userBranchId = Number(user?.branch_id || 0);
    const userDepartmentId = Number(effectiveOwnedFmsDepartmentId || 0);
    if (userBranchId && userDepartmentId) {
      const departmentMediaNode = uploadNodeOptions.find((node) => (
        Number(node.branch_id || 0) === userBranchId
        && Number(node.department_master?.legacy_department_id || 0) === userDepartmentId
        && String(node.node_type || '').toUpperCase() === 'MEDIA_FOLDER'
      ));
      if (departmentMediaNode) return departmentMediaNode;
      const departmentBranchNode = uploadNodeOptions.find((node) => (
        Number(node.branch_id || 0) === userBranchId
        && Number(node.department_master?.legacy_department_id || 0) === userDepartmentId
        && String(node.node_type || '').toUpperCase() === 'BANK'
      ));
      if (departmentBranchNode) return departmentBranchNode;
    }
    if (selectedNode && uploadNodeOptions.some((node) => String(node.id) === String(selectedNode.id))) return selectedNode;
    if (uploadTargetNode) return uploadTargetNode;
    if (userBranchId) {
      const branchMediaNode = uploadNodeOptions.find((node) => (
        Number(node.branch_id || 0) === userBranchId
        && String(node.node_type || '').toUpperCase() === 'MEDIA_FOLDER'
      ));
      if (branchMediaNode) return branchMediaNode;
      const branchNode = uploadNodeOptions.find((node) => (
        Number(node.branch_id || 0) === userBranchId
        && String(node.node_type || '').toUpperCase() === 'BANK'
      ));
      if (branchNode) return branchNode;
    }
    return uploadNodeOptions[0] || null;
  }, [effectiveOwnedFmsDepartmentId, selectedNode, uploadTargetNode, uploadNodeOptions, user?.branch_id]);
  const scopedDeskValue = useMemo(() => {
    if (hasOwnedFmsDesk) {
      const matchedOwnedDesk = recordDeskMasterOptions.find((item) => matchesDeskToken(item, ownedFmsDeskLabel));
      if (matchedOwnedDesk) return matchedOwnedDesk;
      return ownedFmsDeskLabel;
    }
    if (!uploadTargetNode?.department_master) return '';
    const nodeDeskToken = normalizeDeskToken(
      uploadTargetNode.department_master.name
      || uploadTargetNode.department_master.code
      || ''
    );
    const matchedDesk = recordDeskMasterOptions.find((item) => matchesDeskToken(item, nodeDeskToken));
    return matchedDesk || uploadTargetNode.department_master.name || '';
  }, [hasOwnedFmsDesk, ownedFmsDeskLabel, recordDeskMasterOptions, uploadTargetNode?.department_master]);
  const uploadDeskOptions = useMemo(() => {
    if (scopedDeskValue) {
      const matchedDeskOptions = recordDeskMasterOptions.filter((item) => matchesDeskToken(item, scopedDeskValue));
      if (matchedDeskOptions.length) return matchedDeskOptions;
      return [scopedDeskValue];
    }
    return recordDeskMasterOptions;
  }, [recordDeskMasterOptions, scopedDeskValue]);
  const circularUploadNodeOptions = useMemo(() => (
    uploadNodeOptions.filter((node) => matchesDeskToken(
      node?.department_master?.name
      || node?.department_master?.code
      || node?.department_master?.path_key
      || node?.name,
      'CIRCULARS'
    ))
  ), [uploadNodeOptions]);
  const circularUploadDefaultNode = useMemo(
    () => circularUploadNodeOptions[0] || uploadNodeOptions[0] || null,
    [circularUploadNodeOptions, uploadNodeOptions]
  );
  const activeDeskValue = uploadForm.document_category || scopedDeskValue || '';
  const deskScopedRecordTypeOptions = useMemo(() => {
    const deskToken = normalizeDeskToken(activeDeskValue);
    if (!deskToken) return uploadScopedRecordTypeOptions;
    const matchesDesk = (item) => (
      item.value === 'OTHER'
      || matchesDeskToken(item.default_desk, deskToken)
      || (Array.isArray(item.department_codes) && item.department_codes.some((code) => matchesDeskToken(code, deskToken)))
    );
    const scopedTypes = uploadScopedRecordTypeOptions.filter(matchesDesk);
    if (scopedTypes.some((item) => item.value !== 'OTHER')) {
      return scopedTypes;
    }
    const fallbackTypes = recordTypeMasterOptions.filter((item) => {
      if (item.value === 'OTHER') return true;
      return matchesDeskToken(item.default_desk, deskToken)
        || (Array.isArray(item.department_codes) && item.department_codes.some((code) => matchesDeskToken(code, deskToken)));
    });
    return fallbackTypes.length ? fallbackTypes : uploadScopedRecordTypeOptions;
  }, [activeDeskValue, recordTypeMasterOptions, uploadScopedRecordTypeOptions]);
  const activeUploadRecordTypeRule = useMemo(
    () => deskScopedRecordTypeOptions.find((item) => String(item.value) === String(uploadForm.document_type || '')) || null,
    [deskScopedRecordTypeOptions, uploadForm.document_type]
  );
  const activeIntakeRule = useMemo(
    () => activeUploadRecordTypeRule || buildDeskFieldProfile(deskScopedRecordTypeOptions, activeDeskValue),
    [activeDeskValue, activeUploadRecordTypeRule, deskScopedRecordTypeOptions]
  );
  const intakeFieldVisible = (field) => {
    const visibleFields = activeIntakeRule?.visible_fields;
    if (!Array.isArray(visibleFields) || visibleFields.length === 0) return true;
    return visibleFields.includes(field);
  };
  const intakeFieldRequired = (field) => Array.isArray(activeIntakeRule?.required_fields) && activeIntakeRule.required_fields.includes(field);
  const intakeFieldLabel = (field, fallback) => activeIntakeRule?.field_labels?.[field] || fallback;
  const intakeFieldPlaceholder = (field, fallback) => {
    const label = intakeFieldLabel(field, fallback);
    if (!label) return '';
    return `Enter ${label}`;
  };
  const shouldForceAdditionalIndexing = ['identity_reference', 'id_proof_number', 'document_reference']
    .some((field) => intakeFieldVisible(field) && intakeFieldRequired(field));
  const knownRecordTypeValues = useMemo(
    () => new Set(deskScopedRecordTypeOptions.filter((item) => item.value !== 'OTHER').map((item) => item.value)),
    [deskScopedRecordTypeOptions]
  );
  const recordTypeSelectValue = !uploadForm.document_type
    ? ''
    : (knownRecordTypeValues.has(uploadForm.document_type)
      ? uploadForm.document_type
      : 'OTHER');
  const resolvedCustomRecordType = recordTypeSelectValue === 'OTHER'
    ? (
      customRecordType
      || (
        uploadForm.document_type
        && uploadForm.document_type !== 'OTHER'
        && !knownRecordTypeValues.has(uploadForm.document_type)
          ? uploadForm.document_type
          : ''
      )
    )
    : '';

  const toggleNodeExpansion = (nodeId) => {
    setExpandedNodes((current) => ({ ...current, [nodeId]: !(current[nodeId] ?? true) }));
  };

  const buildScopedParams = (extra = {}, scopeTenantId = tenantScopeId) => (
    isSuperAdmin && scopeTenantId
      ? { ...extra, tenant_id: scopeTenantId, source_mode: documentSourceMode }
      : { ...extra, source_mode: documentSourceMode }
  );

  useEffect(() => {
    const nextSearchFilters = parseFmsSearchParams(location.search);
    setFilters((current) => (
      current.q === nextSearchFilters.q && current.search_by === nextSearchFilters.search_by
        ? current
        : { ...current, ...nextSearchFilters }
    ));
  }, [location.search]);

  useEffect(() => {
    if (!hasGrantedInboxOnlyAccess) return;
    if (activeSection === 'inbox') return;
    navigate('/fms/inbox', { replace: true });
  }, [activeSection, hasGrantedInboxOnlyAccess, navigate]);

  useEffect(() => {
    if (!user?.has_fms_access && !user?.has_granted_fms_access) return;
    if (user?.department_id || !user?.department) return;
    refreshProfile().catch(() => {});
  }, [refreshProfile, user?.department, user?.department_id, user?.has_fms_access, user?.has_granted_fms_access]);

  useEffect(() => {
    if (!preferredUploadNode?.id) return;
    setUploadForm((current) => (
      current.owner_node_id && (
        !effectiveOwnedFmsDepartmentId
        || uploadNodeOptions.some((node) => (
          String(node.id) === String(current.owner_node_id)
          && Number(node.department_master?.legacy_department_id || 0) === Number(effectiveOwnedFmsDepartmentId || 0)
        ))
      )
        ? current
        : {
          ...current,
          owner_node_id: String(preferredUploadNode.id)
        }
    ));
  }, [effectiveOwnedFmsDepartmentId, preferredUploadNode?.id, uploadNodeOptions, user?.department_id]);

  useEffect(() => {
    if (!uploadForm.owner_node_id) return;
    const departmentScopedMatch = uploadNodeOptions.some((node) => (
      String(node.id) === String(uploadForm.owner_node_id)
      && (
        !effectiveOwnedFmsDepartmentId
        || Number(node.department_master?.legacy_department_id || 0) === Number(effectiveOwnedFmsDepartmentId || 0)
      )
    ));
    if (departmentScopedMatch) return;
    setUploadForm((current) => ({ ...current, owner_node_id: String(preferredUploadNode?.id || uploadNodeOptions[0]?.id || '') }));
  }, [effectiveOwnedFmsDepartmentId, preferredUploadNode?.id, uploadForm.owner_node_id, uploadNodeOptions, user?.department_id]);

  useEffect(() => {
    if (!uploadForm.document_type) return;
    const isCustomRecordType = !recordTypeMasterOptions.some((item) => String(item.value) === String(uploadForm.document_type));
    if (isCustomRecordType) return;
    const stillAllowed = deskScopedRecordTypeOptions.some((item) => String(item.value) === String(uploadForm.document_type));
    if (stillAllowed) return;
    setUploadForm((current) => ({ ...current, document_type: '' }));
  }, [deskScopedRecordTypeOptions, recordTypeMasterOptions, uploadForm.document_type]);

  useEffect(() => {
    if (!scopedDeskValue) return;
    if (matchesDeskToken(uploadForm.document_category, scopedDeskValue)) return;
    setUploadForm((current) => ({
      ...current,
      document_category: scopedDeskValue
    }));
  }, [scopedDeskValue, uploadForm.document_category]);

  useEffect(() => {
    if (!uploadDeskOptions.length) return;
    if (uploadDeskOptions.some((item) => matchesDeskToken(item, uploadForm.document_category || ''))) return;
    setUploadForm((current) => ({
      ...current,
      document_category: uploadDeskOptions[0]
    }));
  }, [uploadDeskOptions, uploadForm.document_category]);

  useEffect(() => {
    if (uploadForm.document_type) return;
    const autoTypeOptions = deskScopedRecordTypeOptions.filter((item) => item.value !== 'OTHER');
    if (autoTypeOptions.length !== 1) return;
    setUploadForm((current) => ({
      ...current,
      document_type: autoTypeOptions[0].value,
      document_category: autoTypeOptions[0].default_desk || current.document_category
    }));
  }, [deskScopedRecordTypeOptions, uploadForm.document_type]);

  useEffect(() => {
    if (!showUploadWorkbench) return;
    const params = new URLSearchParams(location.search);
    const presetDesk = String(params.get('desk') || '').trim();
    const presetType = String(params.get('record_type') || '').trim().toUpperCase();

    if (!presetDesk && !presetType) {
      uploadPresetRef.current = '';
      return;
    }

    const presetKey = `${presetDesk}|${presetType}|${uploadNodeOptions.length}|${uploadDeskOptions.length}|${recordTypeMasterOptions.length}`;
    if (uploadPresetRef.current === presetKey) return;

    const matchedType = recordTypeMasterOptions.find((item) => String(item.value || '').toUpperCase() === presetType) || null;
    const resolvedDesk = uploadDeskOptions.find((item) => matchesDeskToken(item, presetDesk))
      || uploadDeskOptions.find((item) => matchesDeskToken(item, matchedType?.default_desk || ''))
      || '';
    const resolvedNode = uploadNodeOptions.find((node) => matchesDeskToken(
      node.department_master?.name || node.department_master?.code || node.path_key || '',
      resolvedDesk || presetDesk
    ));

    setUploadForm((current) => ({
      ...current,
      document_category: resolvedDesk || current.document_category,
      document_type: matchedType ? matchedType.value : current.document_type,
      owner_node_id: resolvedNode ? String(resolvedNode.id) : current.owner_node_id
    }));

    uploadPresetRef.current = presetKey;
  }, [location.search, recordTypeMasterOptions, showUploadWorkbench, uploadDeskOptions, uploadNodeOptions]);

  useEffect(() => {
    if (!downloadPrompt) return;
    window.setTimeout(() => downloadEmployeeInputRef.current?.focus(), 60);
  }, [downloadPrompt]);

  useEffect(() => {
    if (!downloadPrompt) return undefined;
    window.document.body.classList.add('bank-modal-lock');
    window.document.documentElement.classList.add('bank-modal-lock');
    return () => {
      window.document.body.classList.remove('bank-modal-lock');
      window.document.documentElement.classList.remove('bank-modal-lock');
    };
  }, [downloadPrompt]);

  useEffect(() => {
    if (!showDistributionModal) return undefined;
    window.document.body.classList.add('bank-modal-lock');
    window.document.documentElement.classList.add('bank-modal-lock');
    return () => {
      window.document.body.classList.remove('bank-modal-lock');
      window.document.documentElement.classList.remove('bank-modal-lock');
    };
  }, [showDistributionModal]);

  useEffect(() => {
    if (!showDistributionModal) return undefined;

    const positionModal = () => {
      const modal = distributionModalRef.current;
      if (!modal) return;

      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const modalRect = modal.getBoundingClientRect();
      const padding = 24;

      if (!distributionModalAnchor || viewportWidth <= 900) {
        setDistributionModalPosition(null);
        return;
      }

      const preferLeftSide = distributionModalAnchor.right > viewportWidth * 0.58;
      const sideGap = 14;
      const preferredLeft = preferLeftSide
        ? distributionModalAnchor.right - modalRect.width
        : distributionModalAnchor.left;
      const preferredTop = distributionModalAnchor.top - 26;

      const left = Math.max(padding, Math.min(preferredLeft, viewportWidth - modalRect.width - padding));
      const top = Math.max(padding, Math.min(preferredTop, viewportHeight - modalRect.height - padding));
      const transformOrigin = `${preferLeftSide ? 'right' : 'left'} top`;

      setDistributionModalPosition({
        top,
        left: preferLeftSide ? left : Math.min(left + sideGap, viewportWidth - modalRect.width - padding),
        transformOrigin
      });
    };

    const rafId = window.requestAnimationFrame(positionModal);
    window.addEventListener('resize', positionModal);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', positionModal);
    };
  }, [distributionModalAnchor, showDistributionModal]);

  useEffect(() => {
    if (!showRegisterWorkbench && showRegisterFolders) {
      setShowRegisterFolders(false);
    }
  }, [showRegisterFolders, showRegisterWorkbench]);

  useEffect(() => {
    if (!showRegisterWorkbench) return;
    if (!hasFullLibraryVisibility) return;
    if (!filters.owner_node_id) return;
    if (loading) return;
    if (documents.length > 0) return;

    const nextFilters = {
      ...filters,
      owner_node_id: ''
    };
    setFilters(nextFilters);
    loadDocuments(nextFilters).catch(() => {});
    setMessage('That folder has no released records right now, so the desk switched back to your full accessible register.');
  }, [documents.length, filters, hasFullLibraryVisibility, loading, showRegisterWorkbench]);

  useEffect(() => {
    if (!showRegisterWorkbench) {
      setShowRegisterAdminSummary(false);
      setShowRegisterCircularInbox(false);
      setShowRegisterMandatoryMonitoring(false);
    }
  }, [showRegisterWorkbench]);

  useEffect(() => {
    if (showInboxWorkbench) return;
    setShowCircularComposer(false);
  }, [showInboxWorkbench]);

  const loadBootstrap = async (scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/bootstrap', {
      params: isSuperAdmin && scopeTenantId
        ? { tenant_id: scopeTenantId, source_mode: documentSourceMode }
        : { source_mode: documentSourceMode }
    });
    const payload = response.data || {};
    setBootstrap(payload);
    setLibraryStandardsForm({
      classification_master: payload.library_standards?.classifications?.length ? payload.library_standards.classifications : classificationOptions,
      record_type_master: payload.library_standards?.record_types?.length ? payload.library_standards.record_types : recordTypeOptions,
      record_desk_master: payload.library_standards?.record_desks?.length ? payload.library_standards.record_desks : recordDeskOptions
    });

    if (isSuperAdmin && !scopeTenantId && payload.tenants?.[0]?.id) {
      setTenantScopeId(payload.tenants[0].id);
    }

    setUploadForm((current) => ({
      ...current,
      owner_node_id: current.owner_node_id || String(payload.upload_scope?.node_ids?.[0] || payload.nodes?.[0]?.id || ''),
      classification: current.classification || payload.library_standards?.classifications?.[0]?.value || 'INTERNAL',
      visibility_mode: current.visibility_mode || 'ACTIVE'
    }));
  };

  const openCircularComposer = () => {
    setShowCircularComposer(true);
    setShowAdditionalIndexing(false);
    setCustomRecordType('');
    setUploadFile(null);
    setUploadForm((current) => ({
      ...emptyUpload,
      owner_node_id: String(circularUploadDefaultNode?.id || current.owner_node_id || ''),
      visibility_mode: current.visibility_mode || 'ACTIVE',
      classification: current.classification || 'INTERNAL',
      document_type: 'CIRCULAR',
      document_category: 'Circulars',
      access_scope: 'NODE_ONLY'
    }));
  };

  const loadDocuments = async (nextFilters = filters, scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/documents', {
      params: buildScopedParams({ ...nextFilters }, scopeTenantId)
    });
    let items = response.data?.items || [];
    let resolvedFilters = nextFilters;

    // Banking users should land on their accessible record pool first. If a stale
    // or overly narrow folder filter hides valid shared records, automatically
    // fall back to the broader accessible register instead of showing a false empty state.
    if (
      !items.length
      && nextFilters.owner_node_id
      && !isAdminOperator
    ) {
      const fallbackFilters = {
        ...nextFilters,
        owner_node_id: ''
      };
      const fallbackResponse = await api.get('/fms/documents', {
        params: buildScopedParams({ ...fallbackFilters }, scopeTenantId)
      });
      const fallbackItems = fallbackResponse.data?.items || [];
      if (fallbackItems.length) {
        items = fallbackItems;
        resolvedFilters = fallbackFilters;
        setFilters(fallbackFilters);
        const query = buildFmsSearchQuery(fallbackFilters);
        navigate(query ? `/fms/register?${query}` : '/fms/register', { replace: true });
        setMessage('Shared records were found outside the current folder filter, so the desk switched back to your full accessible register.');
      }
    }

    setDocuments(items);

    if (!items.length) {
      setSelectedDocument(null);
      return;
    }

    if (!selectedDocument) {
      setSelectedDocument(items[0]);
      return;
    }

    const stillSelected = items.find((item) => item.id === selectedDocument.id);
    setSelectedDocument(stillSelected || items[0]);
  };

  const loadRequests = async (scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/access-requests', {
      params: buildScopedParams({}, scopeTenantId)
    });
    setRequests(response.data?.items || []);
  };

  const loadAppendRequests = async (scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/append-requests', {
      params: buildScopedParams({}, scopeTenantId)
    });
    setAppendRequests(response.data?.items || []);
  };

  const loadAppendGrants = async (scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/append-grants', {
      params: buildScopedParams({ status: 'ACTIVE' }, scopeTenantId)
    });
    setAppendGrants(response.data?.items || []);
  };

  const loadDistributionInbox = async (scopeTenantId = tenantScopeId) => {
    const response = await api.get('/fms/distribution-inbox', {
      params: buildScopedParams({}, scopeTenantId)
    });
    setDistributionInbox(response.data?.items || []);
  };

  const loadCircularDocuments = async (scopeTenantId = tenantScopeId) => {
    const loadFromFallback = async () => {
      const fallbackResponse = await api.get('/fms/documents', {
        params: buildScopedParams({
          document_type: 'CIRCULAR',
          document_category: 'Circulars'
        }, scopeTenantId)
      });

      const fallbackItems = (fallbackResponse.data?.items || []).filter((item) => (
        String(item?.document_type || '').trim().toUpperCase() === 'CIRCULAR'
        || normalizeDeskToken(item?.document_category || '') === 'CIRCULARS'
      ));

      setCircularDocuments(fallbackItems);
    };

    if (circularDocumentsRouteUnavailableRef.current) {
      await loadFromFallback();
      return;
    }

    try {
      const response = await api.get('/fms/circular-documents', {
        params: buildScopedParams({}, scopeTenantId)
      });
      setCircularDocuments(response.data?.items || []);
    } catch (error) {
      // Some running environments may still be on the older backend route set.
      // Fall back to the main FMS register query instead of breaking circular upload.
      if (error?.response?.status !== 404) {
        throw error;
      }
      circularDocumentsRouteUnavailableRef.current = true;
      await loadFromFallback();
    }
  };

  const loadMandatoryDistributions = async (scopeTenantId = tenantScopeId) => {
    if (!(isAdminOperator || hasPermission('FMS_SHARE') || hasPermission('FMS_PUBLISH'))) {
      setMandatoryDistributions([]);
      return;
    }
    const response = await api.get('/fms/mandatory-distributions', {
      params: buildScopedParams({}, scopeTenantId)
    });
    setMandatoryDistributions(response.data?.items || []);
  };

  const loadDocumentDistributions = async (documentId) => {
    if (!documentId) {
      setDocumentDistributions([]);
      return;
    }
    const response = await api.get(`/fms/documents/${documentId}/distributions`);
    setDocumentDistributions(response.data?.items || []);
  };

  const loadNodeGrants = async (nodeId = (filters.owner_node_id || uploadForm.owner_node_id)) => {
    if (!canGrantRecordAccess) {
      setNodeGrants([]);
      return;
    }
    if (!nodeId) {
      setNodeGrants([]);
      return;
    }
    const response = await api.get(`/fms/nodes/${nodeId}/grants`);
    setNodeGrants(response.data?.grants || []);
  };

  const refreshAll = async () => {
    await Promise.all([loadBootstrap(), loadDocuments(filters), loadRequests(), loadAppendRequests(), loadAppendGrants(), loadDistributionInbox(), loadCircularDocuments(), loadMandatoryDistributions(), loadNodeGrants()]);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([loadBootstrap(), loadDocuments(filters), loadRequests(), loadAppendRequests(), loadAppendGrants(), loadDistributionInbox(), loadCircularDocuments(), loadMandatoryDistributions()]);
      } catch (error) {
        setMessage(error.response?.data?.error || 'Unable to load FMS workspace.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [tenantScopeId, documentSourceMode]);

  useEffect(() => {
    if (!canAccessFms) return;
    loadDocuments(filters).catch(() => {});
  }, [
    filters.q,
    filters.search_by,
    filters.owner_node_id,
    filters.department_master_id,
    filters.branch_id,
    filters.document_type,
    filters.document_category,
    filters.uploaded_by,
    filters.from_date,
    filters.to_date,
    filters.classification,
    filters.status,
    filters.include_history,
    tenantScopeId,
    documentSourceMode,
    canAccessFms
  ]);

  useEffect(() => {
    if (!canGrantRecordAccess) {
      setNodeGrants([]);
      return;
    }
    loadNodeGrants().catch(() => {});
  }, [canGrantRecordAccess, filters.owner_node_id, uploadForm.owner_node_id, tenantScopeId]);

  useEffect(() => {
    setSelectedAccessCard(null);
  }, [selectedDocumentDetail?.id]);

  useEffect(() => {
    setForwardingRecipient(null);
    setDistributionForm(emptyDistributionForm);
  }, [selectedDocumentDetail?.id]);

  useEffect(() => {
    loadDocumentDistributions(selectedDocumentDetail?.id).catch(() => {});
  }, [selectedDocumentDetail?.id, tenantScopeId]);

  useEffect(() => {
    if (!showRegisterWorkbench || !selectedDocumentDetail?.id) return undefined;

    const intervalId = window.setInterval(() => {
      openDocument(selectedDocumentDetail.id, { skipScroll: true }).catch(() => {});
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [selectedDocumentDetail?.id, showRegisterWorkbench]);

  useEffect(() => {
    const openDocumentId = location.state?.openDocumentId;
    if (!openDocumentId || (!showRegisterWorkbench && !showApprovalWorkbench && !showInboxWorkbench)) return;

    openDocument(openDocumentId, { focusArea: location.state?.focusArea || 'detail' }).finally(() => {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: {} });
    });
  }, [location.pathname, location.search, location.state, navigate, showApprovalWorkbench, showInboxWorkbench, showRegisterWorkbench]);

  useEffect(() => {
    if (showLibraryWorkbench) {
      setLibraryDesk('tree');
    }
    if (showApprovalWorkbench) {
      setAccessDesk('requests');
    }
  }, [showApprovalWorkbench, showLibraryWorkbench]);

  if (!canAccessFms && !loading) {
    return <Navigate to="/dashboard" replace />;
  }

  if (showLibraryWorkbench && !canManageLibrary) {
    return <Navigate to="/fms/register" replace />;
  }

  if (showAdminWorkbench && !canUseAdminWorkbench) {
    return <Navigate to="/fms/register" replace />;
  }

  const handleSearch = async (event) => {
    event.preventDefault();
    await loadDocuments(filters);
  };

  const handleResetFilters = async () => {
    const nextFilters = { ...emptyFilters };
    setFilters(nextFilters);
    const query = buildFmsSearchQuery(nextFilters);
    navigate(query ? `/fms/register?${query}` : '/fms/register', { replace: true });
    await loadDocuments(nextFilters);
  };

  const handleNodeScopeSelect = async (nodeId) => {
    const nextFilters = {
      ...filters,
      owner_node_id: String(nodeId || '')
    };
    setFilters(nextFilters);
    const loaders = [loadDocuments(nextFilters)];
    if (canGrantRecordAccess) {
      loaders.push(loadNodeGrants(nodeId || ''));
    }
    await Promise.all(loaders);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!uploadFile) {
      setMessage('Select an approved PDF or banking image file before lodging to FMS.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const resolvedDocumentType = recordTypeSelectValue === 'OTHER'
        ? String(resolvedCustomRecordType || '').trim().toUpperCase().replace(/\s+/g, '_')
        : String(uploadForm.document_type || '').trim();
      if (!resolvedDocumentType) {
        setMessage('Select the banking record type before lodging this file.');
        setSaving(false);
        return;
      }

      const payload = new FormData();
      const normalizedUploadForm = {
        ...uploadForm,
        document_type: resolvedDocumentType,
        document_category: uploadForm.document_category || activeUploadRecordTypeRule?.default_desk || ''
      };
      Object.entries(normalizedUploadForm).forEach(([key, value]) => payload.append(key, value));
      payload.append('file', uploadFile);
      await api.post('/fms/documents/upload', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setUploadForm((current) => ({
        ...emptyUpload,
        owner_node_id: current.owner_node_id || '',
        visibility_mode: current.visibility_mode || 'ACTIVE'
      }));
      setCustomRecordType('');
      setShowAdditionalIndexing(false);
      setUploadFile(null);
      if (showInboxWorkbench && resolvedDocumentType === 'CIRCULAR') {
        setShowCircularComposer(false);
      }
      setMessage((uploadForm.visibility_mode || 'ACTIVE') === 'ACTIVE'
        ? 'FMS document lodged successfully.'
        : 'FMS backup lodged successfully. It stays hidden until admin releases it.');
      await refreshAll();
    } catch (error) {
      setMessage(error.response?.data?.error || 'FMS upload failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateNode = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/fms/nodes', {
        ...nodeForm,
        tenant_id: tenantScopeId || user?.tenant_id
      });
      setNodeForm(emptyNodeForm);
      setMessage('Library folder created successfully.');
      await loadBootstrap();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to create FMS node.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateDepartment = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/fms/department-masters', {
        ...departmentForm,
        tenant_id: tenantScopeId || user?.tenant_id,
        branch_ids: departmentForm.branch_ids
      });
      setDepartmentForm(emptyDepartmentForm);
      setMessage('Bank department master updated successfully.');
      await loadBootstrap();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update bank department master.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLibraryStandards = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        tenant_id: tenantScopeId || user?.tenant_id,
        classification_master: libraryStandardsForm.classification_master,
        record_type_master: libraryStandardsForm.record_type_master,
        record_desk_master: libraryStandardsForm.record_desk_master
      };
      await api.put('/fms/library-standards', payload);
      setMessage('Bank library standards updated successfully.');
      await loadBootstrap();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update bank library standards.');
    } finally {
      setSaving(false);
    }
  };

  const handleNodeGrant = async (event) => {
    event.preventDefault();
    const nodeId = selectedNode?.id || uploadForm.owner_node_id || filters.owner_node_id;
    if (!nodeId) {
      setMessage('Select a library folder before granting inherited access.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/nodes/${nodeId}/grants`, nodeGrantForm);
      setNodeGrantForm(emptyNodeGrantForm);
      setMessage('Inherited folder access granted successfully.');
      await loadNodeGrants(nodeId);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to grant inherited folder access.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeNodeGrant = async (grantId) => {
    const revokeReason = window.prompt('Enter revoke reason for this inherited folder access:');
    if (revokeReason == null) return;

    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/nodes/grants/${grantId}/revoke`, { revoke_reason: revokeReason });
      setMessage('Inherited folder access revoked successfully.');
      await loadNodeGrants();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to revoke inherited folder access.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = async (documentId, options = {}) => {
    try {
      const response = await api.get(`/fms/documents/${documentId}`);
      setSelectedDocument({
        ...(response.data?.document || null),
        node_grants: response.data?.node_grants || []
      });
      if (!options.skipScroll) {
        scrollToRecordDetail(options.focusArea || 'detail');
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to load FMS document.');
    }
  };

  const openDocumentFromAdminDesk = async (documentId, focusArea = 'detail') => {
    if (!documentId) return;
    navigate(`/fms/document/${documentId}`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        focusArea
      }
    });
  };

  const openDocumentPage = (documentId, focusArea = 'detail') => {
    if (!documentId) return;
    navigate(`/fms/document/${documentId}`, {
      state: {
        returnTo: `${location.pathname}${location.search}`,
        focusArea
      }
    });
  };

  const captureDistributionModalAnchor = (event) => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    if (!rect) {
      setDistributionModalAnchor(null);
      return;
    }

    setDistributionModalAnchor({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height
    });
  };

  const closeDistributionModal = () => {
    if (saving) return;
    setShowDistributionModal(false);
    setDistributionModalAnchor(null);
    setDistributionModalPosition(null);
    setForwardingRecipient(null);
    setDistributionForm(emptyDistributionForm);
  };

  const openDistributionModalForDocument = (event, documentItem) => {
    if (!documentItem?.id) return;
    captureDistributionModalAnchor(event);
    setSelectedDocument(documentItem);
    setForwardingRecipient(null);
    setDistributionForm(emptyDistributionForm);
    setShowDistributionModal(true);
  };

  const handleRequestDownloadFromList = async (_event, documentItem) => {
    await openDocument(documentItem.id, { skipScroll: true });
    setRequestForm((current) => ({
      ...current,
      access_level: 'DOWNLOAD',
      target_type: canRequestForOthers ? current.target_type : 'USER',
      target_user_id: canRequestForOthers ? current.target_user_id : String(user?.id || '')
    }));
    setInlinePromptDocumentId(documentItem.id);
  };

  const handleGrant = async (event) => {
    event.preventDefault();
    if (!selectedDocumentDetail) return;

    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/documents/${selectedDocumentDetail.id}/grants`, grantForm);
      setGrantForm(emptyGrantForm);
      setMessage('Access granted successfully.');
      await Promise.all([openDocument(selectedDocumentDetail.id), loadRequests()]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to grant access.');
    } finally {
      setSaving(false);
    }
  };

  const prepareForwardDistribution = (event, recipient, documentItem = null) => {
    if (!recipient?.distribution) return;
    const resolvedDocument = documentItem || recipient.document || selectedDocumentDetail || null;
    if (!resolvedDocument?.id) return;
    captureDistributionModalAnchor(event);
    setSelectedDocument(resolvedDocument);
    setForwardingRecipient(recipient);
    setDistributionForm({
      ...emptyDistributionForm,
      title: recipient.distribution.title || resolvedDocument.title || '',
      instruction_type: recipient.distribution.instruction_type || 'ACTION',
      message: recipient.distribution.message || '',
      due_at: recipient.distribution.due_at ? String(recipient.distribution.due_at).slice(0, 16) : '',
      access_level: recipient.distribution.access_level || 'VIEW',
      allow_redistribution: false,
      parent_distribution_id: String(recipient.distribution.id),
      source_recipient_id: String(recipient.id)
    });
    setShowDistributionModal(true);
  };

  const handleCreateDistribution = async (event) => {
    event.preventDefault();
    if (!selectedDocumentDetail) return;

    setSaving(true);
    setMessage('');
    try {
      const payload = {
        ...distributionForm,
        target_user_id: distributionForm.target_type === 'USER' ? distributionForm.target_user_id : '',
        target_branch_id: distributionForm.target_type === 'BRANCH' ? distributionForm.target_branch_id : '',
        target_department_master_id: distributionForm.target_type === 'DEPARTMENT' ? distributionForm.target_department_master_id : '',
        instruction_type: distributionForm.target_type === 'BANK_WIDE' ? 'ACKNOWLEDGEMENT' : distributionForm.instruction_type,
        allow_redistribution: distributionForm.target_type === 'BANK_WIDE' ? false : distributionForm.allow_redistribution,
        parent_distribution_id: distributionForm.parent_distribution_id || undefined,
        source_recipient_id: distributionForm.source_recipient_id || undefined
      };
      await api.post(`/fms/documents/${selectedDocumentDetail.id}/distributions`, payload);
      setShowDistributionModal(false);
      setDistributionForm(emptyDistributionForm);
      setForwardingRecipient(null);
      setMessage(distributionForm.target_type === 'BANK_WIDE' ? 'Mandatory bank-wide circular released successfully.' : 'Controlled circular shared successfully.');
      await Promise.all([
        openDocument(selectedDocumentDetail.id, { skipScroll: true }),
        loadDocuments(filters),
        loadDistributionInbox(),
        loadMandatoryDistributions(),
        loadDocumentDistributions(selectedDocumentDetail.id)
      ]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to share this controlled circular.');
    } finally {
      setSaving(false);
    }
  };

  const handleDistributionRecipientAction = async (recipientId, actionType) => {
    setSaving(true);
    setMessage('');
    try {
      const note = actionType === 'complete'
        ? window.prompt('Add a short completion note for this branch/user action:') || ''
        : '';
      const endpoint = actionType === 'acknowledge'
        ? `/fms/distribution-recipients/${recipientId}/acknowledge`
        : `/fms/distribution-recipients/${recipientId}/complete`;
      await api.post(endpoint, { note });
      setMessage(actionType === 'acknowledge'
        ? 'Circular acknowledged successfully.'
        : 'Circular action marked complete.');
      await Promise.all([
        loadDistributionInbox(),
        loadMandatoryDistributions(),
        selectedDocumentDetail ? loadDocumentDistributions(selectedDocumentDetail.id) : Promise.resolve()
      ]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update circular status.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestAccess = async (event) => {
    event.preventDefault();
    if (!selectedDocumentDetail) return;

    setSaving(true);
    setMessage('');
    try {
      const payload = canRequestForOthers
        ? requestForm
        : {
          ...requestForm,
          target_type: 'USER',
          target_user_id: user?.id,
          target_branch_id: ''
        };
      await api.post(`/fms/documents/${selectedDocumentDetail.id}/access-requests`, payload);
      setRequestForm(emptyRequestForm);
      setMessage('Access request submitted for approval.');
      await loadRequests();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to submit access request.');
    } finally {
      setSaving(false);
    }
  };

  const handleDecision = async (requestId, decision) => {
    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/access-requests/${requestId}/decision`, { decision });
      setMessage(`Request ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      await Promise.all([loadRequests(), loadDocuments(filters)]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update request.');
    } finally {
      setSaving(false);
    }
  };

  const handleAppendRequest = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/fms/append-requests', appendForm);
      setAppendForm(emptyAppendForm);
      setMessage('Cross-branch append request submitted. It will open as view-only first after approval.');
      await loadAppendRequests();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to submit branch append request.');
    } finally {
      setSaving(false);
    }
  };

  const handleAppendDecision = async (requestId, decision) => {
    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/append-requests/${requestId}/decision`, { decision });
      setMessage(`Branch append request ${decision === 'APPROVE' ? 'approved' : 'rejected'} successfully.`);
      await Promise.all([loadAppendRequests(), loadAppendGrants(), loadDocuments(filters)]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to decide branch append request.');
    } finally {
      setSaving(false);
    }
  };

  const handleAppendGrantUpgrade = async (grantId, accessLevel) => {
    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/append-grants/${grantId}/update`, { access_level: accessLevel });
      setMessage(accessLevel === 'DOWNLOAD'
        ? 'Append access upgraded to view + download.'
        : 'Append access adjusted successfully.');
      await Promise.all([loadAppendGrants(), loadDocuments(filters)]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update append access.');
    } finally {
      setSaving(false);
    }
  };

  const handleAppendGrantRevoke = async (grantId) => {
    const revokeReason = window.prompt('Enter revoke reason for this append access:');
    if (revokeReason == null) return;

    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/append-grants/${grantId}/revoke`, { revoke_reason: revokeReason });
      setMessage('Branch append visibility revoked successfully.');
      await Promise.all([loadAppendGrants(), loadDocuments(filters)]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to revoke append access.');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (grantId) => {
    setSaving(true);
    setMessage('');
    try {
      await api.post(`/fms/grants/${grantId}/revoke`, {});
      setMessage('Access revoked successfully.');
      if (selectedDocumentDetail) {
        await openDocument(selectedDocumentDetail.id);
      }
      await loadDocuments(filters);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to revoke access.');
    } finally {
      setSaving(false);
    }
  };

  const handleActivateDocument = async (documentId) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await api.post(`/fms/documents/${documentId}/activate`);
      const releasedDocument = response.data?.document || null;
      setMessage('Backup file released into the visible FMS register.');
      await loadDocuments(filters);
      if (releasedDocument) {
        setSelectedDocument(releasedDocument);
      } else if (selectedDocumentDetail) {
        await openDocument(selectedDocumentDetail.id);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to release this backup file.');
    } finally {
      setSaving(false);
    }
  };

  const downloadDocument = async (documentItem, disposition = 'attachment') => {
    try {
      if (disposition === 'attachment') {
        setDownloadEmployeeId(isDemoDownloadMode ? DEMO_DOWNLOAD_EMPLOYEE_ID : '');
        setDownloadPrompt({
          documentId: documentItem.id,
          fallbackName: documentItem.file_name,
          title: recordTypeLabelMap[documentItem.document_type] || documentItem.document_type || 'FMS record'
        });
        return;
      }
      const response = await api.get(`/fms/documents/${documentItem.id}/file?disposition=${disposition}`, { responseType: 'blob' });
      const blobUrl = window.URL.createObjectURL(response.data);
      if (disposition === 'inline') {
        window.open(blobUrl, '_blank', 'noopener,noreferrer');
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
        return;
      }
      const anchor = window.document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = documentItem.file_name;
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to open file.');
    }
  };

  const libraryDocuments = useMemo(
    () => documents.filter((documentItem) => !isCircularDocument(documentItem)),
    [documents]
  );

  const handleProtectedDownload = async () => {
    if (!downloadPrompt?.documentId) return;
    setDownloadSubmitting(true);
    setMessage('');
    try {
      const response = await api.get(
        `/fms/documents/${downloadPrompt.documentId}/file`,
        {
          params: {
            disposition: 'attachment',
            employee_id: downloadEmployeeId
          },
          responseType: 'blob'
        }
      );
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = window.document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = getDownloadName(response.headers?.['content-disposition'], downloadPrompt.fallbackName || 'fms-document');
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setDownloadPrompt(null);
      await Promise.all([
        loadDocuments(),
        selectedDocumentDetail?.id ? openDocument(selectedDocumentDetail.id, { skipScroll: true }) : Promise.resolve()
      ]);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to open file.');
    } finally {
      setDownloadSubmitting(false);
    }
  };

  const hydrateUploadFromBaseDocument = (documentId) => {
    const baseDocument = documents.find((item) => String(item.id) === String(documentId));
    if (!baseDocument) {
      setUploadForm((current) => ({ ...current, base_document_id: documentId || '' }));
      return;
    }
    setUploadForm((current) => ({
      ...current,
      base_document_id: String(baseDocument.id),
      owner_node_id: String(baseDocument.owner_node_id || current.owner_node_id),
      classification: baseDocument.classification || current.classification,
      document_type: baseDocument.document_type || current.document_type,
      document_category: baseDocument.document_category || current.document_category,
      title: baseDocument.title || current.title,
      customer_name: baseDocument.customer_name || '',
      customer_reference: baseDocument.customer_reference || '',
      cif_reference: baseDocument.cif_reference || '',
      account_reference: baseDocument.account_reference || '',
      identity_reference: baseDocument.identity_reference || '',
      id_proof_number: baseDocument.id_proof_number || '',
      document_reference: baseDocument.document_reference || '',
      tags: Array.isArray(baseDocument.tags) ? baseDocument.tags.join(', ') : current.tags,
      notes: current.notes
    }));
  };

  const renderNodeTree = (items = [], depth = 0, options = {}) => items.map((node) => {
    const {
      activeId = filters.owner_node_id,
      onSelect = handleNodeScopeSelect,
      selectable = true
    } = options;
    const isActiveNode = String(node.id) === String(activeId);
    return (
      <div key={node.id} className="fms-tree-node" style={{ paddingLeft: `${depth * 16}px` }}>
        <button
          type="button"
          className={`fms-tree-node-btn ${isActiveNode ? 'is-active' : ''}`}
          onClick={() => selectable && onSelect(isActiveNode ? '' : node.id)}
        >
          <span className="fms-tree-node-label">{node.name}</span>
          <span className="fms-tree-node-meta">
            {node.node_type || node.department_type}
            {typeof node.aggregate_document_count === 'number' ? ` - ${node.aggregate_document_count}` : ''}
          </span>
        </button>
        {node.children?.length ? renderNodeTree(node.children, depth + 1, options) : null}
      </div>
    );
  });

  const renderLibraryTree = (items = [], depth = 0, options = {}) => items.map((node) => {
    const {
      activeId = filters.owner_node_id,
      onSelect = handleNodeScopeSelect,
      selectable = true
    } = options;
    const isActiveNode = String(node.id) === String(activeId);
    const hasChildren = Boolean(node.children?.length);
    const isExpanded = expandedNodes[node.id] ?? depth < 1;
    const descriptor = describeLibraryNode(node);

    return (
      <div key={`library-${node.id}`} className="fms-tree-node" style={{ paddingLeft: `${depth * 16}px` }}>
        <div className={`fms-tree-row ${isActiveNode ? 'is-active' : ''}`}>
          <button
            type="button"
            className={`fms-tree-node-btn ${isActiveNode ? 'is-active' : ''}`}
            onClick={() => selectable && onSelect(isActiveNode ? '' : node.id)}
          >
            <span className="fms-tree-node-icon" aria-hidden="true">
              {descriptor.kind === 'Bank' ? 'B' : descriptor.kind === 'Department' ? 'D' : descriptor.kind === 'Sub-department' ? 'S' : 'R'}
            </span>
            <span className="fms-tree-node-copy">
              <span className="fms-tree-node-label">{descriptor.label}</span>
              <span className="fms-tree-node-meta">{descriptor.meta}</span>
            </span>
          </button>
          {hasChildren ? (
            <button
              type="button"
              className="fms-tree-toggle"
              onClick={() => toggleNodeExpansion(node.id)}
              aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
            >
              {isExpanded ? '-' : '+'}
            </button>
          ) : null}
        </div>
        {hasChildren && isExpanded ? renderLibraryTree(node.children, depth + 1, options) : null}
      </div>
    );
  });

  return (
    <div className="fms-shell">
      <div className="fms-header">
        <div className="fms-header-copy">
          <div className="fms-role-badge">{sectionCopy.badge}</div>
          <h1>{sectionCopy.title}</h1>
          <p>{sectionCopy.description}</p>
        </div>

        <div className="fms-header-tools">
          {isSuperAdmin && (
            <div className="form-group fms-header-scope">
              <label>Tenant Scope</label>
              <select
                className="fms-header-scope-select"
                value={tenantScopeId || ''}
                onChange={(event) => setTenantScopeId(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">All tenants</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.tenant_name} ({tenant.tenant_code})</option>
                ))}
              </select>
            </div>
          )}
          {hasOwnedFmsDesk && (
            <div className="fms-header-note">
              <span>Owned FMS Desk</span>
              <strong>{ownedFmsDeskLabel}</strong>
            </div>
          )}
          <div className="fms-header-note">
            <span>{activeSectionMeta.label}</span>
            <strong>{user?.tenant_name || user?.tenant_code || 'Bank scope'}</strong>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`ui-message ${/unable|failed|error|not found|conflict|already/i.test(message) ? 'error' : 'success'}`}
          style={{ marginBottom: '16px' }}
          role="status"
          aria-live="polite"
        >
          <span>{message}</span>
          <button type="button" className="ui-message-close" onClick={() => setMessage('')}>Dismiss</button>
        </div>
      )}
      {showDistributionModal && selectedDocumentDetail && (
        <div className="fms-modal-backdrop" role="presentation" onClick={closeDistributionModal}>
          <div
            ref={distributionModalRef}
            className="fms-modal-card fms-form-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fms-distribution-modal-title"
            style={distributionModalPosition ? {
              position: 'fixed',
              top: `${distributionModalPosition.top}px`,
              left: `${distributionModalPosition.left}px`,
              margin: 0,
              transformOrigin: distributionModalPosition.transformOrigin || 'center center'
            } : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="fms-modal-eyebrow">Controlled Circular Release</div>
            <div className="fms-modal-title" id="fms-distribution-modal-title">Release Controlled Circular</div>
            <div className="fms-modal-copy">
              Send this circular to the required user, branch, department, or full bank audience from one clear banking pop-up.
            </div>
            <div className="fms-share-card">
              <span>Selected Circular</span>
              <strong>{selectedDocumentDetail.title || 'Controlled Circular'}</strong>
              <small>
                {selectedDocumentDetail.document_reference || selectedDocumentDetail.file_name || 'No circular number'}{selectedDocumentDetail.branch?.branch_name ? ` | ${selectedDocumentDetail.branch.branch_name}` : ''}
              </small>
            </div>
            {selectedDocumentInboxItems.length > 0 && showOperatorCircularCards && (
              <div className="fms-empty-box">
                <strong>Your current instruction trail for this record</strong>
                <div className="text-muted text-sm">
                  {selectedDocumentInboxItems.map((item) => `${distributionInstructionLabelMap[item.distribution?.instruction_type] || item.distribution?.instruction_type} - ${item.status}`).join(' | ')}
                </div>
              </div>
            )}
            <form onSubmit={handleCreateDistribution} className="fms-inline-form share-elevated fms-circular-form fms-modal-form">
              {forwardingRecipient && (
                <div className="fms-empty-box" style={{ marginBottom: '14px' }}>
                  <strong>Forwarding Mode</strong>
                  <div className="text-muted text-sm">
                    This circular is being forwarded from {forwardingRecipient.target_label}. The new recipient will receive it as the next controlled banking handoff.
                  </div>
                  <div className="action-row" style={{ marginTop: '10px' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => {
                      setForwardingRecipient(null);
                      setDistributionForm(emptyDistributionForm);
                    }}>
                      Clear Forward Mode
                    </button>
                  </div>
                </div>
              )}
              <div className="form-grid cols-2">
                <div className="form-group">
                  <label>Target Type<RequiredMark /></label>
                  <select value={distributionForm.target_type} onChange={(event) => setDistributionForm((current) => ({
                    ...current,
                    target_type: event.target.value,
                    target_user_id: '',
                    target_branch_id: '',
                    target_department_master_id: '',
                    allow_redistribution: event.target.value === 'BANK_WIDE' ? false : current.allow_redistribution,
                    instruction_type: event.target.value === 'BANK_WIDE' ? 'ACKNOWLEDGEMENT' : current.instruction_type
                  }))}>
                    <option value="USER">Specific User</option>
                    <option value="DEPARTMENT">Department</option>
                    <option value="BRANCH">Branch</option>
                    <option value="BANK_WIDE">All Bank Users (Mandatory)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Instruction Type<RequiredMark /></label>
                  <select value={distributionForm.instruction_type} onChange={(event) => setDistributionForm((current) => ({ ...current, instruction_type: event.target.value }))} disabled={distributionForm.target_type === 'BANK_WIDE'}>
                    <option value="INFORMATION">For Information</option>
                    <option value="ACKNOWLEDGEMENT">Acknowledge Receipt</option>
                    <option value="ACTION">Action Required</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Permission<RequiredMark /></label>
                  <select value={distributionForm.access_level} onChange={(event) => setDistributionForm((current) => ({ ...current, access_level: event.target.value }))}>
                    <option value="VIEW">View Only</option>
                    <option value="DOWNLOAD">View + Download</option>
                  </select>
                </div>
                <div className="form-group fms-circular-date-field">
                  <label>Due Date</label>
                  <input type="datetime-local" value={distributionForm.due_at} onChange={(event) => setDistributionForm((current) => ({ ...current, due_at: event.target.value }))} />
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Distribution Title<RequiredMark /></label>
                  <input type="text" value={distributionForm.title} onChange={(event) => setDistributionForm((current) => ({ ...current, title: event.target.value }))} placeholder="Example: HO circular - customer KYC refresh" required />
                </div>
                {distributionForm.target_type === 'BANK_WIDE' && (
                  <div className="fms-empty-box" style={{ gridColumn: '1 / -1' }}>
                    <strong>Mandatory bank-wide release</strong>
                    <div className="text-muted text-sm">
                      This sends only this specific circular / RBI item to every active user in the bank. It does not grant access to all FMS records.
                    </div>
                  </div>
                )}
                {distributionForm.target_type === 'USER' && (
                  <div className="form-group">
                    <label>User<RequiredMark /></label>
                    <select value={distributionForm.target_user_id} onChange={(event) => setDistributionForm((current) => ({ ...current, target_user_id: event.target.value }))} required>
                      <option value="">Select user</option>
                      {userOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.role?.name})</option>)}
                    </select>
                  </div>
                )}
                {distributionForm.target_type === 'DEPARTMENT' && (
                  <div className="form-group">
                    <label>Department<RequiredMark /></label>
                    <select value={distributionForm.target_department_master_id} onChange={(event) => setDistributionForm((current) => ({ ...current, target_department_master_id: event.target.value }))} required>
                      <option value="">Select department</option>
                      {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.path_key}</option>)}
                    </select>
                  </div>
                )}
                {distributionForm.target_type === 'BRANCH' && (
                  <div className="form-group">
                    <label>Branch<RequiredMark /></label>
                    <select value={distributionForm.target_branch_id} onChange={(event) => setDistributionForm((current) => ({ ...current, target_branch_id: event.target.value }))} required>
                      <option value="">Select branch</option>
                      {branchOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>)}
                    </select>
                  </div>
                )}
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Instruction Note<RequiredMark /></label>
                  <textarea value={distributionForm.message} onChange={(event) => setDistributionForm((current) => ({ ...current, message: event.target.value }))} style={{ minHeight: '82px' }} placeholder={distributionForm.target_type === 'BANK_WIDE' ? 'Explain what every bank user must read, acknowledge, or complete for this mandatory item.' : 'Explain what the next authority must do with this record.'} required />
                </div>
                {distributionForm.target_type !== 'BANK_WIDE' && (
                  <label className="fms-checkbox fms-circular-checkbox" style={{ gridColumn: '1 / -1' }}>
                    <input type="checkbox" checked={distributionForm.allow_redistribution} onChange={(event) => setDistributionForm((current) => ({ ...current, allow_redistribution: event.target.checked }))} />
                    <span>Allow this recipient to forward the circular further down the hierarchy</span>
                  </label>
                )}
              </div>
              <div className="fms-modal-actions fms-modal-form-actions">
                <button type="button" className="btn btn-outline" onClick={closeDistributionModal} disabled={saving}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {distributionForm.target_type === 'BANK_WIDE' ? 'Release Mandatory Circular' : 'Release Circular'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {(showLibraryWorkbench || showApprovalWorkbench) && (
        <div className="fms-desk-switcher">
          {showLibraryWorkbench ? (
            <>
              <button type="button" className={`fms-desk-btn ${libraryDesk === 'tree' ? 'is-active' : ''}`} onClick={() => setLibraryDesk('tree')}>Folder Explorer</button>
              <button type="button" className={`fms-desk-btn ${libraryDesk === 'standards' ? 'is-active' : ''}`} onClick={() => setLibraryDesk('standards')}>Library Standards</button>
              <button type="button" className={`fms-desk-btn ${libraryDesk === 'departments' ? 'is-active' : ''}`} onClick={() => setLibraryDesk('departments')}>Bank Departments</button>
              <button type="button" className={`fms-desk-btn ${libraryDesk === 'nodes' ? 'is-active' : ''}`} onClick={() => setLibraryDesk('nodes')}>Library Folders</button>
              <button type="button" className={`fms-desk-btn ${libraryDesk === 'permissions' ? 'is-active' : ''}`} onClick={() => setLibraryDesk('permissions')}>Folder Access</button>
            </>
          ) : (
            <>
              <button type="button" className={`fms-desk-btn ${accessDesk === 'requests' ? 'is-active' : ''}`} onClick={() => setAccessDesk('requests')}>Access Requests</button>
              {shouldShowAppendControls && (
                <button type="button" className={`fms-desk-btn ${accessDesk === 'append' ? 'is-active' : ''}`} onClick={() => setAccessDesk('append')}>Branch Sharing</button>
              )}
            </>
          )}
        </div>
      )}
      <div
        className={`fms-policy-strip ${appendFeatureEnabled ? 'enabled' : 'disabled'}`}
        style={{ display: showApprovalWorkbench && shouldShowAppendControls && accessDesk === 'append' ? undefined : 'none' }}
      >
        <strong>{appendPolicy.title || 'Cross-Branch Append Access'}</strong>
        <span>{appendPolicy.summary || 'Branch append policy is not configured yet.'}</span>
      </div>

      <div className={`fms-layout-grid ${showApprovalWorkbench || !showSideColumn ? 'fms-layout-grid-access' : ''}`}>
        {showMainColumn && (
        <div className="fms-main-column">
          {showRegisterWorkbench && (
            canUseFullLibraryExplorer ? (
              <div className="fms-register-layout">
                <div className="card fms-panel">
                  <div className="card-header blue">Library Explorer</div>
                  <div className="card-body">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Open folders in this order</strong>
                        <small>Bank -&gt; Department -&gt; Sub-department -&gt; Branch. Choose a folder here first, then search only inside that scope.</small>
                      </div>
                    </div>
                    <div className="fms-selected-folder">
                      <span>Current folder</span>
                      <strong>{selectedFolderDisplayLabel}</strong>
                    </div>
                    <div className="fms-tree-wrap">
                      {nodeTree.length === 0 ? (
                        <div className="fms-empty-box">No visible library folders are available in your current scope yet.</div>
                      ) : renderLibraryTree(nodeTree)}
                    </div>
                  </div>
                </div>
                <div className="fms-register-hero">
                  <div className="card fms-panel">
                    <div className="card-header blue">How This Library Works</div>
                    <div className="card-body">
                      <div className="fms-guide-grid">
                        {libraryGuideCards.map((item) => (
                          <div key={item.title} className="fms-guide-card">
                            <span>{item.title}</span>
                            <strong>{item.text}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card fms-panel">
                <div className="card-header blue">{hasFullLibraryVisibility ? 'Records Library' : (isViewerOnlyFmsUser ? 'Shared Records Desk' : 'My Records Desk')}</div>
                <div className="card-body">
                  <div className="fms-subtitle-row" style={{ alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <div>
                      <strong>{hasFullLibraryVisibility ? 'Bank-wide records library' : 'Controlled records library'}</strong>
                      <small>{hasFullLibraryVisibility ? 'Search all released records across the bank. Download remains controlled by role.' : 'Search records already released into your user, branch, department, or inherited folder scope.'}</small>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setShowRegisterFolders((current) => !current)}
                    >
                      {showRegisterFolders ? 'Close Folder View' : `Open Folder View${compactVisibleFolders.length ? ` (${compactVisibleFolders.length})` : ''}`}
                    </button>
                  </div>
                  <div className="fms-guide-grid compact" style={{ marginTop: '12px' }}>
                    <div className="fms-guide-card compact">
                      <span>Current Scope</span>
                      <strong>{selectedFolderDisplayLabel}</strong>
                    </div>
                    <div className="fms-guide-card compact">
                      <span>Access</span>
                      <strong>{canLodgeRecords ? 'Upload in owned desk plus library visibility' : (hasFullLibraryVisibility ? 'Bank-wide released library view' : 'Released scope visibility only')}</strong>
                    </div>
                  </div>
                  {showRegisterFolders && (
                    <div className="fms-section-block" style={{ marginTop: '14px' }}>
                      <div className="fms-subtitle-row">
                        <div>
                          <strong>Folder Scope</strong>
                          <small>Use this only when you want to narrow the library view to a specific folder.</small>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                        <button
                          type="button"
                          className={`btn ${filters.owner_node_id ? 'btn-outline' : 'btn-primary'}`}
                          style={{ borderRadius: '999px' }}
                          onClick={() => handleNodeScopeSelect('')}
                        >
                          All Accessible Records
                        </button>
                        {compactVisibleFolders.length === 0 ? (
                          <div className="fms-empty-box" style={{ width: '100%' }}>No visible folders are available in your current scope yet.</div>
                        ) : compactVisibleFolders.map((node) => (
                          <button
                            key={`compact-folder-${node.id}`}
                            type="button"
                            className={`btn ${String(filters.owner_node_id) === String(node.id) ? 'btn-primary' : 'btn-outline'}`}
                            style={{ borderRadius: '999px' }}
                            onClick={() => handleNodeScopeSelect(String(filters.owner_node_id) === String(node.id) ? '' : node.id)}
                          >
                            {formatDepartmentFirstFolderLabel(node, { compact: true })}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
          {showInboxWorkbench && (
            <div className="card fms-panel fms-circular-inbox-panel">
              <div className="card-header blue">Controlled Circular Inbox</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>Head office and bank-level circulars come here first</strong>
                    <small>
                      {hasGrantedInboxOnlyAccess
                        ? 'This user has circular-only access. Mandatory or controlled circulars appear here even without the full FMS library.'
                        : 'Use this inbox for information, acknowledgement, and action-based circulation before you forward anything further down the bank hierarchy.'}
                    </small>
                  </div>
                  {canLodgeRecords && (
                    <div className="fms-action-list" style={{ justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={openCircularComposer}
                      >
                        Upload Circular
                      </button>
                    </div>
                  )}
                </div>
                {showCircularComposer && (
                  <form onSubmit={handleUpload} className="fms-section-block fms-circular-form" style={{ marginBottom: '16px' }}>
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Upload Circular</strong>
                        <small>Use this circular-only desk for RBI instructions, head-office circulars, and mandatory communication items.</small>
                      </div>
                    </div>
                    <div className="form-grid cols-2" style={{ marginTop: '14px' }}>
                      <div className="form-group">
                        <label>Title<RequiredMark /></label>
                        <input
                          type="text"
                          value={uploadForm.title}
                          onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })}
                          placeholder="Example: RBI KYC refresh circular"
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Library Folder<RequiredMark /></label>
                        <select
                          value={uploadForm.owner_node_id}
                          onChange={(event) => setUploadForm({ ...uploadForm, owner_node_id: event.target.value })}
                          required
                        >
                          <option value="">Select folder</option>
                          {circularUploadNodeOptions.map((node) => (
                            <option key={`circular-node-${node.id}`} value={node.id}>
                              {formatUploadFolderOptionLabel(node)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Record Classification<RequiredMark /></label>
                        <select
                          value={uploadForm.classification}
                          onChange={(event) => setUploadForm({ ...uploadForm, classification: event.target.value })}
                        >
                          {classificationMasterOptions.map((item) => (
                            <option key={item.value} value={item.value}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Register Placement<RequiredMark /></label>
                        <select
                          value={uploadForm.visibility_mode}
                          onChange={(event) => setUploadForm({ ...uploadForm, visibility_mode: event.target.value })}
                        >
                          <option value="ACTIVE">Visible in Register</option>
                          <option value="BACKUP_ONLY">Backup / Hidden Until Release</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>{intakeFieldLabel('document_reference', 'Circular Number')}<RequiredMark /></label>
                        <input
                          type="text"
                          value={uploadForm.document_reference}
                          onChange={(event) => setUploadForm({ ...uploadForm, document_reference: event.target.value })}
                          placeholder={intakeFieldPlaceholder('document_reference', 'Circular Number')}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Banking Desk</label>
                        <input type="text" value="Circulars" readOnly />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Circular Instruction / Note</label>
                        <textarea
                          value={uploadForm.notes}
                          onChange={(event) => setUploadForm({ ...uploadForm, notes: event.target.value })}
                          style={{ minHeight: '96px' }}
                          placeholder="Explain what the circular is about and what the next release/distribution step should be."
                        />
                      </div>
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>File<RequiredMark /></label>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                          onChange={(event) => setUploadFile(event.target.files?.[0] || null)}
                          required={!uploadFile}
                        />
                      </div>
                    </div>
                    <div className="fms-action-list" style={{ justifyContent: 'flex-end', marginTop: '16px' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setShowCircularComposer(false);
                          setUploadFile(null);
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={saving || !circularUploadNodeOptions.length}
                      >
                        {saving ? 'Uploading Circular...' : 'Upload Circular'}
                      </button>
                    </div>
                  </form>
                )}
                {canManageLibrary && circularDocuments.length > 0 && (
                  <div className="fms-grant-list" style={{ marginBottom: '16px' }}>
                    {circularDocuments.map((documentItem) => (
                      <div key={`circular-document-${documentItem.id}`} className="fms-grant-card fms-circular-inbox-card" style={{ alignItems: 'stretch' }}>
                        <div style={{ flex: 1 }}>
                          <strong>{documentItem.title || 'Circular'}</strong>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {documentItem.document_reference || documentItem.file_name || 'No circular number'} - {documentItem.created_at ? formatDateTime(documentItem.created_at) : 'Recent upload'}
                            </div>
                          <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                            {documentItem.branch?.branch_name || documentItem.owner_node?.name || 'Head Office'} - {recordTypeLabelMap[documentItem.document_type] || documentItem.document_type || 'Circular'}
                          </div>
                        </div>
                        <div className="fms-action-list" style={{ minWidth: '220px', alignItems: 'flex-end' }}>
                          <span className="fms-share-pill">{documentItem.viewer_access_level === 'DOWNLOAD' ? 'VIEW + DOWNLOAD' : 'VIEW'}</span>
                          {canManageLibrary && (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={(event) => openDistributionModalForDocument(event, documentItem)}
                            >
                              Release Circular
                            </button>
                          )}
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocumentPage(documentItem.id)}>View Circular</button>
                          {documentItem.can_download && (
                            <button type="button" className="btn btn-primary btn-sm" onClick={() => downloadDocument(documentItem)}>
                              Download
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                  <div className="fms-grant-list">
                  {visibleCircularInboxItems.length === 0 && (!canManageLibrary || circularDocuments.length === 0) ? (
                    <div className="fms-empty-box">
                      <strong>No active circulars are assigned to your current user, branch, or department scope yet.</strong>
                      {canLodgeRecords ? (
                        <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                          Upload the circular first, then release it bank-wide, department-wise, branch-wise, or to a specific user from the access flow.
                        </div>
                      ) : null}
                    </div>
                  ) : visibleCircularInboxItems.map((item) => (
                    <div key={`distribution-inbox-${item.id}`} className="fms-grant-card fms-circular-inbox-card" style={{ alignItems: 'stretch' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{item.distribution?.title || item.document?.title || 'Controlled circular'}</strong>
                        {showOperatorCircularCards ? (
                          <>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {item.is_bank_wide_mandatory ? 'Mandatory bank-wide release' : (distributionInstructionLabelMap[item.distribution?.instruction_type] || item.distribution?.instruction_type)} - {accessLevelLabel[item.distribution?.access_level] || item.distribution?.access_level || 'View Only'} - Targeted to {item.target_label}
                            </div>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {item.distribution?.message || 'No additional instruction note was attached.'}
                            </div>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {item.document?.title || 'Document'} - {item.document?.document_reference || item.document?.file_name || 'No reference'} - {item.distribution?.due_at ? `Due ${formatDateTime(item.distribution.due_at)}` : 'No due date'}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {item.document?.document_reference || item.document?.file_name || 'No reference'}{item.distribution?.due_at ? ` - Due ${formatDateTime(item.distribution.due_at)}` : ''}
                            </div>
                          </>
                        )}
                      </div>
                      <div className="fms-action-list" style={{ minWidth: '220px', alignItems: 'flex-end' }}>
                        {showOperatorCircularCards ? <span className="fms-share-pill">{item.status}</span> : null}
                        {isBankAdminRole ? (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => item.document?.id && openDocumentPage(item.document.id)}>View Circular</button>
                        ) : null}
                        {(item.document?.can_download || item.document?.viewer_access_level === 'DOWNLOAD' || item.distribution?.access_level === 'DOWNLOAD') && (
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => item.document && downloadDocument(item.document, 'attachment')}
                          >
                            Download
                          </button>
                        )}
                        {isBankAdminRole && item.status === 'PENDING' && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleDistributionRecipientAction(item.id, 'acknowledge')} disabled={saving}>Acknowledge</button>
                        )}
                        {isBankAdminRole && item.status !== 'COMPLETED' && item.distribution?.instruction_type === 'ACTION' && (
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleDistributionRecipientAction(item.id, 'complete')} disabled={saving}>Mark Action Done</button>
                        )}
                        {isBankAdminRole && item.can_forward && item.document?.id && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={(event) => prepareForwardDistribution(event, item, item.document)}
                          >
                            Forward Downward
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {showInboxWorkbench && canGrantRecordAccess && mandatoryDistributions.length > 0 && (
            <div className="card fms-panel">
              <div className="card-header blue">Mandatory Circular Monitoring</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>Track who has not opened, acknowledged, or completed each mandatory bank-wide item</strong>
                    <small>This is item-specific circulation control. It does not grant blanket FMS access beyond the released record itself.</small>
                  </div>
                </div>
                <div className="fms-grant-list">
                  {mandatoryDistributions.map((distribution) => (
                    <div key={`mandatory-monitor-${distribution.id}`} className="fms-grant-card" style={{ alignItems: 'stretch' }}>
                      <div style={{ flex: 1 }}>
                        <strong>{distribution.title}</strong>
                        <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                          {distribution.document?.title || 'Record'} - {distribution.document?.document_reference || distribution.document?.file_name || 'No reference'} - {distribution.due_at ? `Due ${formatDateTime(distribution.due_at)}` : 'No due date'}
                        </div>
                        <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                          Unread: {distribution.recipient_summary?.unread || 0} | Acknowledged: {distribution.recipient_summary?.acknowledged || 0} | Completed: {distribution.recipient_summary?.completed || 0}
                        </div>
                        {distribution.pending_recipients?.length > 0 && (
                          <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                            Not opened / pending: {distribution.pending_recipients.map((recipient) => recipient.target_user?.name || recipient.target_label).join(' | ')}
                          </div>
                        )}
                        {distribution.acknowledged_recipients?.length > 0 && (
                          <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                            Acknowledged: {distribution.acknowledged_recipients.map((recipient) => recipient.target_user?.name || recipient.target_label).join(' | ')}
                          </div>
                        )}
                        {distribution.completed_recipients?.length > 0 && (
                          <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                            Completed: {distribution.completed_recipients.map((recipient) => recipient.target_user?.name || recipient.target_label).join(' | ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {showAdminWorkbench && (
            <div className="card fms-panel">
              <div className="card-header blue">How Library Administration Works</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>Use one administration desk, then open the task you need</strong>
                    <small>Normal users work from the Records Library. Bank administrators should work in this order: assign the banking FMS role, set bank and department hierarchy, map branch visibility, handle intake, then let indexed records flow into searchable library use.</small>
                  </div>
                </div>
                <div className="fms-guide-grid">
                  {adminDeskCards.length === 0 ? (
                    <div className="fms-empty-box">No records-administration tools are assigned to your current role.</div>
                  ) : adminDeskCards.map((item) => (
                    <button key={item.key} type="button" className="fms-admin-card" onClick={() => navigate(item.path)}>
                      <span>{item.title}</span>
                      <strong>{item.text}</strong>
                      <small>Open</small>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="card fms-panel" style={{ display: showLibraryWorkbench ? undefined : 'none' }}>
            <div className="card-header blue">Folder Structure Preview</div>
            <div className="card-body">
              <div className="fms-subtitle-row">
                <div>
                  <strong>Bank department and branch folder structure</strong>
                  <small>Build the library exactly the way the bank works: department first, then sub-department, then branch folders below it.</small>
                </div>
              </div>
              <div className="fms-tree-wrap">
                {departmentTree.length === 0 ? (
                  <div className="fms-empty-box">No folder structure is configured yet.</div>
                ) : renderLibraryTree(
                  departmentTree.map((item) => ({
                    ...item,
                    node_type: item.department_type,
                    children: item.children
                  })),
                  0,
                  { activeId: null, onSelect: null, selectable: false }
                )}
              </div>
            </div>
          </div>

          {canManageLibrary && (
            <div className="card fms-panel" style={{ display: showLibraryWorkbench && libraryDesk === 'standards' ? undefined : 'none' }}>
              <div className="card-header blue">Bank Library Standards</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>Control the bank's intake language and record masters</strong>
                    <small>These values drive the intake desk and the records library so the bank works from its own record types, desks, and sensitivity labels.</small>
                  </div>
                </div>

                <form onSubmit={handleSaveLibraryStandards}>
                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Record Sensitivity Labels</strong>
                        <small>Keep the secure internal codes, but rename the operator-facing labels for this bank if needed.</small>
                      </div>
                    </div>
                    <div className="form-grid cols-2">
                      {libraryStandardsForm.classification_master.map((item, index) => (
                        <div key={item.value} className="form-group">
                          <label>{item.value}</label>
                          <input
                            type="text"
                            value={item.label}
                            onChange={(event) => setLibraryStandardsForm((current) => ({
                              ...current,
                              classification_master: current.classification_master.map((entry, entryIndex) => (
                                entryIndex === index ? { ...entry, label: event.target.value } : entry
                              ))
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Record Types</strong>
                        <small>These appear in Record Intake and search filters.</small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setLibraryStandardsForm((current) => ({
                          ...current,
                          record_type_master: [...current.record_type_master, { value: '', label: '' }]
                        }))}
                      >
                        Add Record Type
                      </button>
                    </div>
                    <div className="form-grid cols-2">
                      {libraryStandardsForm.record_type_master.map((item, index) => (
                        <React.Fragment key={`record-type-${index}`}>
                          <div className="form-group">
                            <label>Type Code</label>
                            <input
                              type="text"
                              value={item.value}
                              onChange={(event) => setLibraryStandardsForm((current) => ({
                                ...current,
                                record_type_master: current.record_type_master.map((entry, entryIndex) => (
                                  entryIndex === index ? { ...entry, value: event.target.value.toUpperCase().replace(/\s+/g, '_') } : entry
                                ))
                              }))}
                            />
                          </div>
                          <div className="form-group">
                            <label>Type Label</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                              <input
                                type="text"
                                value={item.label}
                                onChange={(event) => setLibraryStandardsForm((current) => ({
                                  ...current,
                                  record_type_master: current.record_type_master.map((entry, entryIndex) => (
                                    entryIndex === index ? { ...entry, label: event.target.value } : entry
                                  ))
                                }))}
                              />
                              {libraryStandardsForm.record_type_master.length > 1 && (
                                <button
                                  type="button"
                                  className="btn btn-outline btn-sm"
                                  onClick={() => setLibraryStandardsForm((current) => ({
                                    ...current,
                                    record_type_master: current.record_type_master.filter((_, entryIndex) => entryIndex !== index)
                                  }))}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Banking Desks</strong>
                        <small>These help classify records by desk like Loans, KYC, Treasury, Audit, or any bank-specific business unit.</small>
                      </div>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => setLibraryStandardsForm((current) => ({
                          ...current,
                          record_desk_master: [...current.record_desk_master, '']
                        }))}
                      >
                        Add Desk
                      </button>
                    </div>
                    <div className="form-grid cols-2">
                      {libraryStandardsForm.record_desk_master.map((desk, index) => (
                        <div key={`desk-${index}`} className="form-group">
                          <label>Desk Name</label>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                              type="text"
                              value={desk}
                              onChange={(event) => setLibraryStandardsForm((current) => ({
                                ...current,
                                record_desk_master: current.record_desk_master.map((entry, entryIndex) => (
                                  entryIndex === index ? event.target.value : entry
                                ))
                              }))}
                            />
                            {libraryStandardsForm.record_desk_master.length > 1 && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => setLibraryStandardsForm((current) => ({
                                  ...current,
                                  record_desk_master: current.record_desk_master.filter((_, entryIndex) => entryIndex !== index)
                                }))}
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={saving}>Save Library Standards</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {canManageLibrary && (
            <div className="card fms-panel" style={{ display: showLibraryWorkbench && libraryDesk === 'departments' ? undefined : 'none' }}>
              <div className="card-header blue">Bank Department Setup</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>{departmentOptions.length} department record(s)</strong>
                    <small>Create the business hierarchy the bank will use for its digital library: Bank -&gt; Department -&gt; Sub-department -&gt; Branch.</small>
                  </div>
                </div>
                <div className="fms-guide-grid" style={{ marginBottom: '14px' }}>
                  {hierarchySummaryCards.map((item) => (
                    <div key={item.title} className="fms-guide-card">
                      <span>{item.title}</span>
                      <strong>{item.value}</strong>
                      <small>{item.note}</small>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleCreateDepartment}>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Parent Department</label>
                      <select value={departmentForm.parent_department_id} onChange={(event) => setDepartmentForm({ ...departmentForm, parent_department_id: event.target.value })}>
                        <option value="">Top Level Department</option>
                        {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.path_key}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Linked DMS Department</label>
                      <select value={departmentForm.legacy_department_id} onChange={(event) => setDepartmentForm({ ...departmentForm, legacy_department_id: event.target.value })}>
                        <option value="">Not linked</option>
                        {legacyDepartmentOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Name<RequiredMark /></label>
                      <input type="text" value={departmentForm.name} onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Code<RequiredMark /></label>
                      <input type="text" value={departmentForm.code} onChange={(event) => setDepartmentForm({ ...departmentForm, code: event.target.value.toUpperCase() })} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Branch Visibility</label>
                      <select
                        multiple
                        value={departmentForm.branch_ids}
                        onChange={(event) => setDepartmentForm({
                          ...departmentForm,
                          branch_ids: Array.from(event.target.selectedOptions).map((option) => option.value)
                        })}
                        style={{ minHeight: '120px' }}
                      >
                        {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name} ({branch.branch_code})</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={saving}>Save Department Structure</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {canManageLibrary && (
            <div className="card fms-panel" style={{ display: showLibraryWorkbench && libraryDesk === 'nodes' ? undefined : 'none' }}>
              <div className="card-header blue">{isSuperAdmin ? 'Bank Folder Mapping' : 'Library Folder Setup'}</div>
              <div className="card-body">
                <div className="fms-subtitle-row" style={{ marginBottom: '14px' }}>
                  <div>
                    <strong>Department folders become the bank&apos;s future media collectors</strong>
                    <small>Create visible folders under the correct bank, department, sub-department, and branch path so uploaded records stay searchable and controlled later.</small>
                  </div>
                </div>
                <form onSubmit={handleCreateNode}>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Parent Folder</label>
                      <select value={nodeForm.parent_id} onChange={(event) => setNodeForm({ ...nodeForm, parent_id: event.target.value })}>
                        <option value="">Top Level (HO)</option>
                        {nodeOptions.map((node) => <option key={node.id} value={node.id}>{node.path_key}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Folder Level<RequiredMark /></label>
                      <select value={nodeForm.node_type} onChange={(event) => setNodeForm({ ...nodeForm, node_type: event.target.value })}>
                        <option value="HO">HO</option>
                        <option value="DEPARTMENT">Department</option>
                        <option value="SUB_DEPARTMENT">Sub-Department</option>
                        <option value="BANK">Bank</option>
                        <option value="MEDIA_FOLDER">Media Folder</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Name<RequiredMark /></label>
                      <input type="text" value={nodeForm.name} onChange={(event) => setNodeForm({ ...nodeForm, name: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Code<RequiredMark /></label>
                      <input type="text" value={nodeForm.code} onChange={(event) => setNodeForm({ ...nodeForm, code: event.target.value.toUpperCase() })} required />
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Department Link</label>
                      <select value={nodeForm.department_master_id || ''} onChange={(event) => setNodeForm({ ...nodeForm, department_master_id: event.target.value })}>
                        <option value="">No department link</option>
                        {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.path_key}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>Branch Link</label>
                      <select value={nodeForm.branch_id} onChange={(event) => setNodeForm({ ...nodeForm, branch_id: event.target.value })}>
                        <option value="">No branch mapping</option>
                        {branchOptions.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_name} ({branch.branch_code})</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <small className="text-muted text-sm">Use <strong>Media Folder</strong> when the bank wants a collector folder under a branch or department for future searchable usage of media files and direct uploads.</small>
                    </div>
                  </div>
                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={saving}>Create Library Folder</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {canGrantRecordAccess && selectedNode && (
            <div className="card fms-panel" style={{ display: showLibraryWorkbench && libraryDesk === 'permissions' ? undefined : 'none' }}>
              <div className="card-header blue">Access Rules by Library Folder</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>{selectedFolderDisplayLabel}</strong>
                    <small>Grant access once at department or branch folder level so all descendant folders inherit it.</small>
                  </div>
                </div>

                <div className="fms-grant-list" style={{ marginBottom: '16px' }}>
                  {nodeGrants.length === 0 ? (
                    <div className="fms-empty-box">No inherited access grant is active on this folder right now.</div>
                  ) : nodeGrants.map((grant) => (
                    <div key={grant.id} className="fms-grant-card">
                      <div>
                        <strong>{grant.grant_type === 'USER'
                          ? grant.user?.name
                          : grant.grant_type === 'BRANCH'
                            ? grant.branch?.branch_name
                            : grant.grant_type === 'DEPARTMENT'
                              ? grant.department_master?.name
                              : 'Whole Bank'}</strong>
                        <div className="text-muted text-sm">
                          {accessLevelLabel[grant.access_level] || grant.access_level} - {grant.include_descendants ? 'Descendants included' : 'This folder only'}
                        </div>
                      </div>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRevokeNodeGrant(grant.id)} disabled={saving}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleNodeGrant} className="fms-inline-form">
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Share With<RequiredMark /></label>
                      <select value={nodeGrantForm.grant_type} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, grant_type: event.target.value, user_id: '', branch_id: '', department_master_id: '' })}>
                        <option value="BRANCH">Entire Branch</option>
                        <option value="DEPARTMENT">Whole Department</option>
                        <option value="USER">Specific User</option>
                        <option value="GLOBAL">Whole Bank</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Permission<RequiredMark /></label>
                      <select value={nodeGrantForm.access_level} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, access_level: event.target.value })}>
                        <option value="VIEW">View Only</option>
                        <option value="DOWNLOAD">View + Download</option>
                      </select>
                    </div>
                    {nodeGrantForm.grant_type === 'USER' ? (
                      <div className="form-group">
                        <label>User<RequiredMark /></label>
                        <select value={nodeGrantForm.user_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, user_id: event.target.value })} required>
                          <option value="">Select user</option>
                          {userOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.role?.name})</option>)}
                        </select>
                      </div>
                    ) : nodeGrantForm.grant_type === 'DEPARTMENT' ? (
                      <div className="form-group">
                        <label>Department<RequiredMark /></label>
                        <select value={nodeGrantForm.department_master_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, department_master_id: event.target.value })} required>
                          <option value="">Select department</option>
                          {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.path_key}</option>)}
                        </select>
                      </div>
                    ) : nodeGrantForm.grant_type === 'GLOBAL' ? (
                      <div className="form-group">
                        <label>Scope</label>
                        <input type="text" value="Whole bank / HO scope" readOnly />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Branch<RequiredMark /></label>
                        <select value={nodeGrantForm.branch_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, branch_id: event.target.value })} required>
                          <option value="">Select branch</option>
                          {branchOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>)}
                        </select>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Applies To</label>
                      <select value={nodeGrantForm.include_descendants ? 'YES' : 'NO'} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, include_descendants: event.target.value === 'YES' })}>
                        <option value="YES">This folder + descendants</option>
                        <option value="NO">This folder only</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Expiry</label>
                      <input type="datetime-local" value={nodeGrantForm.expires_at} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, expires_at: event.target.value })} />
                    </div>
                  </div>
                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={saving}>Grant Inherited Access</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div
            className="card fms-panel"
            style={{ display: showRegisterWorkbench && showAdvancedFilters ? undefined : 'none' }}
          >
            <div className="card-header blue">Advanced Library Filters</div>
            <div className="card-body">
              <div className="fms-subtitle-row" style={{ marginBottom: '16px' }}>
                <div>
                  <strong>Use this only when the header search is not enough</strong>
                  <small>Header search should stay your main way to find records. Open these filters only when you need to narrow by department, branch, date, or record sensitivity.</small>
                </div>
              </div>
              <div className="fms-guide-grid" style={{ marginBottom: '14px' }}>
                {searchExamples.map((item) => (
                  <div key={item} className="fms-guide-card">
                    <span>Search Example</span>
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
              <form onSubmit={handleSearch}>
                <div className="form-grid cols-2">
                  <div className="form-group">
                    <label>Search Value</label>
                    <input type="text" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="Account no, CIF, PAN, Aadhaar, document ref, user name..." />
                  </div>
                  <div className="form-group">
                    <label>Search By</label>
                    <select value={filters.search_by} onChange={(event) => setFilters({ ...filters, search_by: event.target.value })}>
                      {fmsSearchModeOptions.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Department</label>
                    <select value={filters.department_master_id} onChange={(event) => setFilters({ ...filters, department_master_id: event.target.value })}>
                      <option value="">All departments</option>
                      {departmentOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.path_key}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Branch</label>
                    <select value={filters.branch_id} onChange={(event) => setFilters({ ...filters, branch_id: event.target.value })}>
                      <option value="">All branches</option>
                      {branchOptions.map((item) => (
                        <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Record Type</label>
                    <input type="text" value={filters.document_type} onChange={(event) => setFilters({ ...filters, document_type: event.target.value })} placeholder="KYC, sanction letter, statement" />
                  </div>
                  <div className="form-group">
                    <label>Banking Desk</label>
                    <input type="text" value={filters.document_category} onChange={(event) => setFilters({ ...filters, document_category: event.target.value })} placeholder="Retail loan, treasury, audit..." />
                  </div>
                  <div className="form-group">
                    <label>Uploaded By</label>
                    <input type="text" value={filters.uploaded_by} onChange={(event) => setFilters({ ...filters, uploaded_by: event.target.value })} placeholder="Officer or admin name" />
                  </div>
                  <div className="form-group">
                    <label>Record Sensitivity</label>
                    <select value={filters.classification} onChange={(event) => setFilters({ ...filters, classification: event.target.value })}>
                      <option value="">All</option>
                      {classificationMasterOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </div>
                  {isAdminOperator && (
                    <div className="form-group">
                      <label>Register Placement</label>
                      <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                        <option value="ACTIVE">Visible Register</option>
                        <option value="BACKUP_ONLY">Backup Only</option>
                        <option value="ALL">All</option>
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label>From Date</label>
                    <input type="date" value={filters.from_date} onChange={(event) => setFilters({ ...filters, from_date: event.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>To Date</label>
                    <input type="date" value={filters.to_date} onChange={(event) => setFilters({ ...filters, to_date: event.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Version View</label>
                    <select value={filters.include_history ? 'ALL' : 'LATEST'} onChange={(event) => setFilters({ ...filters, include_history: event.target.value === 'ALL' })}>
                      <option value="LATEST">Latest Version Only</option>
                      <option value="ALL">Include Older Versions</option>
                    </select>
                  </div>
                </div>

                <div className="action-row">
                  <button type="submit" className="btn btn-primary" disabled={loading}>Apply Filters</button>
                  <button type="button" className="btn btn-outline" onClick={handleResetFilters}>Reset</button>
                  <button type="button" className="btn btn-outline" onClick={() => setShowAdvancedFilters(false)}>Close</button>
                </div>
              </form>
            </div>
          </div>

          <div className="card fms-panel" style={{ display: showRegisterWorkbench ? undefined : 'none' }}>
            <div className="card-header blue">{isViewerOnlyFmsUser ? 'Shared Records' : 'Latest Visible Records'}</div>
            <div className="card-body">
              <div className="fms-subtitle-row">
                <div>
                  <strong>{documents.length} record(s) in your accessible register</strong>
                  <small>{isAdminOperator
                    ? 'This register shows files placed in visible bank folders, plus any direct or inherited access shared into your current scope.'
                    : (isViewerOnlyFmsUser
                      ? 'You see records already released to your user, branch, department, or Head Office scope. Folder selection only narrows the view further.'
                      : 'You see records released to your valid bank scope, directly shared to you, or created by you. Folder selection only narrows the view further.')}
                  </small>
                </div>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <div className="fms-selected-folder compact">
                    <span>Current folder</span>
                  <strong>{selectedFolderDisplayLabel}</strong>
                  </div>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowAdvancedFilters((current) => !current)}
                  >
                    {showAdvancedFilters ? 'Hide Advanced Filters' : 'Open Advanced Filters'}
                  </button>
                </div>
              </div>
              <div className="table-wrap fms-register-table">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Version</th>
                      <th>Classification</th>
                      <th>Category</th>
                      <th>Visibility</th>
                      <th>Type</th>
                      <th>Reference</th>
                      <th>Department</th>
                      <th>Library Folder</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px' }}>Loading FMS register...</td></tr>
                    ) : libraryDocuments.length === 0 ? (
                      <tr>
                        <td colSpan="10" style={{ textAlign: 'center', padding: '24px' }}>
                          <div>No library records are visible in your current scope yet.</div>
                          {filters.owner_node_id ? (
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              style={{ marginTop: '12px' }}
                              onClick={() => handleNodeScopeSelect('')}
                            >
                              Back To All Accessible Records
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ) : libraryDocuments.map((documentItem) => (
                      <React.Fragment key={documentItem.id}>
                        <tr>
                          <td>
                            <strong>{documentItem.title}</strong>
                            <div className="text-muted text-sm">{documentItem.file_name}</div>
                          </td>
                          <td>
                            <strong>v{documentItem.version_number || 1}</strong>
                            <div className="text-muted text-sm">{documentItem.is_latest_version ? 'Latest' : 'History'}</div>
                          </td>
                          <td>
                            <span className={`badge ${['CONFIDENTIAL', 'RESTRICTED'].includes(documentItem.classification) ? 'badge-amber' : 'badge-blue'}`}>
                              {documentItem.classification}
                            </span>
                          </td>
                          <td>{documentItem.document_category || '-'}</td>
                          <td>
                            <span className={`badge ${documentItem.status === 'BACKUP_ONLY' ? 'badge-gray' : 'badge-green'}`}>
                              {documentItem.visibility_label || documentItem.status}
                            </span>
                          </td>
                          <td>{documentItem.document_type}</td>
                          <td>{documentItem.document_reference || documentItem.customer_reference}</td>
                          <td>{documentItem.department_master?.name || '-'}</td>
                          <td>{formatLibraryFolderLabel(documentItem.owner_node)}</td>
                          <td>
                            <div className="fms-action-list fms-register-actions">
                              {isBankAdminRole ? (
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocumentPage(documentItem.id)}>{canViewSensitiveFmsFiles ? 'Details' : 'Summary'}</button>
                              ) : null}
                              {documentItem.can_download ? (
                                <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadDocument(documentItem, 'attachment')}>Download</button>
                              ) : (
                                <button type="button" className="btn btn-outline btn-sm" onClick={(event) => handleRequestDownloadFromList(event, documentItem)}>Request Download</button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {inlinePromptDocumentId === documentItem.id && (
                          <tr className="fms-inline-prompt-row">
                            <td colSpan="10">
                              <div className="fms-inline-context-prompt">
                                <div className="fms-inline-context-eyebrow">Action Guidance</div>
                                <div className="fms-inline-context-title">Request download approval</div>
                                <div className="fms-inline-context-copy">
                                  Download is controlled for this banking role. Open the request desk only when you are ready to raise the approval request for this record.
                                </div>
                                <div className="fms-inline-context-actions">
                                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setInlinePromptDocumentId(null)}>Later</button>
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={() => {
                                      setInlinePromptDocumentId(null);
                                      scrollToRecordDetail('request');
                                    }}
                                  >
                                    Open Request Desk
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="fms-mobile-record-list">
                {loading ? (
                  <div className="fms-empty-box">Loading FMS register...</div>
                ) : libraryDocuments.length === 0 ? (
                  <div className="fms-empty-box">No library records are visible in your current scope yet.</div>
                ) : libraryDocuments.map((documentItem) => (
                  <div key={`mobile-${documentItem.id}`} className="fms-mobile-record-card">
                    <div className="fms-mobile-record-head">
                      <div>
                        <strong>{documentItem.title}</strong>
                        <div className="text-muted text-sm">{documentItem.file_name}</div>
                      </div>
                      <span className={`badge ${documentItem.status === 'BACKUP_ONLY' ? 'badge-gray' : 'badge-green'}`}>
                        {documentItem.visibility_label || documentItem.status}
                      </span>
                    </div>
                    <div className="fms-mobile-record-grid">
                      <div><span>Version</span><strong>v{documentItem.version_number || 1}</strong></div>
                      <div><span>Type</span><strong>{documentItem.document_type}</strong></div>
                      <div><span>Reference</span><strong>{documentItem.document_reference || documentItem.customer_reference || '-'}</strong></div>
                      <div><span>Department</span><strong>{documentItem.department_master?.name || '-'}</strong></div>
                      <div><span>Folder</span><strong>{formatLibraryFolderLabel(documentItem.owner_node)}</strong></div>
                      <div><span>Classification</span><strong>{documentItem.classification}</strong></div>
                    </div>
                    <div className="fms-action-list fms-register-actions">
                      {isBankAdminRole ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocumentPage(documentItem.id)}>{canViewSensitiveFmsFiles ? 'Details' : 'Summary'}</button>
                      ) : null}
                      {documentItem.can_download ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadDocument(documentItem, 'attachment')}>Download</button>
                      ) : (
                        <button type="button" className="btn btn-outline btn-sm" onClick={(event) => handleRequestDownloadFromList(event, documentItem)}>Request Download</button>
                      )}
                    </div>
                    {inlinePromptDocumentId === documentItem.id && (
                      <div className="fms-inline-context-prompt mobile">
                        <div className="fms-inline-context-eyebrow">Action Guidance</div>
                        <div className="fms-inline-context-title">Request download approval</div>
                        <div className="fms-inline-context-copy">
                          Download is controlled for this banking role. Open the request desk only when you are ready to raise the approval request for this record.
                        </div>
                        <div className="fms-inline-context-actions">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => setInlinePromptDocumentId(null)}>Later</button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setInlinePromptDocumentId(null);
                              scrollToRecordDetail('request');
                            }}
                          >
                            Open Request Desk
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {showInlineRecordDetail && (
            <div ref={recordDetailRef} className="card fms-panel">
              <div className="card-header blue">{isBankAdminRole ? 'Record Detail' : 'Request Access'}</div>
              <div className="card-body">
                {isBankAdminRole ? (
                <>
                <div className="fms-detail-grid">
                  <div className="fms-detail-card">
                    <span>Document</span>
                    <strong>{selectedDocumentDetail.title}</strong>
                    <small>{selectedDocumentDetail.file_name}</small>
                  </div>
                  <div className="fms-detail-card">
                    <span>Your Access</span>
                    <strong>{accessLevelLabel[selectedDocumentDetail.viewer_access_level] || selectedDocumentDetail.viewer_access_level || 'View Only'}</strong>
                    <small>{accessViaLabelMap[selectedDocumentDetail.viewer_access_via] || (selectedDocumentDetail.can_download ? 'Download is allowed for you.' : 'You can preview but not download unless admin upgrades access.')}</small>
                  </div>
                  <div className="fms-detail-card">
                    <span>Record Type</span>
                    <strong>{recordTypeLabelMap[selectedDocumentDetail.document_type] || selectedDocumentDetail.document_type}</strong>
                    <small>{classificationLabelMap[selectedDocumentDetail.classification] || selectedDocumentDetail.classification}</small>
                  </div>
                  <div className="fms-detail-card">
                    <span>Reference</span>
                    <strong>{selectedDocumentDetail.document_reference || selectedDocumentDetail.customer_reference || '-'}</strong>
                    <small>{selectedDocumentDetail.cif_reference || selectedDocumentDetail.id_proof_number || selectedDocumentDetail.identity_reference || selectedDocumentDetail.account_reference || 'No extra identity key stored'}</small>
                  </div>
                  {isAdminOperator && (
                    <>
                      <div className="fms-detail-card">
                        <span>Library Folder</span>
                        <strong>{formatLibraryFolderLabel(selectedDocumentDetail.owner_node)}</strong>
                        <small>Library custody folder</small>
                      </div>
                      <div className="fms-detail-card">
                        <span>Visibility</span>
                        <strong>{selectedDocumentDetail.visibility_label || selectedDocumentDetail.status}</strong>
                        <small>{selectedDocumentDetail.status === 'BACKUP_ONLY' ? 'Hidden from normal register until released' : 'Visible in the searchable FMS register'}</small>
                      </div>
                      <div className="fms-detail-card">
                        <span>Published By</span>
                        <strong>{selectedDocumentDetail.published_by?.name || selectedDocumentDetail.uploaded_by?.name || '-'}</strong>
                        <small>{formatDateTime(selectedDocumentDetail.published_at || selectedDocumentDetail.created_at)}</small>
                      </div>
                      <div className="fms-detail-card">
                        <span>Why You Can See This</span>
                        <strong>{accessViaLabelMap[selectedDocumentDetail.viewer_access_via] || 'No active access route'}</strong>
                        <small>{accessViaDetailMap[selectedDocumentDetail.viewer_access_via] || 'If access should be broader, request the required sharing from Records Administration.'}</small>
                      </div>
                      <div className="fms-detail-card">
                        <span>Version Chain</span>
                        <strong>v{selectedDocumentDetail.version_number || 1}</strong>
                        <small>{selectedDocumentDetail.is_latest_version ? 'Current visible version' : 'Older archived version'}</small>
                      </div>
                      <div className="fms-detail-card">
                        <span>Business Scope</span>
                        <strong>{selectedDocumentDetail.department_master?.name || 'No department linked'}</strong>
                        <small>{selectedDocumentDetail.branch?.branch_name || selectedDocumentDetail.owner_node?.branch_id || 'No branch snapshot stored'}</small>
                      </div>
                    </>
                  )}
                </div>

                {(selectedDocumentDetail.version_history || []).length > 0 && (
                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                    <div>
                      <strong>Version History</strong>
                      <small>Latest version stays visible by default. Older versions stay available only when history view is included in search.</small>
                    </div>
                  </div>
                    <div className="fms-version-list">
                      {selectedDocumentDetail.version_history.map((item) => (
                        <button key={item.id} type="button" className={`fms-version-card ${item.id === selectedDocumentDetail.id ? 'is-active' : ''}`} onClick={() => openDocument(item.id)}>
                          <strong>v{item.version_number || 1}</strong>
                          <span>{item.file_name}</span>
                          <small>{item.is_latest_version ? 'Latest' : 'History'} - {formatDateTime(item.created_at)}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                </>
                ) : null}

                <div className="fms-section-block">
                  {isBankAdminRole ? (
                  <>
                  <div className="fms-subtitle-row">
                    <div>
                      <strong>{buildFmsAuditScopeLabel(selectedDocumentDetail)} File Audit Log</strong>
                      <small>Every controlled open and download for this {buildFmsAuditScopeLabel(selectedDocumentDetail)} record is stamped here with bank user, employee ID, and exact time. Concurrent downloads stay as separate audit rows.</small>
                    </div>
                  </div>
                  <div className="fms-empty-box" style={{ marginBottom: '14px' }}>
                    <strong>{buildFmsAuditScopeLabel(selectedDocumentDetail)} Audit Header</strong>
                    <div className="text-muted text-sm">
                      File: {selectedDocumentDetail.title || selectedDocumentDetail.file_name || '-'} | Department Scope: {buildFmsAuditScopeLabel(selectedDocumentDetail)} | Reference: {selectedDocumentDetail.document_reference || selectedDocumentDetail.customer_reference || '-'}
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Performed By</th>
                          <th>Employee ID</th>
                          <th>Date & Time</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedDocumentDetail.audit_logs || []).length === 0 ? (
                          <tr>
                            <td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No FMS audit events have been recorded for this file yet.</td>
                          </tr>
                        ) : (
                          selectedDocumentDetail.audit_logs.map((log) => (
                            <tr key={`fms-audit-${log.id}`}>
                              <td>
                                <span className={`badge ${String(log.action_label || log.action || '').includes('DOWNLOADED') ? 'badge-green' : 'badge-blue'}`}>
                                  {log.action_label || formatFmsAuditAction(log.action)}
                                </span>
                              </td>
                              <td>{log.actor?.name || log.performed_by || '-'}</td>
                              <td>{log.actor?.employee_id || log.metadata?.employee_id || '-'}</td>
                              <td>{formatDateTime(log.timestamp)}</td>
                              <td>{log.remarks || '-'}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  </>
                  ) : null}
                </div>

                {isBankAdminRole && selectedDocumentDetail.status === 'BACKUP_ONLY' && canReleaseBackup && (
                  <div className="fms-empty-box" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center' }}>
                    <div>
                      <strong>Backup-only custody</strong>
                      <div className="text-muted text-sm">This file is stored safely but hidden from the main FMS register until an admin releases it.</div>
                    </div>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => handleActivateDocument(selectedDocumentDetail.id)} disabled={saving}>
                      Release to Register
                    </button>
                  </div>
                )}

                {isBankAdminRole && canSeeGovernancePanels && !selectedDocumentIsCircular && (
                <div className="fms-section-block">
                  <div className="fms-subtitle-row">
                    <div>
                      <strong>Who Can See This Record</strong>
                      <small>Folder ownership, direct sharing, branch sharing, and expiry rules are shown here.</small>
                    </div>
                  </div>
                  <div className="fms-grant-list">
                    <button
                      type="button"
                      className={`fms-grant-card fms-grant-card-button ${selectedAccessCard === 'default-folder' ? 'is-active' : ''}`}
                      onClick={() => setSelectedAccessCard((current) => current === 'default-folder' ? null : 'default-folder')}
                    >
                      <div>
                        <strong>{formatLibraryFolderLabel(selectedDocumentDetail.owner_node) || 'Default library folder'}</strong>
                        <div className="text-muted text-sm">DEFAULT LIBRARY FOLDER - default custody scope</div>
                      </div>
                    </button>
                    {(selectedDocumentDetail.access_grants || []).map((grant) => (
                      <button
                        key={grant.id}
                        type="button"
                        className={`fms-grant-card fms-grant-card-button ${selectedAccessCard === `grant-${grant.id}` ? 'is-active' : ''}`}
                        onClick={() => setSelectedAccessCard((current) => current === `grant-${grant.id}` ? null : `grant-${grant.id}`)}
                      >
                        <div>
                          <strong>{grant.grant_type === 'USER' ? grant.user?.name : grant.branch?.branch_name}</strong>
                          <div className="text-muted text-sm">
                            {grant.access_type} - {accessLevelLabel[grant.access_level] || grant.access_level} - Granted by {grant.granted_by?.name || grant.granted_by_user_id || '-'} - {grant.expires_at ? `Expires ${formatDateTime(grant.expires_at)}` : 'No expiry'}
                          </div>
                        </div>
                        {canRevokeRecordAccess && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="btn btn-danger btn-sm"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRevoke(grant.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                event.stopPropagation();
                                handleRevoke(grant.id);
                              }
                            }}
                          >
                            Revoke
                          </span>
                        )}
                      </button>
                    ))}
                    {(selectedDocumentDetail.access_grants || []).length === 0 && (
                      <div className="fms-empty-box">No explicit access grants exist for this file yet.</div>
                    )}
                  </div>
                  {selectedAccessCard && (
                    <div className="fms-empty-box" style={{ marginTop: '12px' }}>
                      {selectedAccessCard === 'default-folder' ? (
                        <>
                          <strong>Default Folder Visibility</strong>
                          <div className="text-muted text-sm">This record belongs to the shown library folder. Users can see it from this folder only if their user, branch, department, or inherited folder access allows that folder scope.</div>
                        </>
                      ) : (
                        <>
                          <strong>Access Rule Detail</strong>
                          <div className="text-muted text-sm">This is a direct record-sharing rule. It stays active until revoked or until the shown expiry time is reached.</div>
                        </>
                      )}
                    </div>
                  )}
                </div>
                )}

                {canSeeGovernancePanels && !selectedDocumentIsCircular && (selectedDocumentDetail.node_grants || []).length > 0 && (
                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Inherited Folder Access</strong>
                        <small>These rules open this record through the folder hierarchy, not through one-off sharing only.</small>
                      </div>
                    </div>
                    <div className="fms-grant-list">
                      {selectedDocumentDetail.node_grants.map((grant) => (
                        <div key={grant.id} className="fms-grant-card">
                          <div>
                            <strong>{grant.grant_type === 'USER' ? grant.user?.name : grant.branch?.branch_name}</strong>
                            <div className="text-muted text-sm">
                              Inherited folder access - {accessLevelLabel[grant.access_level] || grant.access_level} - {grant.include_descendants ? 'Includes descendants' : 'This folder only'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(canCreateDistribution || documentDistributions.length > 0 || selectedDocumentInboxItems.length > 0) && (
                  <div className="fms-section-block">
                    <div className="fms-subtitle-row">
                      <div>
                        <strong>Circular Release & Tracking</strong>
                        <small>Use this desk to release one circular to the next banking authority or to a bank-wide mandatory audience with acknowledgement and action tracking.</small>
                      </div>
                    </div>

                    {selectedDocumentInboxItems.length > 0 && showOperatorCircularCards && (
                      <div className="fms-empty-box" style={{ marginBottom: '14px' }}>
                        <strong>Your current instruction trail for this record</strong>
                        <div className="text-muted text-sm">
                          {selectedDocumentInboxItems.map((item) => `${distributionInstructionLabelMap[item.distribution?.instruction_type] || item.distribution?.instruction_type} - ${item.status}`).join(' | ')}
                        </div>
                      </div>
                    )}

                    <div className="fms-grant-list">
                      {documentDistributions.length === 0 ? (
                        <div className="fms-empty-box">No controlled distribution trail exists for this record yet.</div>
                      ) : documentDistributions.map((distribution) => (
                        <div key={`distribution-${distribution.id}`} className="fms-grant-card" style={{ alignItems: 'stretch' }}>
                          <div style={{ flex: 1 }}>
                            <strong>{distribution.title}</strong>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>
                              {distributionInstructionLabelMap[distribution.instruction_type] || distribution.instruction_type} - {accessLevelLabel[distribution.access_level] || distribution.access_level} - Sent by {distribution.created_by?.name || 'System'} - {distribution.due_at ? `Due ${formatDateTime(distribution.due_at)}` : 'No due date'}
                            </div>
                            <div className="text-muted text-sm" style={{ marginTop: '4px' }}>{distribution.message || 'No additional note.'}</div>
                            <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                              {distribution.is_bank_wide_mandatory ? `Mandatory item - unread ${distribution.recipient_summary?.unread || 0} - acknowledged ${distribution.recipient_summary?.acknowledged || 0} - completed ${distribution.recipient_summary?.completed || 0}` : null}
                            </div>
                            <div className="text-muted text-sm" style={{ marginTop: '6px' }}>
                              {distribution.recipients.map((recipient) => `${recipient.target_label} - ${recipient.status}${recipient.can_forward ? ' - can forward' : ''}`).join(' | ')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                  {(!selectedDocumentIsCircular && ((isBankAdminRole && canSeeGovernancePanels) || shouldShowRequestForm)) && (
                <div className="fms-form-pair">
                  {canSeeGovernancePanels && (
                    <div className="fms-inline-form">
                      <div className="fms-inline-form-title">Pending Access Decisions</div>
                      {selectedDocumentRequests.length === 0 ? (
                        <div className="fms-empty-box">No record-level access requests exist for this file yet.</div>
                      ) : (
                        <div className="fms-request-list">
                          {selectedDocumentRequests.map((request) => (
                            <div key={`detail-request-${request.id}`} className="fms-request-card">
                              <div className="fms-request-head">
                                <div>
                                  <strong>{request.requester?.name || 'Unknown requester'} requesting {accessLevelLabel[request.access_level] || request.access_level || 'View Only'}</strong>
                                  <div className="text-muted text-sm">{formatDateTime(request.created_at)} - {request.target_type === 'USER' ? (request.target_user?.name || 'Specific user') : (request.target_branch?.branch_name || 'Branch target')}</div>
                                </div>
                                <span className={`badge ${request.status === 'APPROVED' ? 'badge-green' : request.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>
                                  {request.status}
                                </span>
                              </div>
                              <div className="text-muted text-sm" style={{ marginTop: '6px' }}>{request.reason || 'No reason provided.'}</div>
                              {request.status === 'PENDING' && canApproveAccessRequests ? (
                                <div className="fms-action-list" style={{ marginTop: '10px' }}>
                                  <button type="button" className="btn btn-primary btn-sm" onClick={() => handleDecision(request.id, 'APPROVE')} disabled={saving}>Approve Download</button>
                                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDecision(request.id, 'REJECT')} disabled={saving}>Reject</button>
                                </div>
                              ) : (
                                <div className="text-sm text-muted" style={{ marginTop: '8px' }}>Decided by: {request.decided_by?.name || '-'}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {canGrantRecordAccess && !selectedDocumentIsCircular && (
                    <form onSubmit={handleGrant} className="fms-inline-form share-elevated">
                      <div className="fms-inline-form-title">Grant Direct Record Access</div>
                      <div className="fms-inline-form-note">
                        Use this desk only for one-time record visibility. User-level FMS role assignment stays in User Management.
                      </div>
                      <div className="fms-share-hero">
                        <div className="fms-share-card">
                          <span>Record Control</span>
                          <strong>{selectedDocumentDetail.title}</strong>
                          <small>
                            {formatLibraryFolderLabel(selectedDocumentDetail.owner_node) || 'Default library folder'} · {selectedDocumentDetail.document_reference || selectedDocumentDetail.customer_reference || 'No reference tagged'}
                          </small>
                        </div>
                        <div className="fms-share-card">
                          <span>Share Status</span>
                          <strong>{selectedGrantTargetStatus}</strong>
                          <div className="fms-share-status-row">
                            <div className="fms-share-pill">{directGrantCount} direct share{directGrantCount === 1 ? '' : 's'}</div>
                            <div className={`fms-share-pill ${selectedDocumentDetail.status === 'BACKUP_ONLY' ? 'warning' : ''}`}>
                              {selectedDocumentDetail.status === 'BACKUP_ONLY' ? 'Currently hidden from normal register' : 'Visible in normal register'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="form-grid cols-2">
                        <div className="form-group">
                          <label>Share With<RequiredMark /></label>
                          <select value={grantForm.grant_type} onChange={(event) => setGrantForm({ ...grantForm, grant_type: event.target.value, user_id: '', branch_id: '' })}>
                            <option value="USER">Specific User</option>
                            <option value="BRANCH">Entire Branch</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label>Permission<RequiredMark /></label>
                          <select value={grantForm.access_level} onChange={(event) => setGrantForm({ ...grantForm, access_level: event.target.value })}>
                            <option value="VIEW">View Only</option>
                            <option value="DOWNLOAD">View + Download</option>
                          </select>
                        </div>
                        {grantForm.grant_type === 'USER' ? (
                          <div className="form-group">
                            <label>User<RequiredMark /></label>
                            <select value={grantForm.user_id} onChange={(event) => setGrantForm({ ...grantForm, user_id: event.target.value })} required>
                              <option value="">Select user</option>
                              {userOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.role?.name})</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="form-group">
                            <label>Branch<RequiredMark /></label>
                            <select value={grantForm.branch_id} onChange={(event) => setGrantForm({ ...grantForm, branch_id: event.target.value })} required>
                              <option value="">Select branch</option>
                              {branchOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>)}
                            </select>
                          </div>
                        )}
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Expiry</label>
                          <input type="datetime-local" value={grantForm.expires_at} onChange={(event) => setGrantForm({ ...grantForm, expires_at: event.target.value })} />
                        </div>
                      </div>
                      <div className="action-row">
                        <button type="submit" className="btn btn-primary" disabled={saving}>Grant Record Access</button>
                      </div>
                    </form>
                  )}

                  {shouldShowRequestForm ? (
                  <form ref={requestDeskRef} onSubmit={handleRequestAccess} className="fms-inline-form">
                    <div className="fms-inline-form-title">{requestFormHeading}</div>
                    {selectedCurrentUserRequest && (
                      <div className="fms-empty-box" style={{ marginBottom: '12px' }}>
                        <strong>Request Already Pending</strong>
                        <div className="text-muted text-sm">
                          Your request for {accessLevelLabel[selectedCurrentUserRequest.access_level] || selectedCurrentUserRequest.access_level || 'access'} is already pending since {formatDateTime(selectedCurrentUserRequest.created_at)}.
                        </div>
                      </div>
                    )}
                    <div className="form-grid cols-2">
                      {canRequestForOthers ? (
                        <>
                          <div className="form-group">
                            <label>Target Type<RequiredMark /></label>
                            <select value={requestForm.target_type} onChange={(event) => setRequestForm({ ...requestForm, target_type: event.target.value, target_user_id: '', target_branch_id: '' })}>
                              <option value="USER">Specific User</option>
                              <option value="BRANCH">Entire Branch</option>
                            </select>
                          </div>
                          <div className="form-group">
                            <label>Permission<RequiredMark /></label>
                            <select value={requestForm.access_level} onChange={(event) => setRequestForm({ ...requestForm, access_level: event.target.value })}>
                              <option value="VIEW">View Only</option>
                              <option value="DOWNLOAD">View + Download</option>
                            </select>
                          </div>
                          {requestForm.target_type === 'USER' ? (
                            <div className="form-group">
                              <label>User<RequiredMark /></label>
                              <select value={requestForm.target_user_id} onChange={(event) => setRequestForm({ ...requestForm, target_user_id: event.target.value })} required>
                                <option value="">Select user</option>
                                {userOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                              </select>
                            </div>
                          ) : (
                            <div className="form-group">
                              <label>Branch<RequiredMark /></label>
                              <select value={requestForm.target_branch_id} onChange={(event) => setRequestForm({ ...requestForm, target_branch_id: event.target.value })} required>
                                <option value="">Select branch</option>
                                {branchOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name}</option>)}
                              </select>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Request Scope</label>
                          <input type="text" value={`${user?.name || 'Current user'} (self access request)`} readOnly />
                        </div>
                      )}
                      <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                        <label>Reason<RequiredMark /></label>
                        <textarea value={requestForm.reason} onChange={(event) => setRequestForm({ ...requestForm, reason: event.target.value })} style={{ minHeight: '82px' }} required />
                      </div>
                    </div>
                    <div className="action-row">
                      <button type="submit" className="btn btn-outline" disabled={saving || Boolean(selectedCurrentUserRequest)}>{userAlreadyHasViewAccess ? 'Request Download Approval' : 'Submit for Approval'}</button>
                    </div>
                  </form>
                  ) : canSeeGovernancePanels ? (
                    <div className="fms-inline-form">
                      <div className="fms-inline-form-title">Access Status</div>
                      <div className="fms-inline-form-note">
                        Review the current record control before granting another share.
                      </div>
                      <div className="fms-status-hero">
                        <div>
                          <small>Current Record Control</small>
                          <strong>{formatLibraryFolderLabel(selectedDocumentDetail.owner_node) || 'Default library folder'}</strong>
                        </div>
                        <span className="fms-status-pill">
                          {directGrantCount} direct share{directGrantCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div className="fms-status-grid">
                        <div className="fms-status-card">
                          <small>Folder Visibility</small>
                          <strong>{formatLibraryFolderLabel(selectedDocumentDetail.owner_node) || 'Default library folder'}</strong>
                          <span>This record is held under the shown bank folder and follows that custody scope first.</span>
                        </div>
                        <div className="fms-status-card">
                          <small>Inherited Rules</small>
                          <strong>{inheritedGrantCount} active inherited rule{inheritedGrantCount === 1 ? '' : 's'}</strong>
                          <span>{inheritedGrantCount > 0 ? 'Folder-based access is also active for this record.' : 'No inherited folder rule is active right now.'}</span>
                        </div>
                        <div className="fms-status-card">
                          <small>Selected Target</small>
                          <strong>{selectedGrantTarget?.label || 'No user or branch chosen yet'}</strong>
                          <span>{selectedGrantTargetStatus}</span>
                        </div>
                        <div className="fms-status-card">
                          <small>Next Action</small>
                          <strong>
                            {selectedGrantTarget?.activeGrant
                              ? (selectedGrantTarget.activeGrant.access_level === 'DOWNLOAD' ? 'No further share needed' : 'Upgrade to download only if required')
                              : 'You can grant access after choosing the target'}
                          </strong>
                          <span>
                            {selectedGrantTarget?.activeGrant
                              ? (selectedGrantTarget.activeGrant.expires_at
                                ? `Active until ${formatDateTime(selectedGrantTarget.activeGrant.expires_at)}`
                                : 'This share has no expiry configured.')
                              : 'Pick a user or branch in the grant panel to review their current status first.'}
                          </span>
                        </div>
                      </div>
                      <div className="fms-empty-box" style={{ marginTop: '14px' }}>
                        <strong>{userAlreadyHasDownloadAccess ? 'Access already active' : 'View access already active'}</strong>
                        <div className="text-muted text-sm">
                          {userAlreadyHasDownloadAccess
                            ? 'You already have view and download rights on this record. New requests are not required unless you are sharing it onward as an authorized officer.'
                            : 'You already have view rights on this record. Raise a download-upgrade request only if operationally required.'}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
                )}
              </div>
            </div>
          )}

          {showUploadWorkbench && (
            <div className="card fms-panel" style={{ display: showUploadWorkbench ? undefined : 'none' }}>
              <div className="card-header blue">Branch Record Intake Form</div>
              <div className="card-body">
                {!canLodgeRecords ? (
                  <div className="fms-role-gate">
                    <div className="fms-role-gate-badge">Upload Not Enabled</div>
                    <h3>This user can view records, but cannot lodge new ones yet.</h3>
                    <p>
                      Manual FMS upload is a separate banking permission. A direct share or library view grant only lets this user
                      search, open, and download shared records. If admin has instructed this approver or branch user to upload
                      PAN, Aadhaar, KYC, account-opening, or other manual branch records, assign
                      <strong> Records Intake Officer</strong> in FMS Setup.
                    </p>
                    <div className="fms-role-gate-grid">
                      <div className="fms-role-gate-card">
                        <span>Current Access</span>
                        <strong>Library Viewer Only</strong>
                        <small>Can search, open, and use only already shared records.</small>
                      </div>
                      <div className="fms-role-gate-card">
                        <span>Needed For Manual Upload</span>
                        <strong>Records Intake Officer</strong>
                        <small>Enables record intake inside the user&apos;s permitted branch or library folder scope.</small>
                      </div>
                    </div>
                  </div>
                ) : (
                <>
                  <div className="fms-subtitle-row" style={{ marginBottom: '14px' }}>
                    <div>
                      <strong>Use this for manual banking records</strong>
                      <small>Store PAN, Aadhaar, KYC packs, account-opening forms, sanction copies, customer photographs, or other branch records in the correct controlled library folder.</small>
                    </div>
                  </div>
                  {hasOwnedFmsDesk && (
                    <div className="fms-empty-box" style={{ marginBottom: '14px', borderStyle: 'solid' }}>
                      <strong>Owned FMS Desk: {ownedFmsDeskLabel}</strong>
                      <div className="text-muted text-sm">
                        This user is currently operating inside the {ownedFmsDeskLabel} FMS ownership scope. Library folder, banking desk, and allowed record types should follow that assignment.
                      </div>
                    </div>
                  )}
                  <div className="fms-guide-grid" style={{ marginBottom: '14px' }}>
                    <div className="fms-guide-card">
                      <span>Index For Future Search</span>
                      <strong>Account, CIF, identity, and document reference fields should be captured whenever available.</strong>
                    </div>
                    <div className="fms-guide-card">
                      <span>Allowed Media</span>
                      <strong>{bootstrap.upload_policy?.allowed_extensions?.length
                        ? `Allowed formats: ${bootstrap.upload_policy.allowed_extensions.join(', ')}`
                        : 'Only approved PDF and image formats are accepted into controlled FMS custody.'}</strong>
                    </div>
                    <div className="fms-guide-card">
                      <span>Upload Governance</span>
                      <strong>{bootstrap.upload_policy?.max_file_size_mb
                        ? `Type and size restrictions are enforced by backend policy. Maximum file size: ${bootstrap.upload_policy.max_file_size_mb} MB.`
                        : 'Type and size restrictions are enforced by the bank policy on the backend even if this user can see the intake screen.'}</strong>
                    </div>
                  </div>
                  <form onSubmit={handleUpload}>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Create as Next Version Of</label>
                      <select value={uploadForm.base_document_id} onChange={(event) => hydrateUploadFromBaseDocument(event.target.value)}>
                        <option value="">Fresh FMS record</option>
                        {documents.map((documentItem) => (
                          <option key={documentItem.id} value={documentItem.id}>
                            {documentItem.title} - v{documentItem.version_number || 1}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Library Folder<RequiredMark /></label>
                      <select value={uploadForm.owner_node_id} onChange={(event) => setUploadForm({ ...uploadForm, owner_node_id: event.target.value })} required>
                        <option value="">Select node</option>
                        {uploadNodeOptions.map((node) => (
                          <option key={node.id} value={node.id}>{formatUploadFolderOptionLabel(node)}</option>
                        ))}
                      </select>
                      <small className="text-muted text-sm">Choose the bank folder that should own this record.</small>
                    </div>
                    <div className="form-group">
                      <label>Record Sensitivity<RequiredMark /></label>
                      <select value={uploadForm.classification} onChange={(event) => setUploadForm({ ...uploadForm, classification: event.target.value })}>
                        {classificationMasterOptions
                          .filter((item) => (bootstrap.classifications || []).includes(item.value))
                          .map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Register Placement<RequiredMark /></label>
                      <select value={uploadForm.visibility_mode} onChange={(event) => setUploadForm({ ...uploadForm, visibility_mode: event.target.value })}>
                        <option value="ACTIVE">Visible in Register</option>
                        <option value="BACKUP_ONLY">Backup Only</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Title<RequiredMark /></label>
                      <input type="text" value={uploadForm.title} onChange={(event) => setUploadForm({ ...uploadForm, title: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Record Type<RequiredMark /></label>
                      <select
                        value={recordTypeSelectValue}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          const matchedRule = uploadScopedRecordTypeOptions.find((item) => item.value === nextValue);
                          setUploadForm({
                            ...uploadForm,
                            document_type: nextValue,
                            document_category: nextValue === 'OTHER'
                              ? uploadForm.document_category
                              : (matchedRule?.default_desk || uploadForm.document_category)
                          });
                          if (nextValue !== 'OTHER') setCustomRecordType('');
                        }}
                        required
                      >
                        <option value="">Select record type</option>
                        {deskScopedRecordTypeOptions.map((item) => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </select>
                    </div>
                    {recordTypeSelectValue === 'OTHER' && (
                      <div className="form-group">
                        <label>Custom Record Type<RequiredMark /></label>
                        <input
                          type="text"
                          value={resolvedCustomRecordType}
                          onChange={(event) => setCustomRecordType(event.target.value)}
                          placeholder="Example: BOARD_RESOLUTION, CUSTOMER_REQUEST_LETTER"
                          required
                        />
                      </div>
                    )}
                    <div className="form-group">
                      <label>Banking Desk</label>
                      <select
                        value={uploadForm.document_category}
                        onChange={(event) => {
                          const nextDesk = event.target.value;
                          const nextDeskTypes = uploadScopedRecordTypeOptions.filter((item) => (
                            item.value === 'OTHER'
                            || matchesDeskToken(item.default_desk, nextDesk)
                            || (Array.isArray(item.department_codes) && item.department_codes.some((code) => matchesDeskToken(code, nextDesk)))
                          ));
                          const singleDeskType = nextDeskTypes.filter((item) => item.value !== 'OTHER');
                          setUploadForm({
                            ...uploadForm,
                            document_category: nextDesk,
                            document_type: singleDeskType.length === 1
                              ? singleDeskType[0].value
                              : (nextDeskTypes.some((item) => String(item.value) === String(uploadForm.document_type || ''))
                                ? uploadForm.document_type
                                : '')
                          });
                        }}
                        disabled={uploadDeskOptions.length <= 1}
                      >
                        <option value="">Select desk</option>
                        {uploadDeskOptions.map((item) => (
                          <option key={item} value={item}>{item}</option>
                        ))}
                      </select>
                      <small className="text-muted text-sm">
                        {uploadDeskOptions.length <= 1
                          ? 'This desk is fixed by the selected FMS ownership scope or record type.'
                          : 'Select the banking desk allowed for this upload scope.'}
                      </small>
                    </div>
                    {intakeFieldVisible('customer_name') && (
                    <div className="form-group">
                      <label>{intakeFieldLabel('customer_name', 'Customer Name')}{intakeFieldRequired('customer_name') ? <RequiredMark /> : null}</label>
                      <input type="text" value={uploadForm.customer_name} onChange={(event) => setUploadForm({ ...uploadForm, customer_name: event.target.value })} placeholder={intakeFieldPlaceholder('customer_name', 'Customer Name')} />
                    </div>
                    )}
                    {intakeFieldVisible('customer_reference') && (
                    <div className="form-group">
                      <label>{intakeFieldLabel('customer_reference', 'Customer / Account Reference')}{intakeFieldRequired('customer_reference') ? <RequiredMark /> : null}</label>
                      <input type="text" value={uploadForm.customer_reference} onChange={(event) => setUploadForm({ ...uploadForm, customer_reference: event.target.value })} required={intakeFieldRequired('customer_reference')} placeholder={intakeFieldPlaceholder('customer_reference', 'Customer / Account Reference')} />
                    </div>
                    )}
                    {intakeFieldVisible('cif_reference') && (
                    <div className="form-group">
                      <label>{intakeFieldLabel('cif_reference', 'CIF / Customer ID')}{intakeFieldRequired('cif_reference') ? <RequiredMark /> : null}</label>
                      <input type="text" value={uploadForm.cif_reference} onChange={(event) => setUploadForm({ ...uploadForm, cif_reference: event.target.value })} placeholder={intakeFieldPlaceholder('cif_reference', 'CIF / Customer ID')} />
                    </div>
                    )}
                    {intakeFieldVisible('account_reference') && (
                    <div className="form-group">
                      <label>{intakeFieldLabel('account_reference', 'Account Reference')}{intakeFieldRequired('account_reference') ? <RequiredMark /> : null}</label>
                      <input type="text" value={uploadForm.account_reference} onChange={(event) => setUploadForm({ ...uploadForm, account_reference: event.target.value })} placeholder={intakeFieldPlaceholder('account_reference', 'Account Reference')} />
                    </div>
                    )}
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      {!shouldForceAdditionalIndexing && (
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => setShowAdditionalIndexing((current) => !current)}
                        >
                          {showAdditionalIndexing ? 'Hide Additional Indexing' : 'Show Additional Indexing'}
                        </button>
                      )}
                    </div>
                    {(showAdditionalIndexing || shouldForceAdditionalIndexing) && (
                      <>
                        {intakeFieldVisible('identity_reference') && (
                        <div className="form-group">
                          <label>{intakeFieldLabel('identity_reference', 'ID Proof / Identity Reference')}{intakeFieldRequired('identity_reference') ? <RequiredMark /> : null}</label>
                          <input type="text" value={uploadForm.identity_reference} onChange={(event) => setUploadForm({ ...uploadForm, identity_reference: event.target.value })} placeholder={intakeFieldPlaceholder('identity_reference', 'ID Proof / Identity Reference')} />
                        </div>
                        )}
                        {intakeFieldVisible('id_proof_number') && (
                        <div className="form-group">
                          <label>{intakeFieldLabel('id_proof_number', 'ID Proof Number')}{intakeFieldRequired('id_proof_number') ? <RequiredMark /> : null}</label>
                          <input type="text" value={uploadForm.id_proof_number} onChange={(event) => setUploadForm({ ...uploadForm, id_proof_number: event.target.value })} placeholder={intakeFieldPlaceholder('id_proof_number', 'ID Proof Number')} />
                        </div>
                        )}
                        {intakeFieldVisible('document_reference') && (
                        <div className="form-group">
                          <label>{intakeFieldLabel('document_reference', 'Document Reference')}{intakeFieldRequired('document_reference') ? <RequiredMark /> : null}</label>
                          <input type="text" value={uploadForm.document_reference} onChange={(event) => setUploadForm({ ...uploadForm, document_reference: event.target.value })} placeholder={intakeFieldPlaceholder('document_reference', 'Document Reference')} />
                        </div>
                        )}
                        <div className="form-group">
                          <label>Tags</label>
                          <input type="text" value={uploadForm.tags} onChange={(event) => setUploadForm({ ...uploadForm, tags: event.target.value })} placeholder="loan, renewal, sanction" />
                        </div>
                        <div className="form-group">
                          <label>Sharing Rule</label>
                          <select value={uploadForm.access_scope} onChange={(event) => setUploadForm({ ...uploadForm, access_scope: event.target.value })}>
                            <option value="NODE_ONLY">Folder Based</option>
                            <option value="REQUEST_BASED">Request Based</option>
                          </select>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Custody Notes</label>
                          <textarea value={uploadForm.notes} onChange={(event) => setUploadForm({ ...uploadForm, notes: event.target.value })} style={{ minHeight: '82px' }} />
                        </div>
                      </>
                    )}
                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <label>File<RequiredMark /></label>
                      <input className="mobile-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff" onChange={(event) => setUploadFile(event.target.files?.[0] || null)} required />
                      {uploadFile ? <div className="mobile-file-pill">{uploadFile.name}</div> : null}
                    </div>
                  </div>
                  <div className="action-row mobile-sticky-actions">
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Lodging...' : ((uploadForm.visibility_mode || 'ACTIVE') === 'ACTIVE' ? 'Lodge to FMS' : 'Lodge as Backup')}
                    </button>
                  </div>
                  </form>
                </>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {downloadPrompt && (
          <div className="bank-download-modal-backdrop" role="presentation" onClick={() => !downloadSubmitting && setDownloadPrompt(null)}>
            <div className="bank-download-modal" role="dialog" aria-modal="true" aria-labelledby="fms-download-title" onClick={(event) => event.stopPropagation()}>
              <div className="bank-download-kicker">Controlled Download Release</div>
              <h3 id="fms-download-title">{downloadPrompt.title}</h3>
              <p>
                {isDemoDownloadMode
                  ? 'For demo testing, use employee ID 123456. In production, the download will validate against the real employee ID mapped to the signed-in bank user.'
                  : 'Enter the bank employee ID mapped to your signed-in profile. The downloaded copy will be released only after bank validation and will carry your employee watermark.'}
              </p>
              <label className="bank-download-label" htmlFor="fms-download-employee-id">Employee ID</label>
              <input
                id="fms-download-employee-id"
                ref={downloadEmployeeInputRef}
                type="text"
                className="bank-download-input"
                value={downloadEmployeeId}
                onChange={(event) => setDownloadEmployeeId(event.target.value.toUpperCase())}
                placeholder={isDemoDownloadMode ? DEMO_DOWNLOAD_EMPLOYEE_ID : 'Enter bank employee ID'}
                disabled={downloadSubmitting}
              />
              <div className="bank-download-hint">
                {isDemoDownloadMode
                  ? 'Demo mode: every bank user can test downloads with 123456. Production mode will switch back to each user\'s real employee ID.'
                  : 'Bank users only. Every released copy is stamped and added to the FMS audit trail with employee ID, user, date, and time.'}
              </div>
              <div className="bank-download-actions">
                <button type="button" className="btn btn-outline" onClick={() => setDownloadPrompt(null)} disabled={downloadSubmitting}>
                  Cancel
                </button>
                <button type="button" className="btn btn-primary" onClick={handleProtectedDownload} disabled={downloadSubmitting}>
                  {downloadSubmitting ? 'Validating...' : 'Validate & Download'}
                </button>
              </div>
            </div>
          </div>
        )}

        {showSideColumn && (
        <div className="fms-side-column">
          <div className="card fms-panel" style={{ display: 'none' }}>
            <div className="card-header blue">Operations Overview</div>
            <div className="card-body">
              <div className="fms-ops-grid">
                <div className="fms-ops-card">
                  <span>User Scope</span>
                  <strong>{user?.name}</strong>
                  <small>{user?.role} - {user?.tenant_name || user?.tenant_code || 'Tenant scope'}</small>
                </div>
                <div className="fms-ops-card">
                  <span>Branch Context</span>
                  <strong>{user?.branch_name || user?.branch_code || 'Head Office'}</strong>
                  <small>Current branch visibility and records scope</small>
                </div>
                <div className="fms-ops-card">
                  <span>Selected Folder</span>
                  <strong>{selectedFolderDisplayLabel === 'All shared folders' ? 'Not selected' : selectedFolderDisplayLabel}</strong>
                  <small>{selectedFolderDisplayLabel === 'All shared folders' ? 'Choose a library folder for upload or publish actions' : 'Current library folder in focus'}</small>
                </div>
                <div className="fms-ops-card">
                  <span>Publishing Control</span>
                  <strong>{hasPermission('FMS_PUBLISH') ? 'Allowed' : 'Not Assigned'}</strong>
                  <small>Approved DMS files land in backup custody automatically. Release to the visible register stays admin-controlled.</small>
                </div>
              </div>
            </div>
          </div>

          {canGrantRecordAccess && selectedNode && (
            <div className="card fms-panel" style={{ display: showLibraryWorkbench ? undefined : 'none' }}>
              <div className="card-header blue">Inherited Folder Access</div>
              <div className="card-body">
                <div className="fms-subtitle-row">
                  <div>
                    <strong>{selectedFolderDisplayLabel}</strong>
                    <small>Grant access once at department or branch folder level so all descendant library folders inherit it.</small>
                  </div>
                </div>

                <div className="fms-grant-list" style={{ marginBottom: '16px' }}>
                  {nodeGrants.length === 0 ? (
                    <div className="fms-empty-box">No inherited access grant is active on this folder right now.</div>
                  ) : nodeGrants.map((grant) => (
                    <div key={grant.id} className="fms-grant-card">
                      <div>
                        <strong>{grant.grant_type === 'USER'
                          ? grant.user?.name
                          : grant.grant_type === 'BRANCH'
                            ? grant.branch?.branch_name
                            : grant.grant_type === 'DEPARTMENT'
                              ? grant.department_master?.name
                              : 'Whole Bank'}</strong>
                        <div className="text-muted text-sm">
                          {accessLevelLabel[grant.access_level] || grant.access_level} - {grant.include_descendants ? 'Descendants included' : 'This folder only'}
                        </div>
                      </div>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => handleRevokeNodeGrant(grant.id)} disabled={saving}>
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleNodeGrant} className="fms-inline-form">
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Share With<RequiredMark /></label>
                      <select value={nodeGrantForm.grant_type} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, grant_type: event.target.value, user_id: '', branch_id: '', department_master_id: '' })}>
                        <option value="BRANCH">Entire Branch</option>
                        <option value="DEPARTMENT">Whole Department</option>
                        <option value="USER">Specific User</option>
                        <option value="GLOBAL">Whole Bank</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Permission<RequiredMark /></label>
                      <select value={nodeGrantForm.access_level} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, access_level: event.target.value })}>
                        <option value="VIEW">View Only</option>
                        <option value="DOWNLOAD">View + Download</option>
                      </select>
                    </div>
                    {nodeGrantForm.grant_type === 'USER' ? (
                      <div className="form-group">
                        <label>User<RequiredMark /></label>
                        <select value={nodeGrantForm.user_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, user_id: event.target.value })} required>
                          <option value="">Select user</option>
                          {userOptions.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.role?.name})</option>)}
                        </select>
                      </div>
                    ) : nodeGrantForm.grant_type === 'DEPARTMENT' ? (
                      <div className="form-group">
                        <label>Department<RequiredMark /></label>
                        <select value={nodeGrantForm.department_master_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, department_master_id: event.target.value })} required>
                          <option value="">Select department</option>
                          {departmentOptions.map((item) => <option key={item.id} value={item.id}>{item.path_key}</option>)}
                        </select>
                      </div>
                    ) : nodeGrantForm.grant_type === 'GLOBAL' ? (
                      <div className="form-group">
                        <label>Scope</label>
                        <input type="text" value="Whole bank visibility" readOnly />
                      </div>
                    ) : (
                      <div className="form-group">
                        <label>Branch<RequiredMark /></label>
                        <select value={nodeGrantForm.branch_id} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, branch_id: event.target.value })} required>
                          <option value="">Select branch</option>
                          {branchOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>)}
                        </select>
                      </div>
                    )}
                    <div className="form-group">
                      <label>Applies To</label>
                      <select value={nodeGrantForm.include_descendants ? 'YES' : 'NO'} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, include_descendants: event.target.value === 'YES' })}>
                        <option value="YES">This folder + descendants</option>
                        <option value="NO">This folder only</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Expiry</label>
                      <input type="datetime-local" value={nodeGrantForm.expires_at} onChange={(event) => setNodeGrantForm({ ...nodeGrantForm, expires_at: event.target.value })} />
                    </div>
                  </div>
                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={saving}>Grant Inherited Access</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="card fms-panel" style={{ display: showApprovalWorkbench && shouldShowAppendControls && accessDesk === 'append' ? undefined : 'none' }}>
            <div className="card-header blue">Branch Sharing Control</div>
            <div className="card-body">
              {!appendFeatureEnabled ? (
                <div className="fms-empty-box">
                  This bank is still on standard library visibility. Super admin can enable branch-to-branch sharing when the bank asks for controlled cross-branch access.
                </div>
              ) : (
                <>
                  <div className="fms-subtitle-row">
                    <div>
                      <strong>{appendGrants.length} active append grant(s)</strong>
                      <small>{appendPolicy.summary}</small>
                    </div>
                  </div>

                  <div className="fms-grant-list" style={{ marginBottom: '16px' }}>
                    {appendGrants.length === 0 ? (
                      <div className="fms-empty-box">No branch append visibility is active right now.</div>
                    ) : appendGrants.map((grant) => (
                      <div key={grant.id} className="fms-grant-card">
                        <div>
                          <strong>{grant.target_branch?.branch_name} can view {grant.source_branch?.branch_name}</strong>
                          <div className="text-muted text-sm">
                            {accessLevelLabel[grant.access_level] || grant.access_level} - {grant.expires_at ? `Valid until ${formatDateTime(grant.expires_at)}` : 'No expiry'} - {grant.reason || 'Reason not recorded'}
                          </div>
                        </div>
                        {canManageAppend && (
                          <div className="fms-action-list">
                            {grant.access_level !== 'DOWNLOAD' && (
                              <button type="button" className="btn btn-outline btn-sm" onClick={() => handleAppendGrantUpgrade(grant.id, 'DOWNLOAD')} disabled={saving}>
                                Upgrade to Download
                              </button>
                            )}
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => handleAppendGrantRevoke(grant.id)} disabled={saving}>
                              Revoke
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {user?.branch_id ? (
                    <form onSubmit={handleAppendRequest} className="fms-inline-form">
                      <div className="fms-inline-form-title">Request Branch-to-Branch Visibility</div>
                      <div className="form-grid cols-2">
                        <div className="form-group">
                          <label>Requesting Branch</label>
                          <input type="text" value={user?.branch_name || user?.branch_code || 'Current branch'} readOnly />
                        </div>
                        <div className="form-group">
                          <label>Access Policy</label>
                          <input type="text" value="View Only first" readOnly />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Source Branch<RequiredMark /></label>
                          <select value={appendForm.source_branch_id} onChange={(event) => setAppendForm({ ...appendForm, source_branch_id: event.target.value })} required>
                            <option value="">Select source branch</option>
                            {appendSourceOptions.map((item) => <option key={item.id} value={item.id}>{item.branch_name} ({item.branch_code})</option>)}
                          </select>
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Business Reason<RequiredMark /></label>
                          <textarea value={appendForm.reason} onChange={(event) => setAppendForm({ ...appendForm, reason: event.target.value })} style={{ minHeight: '82px' }} required />
                        </div>
                        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                          <label>Validity Until</label>
                          <input type="datetime-local" value={appendForm.expires_at} onChange={(event) => setAppendForm({ ...appendForm, expires_at: event.target.value })} />
                        </div>
                      </div>
                      <div className="action-row">
                        <button type="submit" className="btn btn-outline" disabled={saving}>Submit Append Request</button>
                      </div>
                    </form>
                  ) : (
                    <div className="fms-empty-box">Branch append requests open only for users who are mapped to an operating branch.</div>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="card fms-panel" style={{ display: showApprovalWorkbench && accessDesk === 'requests' ? undefined : 'none' }}>
            <div className="card-header blue">{shouldShowAppendControls ? 'Permission Approval Queue' : 'Access Requests'}</div>
            <div className="card-body">
              <div className="fms-subtitle-row">
                <div>
                  <strong>{shouldShowAppendControls ? pendingAppendRequests.length + pendingRequests.length : pendingRequests.length} pending item(s)</strong>
                  <small>{shouldShowAppendControls ? 'Record access and branch-sharing requests route here for approval by HO or the permitted FMS controller.' : 'Record access approvals are handled here. Branch-sharing is not enabled for this bank.'}</small>
                </div>
              </div>
              {shouldShowAppendControls && appendRequests.length > 0 && (
                <div className="fms-request-list" style={{ marginBottom: requests.length > 0 ? '14px' : 0 }}>
                  {appendRequests.map((request) => (
                    <div key={`append-${request.id}`} className="fms-request-card">
                      <div className="fms-request-head">
                        <div>
                          <strong>{request.target_branch?.branch_name} requesting visibility of {request.source_branch?.branch_name}</strong>
                          <div className="text-muted text-sm">{request.requester?.name || 'Unknown requester'} - {formatDateTime(request.created_at)}</div>
                        </div>
                        <span className={`badge ${request.status === 'APPROVED' ? 'badge-green' : request.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>
                          {request.status}
                        </span>
                      </div>
                      <div className="fms-request-meta">
                        <div>
                          <span>Policy</span>
                          <strong>{request.policy_label}</strong>
                        </div>
                        <div>
                          <span>Permission</span>
                          <strong>{accessLevelLabel[request.access_level] || request.access_level || 'View Only'}</strong>
                        </div>
                        <div>
                          <span>Reason</span>
                          <strong>{request.reason || '-'}</strong>
                        </div>
                      </div>
                      {request.status === 'PENDING' && canManageAppend ? (
                        <div className="fms-action-list">
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleAppendDecision(request.id, 'APPROVE')} disabled={saving}>Approve View Access</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleAppendDecision(request.id, 'REJECT')} disabled={saving}>Reject</button>
                        </div>
                      ) : (
                        <div className="text-sm text-muted">Decided by: {request.decided_by?.name || '-'}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {requests.length === 0 ? (
                appendRequests.length === 0 ? <div className="fms-empty-box">No access requests available.</div> : null
              ) : (
                <div className="fms-request-list">
                  {requests.map((request) => (
                    <div key={request.id} className="fms-request-card">
                      <div className="fms-request-head">
                        <div>
                          <strong>{request.document?.title || `Document #${request.document_id}`}</strong>
                          <div className="text-muted text-sm">{request.requester?.name || 'Unknown requester'} - {formatDateTime(request.created_at)}</div>
                        </div>
                        <span className={`badge ${request.status === 'APPROVED' ? 'badge-green' : request.status === 'REJECTED' ? 'badge-red' : 'badge-amber'}`}>
                          {request.status}
                        </span>
                      </div>
                      <div className="fms-request-meta">
                        <div>
                          <span>Target</span>
                          <strong>{request.target_type === 'USER' ? request.target_user?.name : request.target_branch?.branch_name}</strong>
                        </div>
                        <div>
                          <span>Permission</span>
                          <strong>{accessLevelLabel[request.access_level] || request.access_level || 'View Only'}</strong>
                        </div>
                        <div>
                          <span>Reason</span>
                          <strong>{request.reason || '-'}</strong>
                        </div>
                      </div>
                      {request.status === 'PENDING' && canApproveAccessRequests ? (
                        <div className="fms-action-list">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocumentFromAdminDesk(request.document?.id, 'detail')} disabled={!request.document?.id}>Open Record</button>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => handleDecision(request.id, 'APPROVE')} disabled={saving}>Approve</button>
                          <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDecision(request.id, 'REJECT')} disabled={saving}>Reject</button>
                        </div>
                      ) : (
                        <div className="fms-action-list">
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => openDocumentFromAdminDesk(request.document?.id, 'detail')} disabled={!request.document?.id}>Open Record</button>
                          <div className="text-sm text-muted">Decided by: {request.decided_by?.name || '-'}</div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>

      <style>{`
        .fms-shell {
          display: grid;
          gap: 14px;
        }
        .fms-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          padding-bottom: 0;
        }
        .fms-role-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 10px;
          color: #16407b;
          background: #eef5ff;
          border: 1px solid #cbdcf5;
        }
        .fms-header-copy {
          max-width: 760px;
        }
        .fms-header h1 {
          margin-bottom: 6px;
          color: #13273f;
          font-size: 24px;
          line-height: 1.1;
        }
        .fms-header p {
          color: #5f748e;
          max-width: 760px;
          line-height: 1.55;
          font-size: 14px;
        }
        .fms-header-tools {
          display: flex;
          align-items: stretch;
          justify-content: flex-end;
          gap: 14px;
          flex-wrap: wrap;
          margin-left: 0;
        }
        .fms-header-scope {
          min-width: 320px;
          margin-bottom: 0;
          padding: 14px 16px 16px;
          border: 1px solid rgba(167, 188, 216, 0.72);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(244, 248, 253, 0.98) 100%);
          box-shadow: 0 18px 40px rgba(21, 46, 79, 0.08);
        }
        .fms-header-scope label {
          display: block;
          margin-bottom: 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #6b7f99;
        }
        .fms-header-scope-select {
          min-height: 48px;
          border-radius: 14px;
          border: 1px solid #c9d8ea;
          background: #f8fbff;
          color: #173c6d;
          font-weight: 700;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        }
        .fms-header-scope-select:focus {
          border-color: #2c5ea8;
          box-shadow: 0 0 0 3px rgba(44, 94, 168, 0.16);
        }
        .fms-header-note {
          display: inline-grid;
          align-content: center;
          gap: 6px;
          min-width: 230px;
          padding: 16px 18px;
          border: 1px solid rgba(167, 188, 216, 0.72);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.98) 0%, rgba(245, 248, 253, 0.98) 100%);
          box-shadow: 0 18px 40px rgba(21, 46, 79, 0.08);
        }
        .fms-header-note span,
        .fms-detail-card span,
        .fms-ops-card span,
        .fms-request-meta span {
          display: block;
          margin-bottom: 5px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-header-note strong,
        .fms-detail-card strong,
        .fms-ops-card strong,
        .fms-request-meta strong {
          color: #12263d;
          font-size: 15px;
          line-height: 1.45;
        }
        .fms-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
          background: rgba(7, 18, 34, 0.58);
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .fms-modal-card {
          width: min(100%, 520px);
          max-height: calc(100vh - 48px);
          display: grid;
          gap: 12px;
          padding: 24px;
          margin: auto;
          border-radius: 22px;
          border: 1px solid #d6e0eb;
          background:
            radial-gradient(circle at top right, rgba(184, 203, 229, 0.18) 0%, transparent 26%),
            linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          box-shadow: 0 28px 56px rgba(15, 23, 42, 0.22);
          overflow-y: auto;
          animation: fmsModalAppear 180ms ease-out;
        }
        .fms-form-modal-card {
          width: min(100%, 540px);
          max-height: min(84vh, 860px);
        }
        .fms-form-modal-card .form-grid.cols-2 {
          grid-template-columns: 1fr;
        }
        @keyframes fmsModalAppear {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .fms-modal-card.is-warning {
          border-color: rgba(225, 198, 130, 0.9);
          background: linear-gradient(180deg, rgba(255, 252, 244, 0.99) 0%, rgba(255, 247, 231, 0.99) 100%);
        }
        .fms-modal-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-modal-title {
          color: #142c4d;
          font-size: 22px;
          line-height: 1.12;
          font-weight: 800;
        }
        .fms-modal-copy {
          color: #556b84;
          font-size: 15px;
          line-height: 1.7;
        }
        .fms-modal-actions {
          display: flex;
          justify-content: flex-end;
          padding-top: 4px;
        }
        .fms-modal-form-actions {
          gap: 10px;
          padding-top: 16px;
        }
        .fms-inline-prompt-row td {
          padding: 0 0 16px;
          border-top: 0;
          background: #f8fbff;
        }
        .fms-inline-context-prompt {
          display: grid;
          gap: 10px;
          padding: 18px 18px 16px;
          border-radius: 18px;
          border: 1px solid rgba(197, 212, 232, 0.92);
          background: rgba(255, 255, 255, 0.98);
          box-shadow: 0 12px 26px rgba(10, 29, 53, 0.1);
          margin: 0 14px 6px;
        }
        .fms-inline-context-prompt.mobile {
          margin-top: 12px;
        }
        .fms-inline-context-eyebrow {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-inline-context-title {
          color: #173c6d;
          font-size: 19px;
          line-height: 1.18;
          font-weight: 800;
        }
        .fms-inline-context-copy {
          color: #5b6f87;
          font-size: 14px;
          line-height: 1.65;
        }
        .fms-inline-context-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 2px;
        }
        .fms-register-actions {
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
        }
        .fms-records-table th:last-child,
        .fms-records-table td:last-child {
          position: sticky;
          right: 0;
          min-width: 138px;
          width: 138px;
        }
        .fms-records-table th:last-child {
          z-index: 3;
          background: #404a5b;
          box-shadow: -10px 0 14px rgba(10, 29, 53, 0.16);
        }
        .fms-records-table td:last-child {
          z-index: 2;
          background: #ffffff;
          box-shadow: -10px 0 14px rgba(10, 29, 53, 0.08);
        }
        .fms-policy-strip {
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #dbe4ef;
          background: #ffffff;
        }
        .fms-policy-strip strong {
          color: #173c6d;
          font-size: 13px;
        }
        .fms-policy-strip span {
          color: #61778f;
          font-size: 13px;
          line-height: 1.55;
        }
        .fms-policy-strip.disabled {
          background: #fafcfe;
        }
        .required-marker {
          color: #dc2626;
          font-weight: 800;
        }
        .fms-layout-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.9fr);
          gap: 18px;
          align-items: start;
        }
        .fms-layout-grid-access {
          grid-template-columns: 1fr;
        }
        .fms-register-layout {
          display: grid;
          grid-template-columns: minmax(280px, 0.9fr) minmax(0, 1.35fr);
          gap: 18px;
          align-items: start;
        }
        .fms-register-hero {
          display: grid;
          gap: 18px;
        }
        .fms-register-hero .fms-guide-grid {
          grid-template-columns: 1fr;
        }
        .fms-guide-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .fms-guide-card {
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid #dde7f1;
          background: #ffffff;
        }
        .fms-admin-card {
          width: 100%;
          display: grid;
          gap: 8px;
          padding: 16px 18px;
          border-radius: 16px;
          border: 1px solid #d7e3f1;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          text-align: left;
          color: #173c6d;
          cursor: pointer;
        }
        .fms-admin-card:hover {
          background: #edf5ff;
          border-color: #aac6e8;
        }
        .fms-guide-card span {
          display: block;
          margin-bottom: 8px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-guide-card strong {
          display: block;
          color: #173c6d;
          font-size: 14px;
          line-height: 1.6;
          font-weight: 700;
        }
        .fms-admin-card span {
          display: block;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-admin-card strong {
          display: block;
          color: #173c6d;
          font-size: 14px;
          line-height: 1.6;
          font-weight: 700;
        }
        .fms-admin-card small {
          color: #1f497c;
          font-size: 12px;
          font-weight: 700;
        }
        .fms-main-column,
        .fms-side-column {
          display: grid;
          gap: 18px;
          width: 100%;
          justify-self: stretch;
        }
        .fms-panel {
          border-radius: 18px;
        }
        .fms-circular-inbox-panel {
          border: 1px solid #e3ebf4;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          box-shadow: 0 10px 24px rgba(18, 38, 61, 0.05);
        }
        .fms-circular-inbox-panel .card-header.blue {
          background: linear-gradient(180deg, #4770af 0%, #3f68a7 100%);
        }
        .fms-circular-inbox-panel .card-body {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.99) 0%, rgba(250, 252, 255, 0.99) 100%);
        }
        .fms-desk-switcher {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .fms-desk-btn {
          border: 1px solid #d0ddf0;
          background: #f7fbff;
          color: #1f497c;
          border-radius: 999px;
          padding: 10px 15px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
        }
        .fms-desk-btn.is-active {
          background: #e8f2ff;
          border-color: #8bb4eb;
        }
        .fms-subtitle-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 14px;
        }
        .fms-subtitle-row strong {
          display: block;
          color: #173c6d;
          font-size: 14px;
          margin-bottom: 4px;
        }
        .fms-subtitle-row small {
          color: #71839a;
          font-size: 12px;
          line-height: 1.5;
        }
        .fms-selected-folder {
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          margin-bottom: 14px;
          border-radius: 14px;
          border: 1px solid #dbe4ef;
          background: #f8fbff;
        }
        .fms-selected-folder.compact {
          min-width: 220px;
          margin-bottom: 0;
        }
        .fms-selected-folder span {
          display: block;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-selected-folder strong {
          display: block;
          color: #173c6d;
          font-size: 14px;
          line-height: 1.45;
        }
        .fms-action-list {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fms-detail-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .fms-detail-card,
        .fms-ops-card {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #dde7f1;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .fms-detail-card small,
        .fms-ops-card small {
          display: block;
          margin-top: 4px;
          color: #77889d;
          font-size: 12px;
          line-height: 1.5;
        }
        .fms-section-block {
          margin-top: 18px;
        }
        .fms-tree-wrap {
          display: grid;
          gap: 6px;
        }
        .fms-tree-node {
          display: grid;
          gap: 6px;
        }
        .fms-tree-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }
        .fms-tree-node-btn {
          width: 100%;
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 12px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #d7e3f1;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          color: #173c6d;
          cursor: pointer;
          text-align: left;
        }
        .fms-tree-node-btn.is-active,
        .fms-tree-node-btn:hover {
          background: #edf5ff;
          border-color: #aac6e8;
        }
        .fms-tree-node-icon {
          width: 28px;
          height: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #e8f2ff;
          color: #1f497c;
          font-size: 11px;
          font-weight: 800;
          flex: 0 0 auto;
          margin-top: 1px;
        }
        .fms-tree-node-copy {
          display: grid;
          gap: 2px;
          min-width: 0;
        }
        .fms-tree-node-label {
          font-size: 13px;
          font-weight: 700;
        }
        .fms-tree-node-meta {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: #71839a;
          text-transform: none;
        }
        .fms-tree-toggle {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          border: 1px solid #d7e3f1;
          background: #ffffff;
          color: #1f497c;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
        }
        .fms-tree-toggle:hover {
          background: #edf5ff;
          border-color: #aac6e8;
        }
        .fms-grant-list,
        .fms-request-list,
        .fms-ops-grid {
          display: grid;
          gap: 10px;
        }
        .fms-version-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 10px;
        }
        .fms-version-card {
          display: grid;
          gap: 4px;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid #dde7f1;
          background: #ffffff;
          text-align: left;
          cursor: pointer;
          color: #173c6d;
        }
        .fms-version-card.is-active,
        .fms-version-card:hover {
          background: #f5f9ff;
          border-color: #bfd3ea;
        }
        .fms-version-card span {
          color: #173c6d;
          font-size: 13px;
          font-weight: 600;
        }
        .fms-version-card small {
          color: #76889e;
          font-size: 12px;
        }
        .fms-grant-card,
        .fms-request-card {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #dde7f1;
          background: #ffffff;
        }
        .fms-grant-card {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }
        .fms-circular-inbox-card {
          border-color: #e1eaf4;
          background: linear-gradient(180deg, #ffffff 0%, #fcfdff 100%);
          box-shadow: 0 8px 18px rgba(17, 40, 68, 0.04);
        }
        .fms-grant-card-button {
          width: 100%;
          cursor: pointer;
          text-align: left;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .fms-grant-card-button:hover,
        .fms-grant-card-button.is-active {
          border-color: #aac6e8;
          background: #f8fbff;
          box-shadow: 0 0 0 3px rgba(42, 93, 168, 0.08);
        }
        .fms-empty-box {
          padding: 16px;
          border-radius: 14px;
          border: 1px dashed #cad8e8;
          background: #f8fbff;
          color: #6e8096;
          font-size: 13px;
          line-height: 1.6;
        }
        .fms-form-pair {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
          margin-top: 18px;
        }
        .fms-inline-form {
          padding: 16px;
          border: 1px solid #dde7f1;
          border-radius: 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f9fbfd 100%);
        }
        .fms-inline-form.share-elevated {
          border-color: #cfdff3;
          background:
            radial-gradient(circle at top right, rgba(143, 181, 236, 0.18) 0%, transparent 34%),
            linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          box-shadow: 0 14px 30px rgba(18, 38, 61, 0.06);
        }
        .fms-circular-form {
          border-color: #d2e0f1;
          background:
            radial-gradient(circle at top right, rgba(160, 194, 243, 0.16) 0%, transparent 30%),
            linear-gradient(180deg, rgba(255,255,255,0.99) 0%, rgba(247,251,255,0.99) 100%);
        }
        .fms-modal-form {
          margin-top: 2px;
        }
        .fms-inline-form-title {
          margin-bottom: 14px;
          font-size: 13px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #173c6d;
        }
        .fms-inline-form-note {
          margin: -2px 0 14px;
          color: #6b809a;
          font-size: 13px;
          line-height: 1.5;
        }
        .fms-share-hero {
          display: grid;
          grid-template-columns: minmax(0, 1.2fr) minmax(220px, 0.8fr);
          gap: 12px;
          margin-bottom: 16px;
        }
        .fms-circular-form .form-grid {
          gap: 16px 18px;
        }
        .fms-circular-form .form-group label {
          color: #50657d;
          font-weight: 700;
          letter-spacing: 0.01em;
        }
        .fms-circular-form .form-group input[type="text"],
        .fms-circular-form .form-group input[type="datetime-local"],
        .fms-circular-form .form-group select,
        .fms-circular-form .form-group textarea {
          min-height: 46px;
          border-color: #cfdae8;
          background: rgba(255, 255, 255, 0.96);
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
        }
        .fms-circular-form .form-group textarea {
          min-height: 108px;
          resize: vertical;
          padding-top: 12px;
        }
        .fms-circular-form .form-group input[type="datetime-local"] {
          width: 100%;
          appearance: none;
          -webkit-appearance: none;
          color: #173c6d;
          font-weight: 600;
        }
        .fms-circular-date-field {
          align-self: end;
        }
        .fms-circular-checkbox {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 46px;
          padding: 12px 14px;
          border: 1px solid #d8e4f2;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.92);
        }
        .fms-circular-checkbox input {
          margin: 0;
          width: 16px;
          height: 16px;
          accent-color: #2457a4;
          flex: 0 0 auto;
        }
        .fms-circular-checkbox span {
          color: #22406a;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.45;
        }
        .fms-share-card {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #dbe7f5;
          background: rgba(255, 255, 255, 0.82);
        }
        .fms-share-card span {
          display: block;
          margin-bottom: 6px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-share-card strong {
          display: block;
          color: #173c6d;
          font-size: 14px;
          line-height: 1.55;
        }
        .fms-share-card small {
          display: block;
          margin-top: 5px;
          color: #70839b;
          font-size: 12px;
          line-height: 1.5;
        }
        .fms-share-status-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 8px;
        }
        .fms-share-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 30px;
          padding: 0 11px;
          border-radius: 999px;
          border: 1px solid #d5e1ef;
          background: #edf4ff;
          color: #214d87;
          font-size: 11px;
          font-weight: 700;
        }
        .fms-share-pill.warning {
          background: #fff6e8;
          border-color: #f0d2a2;
          color: #9a5a16;
        }
        .fms-role-gate {
          display: grid;
          gap: 14px;
          padding: 4px 0 2px;
        }
        .fms-role-gate-badge {
          display: inline-flex;
          width: fit-content;
          align-items: center;
          padding: 6px 11px;
          border-radius: 999px;
          background: #fff3e6;
          border: 1px solid #f2c38d;
          color: #9d5216;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fms-role-gate h3 {
          margin: 0;
          color: #173c6d;
          font-size: 21px;
          line-height: 1.35;
        }
        .fms-role-gate p {
          margin: 0;
          color: #5f748e;
          font-size: 14px;
          line-height: 1.65;
          max-width: 900px;
        }
        .fms-role-gate-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .fms-role-gate-card {
          padding: 15px 16px;
          border-radius: 16px;
          border: 1px solid #dde7f1;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .fms-role-gate-card span {
          display: block;
          margin-bottom: 6px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7386a0;
        }
        .fms-role-gate-card strong {
          display: block;
          color: #173c6d;
          font-size: 16px;
          line-height: 1.4;
        }
        .fms-role-gate-card small {
          display: block;
          margin-top: 6px;
          color: #6b809a;
          font-size: 12px;
          line-height: 1.55;
        }
        .fms-status-hero {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid #d8e3f0;
          background: linear-gradient(135deg, #f8fbff 0%, #eef5fb 100%);
          margin-bottom: 14px;
        }
        .fms-status-hero small,
        .fms-status-card small {
          display: block;
          margin-bottom: 6px;
          color: #6d84a0;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .fms-status-hero strong,
        .fms-status-card strong {
          display: block;
          color: #173c6d;
          font-size: 18px;
          line-height: 1.35;
        }
        .fms-status-pill {
          display: inline-flex;
          align-items: center;
          padding: 8px 12px;
          border-radius: 999px;
          background: #dfeafb;
          color: #1d4b87;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .fms-status-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .fms-status-card {
          min-height: 132px;
          padding: 14px 16px;
          border-radius: 16px;
          border: 1px solid #dde7f1;
          background: #ffffff;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75);
        }
        .fms-status-card span {
          display: block;
          margin-top: 8px;
          color: #6b809a;
          font-size: 13px;
          line-height: 1.55;
        }
        .fms-request-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 12px;
        }
        .fms-request-meta {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 12px;
        }
        @media (max-width: 1180px) {
          .fms-register-layout,
          .fms-guide-grid,
          .fms-header,
          .fms-layout-grid {
            display: grid;
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 760px) {
          .fms-header,
          .fms-detail-grid,
          .fms-form-pair,
          .fms-share-hero,
          .fms-request-meta,
          .fms-status-grid,
          .fms-role-gate-grid {
            grid-template-columns: 1fr;
          }
          .fms-grant-card,
          .fms-request-head,
          .fms-status-hero,
          .fms-subtitle-row {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default FmsWorkspace;
