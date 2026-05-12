import prisma from '../utils/prisma.js';
import fs from 'fs/promises';
import path from 'path';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import { allowedUploadExtensions, enableDemoFeatures, uploadMaxFileSizeBytes, uploadScanEnabled } from '../config/env.js';
import {
  assertCanGovernNodeAccess,
  assertCanPublishToNode,
  assertCanUploadToNode,
  assertFmsFeatureAccess,
  assertFmsPermission,
  assertValidClassification,
  assertValidFmsFile,
  buildAccessibleFmsWhere,
  buildFmsPermissionsPayload,
  buildFmsSourceFilter,
  buildFmsSearchText,
  buildStoredDocumentKey,
  canUserUploadToNode,
  computeFileHash,
  copyFileToFmsStorage,
  encodeGrantType,
  DOCUMENT_CLASSIFICATIONS,
  DEFAULT_FMS_CLASSIFICATION_MASTER,
  DEFAULT_FMS_RECORD_DESKS,
  DEFAULT_FMS_RECORD_TYPES,
  FMS_ACCESS_LEVELS,
  FMS_PERMISSIONS,
  getActiveAppendGrantWhere,
  getAccessibleDepartmentIds,
  getActiveNodeGrantWhere,
  getAccessibleBranchIds,
  hasFmsDownloadAccess,
  hasFmsPermission,
  hasRequiredAccessLevel,
  hasFmsFeatureAccess,
  isCrossBranchAppendEnabledForTenant,
  isBankAdmin,
  isFmsRecordTypeAllowedForNode,
  isSuperAdmin,
  listScopedFmsRecordTypes,
  listActiveAppendGrantAccess,
  listActiveNodeGrantAccess,
  listOwnerAdminUsersForNode,
  moveUploadedFileToFmsStorage,
  normalizeFmsAccessLevel,
  normalizeFmsSourceMode,
  normalizeTenantFmsLibraryStandards,
  normalizeFmsMetadata,
  parseGrantType,
  listGrantTypeAliases,
  resolveFmsRecordTypeDefinition,
  resolveFmsDocumentAccess,
  resolveDefaultFmsOwnerNode,
  writeFmsAuditLog
} from '../services/fmsService.js';
import { createNotification } from '../services/notificationService.js';
import { sendOperationalNotificationEmail } from '../services/emailService.js';
import { resolveStoredPath } from '../utils/storage.js';
import { toPublicDocumentReference } from '../utils/documentReference.js';
import approvedFileService from '../services/approvedFileService.js';
const supportsBranchAppendRequestModel = Boolean(prisma.fmsBranchAppendRequest);
const supportsBranchAppendGrantModel = Boolean(prisma.fmsBranchAppendGrant);
const supportsNodeGrantModel = Boolean(prisma.fmsNodeAccessGrant);
const supportsDepartmentModel = Boolean(prisma.fmsDepartment);
const supportsDistributionModel = Boolean(prisma.fmsDistribution && prisma.fmsDistributionRecipient);
const DEMO_DOWNLOAD_EMPLOYEE_ID = '123456';
const WORKFLOW_TIMEZONE = 'Asia/Kolkata';
const canViewSensitiveFmsFileDetails = (user) => isSuperAdmin(user) || isBankAdmin(user);
const DEFAULT_FMS_DEPARTMENT_MASTERS = [
  { code: 'RETAIL', name: 'Retail', legacyDepartmentName: 'Retail Banking' },
  { code: 'LOANS', name: 'Loans', legacyDepartmentName: 'Loans' },
  { code: 'KYC', name: 'KYC', legacyDepartmentName: 'KYC' },
  { code: 'MANUAL', name: 'Manual', legacyDepartmentName: 'Manual' },
  { code: 'CIRCULARS', name: 'Circulars', legacyDepartmentName: 'Circulars' },
  { code: 'DEPOSITS', name: 'Deposits', legacyDepartmentName: 'Deposits' },
  { code: 'OPERATIONS', name: 'Operations', legacyDepartmentName: 'Operations' },
  { code: 'COMPLIANCE', name: 'Compliance', legacyDepartmentName: 'Compliance' },
  { code: 'AUDIT', name: 'Audit', legacyDepartmentName: 'Audit' },
  { code: 'LEGAL', name: 'Legal', legacyDepartmentName: 'Legal' },
  { code: 'TREASURY', name: 'Treasury', legacyDepartmentName: 'Treasury' },
  { code: 'TRADE_FINANCE', name: 'Trade Finance', legacyDepartmentName: 'Trade Finance' },
  { code: 'RECOVERY', name: 'Recovery', legacyDepartmentName: 'Recovery' }
];

const parseId = (value) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) ? parsed : null;
};

const parseOptionalDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const normalizeEmployeeId = (value) => String(value || '').trim().toUpperCase();
const formatWorkflowTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: WORKFLOW_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
};
const buildFmsDownloadActorLabel = (user) => [
  user?.employee_id ? `Emp ID: ${user.employee_id}` : null,
  user?.user_id ? `User Ref: ${user.user_id}` : null
].filter(Boolean).join(' | ') || null;
const buildFmsDownloadRemarks = ({ user, document, accessType }) => [
  accessType === 'attachment' ? 'Controlled FMS copy released' : 'FMS record preview opened',
  buildFmsDownloadActorLabel(user),
  document?.document_type ? `Record Type: ${document.document_type}` : null,
  document?.file_name ? `File Name: ${document.file_name}` : null,
  document?.document_reference ? `Reference: ${document.document_reference}` : null,
  `Date & Time: ${formatWorkflowTimestamp(new Date())}`
].filter(Boolean).join(' | ');
const buildFmsControlledCopyContext = (user, document) => ({
  title: 'APPROVED',
  watermarkVariant: 'approved',
  officerName: user?.name || 'Bank User',
  employeeId: user?.employee_id || '',
  role: String(user?.role?.name || user?.role || '').trim(),
  downloadedAt: formatWorkflowTimestamp(new Date()),
  noteReference: toPublicDocumentReference(
    document?.document_reference
    || document?.customer_reference
    || document?.version_group_key
    || document?.file_name
    || '',
    '',
    document?.branch || null
  )
});
const buildControlledCopyDocumentContext = (document) => ({
  document_group_key: document?.document_reference || document?.version_group_key || document?.file_name || '',
  document_code: document?.document_reference || document?.customer_reference || document?.version_group_key || '',
  note_id: document?.document_reference || document?.customer_reference || document?.file_name || '',
  branch: document?.branch || null
});
const notifyFmsDownloadStakeholders = async ({ document, downloadOfficer }) => {
  const legacyDepartmentId = Number(document?.department_master?.legacy_department_id || 0) || null;
  const recipientIds = new Set();

  if (document?.uploaded_by?.id) {
    recipientIds.add(Number(document.uploaded_by.id));
  }

  const candidateUsers = await prisma.user.findMany({
    where: {
      tenant_id: document?.tenant_id || undefined,
      is_active: true,
      OR: [
        { role: { name: { in: ['ADMIN', 'SUPER_ADMIN'] } } },
        ...(legacyDepartmentId ? [{ department_id: legacyDepartmentId, fms_enabled: true }] : [])
      ]
    },
    select: {
      id: true,
      branch_id: true
    }
  }).catch(() => []);

  for (const user of candidateUsers) {
    recipientIds.add(Number(user.id));
  }

  recipientIds.delete(Number(downloadOfficer?.id || 0));

  const departmentName = document?.department_master?.name || 'FMS';
  const reference = document?.document_reference || document?.customer_reference || document?.file_name || 'Controlled record';
  const timestamp = formatWorkflowTimestamp(new Date());

  await Promise.all([...recipientIds].map((userId) => createNotification({
    userId,
    tenantId: document?.tenant_id || null,
    branchId: document?.branch_id || null,
    title: 'FMS controlled copy downloaded',
    message: `${downloadOfficer?.name || 'A bank user'} downloaded ${departmentName} record "${reference}" on ${timestamp}.`,
    category: 'FMS_AUDIT',
    entityType: 'FMS_DOCUMENT',
    entityId: document?.id || null
  }).catch(() => {})));
};
const validateFmsDownloadEmployee = async (req, document) => {
  const enteredEmployeeId = normalizeEmployeeId(
    req.headers['x-dms-employee-id']
    || req.query.employee_id
    || req.body?.employee_id
  );

  if (!enteredEmployeeId) {
    const error = new Error('Employee ID is required before this file can be downloaded.');
    error.status = 400;
    throw error;
  }

  if (enableDemoFeatures && enteredEmployeeId === DEMO_DOWNLOAD_EMPLOYEE_ID) {
    return {
      ...req.user,
      employee_id: DEMO_DOWNLOAD_EMPLOYEE_ID
    };
  }

  const downloadOfficer = await prisma.user.findFirst({
    where: {
      employee_id: enteredEmployeeId,
      is_active: true,
      ...(req.user?.tenant_id ? { tenant_id: req.user.tenant_id } : {})
    },
    include: { role: true }
  });

  if (!downloadOfficer) {
    const error = new Error('Entered employee ID is not mapped to an active bank user.');
    error.status = 403;
    throw error;
  }

  if (Number(downloadOfficer.id) !== Number(req.user?.id)) {
    const error = new Error('Entered employee ID does not match the signed-in bank user.');
    error.status = 403;
    throw error;
  }

  if (req.user?.employee_id && normalizeEmployeeId(req.user.employee_id) !== enteredEmployeeId) {
    const error = new Error('Entered employee ID does not match your bank profile.');
    error.status = 403;
    throw error;
  }

  if (
    document?.tenant_id
    && downloadOfficer?.tenant_id
    && Number(document.tenant_id) !== Number(downloadOfficer.tenant_id)
  ) {
    const error = new Error('This employee ID is not authorized for the current bank file.');
    error.status = 403;
    throw error;
  }

  return downloadOfficer;
};

const tenantLibraryStandardsSelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  fms_record_type_master_json: true,
  fms_record_desk_master_json: true,
  fms_classification_master_json: true
};

const buildLibraryStandardsPayload = (tenant) => ({
  tenant_id: tenant?.id || null,
  tenant_name: tenant?.tenant_name || null,
  tenant_code: tenant?.tenant_code || null,
  ...normalizeTenantFmsLibraryStandards(tenant || {
    fms_record_type_master_json: DEFAULT_FMS_RECORD_TYPES,
    fms_record_desk_master_json: DEFAULT_FMS_RECORD_DESKS,
    fms_classification_master_json: DEFAULT_FMS_CLASSIFICATION_MASTER
  })
});

const isAppendSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('Unknown field `cross_branch_append_enabled`')
    || message.includes('Unknown argument `cross_branch_append_enabled`')
    || message.includes('The column `Tenant.cross_branch_append_enabled` does not exist')
    || message.includes('The column `Tenant.fms_record_type_master_json` does not exist')
    || message.includes('The column `Tenant.fms_record_desk_master_json` does not exist')
    || message.includes('The column `Tenant.fms_classification_master_json` does not exist')
    || message.includes('relation "FmsBranchAppendRequest" does not exist')
    || message.includes('relation "FmsBranchAppendGrant" does not exist')
    || message.includes('table `public.FmsBranchAppendRequest` does not exist')
    || message.includes('table `public.FmsBranchAppendGrant` does not exist');
};

const isDistributionSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('relation "FmsDistribution" does not exist')
    || message.includes('relation "FmsDistributionRecipient" does not exist')
    || message.includes('table `public.FmsDistribution` does not exist')
    || message.includes('table `public.FmsDistributionRecipient` does not exist')
    || message.includes('Unknown field `distributions`')
    || message.includes('Unknown field `fmsDistribution`')
    || message.includes('Unknown field `fmsDistributionRecipient`');
};

const getActiveGrantWhere = () => ({
  revoked_at: null,
  OR: [
    { expires_at: null },
    { expires_at: { gt: new Date() } }
  ]
});

const normalizeGrantTarget = (value) => parseGrantType(value).targetType;
const findActiveGrantForTarget = async (tx, {
  documentId,
  targetType,
  userId = null,
  branchId = null
}) => tx.fmsDocumentAccessGrant.findFirst({
  where: {
    document_id: documentId,
    grant_type: { in: listGrantTypeAliases(targetType) },
    ...(normalizeGrantTarget(targetType) === 'USER' ? { user_id: userId } : { branch_id: branchId }),
    ...getActiveGrantWhere()
  }
});

const fmsDocumentInclude = {
  owner_node: true,
  department_master: true,
  branch: { select: { id: true, branch_name: true, branch_code: true } },
  previous_version: {
    select: { id: true, version_number: true, file_name: true, created_at: true }
  },
  uploaded_by: { select: { id: true, name: true, email: true } },
  published_by: { select: { id: true, name: true } },
  access_grants: {
    where: getActiveGrantWhere(),
    include: {
      user: { select: { id: true, name: true, email: true } },
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    }
  }
};

const distributionRecipientInclude = {
  target_user: { select: { id: true, name: true, email: true } },
  target_branch: { select: { id: true, branch_name: true, branch_code: true } },
  target_department_master: { select: { id: true, name: true, code: true, department_type: true, legacy_department_id: true } },
  assigned_by: { select: { id: true, name: true, email: true } }
};

const fmsDistributionInclude = {
  created_by: { select: { id: true, name: true, email: true } },
  parent_distribution: {
    select: {
      id: true,
      title: true,
      instruction_type: true,
      created_at: true
    }
  },
  recipients: {
    include: distributionRecipientInclude,
    orderBy: { created_at: 'asc' }
  }
};

const buildGrantActorMap = async (documents = []) => {
  const actorIds = [...new Set(
    documents
      .flatMap((document) => document.access_grants || [])
      .map((grant) => grant.approved_by_user_id)
      .filter(Boolean)
  )];

  if (actorIds.length === 0) return {};

  const users = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: { id: true, name: true, email: true }
  });

  return users.reduce((acc, user) => {
    acc[user.id] = user;
    return acc;
  }, {});
};

const buildNodeTree = (nodes = []) => {
  const nodeMap = new Map(nodes.map((node) => [node.id, { ...node, children: [] }]));
  const roots = [];

  for (const node of nodeMap.values()) {
    if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortTree = (items) => items
    .sort((left, right) => String(left.path_key || left.name).localeCompare(String(right.path_key || right.name)))
    .map((item) => ({ ...item, children: sortTree(item.children || []) }));

  return sortTree(roots);
};

const buildDepartmentTree = (departments = []) => {
  const departmentMap = new Map(departments.map((department) => [department.id, { ...department, children: [] }]));
  const roots = [];

  for (const department of departmentMap.values()) {
    if (department.parent_id && departmentMap.has(department.parent_id)) {
      departmentMap.get(department.parent_id).children.push(department);
    } else {
      roots.push(department);
    }
  }

  const sortTree = (items) => items
    .sort((left, right) => String(left.path_key || left.name).localeCompare(String(right.path_key || right.name)))
    .map((item) => ({ ...item, children: sortTree(item.children || []) }));

  return sortTree(roots);
};

const ensureDefaultFmsDepartmentMasters = async (tenantId) => {
  if (!supportsDepartmentModel || !tenantId) return;

  await prisma.$transaction(async (tx) => {
    const [branches, existingDepartments] = await Promise.all([
      tx.branch.findMany({
        where: { tenant_id: tenantId },
        select: { id: true }
      }),
      tx.fmsDepartment.findMany({
        where: { tenant_id: tenantId, parent_id: null },
        select: {
          id: true,
          tenant_id: true,
          parent_id: true,
          legacy_department_id: true,
          name: true,
          code: true,
          department_type: true,
          hierarchy_level: true,
          path_key: true,
          is_active: true
        }
      })
    ]);

    const branchIds = branches.map((branch) => branch.id);
    const legacyDepartmentMap = new Map();

    for (const definition of DEFAULT_FMS_DEPARTMENT_MASTERS) {
      const legacyDepartment = await tx.department.upsert({
        where: { name: definition.legacyDepartmentName },
        update: {},
        create: { name: definition.legacyDepartmentName },
        select: { id: true, name: true }
      });
      legacyDepartmentMap.set(definition.code, legacyDepartment);
    }

    for (const definition of DEFAULT_FMS_DEPARTMENT_MASTERS) {
      const legacyDepartment = legacyDepartmentMap.get(definition.code);
      const matchedDepartment = existingDepartments.find((item) => (
        item.code === definition.code
        || String(item.path_key || '').trim().toUpperCase() === definition.code
        || Number(item.legacy_department_id || 0) === Number(legacyDepartment?.id || 0)
      ));

      const savedDepartment = matchedDepartment
        ? await tx.fmsDepartment.update({
          where: { id: matchedDepartment.id },
          data: {
            name: definition.name,
            code: definition.code,
            legacy_department_id: legacyDepartment?.id || null,
            department_type: 'DEPARTMENT',
            hierarchy_level: 0,
            path_key: definition.code,
            is_active: true
          }
        })
        : await tx.fmsDepartment.create({
          data: {
            tenant_id: tenantId,
            parent_id: null,
            legacy_department_id: legacyDepartment?.id || null,
            name: definition.name,
            code: definition.code,
            department_type: 'DEPARTMENT',
            hierarchy_level: 0,
            path_key: definition.code,
            is_active: true
          }
        });

      if (branchIds.length > 0) {
        await tx.fmsDepartmentBranch.createMany({
          data: branchIds.map((branchId) => ({
            tenant_id: tenantId,
            department_master_id: savedDepartment.id,
            branch_id: branchId
          })),
          skipDuplicates: true
        });
      }

      const departmentNode = await ensureDepartmentNodeChain(tx, savedDepartment);
      await syncDepartmentBranchNodes(tx, savedDepartment, departmentNode.id);
    }
  });
};

const buildNodeCountMap = (documents = []) => documents.reduce((acc, document) => {
  const nodeId = Number(document.owner_node_id || 0);
  if (!nodeId) return acc;
  acc[nodeId] = (acc[nodeId] || 0) + 1;
  return acc;
}, {});

const attachNodeCounts = (items = [], countMap = {}) => items.map((item) => {
  const children = attachNodeCounts(item.children || [], countMap);
  return {
    ...item,
    direct_document_count: countMap[item.id] || 0,
    aggregate_document_count: (countMap[item.id] || 0) + children.reduce((sum, child) => sum + (child.aggregate_document_count || 0), 0),
    children
  };
});

const buildDepartmentCountMap = (documents = []) => documents.reduce((acc, document) => {
  const departmentId = Number(document.department_master_id || 0);
  if (!departmentId) return acc;
  acc[departmentId] = (acc[departmentId] || 0) + 1;
  return acc;
}, {});

const attachDepartmentCounts = (items = [], countMap = {}) => items.map((item) => {
  const children = attachDepartmentCounts(item.children || [], countMap);
  return {
    ...item,
    direct_document_count: countMap[item.id] || 0,
    aggregate_document_count: (countMap[item.id] || 0) + children.reduce((sum, child) => sum + (child.aggregate_document_count || 0), 0),
    children
  };
});

const resolveNodeFilter = async (ownerNodeId, includeDescendants = true) => {
  if (!ownerNodeId) return {};
  const node = await prisma.fmsNode.findUnique({
    where: { id: ownerNodeId },
    select: { id: true, path_key: true }
  });
  if (!node) {
    const error = new Error('Selected owner node was not found.');
    error.status = 404;
    throw error;
  }
  return includeDescendants ? { owner_node_path_prefix: node.path_key } : { owner_node_id: node.id };
};

const loadNodeGrantAccess = async (user, tenantId) => {
  if (!supportsNodeGrantModel) {
    return {
      exactNodeIds: [],
      viewPrefixes: [],
      downloadPrefixes: [],
      grants: []
    };
  }

  return listActiveNodeGrantAccess(user, tenantId);
};

const buildDocumentResponse = (document, grantActorMap = {}, viewer = null, appendAccess = null, nodeGrantAccess = null) => {
  const viewerAccess = viewer
    ? resolveFmsDocumentAccess(viewer, document, appendAccess, nodeGrantAccess)
    : { accessLevel: FMS_ACCESS_LEVELS.VIEW, canDownload: false, via: null };
  const publicDocumentReference = toPublicDocumentReference(
    document.document_reference ||
    document.metadata_json?.public_document_reference ||
    document.metadata_json?.document_reference ||
    document.customer_reference ||
    document.version_group_key,
    null
  );

  return {
    id: document.id,
    source_origin: document.source_note_id ? 'DMS' : 'MANUAL',
    status: document.status,
    visibility_label: document.status === 'BACKUP_ONLY' ? 'Backup Only' : 'Visible in Register',
    classification: document.classification,
    document_type: document.document_type,
    document_category: document.document_category || null,
    title: document.title,
    customer_name: document.customer_name,
    customer_reference: document.customer_reference,
    cif_reference: document.cif_reference || null,
    account_reference: document.account_reference,
    identity_reference: document.identity_reference || document.metadata_json?.identity_reference || null,
    id_proof_number: document.id_proof_number || document.metadata_json?.id_proof_number || null,
    document_reference: publicDocumentReference,
    tags: Array.isArray(document.tags_json) ? document.tags_json : [],
    custom_index_json: document.custom_index_json || null,
    version_group_key: document.version_group_key,
    version_number: document.version_number,
    is_latest_version: document.is_latest_version,
    previous_version: document.previous_version || null,
    file_name: document.file_name,
    mime_type: document.mime_type,
    file_extension: document.file_extension,
    file_size: document.file_size,
    file_kind: document.file_kind,
    owner_node_id: document.owner_node_id,
    branch_id: document.branch_id || document.owner_node?.branch_id || null,
    branch: document.branch ? {
      id: document.branch.id,
      branch_name: document.branch.branch_name,
      branch_code: document.branch.branch_code
    } : null,
    department_master_id: document.department_master_id || null,
    department_master: document.department_master ? {
      id: document.department_master.id,
      name: document.department_master.name,
      code: document.department_master.code,
      department_type: document.department_master.department_type,
      path_key: document.department_master.path_key
    } : null,
    owner_node: document.owner_node ? {
      id: document.owner_node.id,
      name: document.owner_node.name,
      code: document.owner_node.code,
      node_type: document.owner_node.node_type,
      path_key: document.owner_node.path_key,
      branch_id: document.owner_node.branch_id,
      department_master_id: document.owner_node.department_master_id || null
    } : null,
    source_note_id: document.source_note_id,
    uploaded_by: document.uploaded_by,
    published_by: document.published_by,
    created_at: document.created_at,
    published_at: document.published_at,
    metadata: document.metadata_json,
    viewer_access_level: viewerAccess.accessLevel || FMS_ACCESS_LEVELS.VIEW,
    viewer_access_via: viewerAccess.via,
    can_download: viewerAccess.canDownload,
    append_access: viewerAccess.via === 'BRANCH_APPEND'
      ? {
        enabled: true,
        access_level: viewerAccess.accessLevel || FMS_ACCESS_LEVELS.VIEW
      }
      : null,
    inherited_access: viewerAccess.via === 'NODE_GRANT'
      ? {
        enabled: true,
        access_level: viewerAccess.accessLevel || FMS_ACCESS_LEVELS.VIEW
      }
      : null,
    access_grants: (document.access_grants || []).map((grant) => {
      const parsedGrant = parseGrantType(grant.grant_type);
      return {
        id: grant.id,
        grant_type: parsedGrant.targetType,
        access_type: parsedGrant.targetType === 'BRANCH' ? 'BRANCH' : 'DIRECT',
        access_level: parsedGrant.accessLevel,
        user: grant.user || null,
        branch: grant.branch || null,
        granted_by: grant.approved_by_user_id ? grantActorMap[grant.approved_by_user_id] || { id: grant.approved_by_user_id } : null,
        granted_by_user_id: grant.approved_by_user_id || null,
        expires_at: grant.expires_at,
        created_at: grant.created_at
      };
    })
  };
};

const buildAppendPolicy = async (tenantId) => {
  const enabled = await isCrossBranchAppendEnabledForTenant(tenantId).catch((error) => {
    if (isAppendSchemaCompatibilityError(error)) return false;
    throw error;
  });
  return {
    enabled,
    title: 'Cross-Branch Append Access',
    summary: enabled
      ? 'Branch-to-branch visibility can be requested with a business reason. Approval releases view-only access first. Download remains an admin upgrade.'
      : 'Cross-branch append access is disabled for this bank. Super admin can enable it when the bank is ready for branch-to-branch visibility.',
    default_access_level: FMS_ACCESS_LEVELS.VIEW,
    download_upgrade_allowed: true,
    approval_scope: 'Owner-node admin / HO admin approval',
    revoke_label: 'Revoke append visibility'
  };
};

const buildNodeGrantResponse = (grant) => {
  const parsedGrant = parseGrantType(grant.grant_type);
  return {
    id: grant.id,
    grant_type: parsedGrant.targetType,
    access_level: parsedGrant.accessLevel,
    include_descendants: Boolean(grant.include_descendants),
    node: grant.node ? {
      id: grant.node.id,
      name: grant.node.name,
      code: grant.node.code,
      node_type: grant.node.node_type,
      path_key: grant.node.path_key,
      branch_id: grant.node.branch_id
    } : null,
    user: grant.user || null,
    branch: grant.branch || null,
    department_master: grant.department_master ? {
      id: grant.department_master.id,
      name: grant.department_master.name,
      code: grant.department_master.code,
      path_key: grant.department_master.path_key
    } : null,
    requested_by: grant.requested_by || null,
    approved_by: grant.approved_by || null,
    expires_at: grant.expires_at,
    revoked_at: grant.revoked_at,
    created_at: grant.created_at
  };
};

const formatFmsAuditActionLabel = (action = '') => {
  const normalized = String(action || '').trim().toUpperCase();
  if (normalized === 'FMS_CONTROLLED_COPY_ISSUED') return 'DOWNLOADED';
  if (normalized === 'FMS_RECORD_VIEWED') return 'OPENED';
  return normalized.replace(/^FMS_/, '').replace(/_/g, ' ').trim() || 'FMS EVENT';
};

const buildFmsAuditLogResponse = (log) => {
  const metadata = (log?.metadata_json && typeof log.metadata_json === 'object') ? log.metadata_json : {};
  const actorEmployeeId = metadata.employee_id || log?.actor?.employee_id || '';
  return {
    id: log.id,
    action: log.action,
    action_label: formatFmsAuditActionLabel(log.action),
    remarks: log.remarks || '',
    timestamp: log.created_at,
    performed_by: actorEmployeeId
      ? `${log?.actor?.name || 'Bank User'} / ${actorEmployeeId}`
      : (log?.actor?.name || 'Bank User'),
    actor: log.actor ? {
      id: log.actor.id,
      name: log.actor.name,
      email: log.actor.email,
      employee_id: actorEmployeeId || null
    } : null,
    metadata
  };
};

const loadAppendAccess = async (user, tenantId) => {
  try {
    return await listActiveAppendGrantAccess(user, tenantId);
  } catch (error) {
    if (isAppendSchemaCompatibilityError(error)) {
      return {
        sourceBranchIds: [],
        downloadBranchIds: [],
        grants: []
      };
    }
    throw error;
  }
};

const normalizeVisibilityMode = (value, fallback = 'ACTIVE') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  return normalized === 'BACKUP_ONLY' ? 'BACKUP_ONLY' : 'ACTIVE';
};

const assertDocumentAccessible = async (user, documentId) => {
  const document = await prisma.fmsDocument.findUnique({
    where: { id: documentId },
    include: fmsDocumentInclude
  });

  if (!document) {
    const error = new Error('FMS document not found.');
    error.status = 404;
    throw error;
  }

  const appendAccess = await loadAppendAccess(user, document.tenant_id);
  const nodeGrantAccess = await loadNodeGrantAccess(user, document.tenant_id);
  const scopedDocument = await prisma.fmsDocument.findFirst({
    where: {
      id: documentId,
      ...buildAccessibleFmsWhere(
        user,
        isSuperAdmin(user) || isBankAdmin(user)
          ? { status: 'ALL' }
          : {},
        appendAccess,
        nodeGrantAccess
      )
    },
    select: { id: true }
  });

  if (!scopedDocument) {
    const error = new Error('FMS document access denied.');
    error.status = 403;
    throw error;
  }

  return document;
};

const assertDocumentManageable = async (user, documentId) => {
  const document = await prisma.fmsDocument.findUnique({
    where: { id: documentId },
    include: fmsDocumentInclude
  });

  if (!document) {
    const error = new Error('FMS document not found.');
    error.status = 404;
    throw error;
  }

  assertCanGovernNodeAccess(user, document.owner_node, 'govern FMS access');

  return document;
};

const validateNodeHierarchy = async ({ tenantId, parentId, nodeType, branchId }) => {
  const normalizedType = String(nodeType || '').trim().toUpperCase();
  const parent = parentId ? await prisma.fmsNode.findUnique({ where: { id: parentId } }) : null;
  if (parentId && !parent) {
    const error = new Error('Parent node not found.');
    error.status = 404;
    throw error;
  }

  if (parent && Number(parent.tenant_id) !== Number(tenantId)) {
    const error = new Error('Parent node belongs to another tenant.');
    error.status = 400;
    throw error;
  }

  if (parent?.node_type === 'MEDIA_FOLDER') {
    const error = new Error('Media collector folders are terminal nodes.');
    error.status = 400;
    throw error;
  }

  if (normalizedType === 'BANK' && !branchId) {
    const error = new Error('BANK nodes must map to a branch.');
    error.status = 400;
    throw error;
  }

  if (!parent && normalizedType !== 'HO') {
    const error = new Error('Top-level FMS node must be HO.');
    error.status = 400;
    throw error;
  }

  if (parent && parent.node_type === 'HO' && !['DEPARTMENT', 'BANK', 'MEDIA_FOLDER'].includes(normalizedType)) {
    const error = new Error('Only DEPARTMENT, BANK, or MEDIA_FOLDER can be created under HO.');
    error.status = 400;
    throw error;
  }

  if (parent && parent.node_type === 'DEPARTMENT' && !['SUB_DEPARTMENT', 'BANK', 'MEDIA_FOLDER'].includes(normalizedType)) {
    const error = new Error('Only SUB_DEPARTMENT, BANK, or MEDIA_FOLDER can be created under DEPARTMENT.');
    error.status = 400;
    throw error;
  }

  if (parent && parent.node_type === 'SUB_DEPARTMENT' && !['BANK', 'MEDIA_FOLDER'].includes(normalizedType)) {
    const error = new Error('Only BANK or MEDIA_FOLDER can exist under SUB_DEPARTMENT.');
    error.status = 400;
    throw error;
  }

  if (parent && parent.node_type === 'BANK' && normalizedType !== 'MEDIA_FOLDER') {
    const error = new Error('Only MEDIA_FOLDER can exist under a BANK node.');
    error.status = 400;
    throw error;
  }

  return parent;
};

const buildPathKey = (parent, code) => parent ? `${parent.path_key}/${code}` : code;

const buildDepartmentPathKey = (parent, code) => parent ? `${parent.path_key}/${code}` : code;

const ensureMediaCollectorNode = async (tx, {
  tenantId,
  parentNode,
  branchId = null,
  departmentMasterId = null
}) => {
  if (!parentNode?.id) return null;

  const existingNode = await tx.fmsNode.findFirst({
    where: {
      tenant_id: tenantId,
      parent_id: parentNode.id,
      node_type: 'MEDIA_FOLDER',
      code: 'MEDIA'
    }
  });

  const payload = {
    tenant_id: tenantId,
    branch_id: branchId,
    department_master_id: departmentMasterId,
    parent_id: parentNode.id,
    name: 'Media Folder',
    code: 'MEDIA',
    node_type: 'MEDIA_FOLDER',
    path_key: `${parentNode.path_key}/MEDIA`,
    is_active: true
  };

  if (existingNode) {
    return tx.fmsNode.update({
      where: { id: existingNode.id },
      data: payload
    });
  }

  return tx.fmsNode.create({ data: payload });
};

const ensureTenantRootNode = async (tenantId) => {
  const existingRoot = await prisma.fmsNode.findFirst({
    where: {
      tenant_id: tenantId,
      parent_id: null
    },
    orderBy: { created_at: 'asc' }
  });
  if (existingRoot) return existingRoot;

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { tenant_code: true }
  });

  return resolveDefaultFmsOwnerNode({
    tenantId,
    branchId: null,
    tenantCode: tenant?.tenant_code || 'BANK'
  });
};

const ensureDepartmentNodeChain = async (tx, department) => {
  const rootNode = await ensureTenantRootNode(department.tenant_id);
  const parentNode = department.parent_id
    ? await tx.fmsNode.findFirst({
      where: { tenant_id: department.tenant_id, department_master_id: department.parent_id }
    })
    : rootNode;

  const nodeType = department.department_type === 'SUB_DEPARTMENT' ? 'SUB_DEPARTMENT' : 'DEPARTMENT';
  const existingNode = await tx.fmsNode.findFirst({
    where: {
      tenant_id: department.tenant_id,
      department_master_id: department.id,
      node_type: nodeType
    }
  });

  if (existingNode) {
    const updatedNode = await tx.fmsNode.update({
      where: { id: existingNode.id },
      data: {
        parent_id: parentNode?.id || null,
        name: department.name,
        code: department.code,
        path_key: buildPathKey(parentNode, department.code),
        is_active: department.is_active
      }
    });
    await ensureMediaCollectorNode(tx, {
      tenantId: department.tenant_id,
      parentNode: updatedNode,
      departmentMasterId: department.id
    });
    return updatedNode;
  }

  const createdNode = await tx.fmsNode.create({
    data: {
      tenant_id: department.tenant_id,
      department_master_id: department.id,
      parent_id: parentNode?.id || null,
      name: department.name,
      code: department.code,
      node_type: nodeType,
      path_key: buildPathKey(parentNode, department.code),
      is_active: department.is_active
    }
  });
  await ensureMediaCollectorNode(tx, {
    tenantId: department.tenant_id,
    parentNode: createdNode,
    departmentMasterId: department.id
  });
  return createdNode;
};

const syncDepartmentBranchNodes = async (tx, department, departmentNodeId) => {
  const departmentNode = await tx.fmsNode.findUnique({
    where: { id: departmentNodeId },
    select: { id: true, path_key: true }
  });
  if (!departmentNode) return;

  const mappings = await tx.fmsDepartmentBranch.findMany({
    where: { department_master_id: department.id },
    include: {
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    }
  });

  const mappedBranchIds = mappings.map((mapping) => mapping.branch_id);
  await tx.fmsNode.deleteMany({
    where: {
      tenant_id: department.tenant_id,
      department_master_id: department.id,
      node_type: 'BANK',
      ...(mappedBranchIds.length > 0 ? { branch_id: { notIn: mappedBranchIds } } : {})
    }
  });

  for (const mapping of mappings) {
    const existingNode = await tx.fmsNode.findFirst({
      where: {
        tenant_id: department.tenant_id,
        branch_id: mapping.branch_id,
        department_master_id: department.id,
        node_type: 'BANK'
      }
    });

    const payload = {
      tenant_id: department.tenant_id,
      branch_id: mapping.branch_id,
      department_master_id: department.id,
      parent_id: departmentNode.id,
      name: mapping.branch.branch_name,
      code: mapping.branch.branch_code,
      node_type: 'BANK',
      path_key: `${departmentNode.path_key}/${mapping.branch.branch_code}`,
      is_active: department.is_active
    };

    if (existingNode) {
      const updatedNode = await tx.fmsNode.update({
        where: { id: existingNode.id },
        data: payload
      });
      await ensureMediaCollectorNode(tx, {
        tenantId: department.tenant_id,
        parentNode: updatedNode,
        branchId: mapping.branch_id,
        departmentMasterId: department.id
      });
      continue;
    }

    const createdNode = await tx.fmsNode.create({ data: payload });
    await ensureMediaCollectorNode(tx, {
      tenantId: department.tenant_id,
      parentNode: createdNode,
      branchId: mapping.branch_id,
      departmentMasterId: department.id
    });
  }
};

const ensureDefaultRootNode = async (user) => {
  if (!user?.tenant_id || (user?.role?.name !== 'ADMIN' && !isSuperAdmin(user))) {
    return null;
  }
  const tenant = await prisma.tenant.findUnique({
    where: { id: user.tenant_id },
    select: { tenant_code: true }
  });

  return resolveDefaultFmsOwnerNode({
    tenantId: user.tenant_id,
    branchId: user.branch_id || null,
    tenantCode: tenant?.tenant_code || 'BANK'
  });
};

const assertGrantTargetInTenant = async ({ tenantId, grantType, userId, branchId }) => {
  if (grantType === 'USER') {
    if (!userId) {
      const error = new Error('Target user is required.');
      error.status = 400;
      throw error;
    }
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenant_id: true, is_active: true, name: true, email: true }
    });
    if (!targetUser || Number(targetUser.tenant_id) !== Number(tenantId)) {
      const error = new Error('Target user is outside the permitted bank scope.');
      error.status = 400;
      throw error;
    }
    return { user: targetUser, branch: null };
  }

  if (!branchId) {
    const error = new Error('Target branch is required.');
    error.status = 400;
    throw error;
  }
  const targetBranch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { id: true, tenant_id: true, branch_name: true, branch_code: true }
  });
  if (!targetBranch || Number(targetBranch.tenant_id) !== Number(tenantId)) {
    const error = new Error('Target branch is outside the permitted bank scope.');
    error.status = 400;
    throw error;
  }
  return { user: null, branch: targetBranch };
};

const assertAppendFeatureEnabled = async (tenantId) => {
  const enabled = await isCrossBranchAppendEnabledForTenant(tenantId).catch((error) => {
    if (isAppendSchemaCompatibilityError(error)) return false;
    throw error;
  });
  if (!enabled) {
    const error = new Error('Cross-branch append access is not enabled for this bank yet.');
    error.status = 403;
    throw error;
  }
};

const assertAppendBranches = async ({ tenantId, requesterBranchId, sourceBranchId }) => {
  if (!requesterBranchId) {
    const error = new Error('Your branch context is required before requesting append access.');
    error.status = 400;
    throw error;
  }
  if (!sourceBranchId) {
    const error = new Error('Source branch is required.');
    error.status = 400;
    throw error;
  }

  const branches = await prisma.branch.findMany({
    where: {
      tenant_id: tenantId,
      id: { in: [requesterBranchId, sourceBranchId] }
    },
    select: { id: true, branch_name: true, branch_code: true, tenant_id: true }
  });

  const requesterBranch = branches.find((branch) => Number(branch.id) === Number(requesterBranchId));
  const sourceBranch = branches.find((branch) => Number(branch.id) === Number(sourceBranchId));

  if (!requesterBranch) {
    const error = new Error('Requester branch is outside the current bank scope.');
    error.status = 400;
    throw error;
  }
  if (!sourceBranch) {
    const error = new Error('Source branch is outside the current bank scope.');
    error.status = 400;
    throw error;
  }
  if (Number(requesterBranch.id) === Number(sourceBranch.id)) {
    const error = new Error('Append access is only used for a different branch. Select another source branch.');
    error.status = 400;
    throw error;
  }

  return { requesterBranch, sourceBranch };
};

const buildAppendRequestResponse = (request) => ({
  ...request,
  request_type: 'CROSS_BRANCH_APPEND',
  policy_label: 'View-only append first. Download needs a later admin upgrade.',
  target_branch: request.requester_branch,
  target_branch_id: request.requester_branch_id,
  source_branch_id: request.source_branch_id,
  access_level: normalizeFmsAccessLevel(request.requested_access_level, FMS_ACCESS_LEVELS.VIEW),
  append_mode: true
});

const buildAppendGrantResponse = (grant) => ({
  ...grant,
  request_type: 'CROSS_BRANCH_APPEND',
  policy_label: 'Append keeps source-branch ownership unchanged. Only visibility is shared.',
  access_level: normalizeFmsAccessLevel(grant.access_level, FMS_ACCESS_LEVELS.VIEW),
  append_mode: true
});

const normalizeDistributionInstructionType = (value, fallback = 'INFORMATION') => {
  const normalized = String(value || fallback).trim().toUpperCase();
  return ['ACTION', 'ACKNOWLEDGEMENT'].includes(normalized) ? normalized : 'INFORMATION';
};

const buildDistributionTargetLabel = (recipient) => {
  if (String(recipient?.target_type || '').toUpperCase() === 'BANK_WIDE') {
    if (recipient?.target_user?.name) {
      return `${recipient.target_user.name} (Bank-wide mandatory)`;
    }
    return 'All Bank Users';
  }
  if (recipient?.target_user) {
    return `${recipient.target_user.name} (${recipient.target_user.email})`;
  }
  if (recipient?.target_branch) {
    return `${recipient.target_branch.branch_name} (${recipient.target_branch.branch_code})`;
  }
  if (recipient?.target_department_master) {
    return recipient.target_department_master.path_key || recipient.target_department_master.name;
  }
  return 'Target not available';
};

const matchesDistributionRecipient = (user, recipient) => {
  if (!user || !recipient) return false;
  if (
    String(recipient?.target_type || '').toUpperCase() === 'BANK_WIDE'
    && recipient.target_user_id
    && Number(recipient.target_user_id) === Number(user.id)
  ) {
    return true;
  }
  const accessibleBranchIds = getAccessibleBranchIds(user);
  const accessibleDepartmentIds = getAccessibleDepartmentIds(user);
  const directDepartmentId = Number(user?.department_id || 0);

  return (
    (recipient.target_user_id && Number(recipient.target_user_id) === Number(user.id))
    || (recipient.target_branch_id && accessibleBranchIds.includes(Number(recipient.target_branch_id)))
    || (recipient.target_department_master_id && accessibleDepartmentIds.includes(Number(recipient.target_department_master_id)))
    || (
      recipient.target_department_master?.legacy_department_id
      && directDepartmentId
      && Number(recipient.target_department_master.legacy_department_id) === directDepartmentId
    )
  );
};

const buildDistributionRecipientResponse = (recipient, viewer = null) => {
  const isRecipientViewer = viewer ? matchesDistributionRecipient(viewer, recipient) : false;
  return {
    id: recipient.id,
    target_type: recipient.target_type,
    target_label: buildDistributionTargetLabel(recipient),
    status: recipient.status,
    viewed_at: recipient.viewed_at,
    acknowledged_at: recipient.acknowledged_at,
    completed_at: recipient.completed_at,
    forwarded_at: recipient.forwarded_at,
    last_action_note: recipient.last_action_note || null,
    can_forward: Boolean(recipient.can_forward),
    is_current_user_target: isRecipientViewer,
    target_user: recipient.target_user || null,
    target_branch: recipient.target_branch || null,
    target_department_master: recipient.target_department_master
      ? {
        id: recipient.target_department_master.id,
        name: recipient.target_department_master.name,
        code: recipient.target_department_master.code,
        path_key: recipient.target_department_master.path_key,
        department_type: recipient.target_department_master.department_type,
        legacy_department_id: recipient.target_department_master.legacy_department_id
      }
      : null,
    assigned_by: recipient.assigned_by || null,
    created_at: recipient.created_at,
    updated_at: recipient.updated_at
  };
};

const buildDistributionResponse = (distribution, viewer = null) => ({
  recipient_summary: {
    total: (distribution.recipients || []).length,
    unread: (distribution.recipients || []).filter((recipient) => !recipient.viewed_at).length,
    acknowledged: (distribution.recipients || []).filter((recipient) => String(recipient.status || '').toUpperCase() === 'ACKNOWLEDGED').length,
    completed: (distribution.recipients || []).filter((recipient) => String(recipient.status || '').toUpperCase() === 'COMPLETED').length
  },
  is_bank_wide_mandatory: (distribution.recipients || []).some((recipient) => String(recipient.target_type || '').toUpperCase() === 'BANK_WIDE'),
  id: distribution.id,
  tenant_id: distribution.tenant_id,
  document_id: distribution.document_id,
  parent_distribution_id: distribution.parent_distribution_id || null,
  title: distribution.title,
  instruction_type: normalizeDistributionInstructionType(distribution.instruction_type),
  access_level: normalizeFmsAccessLevel(distribution.access_level, FMS_ACCESS_LEVELS.VIEW),
  message: distribution.message || null,
  allow_redistribution: Boolean(distribution.allow_redistribution),
  due_at: distribution.due_at,
  status: distribution.status,
  created_at: distribution.created_at,
  updated_at: distribution.updated_at,
  created_by: distribution.created_by || null,
  parent_distribution: distribution.parent_distribution || null,
  recipients: (distribution.recipients || []).map((recipient) => buildDistributionRecipientResponse(recipient, viewer))
});

const buildDistributionInboxItem = (recipient) => {
  const distributionAccessLevel = normalizeFmsAccessLevel(
    recipient.distribution?.access_level,
    FMS_ACCESS_LEVELS.VIEW
  );

  return {
    is_bank_wide_mandatory: String(recipient.target_type || '').toUpperCase() === 'BANK_WIDE',
    id: recipient.id,
    status: recipient.status,
    viewed_at: recipient.viewed_at,
    acknowledged_at: recipient.acknowledged_at,
    completed_at: recipient.completed_at,
    forwarded_at: recipient.forwarded_at,
    last_action_note: recipient.last_action_note || null,
    can_forward: Boolean(recipient.can_forward),
    assigned_by: recipient.assigned_by || null,
    distribution: recipient.distribution ? {
      id: recipient.distribution.id,
      title: recipient.distribution.title,
      instruction_type: normalizeDistributionInstructionType(recipient.distribution.instruction_type),
      access_level: distributionAccessLevel,
      message: recipient.distribution.message || null,
      allow_redistribution: Boolean(recipient.distribution.allow_redistribution),
      due_at: recipient.distribution.due_at,
      created_at: recipient.distribution.created_at,
      created_by: recipient.distribution.created_by || null,
      parent_distribution: recipient.distribution.parent_distribution || null
    } : null,
    document: recipient.distribution?.document ? {
      id: recipient.distribution.document.id,
      title: recipient.distribution.document.title,
      file_name: recipient.distribution.document.file_name,
      document_reference: recipient.distribution.document.document_reference || recipient.distribution.document.customer_reference || null,
      status: recipient.distribution.document.status,
      version_number: recipient.distribution.document.version_number,
      owner_node: recipient.distribution.document.owner_node ? {
        id: recipient.distribution.document.owner_node.id,
        name: recipient.distribution.document.owner_node.name,
        code: recipient.distribution.document.owner_node.code,
        node_type: recipient.distribution.document.owner_node.node_type
      } : null,
      branch: recipient.distribution.document.branch || null,
      department_master: recipient.distribution.document.department_master || null,
      can_download: hasRequiredAccessLevel(distributionAccessLevel, FMS_ACCESS_LEVELS.DOWNLOAD),
      viewer_access_level: distributionAccessLevel,
      document_type: recipient.distribution.document.document_type || null,
      document_category: recipient.distribution.document.document_category || null
    } : null,
    target_type: recipient.target_type,
    target_label: buildDistributionTargetLabel(recipient),
    target_user: recipient.target_user || null,
    target_branch: recipient.target_branch || null,
    target_department_master: recipient.target_department_master || null
  };
};

const assertDepartmentTargetInTenant = async ({ tenantId, departmentMasterId }) => {
  if (!departmentMasterId) {
    const error = new Error('Target department is required.');
    error.status = 400;
    throw error;
  }

  const department = await prisma.fmsDepartment.findFirst({
    where: {
      id: departmentMasterId,
      tenant_id: tenantId,
      is_active: true
    },
    include: {
      branch_mappings: {
        include: {
          branch: { select: { id: true, branch_name: true, branch_code: true } }
        }
      }
    }
  });

  if (!department) {
    const error = new Error('Target department is outside the permitted bank scope.');
    error.status = 400;
    throw error;
  }

  return department;
};

const loadDepartmentRecipientUsers = async (tx, department) => {
  if (!department?.legacy_department_id) {
    const error = new Error('Target department is not mapped to a live banking department yet.');
    error.status = 400;
    throw error;
  }

  const users = await tx.user.findMany({
    where: {
      tenant_id: department.tenant_id,
      department_id: department.legacy_department_id,
      is_active: true
    },
    select: {
      id: true,
      branch_id: true,
      tenant_id: true,
      name: true,
      email: true,
      tenant: {
        select: {
          id: true,
          tenant_name: true,
          tenant_code: true,
          brand_display_name: true,
          brand_short_code: true,
          brand_subtitle: true
        }
      },
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    }
  });

  if (users.length === 0) {
    const error = new Error('No active users are mapped to the selected department yet.');
    error.status = 400;
    throw error;
  }

  return users;
};

const loadBranchRecipientUsers = async (tx, tenantId, branchId) => {
  const users = await tx.user.findMany({
    where: {
      tenant_id: tenantId,
      is_active: true,
      OR: [
        { branch_id: branchId },
        { branch_accesses: { some: { branch_id: branchId } } }
      ]
    },
    select: {
      id: true,
      branch_id: true,
      tenant_id: true,
      name: true,
      email: true,
      tenant: {
        select: {
          id: true,
          tenant_name: true,
          tenant_code: true,
          brand_display_name: true,
          brand_short_code: true,
          brand_subtitle: true
        }
      },
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    }
  });

  if (users.length === 0) {
    const error = new Error('No active users are mapped to the selected branch yet.');
    error.status = 400;
    throw error;
  }

  return users;
};

const loadAllBankRecipientUsers = async (tx, tenantId) => {
  const users = await tx.user.findMany({
    where: {
      tenant_id: tenantId,
      is_active: true
    },
    select: {
      id: true,
      branch_id: true,
      tenant_id: true,
      name: true,
      email: true,
      tenant: {
        select: {
          id: true,
          tenant_name: true,
          tenant_code: true,
          brand_display_name: true,
          brand_short_code: true,
          brand_subtitle: true
        }
      },
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    }
  });

  if (users.length === 0) {
    const error = new Error('No active users are available in this bank scope yet.');
    error.status = 400;
    throw error;
  }

  return users;
};

const resolveDistributionRecipientUsers = async (tx, {
  tenantId,
  targetType,
  targetUserId,
  targetBranchId,
  targetDepartmentMaster
}) => {
  if (targetType === 'USER') {
    const targetUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        branch_id: true,
        tenant_id: true,
        name: true,
        email: true,
        tenant: {
          select: {
            id: true,
            tenant_name: true,
            tenant_code: true,
            brand_display_name: true,
            brand_short_code: true,
            brand_subtitle: true
          }
        },
        branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    });
    return targetUser ? [targetUser] : [];
  }

  if (targetType === 'BRANCH') {
    return loadBranchRecipientUsers(tx, tenantId, targetBranchId);
  }

  if (targetType === 'BANK_WIDE') {
    return loadAllBankRecipientUsers(tx, tenantId);
  }

  return loadDepartmentRecipientUsers(tx, targetDepartmentMaster);
};

const upsertDistributionGrant = async (tx, {
  documentId,
  targetType,
  accessLevel,
  userId = null,
  branchId = null,
  requestedByUserId,
  approvedByUserId,
  expiresAt = null
}) => {
  const existingGrant = await findActiveGrantForTarget(tx, {
    documentId,
    targetType,
    userId,
    branchId
  });

  if (!existingGrant) {
    return tx.fmsDocumentAccessGrant.create({
      data: {
        document_id: documentId,
        grant_type: encodeGrantType(targetType, accessLevel),
        user_id: userId,
        branch_id: branchId,
        requested_by_user_id: requestedByUserId,
        approved_by_user_id: approvedByUserId,
        expires_at: expiresAt
      }
    });
  }

  if (!hasRequiredAccessLevel(parseGrantType(existingGrant.grant_type).accessLevel, accessLevel)) {
    return tx.fmsDocumentAccessGrant.update({
      where: { id: existingGrant.id },
      data: {
        grant_type: encodeGrantType(targetType, accessLevel),
        approved_by_user_id: approvedByUserId,
        expires_at: expiresAt
      }
    });
  }

  return existingGrant;
};

const ensureDistributionVisibility = async (tx, {
  document,
  targetType,
  accessLevel,
  targetUserId,
  targetBranchId,
  targetDepartmentMaster,
  actorUserId,
  expiresAt
}) => {
  if (targetType === 'USER') {
    await upsertDistributionGrant(tx, {
      documentId: document.id,
      targetType: 'USER',
      accessLevel,
      userId: targetUserId,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      expiresAt
    });
    return;
  }

  if (targetType === 'BRANCH') {
    await upsertDistributionGrant(tx, {
      documentId: document.id,
      targetType: 'BRANCH',
      accessLevel,
      branchId: targetBranchId,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      expiresAt
    });
    return;
  }

  if (targetType === 'BANK_WIDE') {
    const bankWideUsers = await loadAllBankRecipientUsers(tx, document.tenant_id);
    await Promise.all(bankWideUsers.map((targetUser) => upsertDistributionGrant(tx, {
      documentId: document.id,
      targetType: 'USER',
      accessLevel,
      userId: targetUser.id,
      requestedByUserId: actorUserId,
      approvedByUserId: actorUserId,
      expiresAt
    })));
    return;
  }

  const departmentUsers = await loadDepartmentRecipientUsers(tx, targetDepartmentMaster);
  await Promise.all(departmentUsers.map((targetUser) => upsertDistributionGrant(tx, {
    documentId: document.id,
    targetType: 'USER',
    accessLevel,
    userId: targetUser.id,
    requestedByUserId: actorUserId,
    approvedByUserId: actorUserId,
    expiresAt
  })));
};

const assertDistributionAuthority = ({ user, document, sourceRecipient = null }) => {
  try {
    assertCanGovernNodeAccess(user, document.owner_node, 'distribute this record');
    return { mode: 'ADMIN' };
  } catch (error) {
    if (
      sourceRecipient
      && matchesDistributionRecipient(user, sourceRecipient)
      && sourceRecipient.can_forward
      && sourceRecipient.distribution
      && Number(sourceRecipient.distribution.document_id) === Number(document.id)
      && String(sourceRecipient.distribution.status || '').toUpperCase() === 'ACTIVE'
    ) {
      return { mode: 'FORWARD' };
    }
    throw error;
  }
};

const distributionInboxRecipientInclude = {
  target_user: { select: { id: true, name: true, email: true } },
  target_branch: { select: { id: true, branch_name: true, branch_code: true } },
  target_department_master: { select: { id: true, name: true, code: true, path_key: true, department_type: true, legacy_department_id: true } },
  assigned_by: { select: { id: true, name: true, email: true } },
  distribution: {
    include: {
      created_by: { select: { id: true, name: true, email: true } },
      parent_distribution: { select: { id: true, title: true, instruction_type: true, created_at: true } },
      document: {
        select: {
          id: true,
          title: true,
          file_name: true,
          document_reference: true,
          customer_reference: true,
          status: true,
          version_number: true,
          owner_node: { select: { id: true, name: true, code: true, node_type: true } },
          branch: { select: { id: true, branch_name: true, branch_code: true } },
          department_master: { select: { id: true, name: true, code: true, path_key: true } }
        }
      }
    }
  }
};

const findActiveBranchAppendGrant = async (tx, { tenantId, sourceBranchId, targetBranchId }) => tx.fmsBranchAppendGrant.findFirst({
  where: {
    tenant_id: tenantId,
    source_branch_id: sourceBranchId,
    target_branch_id: targetBranchId,
    ...getActiveAppendGrantWhere()
  },
  include: {
    source_branch: { select: { id: true, branch_name: true, branch_code: true } },
    target_branch: { select: { id: true, branch_name: true, branch_code: true } },
    requested_by: { select: { id: true, name: true, email: true } },
    approved_by: { select: { id: true, name: true, email: true } }
  }
});

export const getFmsBootstrap = async (req, res) => {
  try {
    assertFmsFeatureAccess(req.user);
    const payload = buildFmsPermissionsPayload(req.user);
    const scopedTenantId = isSuperAdmin(req.user)
      ? parseId(req.query.tenant_id)
      : req.user.tenant_id;
    const sourceMode = normalizeFmsSourceMode(req.query.source_mode, isSuperAdmin(req.user) || isBankAdmin(req.user) ? 'ALL' : 'MANUAL_ONLY');
    const filters = scopedTenantId ? { tenant_id: scopedTenantId } : {};

    if (hasFmsFeatureAccess(req.user) && req.user?.tenant_id) {
      await ensureDefaultRootNode(req.user);
    }
    if (supportsDepartmentModel && scopedTenantId) {
      await ensureDefaultFmsDepartmentMasters(scopedTenantId);
    }

    const appendPolicyPromise = scopedTenantId ? buildAppendPolicy(scopedTenantId) : Promise.resolve(await buildAppendPolicy(req.user.tenant_id));
    const standardsTenantId = scopedTenantId || req.user.tenant_id || null;
    const [nodes, branches, users, pendingRequests, pendingAppendRequests, tenants, appendPolicy, departments, legacyDepartments, activeDocuments, standardsTenant] = await Promise.all([
      prisma.fmsNode.findMany({
        where: filters,
        include: {
          branch: { select: { id: true, branch_name: true, branch_code: true } },
          department_master: { select: { id: true, name: true, code: true, path_key: true, department_type: true, legacy_department_id: true } }
        },
        orderBy: [{ path_key: 'asc' }]
      }),
      prisma.branch.findMany({
        where: scopedTenantId ? { tenant_id: scopedTenantId } : {},
        orderBy: { branch_name: 'asc' },
        select: { id: true, branch_name: true, branch_code: true, tenant_id: true }
      }),
      (isSuperAdmin(req.user) || isBankAdmin(req.user))
        ? prisma.user.findMany({
          where: {
            ...(scopedTenantId ? { tenant_id: scopedTenantId } : {}),
            is_active: true,
            ...(!isSuperAdmin(req.user) ? { NOT: { role: { name: 'SUPER_ADMIN' } } } : {})
          },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, email: true, branch_id: true, role: { select: { name: true } } }
        })
        : [],
      prisma.fmsAccessRequest.count({
        where: {
          status: 'PENDING',
          ...(scopedTenantId ? { document: { tenant_id: scopedTenantId } } : {})
        }
      }),
      scopedTenantId && supportsBranchAppendRequestModel
        ? prisma.fmsBranchAppendRequest.count({
          where: {
            tenant_id: scopedTenantId,
            status: 'PENDING'
          }
        }).catch((error) => {
          if (isAppendSchemaCompatibilityError(error)) return 0;
          throw error;
        })
        : Promise.resolve(0),
      isSuperAdmin(req.user)
        ? prisma.tenant.findMany({
          orderBy: { tenant_name: 'asc' },
          select: { id: true, tenant_name: true, tenant_code: true }
        })
        : [],
      appendPolicyPromise,
      supportsDepartmentModel
        ? prisma.fmsDepartment.findMany({
          where: filters,
          include: {
            legacy_department: { select: { id: true, name: true } },
            branch_mappings: {
              include: {
                branch: { select: { id: true, branch_name: true, branch_code: true } }
              }
            }
          },
          orderBy: [{ path_key: 'asc' }]
        })
        : [],
      prisma.department.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true }
      }),
      prisma.fmsDocument.findMany({
        where: {
          ...(scopedTenantId ? { tenant_id: scopedTenantId } : {}),
          ...buildFmsSourceFilter(sourceMode),
          is_latest_version: true
        },
        select: { owner_node_id: true, department_master_id: true }
      }),
      standardsTenantId
        ? prisma.tenant.findUnique({
          where: { id: standardsTenantId },
          select: tenantLibraryStandardsSelect
        }).catch((error) => {
          if (isAppendSchemaCompatibilityError(error)) return null;
          throw error;
        })
        : Promise.resolve(null)
    ]);

    const libraryStandards = buildLibraryStandardsPayload(standardsTenant);
    const uploadableNodes = nodes.filter((node) => canUserUploadToNode(req.user, node));
    const scopedRecordTypeValues = Array.from(new Set(
      uploadableNodes
        .flatMap((node) => listScopedFmsRecordTypes(libraryStandards.record_types, node))
        .map((item) => item.value)
        .filter(Boolean)
    ));
    const nodeTree = attachNodeCounts(buildNodeTree(nodes), buildNodeCountMap(activeDocuments));
    const departmentTree = attachDepartmentCounts(buildDepartmentTree(departments), buildDepartmentCountMap(activeDocuments));
    const mediaFolderCount = nodes.filter((node) => String(node.node_type || '').toUpperCase() === 'MEDIA_FOLDER').length;

    return res.json({
      permissions: payload,
      source_mode: sourceMode,
      append_policy: appendPolicy,
      classifications: DOCUMENT_CLASSIFICATIONS,
      tenant_scope_id: scopedTenantId || req.user.tenant_id || null,
      tenants,
      nodes,
      upload_scope: {
        node_ids: uploadableNodes.map((node) => node.id),
        record_type_values: scopedRecordTypeValues,
        manual_only_default: sourceMode === 'MANUAL_ONLY'
      },
      node_tree: nodeTree,
      departments,
      department_tree: departmentTree,
      legacy_departments: legacyDepartments,
      library_standards: libraryStandards,
      hierarchy_summary: {
        bank_count: tenants.length || (scopedTenantId || req.user.tenant_id ? 1 : 0),
        department_count: departments.length,
        branch_count: branches.length,
        media_folder_count: mediaFolderCount
      },
      upload_policy: {
        allowed_extensions: allowedUploadExtensions,
        max_file_size_bytes: uploadMaxFileSizeBytes,
        max_file_size_mb: Number((uploadMaxFileSizeBytes / (1024 * 1024)).toFixed(2)),
        scan_enabled: uploadScanEnabled
      },
      search_modes: [
        'ALL',
        'CUSTOMER',
        'CIF',
        'ACCOUNT',
        'IDENTITY',
        'DOCUMENT_REF',
        'DEPARTMENT',
        'BRANCH',
        'UPLOADER',
        'DOCUMENT_TYPE',
        'CATEGORY',
        'FILE',
        'TAGS'
      ],
      branches,
      users,
      pending_request_count: pendingRequests,
      pending_append_request_count: pendingAppendRequests
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getFmsLibraryStandards = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const tenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) || req.user.tenant_id : req.user.tenant_id;
    if (!tenantId) {
      return res.json({ standards: buildLibraryStandardsPayload(null) });
    }
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: tenantLibraryStandardsSelect
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });
    return res.json({ standards: buildLibraryStandardsPayload(tenant) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const updateFmsLibraryStandards = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    const tenantId = parseId(req.body.tenant_id) || req.user.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant scope is required.' });
    }
    if (!isSuperAdmin(req.user) && Number(tenantId) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const classificationMaster = Array.isArray(req.body.classification_master)
      ? req.body.classification_master.map((item) => ({
        value: String(item.value || '').trim().toUpperCase(),
        label: String(item.label || '').trim()
      })).filter((item) => DOCUMENT_CLASSIFICATIONS.includes(item.value) && item.label)
      : undefined;
    const recordTypeMaster = Array.isArray(req.body.record_type_master)
      ? req.body.record_type_master.map((item) => ({
        value: String(item.value || '').trim().toUpperCase().replace(/[^A-Z0-9_ -]/g, '').replace(/\s+/g, '_'),
        label: String(item.label || '').trim(),
        department_codes: Array.isArray(item.department_codes)
          ? Array.from(new Set(item.department_codes.map((entry) => String(entry || '').trim().toUpperCase()).filter(Boolean)))
          : undefined,
        default_desk: String(item.default_desk || '').trim() || undefined,
        required_fields: Array.isArray(item.required_fields)
          ? Array.from(new Set(item.required_fields.map((entry) => String(entry || '').trim()).filter(Boolean)))
          : undefined,
        visible_fields: Array.isArray(item.visible_fields)
          ? Array.from(new Set(item.visible_fields.map((entry) => String(entry || '').trim()).filter(Boolean)))
          : undefined,
        field_labels: item.field_labels && typeof item.field_labels === 'object' && !Array.isArray(item.field_labels)
          ? Object.entries(item.field_labels).reduce((acc, [key, value]) => {
            const normalizedKey = String(key || '').trim();
            const normalizedValue = String(value || '').trim();
            if (normalizedKey && normalizedValue) acc[normalizedKey] = normalizedValue;
            return acc;
          }, {})
          : undefined
      })).filter((item) => item.value && item.label)
      : undefined;
    const recordDeskMaster = Array.isArray(req.body.record_desk_master)
      ? Array.from(new Set(req.body.record_desk_master.map((item) => String(item || '').trim()).filter(Boolean)))
      : undefined;

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(classificationMaster ? { fms_classification_master_json: classificationMaster } : {}),
        ...(recordTypeMaster ? { fms_record_type_master_json: recordTypeMaster } : {}),
        ...(recordDeskMaster ? { fms_record_desk_master_json: recordDeskMaster } : {})
      },
      select: tenantLibraryStandardsSelect
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) {
        const compatibilityError = new Error('Apply the latest database migration before updating bank library standards.');
        compatibilityError.status = 400;
        throw compatibilityError;
      }
      throw error;
    });

    await writeFmsAuditLog({
      tenantId,
      actorUserId: req.user.id,
      action: 'FMS_LIBRARY_STANDARDS_UPDATED',
      remarks: 'Bank library standards updated',
      metadata: {
        classification_count: classificationMaster?.length || null,
        record_type_count: recordTypeMaster?.length || null,
        record_desk_count: recordDeskMaster?.length || null
      }
    });

    return res.json({
      standards: buildLibraryStandardsPayload(tenant)
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsNodes = async (req, res) => {
  try {
    assertFmsFeatureAccess(req.user);
    const where = isSuperAdmin(req.user)
      ? (parseId(req.query.tenant_id) ? { tenant_id: parseId(req.query.tenant_id) } : {})
      : { tenant_id: req.user.tenant_id };
    const nodes = await prisma.fmsNode.findMany({
      where,
      include: {
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        parent: { select: { id: true, name: true, code: true, path_key: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true, department_type: true } }
      },
      orderBy: [{ path_key: 'asc' }]
    });
    return res.json({
      items: nodes,
      tree: buildNodeTree(nodes)
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsDepartments = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDepartmentModel) {
      return res.json({ items: [], tree: [] });
    }

    const tenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    const where = tenantId ? { tenant_id: tenantId } : {};
    if (tenantId) {
      await ensureDefaultFmsDepartmentMasters(tenantId);
    }
    const [departments, documents] = await Promise.all([
      prisma.fmsDepartment.findMany({
        where,
        include: {
          legacy_department: { select: { id: true, name: true } },
          branch_mappings: {
            include: {
              branch: { select: { id: true, branch_name: true, branch_code: true } }
            }
          }
        },
        orderBy: [{ path_key: 'asc' }]
      }),
      prisma.fmsDocument.findMany({
        where: {
          ...(tenantId ? { tenant_id: tenantId } : {}),
          is_latest_version: true
        },
        select: { department_master_id: true }
      })
    ]);

    const tree = attachDepartmentCounts(buildDepartmentTree(departments), buildDepartmentCountMap(documents));
    return res.json({ items: departments, tree });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsDepartment = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    if (!supportsDepartmentModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using bank department master.' });
    }

    const tenantId = parseId(req.body.tenant_id) || req.user.tenant_id;
    if (!isSuperAdmin(req.user) && Number(tenantId) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const parentDepartmentId = parseId(req.body.parent_department_id);
    const legacyDepartmentId = parseId(req.body.legacy_department_id);
    const branchIds = Array.isArray(req.body.branch_ids) ? req.body.branch_ids.map(parseId).filter(Boolean) : [];
    const parentDepartment = parentDepartmentId
      ? await prisma.fmsDepartment.findFirst({ where: { id: parentDepartmentId, tenant_id: tenantId } })
      : null;

    if (parentDepartmentId && !parentDepartment) {
      return res.status(404).json({ error: 'Parent department was not found in this bank.' });
    }

    const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const name = String(req.body.name || '').trim();
    const departmentType = parentDepartment ? 'SUB_DEPARTMENT' : 'DEPARTMENT';
    const hierarchyLevel = parentDepartment ? Number(parentDepartment.hierarchy_level || 0) + 1 : 0;
    const pathKey = buildDepartmentPathKey(parentDepartment, code);

    if (branchIds.length > 0) {
      const validBranchCount = await prisma.branch.count({
        where: {
          tenant_id: tenantId,
          id: { in: branchIds }
        }
      });
      if (validBranchCount !== branchIds.length) {
        return res.status(400).json({ error: 'One or more selected branches are outside the current bank scope.' });
      }
    }

    const department = await prisma.$transaction(async (tx) => {
      const createdDepartment = await tx.fmsDepartment.create({
        data: {
          tenant_id: tenantId,
          parent_id: parentDepartment?.id || null,
          legacy_department_id: legacyDepartmentId,
          name,
          code,
          department_type: departmentType,
          hierarchy_level: hierarchyLevel,
          path_key: pathKey
        },
        include: {
          legacy_department: { select: { id: true, name: true } }
        }
      });

      if (branchIds.length > 0) {
        await tx.fmsDepartmentBranch.createMany({
          data: branchIds.map((branchId) => ({
            tenant_id: tenantId,
            department_master_id: createdDepartment.id,
            branch_id: branchId
          })),
          skipDuplicates: true
        });
      }

      const departmentNode = await ensureDepartmentNodeChain(tx, createdDepartment);
      await syncDepartmentBranchNodes(tx, createdDepartment, departmentNode.id);

      return tx.fmsDepartment.findUnique({
        where: { id: createdDepartment.id },
        include: {
          legacy_department: { select: { id: true, name: true } },
          branch_mappings: {
            include: {
              branch: { select: { id: true, branch_name: true, branch_code: true } }
            }
          }
        }
      });
    });

    await writeFmsAuditLog({
      tenantId,
      actorUserId: req.user.id,
      action: 'FMS_DEPARTMENT_MASTER_CREATED',
      remarks: `${department.name} created in bank department master`,
      metadata: { department_master_id: department.id, branch_ids: branchIds }
    });

    return res.status(201).json({ department });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const updateFmsDepartment = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    if (!supportsDepartmentModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before updating bank department master.' });
    }

    const departmentId = parseId(req.params.id);
    const currentDepartment = await prisma.fmsDepartment.findUnique({
      where: { id: departmentId },
      include: {
        branch_mappings: true
      }
    });
    if (!currentDepartment) {
      return res.status(404).json({ error: 'Department master record not found.' });
    }
    if (!isSuperAdmin(req.user) && Number(currentDepartment.tenant_id) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const branchIds = Array.isArray(req.body.branch_ids) ? req.body.branch_ids.map(parseId).filter(Boolean) : null;
    const nextName = String(req.body.name || currentDepartment.name).trim();
    const nextCode = String(req.body.code || currentDepartment.code).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const nextPathKey = buildDepartmentPathKey(
      currentDepartment.parent_id
        ? await prisma.fmsDepartment.findUnique({ where: { id: currentDepartment.parent_id } })
        : null,
      nextCode
    );

    if (branchIds) {
      const validBranchCount = await prisma.branch.count({
        where: {
          tenant_id: currentDepartment.tenant_id,
          id: { in: branchIds }
        }
      });
      if (validBranchCount !== branchIds.length) {
        return res.status(400).json({ error: 'One or more selected branches are outside the current bank scope.' });
      }
    }

    const department = await prisma.$transaction(async (tx) => {
      const updatedDepartment = await tx.fmsDepartment.update({
        where: { id: currentDepartment.id },
        data: {
          name: nextName,
          code: nextCode,
          path_key: nextPathKey,
          legacy_department_id: req.body.legacy_department_id != null ? parseId(req.body.legacy_department_id) : currentDepartment.legacy_department_id,
          is_active: req.body.is_active != null ? Boolean(req.body.is_active) : currentDepartment.is_active
        }
      });

      if (branchIds) {
        await tx.fmsDepartmentBranch.deleteMany({
          where: { department_master_id: currentDepartment.id }
        });
        if (branchIds.length > 0) {
          await tx.fmsDepartmentBranch.createMany({
            data: branchIds.map((branchId) => ({
              tenant_id: currentDepartment.tenant_id,
              department_master_id: currentDepartment.id,
              branch_id: branchId
            })),
            skipDuplicates: true
          });
        }
      }

      const departmentNode = await ensureDepartmentNodeChain(tx, updatedDepartment);
      await syncDepartmentBranchNodes(tx, updatedDepartment, departmentNode.id);

      return tx.fmsDepartment.findUnique({
        where: { id: currentDepartment.id },
        include: {
          legacy_department: { select: { id: true, name: true } },
          branch_mappings: {
            include: {
              branch: { select: { id: true, branch_name: true, branch_code: true } }
            }
          }
        }
      });
    });

    await writeFmsAuditLog({
      tenantId: currentDepartment.tenant_id,
      actorUserId: req.user.id,
      action: 'FMS_DEPARTMENT_MASTER_UPDATED',
      remarks: `${department.name} updated in bank department master`,
      metadata: { department_master_id: department.id }
    });

    return res.json({ department });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsNode = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    if (!isSuperAdmin(req.user) && !isBankAdmin(req.user)) {
      return res.status(403).json({ error: 'Only bank admin or super admin can create governance nodes.' });
    }
    const tenantId = parseId(req.body.tenant_id) || req.user.tenant_id;
    const branchId = parseId(req.body.branch_id);
    const departmentMasterId = parseId(req.body.department_master_id);
    const parentId = parseId(req.body.parent_id);
    const code = String(req.body.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const name = String(req.body.name || '').trim();
    const nodeType = String(req.body.node_type || '').trim().toUpperCase();

    const parent = await validateNodeHierarchy({ tenantId, parentId, nodeType, branchId });
    if (!isSuperAdmin(req.user) && tenantId !== req.user.tenant_id) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const node = await prisma.fmsNode.create({
      data: {
        tenant_id: tenantId,
        branch_id: branchId,
        department_master_id: departmentMasterId,
        parent_id: parentId,
        name,
        code,
        node_type: nodeType,
        path_key: buildPathKey(parent, code)
      }
    });

    await writeFmsAuditLog({
      tenantId,
      ownerNodeId: node.id,
      actorUserId: req.user.id,
      action: 'FMS_NODE_CREATED',
      remarks: `${name} (${nodeType}) created`
    });

    return res.status(201).json(node);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsNodeGrants = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const nodeId = parseId(req.params.id);
    const node = await prisma.fmsNode.findUnique({
      where: { id: nodeId },
      include: { branch: { select: { id: true, branch_name: true, branch_code: true } } }
    });
    if (!node) {
      return res.status(404).json({ error: 'Governance node not found.' });
    }
    assertCanGovernNodeAccess(req.user, node, 'review node access');

    const grants = supportsNodeGrantModel ? await prisma.fmsNodeAccessGrant.findMany({
      where: {
        node_id: node.id,
        ...getActiveNodeGrantWhere()
      },
      include: {
        node: { select: { id: true, name: true, code: true, node_type: true, path_key: true, branch_id: true } },
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      },
      orderBy: [{ created_at: 'desc' }]
    }) : [];

    return res.json({
      node: {
        id: node.id,
        name: node.name,
        code: node.code,
        node_type: node.node_type,
        path_key: node.path_key,
        branch: node.branch || null
      },
      grants: grants.map(buildNodeGrantResponse)
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsNodeGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    const nodeId = parseId(req.params.id);
    const node = await prisma.fmsNode.findUnique({
      where: { id: nodeId },
      include: { branch: { select: { id: true, branch_name: true, branch_code: true } } }
    });
    if (!node) {
      return res.status(404).json({ error: 'Governance node not found.' });
    }
    assertCanGovernNodeAccess(req.user, node, 'govern node access');

    const grantType = normalizeGrantTarget(req.body.grant_type);
    const accessLevel = normalizeFmsAccessLevel(req.body.access_level, FMS_ACCESS_LEVELS.VIEW);
    const includeDescendants = req.body.include_descendants !== false;
    const userId = parseId(req.body.user_id);
    const branchId = parseId(req.body.branch_id);
    const departmentMasterId = parseId(req.body.department_master_id);
    const expiresAt = parseOptionalDate(req.body.expires_at);

    const target = grantType === 'DEPARTMENT'
      ? await prisma.fmsDepartment.findFirst({
        where: { id: departmentMasterId, tenant_id: node.tenant_id },
        select: { id: true, name: true, code: true, path_key: true }
      })
      : grantType === 'GLOBAL'
        ? { id: 'GLOBAL', name: 'Whole Bank Scope' }
        : await assertGrantTargetInTenant({
          tenantId: node.tenant_id,
          grantType,
          userId,
          branchId
        });

    if (grantType === 'DEPARTMENT' && !target) {
      return res.status(400).json({ error: 'Selected department is outside the current bank scope.' });
    }

    const existingGrant = supportsNodeGrantModel ? await prisma.fmsNodeAccessGrant.findFirst({
      where: {
        node_id: node.id,
        grant_type: { in: listGrantTypeAliases(grantType) },
        ...(grantType === 'USER'
          ? { user_id: userId }
          : grantType === 'BRANCH'
            ? { branch_id: branchId }
            : grantType === 'DEPARTMENT'
              ? { department_master_id: departmentMasterId }
              : { user_id: null, branch_id: null, department_master_id: null }),
        ...getActiveNodeGrantWhere()
      }
    }) : null;

    if (existingGrant) {
      return res.status(409).json({ error: 'An active inherited access grant already exists for this node and target.' });
    }

    const grant = await prisma.fmsNodeAccessGrant.create({
      data: {
        tenant_id: node.tenant_id,
        node_id: node.id,
        grant_type: encodeGrantType(grantType, accessLevel),
        user_id: grantType === 'USER' ? userId : null,
        branch_id: grantType === 'BRANCH' ? branchId : null,
        department_master_id: grantType === 'DEPARTMENT' ? departmentMasterId : null,
        access_level: accessLevel,
        include_descendants: includeDescendants,
        requested_by_user_id: req.user.id,
        approved_by_user_id: req.user.id,
        expires_at: expiresAt
      },
      include: {
        node: { select: { id: true, name: true, code: true, node_type: true, path_key: true, branch_id: true } },
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      }
    });

    await writeFmsAuditLog({
      tenantId: node.tenant_id,
      ownerNodeId: node.id,
      actorUserId: req.user.id,
      action: 'FMS_NODE_GRANT_CREATED',
      remarks: `${grantType} inherited ${accessLevel.toLowerCase()} access granted on ${node.path_key}`,
      metadata: {
        node_grant_id: grant.id,
        target_user_id: target.user?.id || null,
        target_branch_id: target.branch?.id || null,
        target_department_id: grantType === 'DEPARTMENT' ? target.id : null,
        target_scope: grantType === 'GLOBAL' ? 'GLOBAL' : null,
        include_descendants: includeDescendants
      }
    });

    return res.status(201).json({ grant: buildNodeGrantResponse(grant) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const revokeFmsNodeGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.REVOKE);
    const grantId = parseId(req.params.id);
    const grant = await prisma.fmsNodeAccessGrant.findUnique({
      where: { id: grantId },
      include: {
        node: { select: { id: true, tenant_id: true, branch_id: true, path_key: true } }
      }
    });
    if (!grant) {
      return res.status(404).json({ error: 'Inherited access grant not found.' });
    }
    assertCanGovernNodeAccess(req.user, grant.node, 'revoke inherited access');
    if (grant.revoked_at) {
      return res.status(409).json({ error: 'This inherited access grant is already revoked.' });
    }

    const revokeReason = String(req.body.revoke_reason || '').trim();
    const updatedGrant = await prisma.fmsNodeAccessGrant.update({
      where: { id: grant.id },
      data: {
        revoked_at: new Date(),
        revoke_reason: revokeReason
      },
      include: {
        node: { select: { id: true, name: true, code: true, node_type: true, path_key: true, branch_id: true } },
        user: { select: { id: true, name: true, email: true } },
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      }
    });

    await writeFmsAuditLog({
      tenantId: grant.tenant_id,
      ownerNodeId: grant.node_id,
      actorUserId: req.user.id,
      action: 'FMS_NODE_GRANT_REVOKED',
      remarks: revokeReason,
      metadata: { node_grant_id: grant.id }
    });

    return res.json({ grant: buildNodeGrantResponse(updatedGrant) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsDocuments = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const scopedTenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    const appendAccess = await loadAppendAccess(req.user, scopedTenantId);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, scopedTenantId);
    const nodeFilter = await resolveNodeFilter(parseId(req.query.owner_node_id), req.query.include_child_nodes !== 'false');
    const documents = await prisma.fmsDocument.findMany({
      where: buildAccessibleFmsWhere(req.user, { ...req.query, ...nodeFilter }, appendAccess, nodeGrantAccess),
      include: fmsDocumentInclude,
      orderBy: [{ created_at: 'desc' }],
      take: Math.min(parseId(req.query.limit) || 50, 200)
    });
    const grantActorMap = await buildGrantActorMap(documents);
    return res.json({ items: documents.map((document) => buildDocumentResponse(document, grantActorMap, req.user, appendAccess, nodeGrantAccess)) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsCircularDocuments = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const scopedTenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    const appendAccess = await loadAppendAccess(req.user, scopedTenantId);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, scopedTenantId);
    const documents = await prisma.fmsDocument.findMany({
      where: buildAccessibleFmsWhere(
        req.user,
        {
          ...req.query,
          document_type: 'CIRCULAR',
          status: 'ACTIVE',
          include_history: false
        },
        appendAccess,
        nodeGrantAccess
      ),
      include: fmsDocumentInclude,
      orderBy: [{ created_at: 'desc' }],
      take: Math.min(parseId(req.query.limit) || 50, 100)
    });
    const grantActorMap = await buildGrantActorMap(documents);
    return res.json({
      items: documents.map((document) => buildDocumentResponse(document, grantActorMap, req.user, appendAccess, nodeGrantAccess))
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsSearchSuggestions = async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const searchBy = String(req.query.search_by || 'ALL').trim().toUpperCase();
    if (q.length < 2) {
      return res.json({ items: [] });
    }

    const scopedTenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    const appendAccess = await loadAppendAccess(req.user, scopedTenantId);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, scopedTenantId);
    const documents = await prisma.fmsDocument.findMany({
      where: buildAccessibleFmsWhere(req.user, { ...req.query, q }, appendAccess, nodeGrantAccess),
      select: {
        title: true,
        file_name: true,
        document_category: true,
        customer_name: true,
        customer_reference: true,
        cif_reference: true,
        account_reference: true,
        identity_reference: true,
        id_proof_number: true,
        document_reference: true,
        version_group_key: true,
        document_type: true,
        department_master: { select: { name: true } },
        branch: { select: { branch_name: true } },
        uploaded_by: { select: { name: true } },
        metadata_json: true
      },
      orderBy: { created_at: 'desc' },
      take: 20
    });

    const lower = q.toLowerCase();
    const seen = new Set();
    const suggestions = [];
    const pushSuggestion = (kind, value) => {
      const normalized = String(value || '').trim();
      if (!normalized || !normalized.toLowerCase().includes(lower)) return;
      const key = `${kind}:${normalized.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      suggestions.push({
        kind,
        value: normalized,
        label: `${kind}: ${normalized}`
      });
    };

    for (const document of documents) {
      if (searchBy === 'ALL' || searchBy === 'CUSTOMER') pushSuggestion('Customer', document.customer_name);
      if (searchBy === 'ALL' || searchBy === 'CIF') pushSuggestion('CIF', document.cif_reference);
      if (searchBy === 'ALL' || searchBy === 'ACCOUNT') pushSuggestion('Account', document.account_reference || document.customer_reference);
      if (searchBy === 'ALL' || searchBy === 'IDENTITY') pushSuggestion('Identity', document.id_proof_number || document.identity_reference || document.metadata_json?.identity_reference);
      if (searchBy === 'ALL' || searchBy === 'DOCUMENT_TYPE') pushSuggestion('Document Type', document.document_type);
      if (searchBy === 'ALL' || searchBy === 'CATEGORY') pushSuggestion('Category', document.document_category);
      if (searchBy === 'ALL' || searchBy === 'DOCUMENT_REF') {
        pushSuggestion(
          'Document Ref',
          toPublicDocumentReference(
            document.document_reference ||
            document.metadata_json?.public_document_reference ||
            document.metadata_json?.document_reference ||
            document.customer_reference ||
            document.version_group_key,
            ''
          )
        );
      }
      if (searchBy === 'ALL' || searchBy === 'DEPARTMENT') pushSuggestion('Department', document.department_master?.name);
      if (searchBy === 'ALL' || searchBy === 'BRANCH') pushSuggestion('Branch', document.branch?.branch_name);
      if (searchBy === 'ALL' || searchBy === 'UPLOADER') pushSuggestion('Uploader', document.uploaded_by?.name);
      if (searchBy === 'ALL' || searchBy === 'FILE') pushSuggestion('File', document.title || document.file_name);
    }

    return res.json({ items: suggestions.slice(0, 10) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const uploadFmsDocument = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.UPLOAD);
    if (!req.file) {
      return res.status(400).json({ error: 'File upload is required.' });
    }

    const fileMeta = await assertValidFmsFile({
      absolutePath: path.resolve(req.file.path),
      fileName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    const visibilityMode = normalizeVisibilityMode(req.body.visibility_mode, 'ACTIVE');
    const ownerNodeId = parseId(req.body.owner_node_id);
    const baseDocumentId = parseId(req.body.base_document_id);
    const classification = assertValidClassification(req.body.classification);
    const ownerNode = await prisma.fmsNode.findUnique({
      where: { id: ownerNodeId },
      include: {
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true, legacy_department_id: true } }
      }
    });
    if (!ownerNode) {
      return res.status(404).json({ error: 'Owner node not found.' });
    }

    assertCanUploadToNode(req.user, ownerNode);

    const tenantStandards = await prisma.tenant.findUnique({
      where: { id: ownerNode.tenant_id },
      select: tenantLibraryStandardsSelect
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });
    const libraryStandards = buildLibraryStandardsPayload(tenantStandards);
    const requestedDocumentType = String(req.body.document_type || '').trim();
    const recordTypeDefinition = resolveFmsRecordTypeDefinition(libraryStandards.record_types, requestedDocumentType);
    if (recordTypeDefinition && !isFmsRecordTypeAllowedForNode(recordTypeDefinition, ownerNode)) {
      return res.status(400).json({ error: `Selected record type is not allowed inside the ${ownerNode.department_master?.name || ownerNode.name} intake scope.` });
    }
    const metadata = normalizeFmsMetadata(req.body, recordTypeDefinition);

    let baseDocument = null;
    if (baseDocumentId) {
      baseDocument = await prisma.fmsDocument.findUnique({
        where: { id: baseDocumentId },
        include: { owner_node: true }
      });
      if (!baseDocument) {
        return res.status(404).json({ error: 'Base FMS document for versioning was not found.' });
      }
      if (Number(baseDocument.tenant_id) !== Number(ownerNode.tenant_id)) {
        return res.status(400).json({ error: 'Versioning is allowed only within the same bank scope.' });
      }
      if (Number(baseDocument.owner_node_id) !== Number(ownerNode.id)) {
        return res.status(400).json({ error: 'Next version must stay under the same owner node.' });
      }
      if (baseDocument.source_note_id) {
        return res.status(400).json({ error: 'DMS-published custody files cannot be versioned from manual FMS record intake.' });
      }
    }

    const effectiveStatus = visibilityMode === 'BACKUP_ONLY' ? 'BACKUP_ONLY' : 'ACTIVE';

    const tenant = await prisma.tenant.findUnique({
      where: { id: ownerNode.tenant_id },
      select: { id: true, tenant_code: true }
    });
    const versionGroupKey = baseDocument?.version_group_key || `FMS-${ownerNode.tenant_id}-${Date.now()}`;
    const versionNumber = (baseDocument?.version_number || 0) + 1;
    const documentKey = buildStoredDocumentKey({
      documentType: metadata.document_type,
      customerReference: metadata.document_reference || metadata.customer_reference,
      fileName: req.file.originalname,
      idHint: `${versionGroupKey}-v${versionNumber}`
    });

    const storedPath = await moveUploadedFileToFmsStorage({
      tempPath: req.file.path,
      tenantCode: tenant?.tenant_code || `tenant-${ownerNode.tenant_id}`,
      nodePathKey: ownerNode.path_key,
      documentKey,
      fileName: req.file.originalname
    });
    const fileHash = await computeFileHash(storedPath);
    const absolutePath = resolveStoredPath(storedPath);
    const stat = await fs.stat(absolutePath);

    const document = await prisma.$transaction(async (tx) => {
      if (baseDocument?.id) {
        await tx.fmsDocument.update({
          where: { id: baseDocument.id },
          data: { is_latest_version: false }
        });
      }

      return tx.fmsDocument.create({
        data: {
          tenant_id: ownerNode.tenant_id,
          owner_node_id: ownerNode.id,
          classification,
          document_type: metadata.document_type,
          document_category: metadata.document_category || recordTypeDefinition?.default_desk || null,
          title: String(req.body.title || '').trim(),
          customer_name: metadata.customer_name,
          customer_reference: metadata.customer_reference,
          cif_reference: metadata.cif_reference,
          account_reference: metadata.account_reference,
          identity_reference: metadata.identity_reference,
          id_proof_number: metadata.id_proof_number,
          document_reference: metadata.document_reference,
          department_master_id: ownerNode.department_master_id || null,
          branch_id: ownerNode.branch_id || null,
          version_group_key: versionGroupKey,
          version_number: versionNumber,
          previous_version_id: baseDocument?.id || null,
          is_latest_version: true,
          file_name: req.file.originalname,
          stored_path: storedPath,
          mime_type: fileMeta.mime,
          file_extension: fileMeta.extension,
          file_size: Number(stat.size),
          file_hash: fileHash,
          file_kind: fileMeta.file_kind,
          uploaded_by_user_id: req.user.id,
          tags_json: metadata.tags,
          custom_index_json: metadata.custom_index_json,
          metadata_json: {
            node_id: ownerNode.id,
            node_path_key: ownerNode.path_key,
            department_master_id: ownerNode.department_master_id || null,
            branch_id: ownerNode.branch_id,
            document_type: metadata.document_type,
            document_category: metadata.document_category || recordTypeDefinition?.default_desk || null,
            source_origin: 'MANUAL',
            record_type_definition: recordTypeDefinition,
            customer_reference: metadata.customer_reference,
            cif_reference: metadata.cif_reference,
            account_reference: metadata.account_reference,
            identity_reference: metadata.identity_reference,
            id_proof_number: metadata.id_proof_number,
            document_reference: metadata.document_reference,
            tags: metadata.tags,
            custom_index_json: metadata.custom_index_json,
            uploaded_by: req.user.id,
            created_at: new Date().toISOString(),
            access_scope: metadata.access_scope,
            notes: metadata.notes,
            visibility_mode: effectiveStatus
          },
          search_text: buildFmsSearchText({
            title: String(req.body.title || '').trim(),
            document_type: metadata.document_type,
            document_category: metadata.document_category || recordTypeDefinition?.default_desk || null,
            customer_name: metadata.customer_name,
            customer_reference: metadata.customer_reference,
            cif_reference: metadata.cif_reference,
            account_reference: metadata.account_reference,
            identity_reference: metadata.identity_reference,
            id_proof_number: metadata.id_proof_number,
            document_reference: metadata.document_reference,
            file_name: req.file.originalname,
            department_name: ownerNode.department_master?.name,
            branch_name: ownerNode.branch?.branch_name,
            node_path_key: ownerNode.path_key,
            classification,
            tags: metadata.tags,
            custom_index_values: Object.values(metadata.custom_index_json || {})
          }),
          status: effectiveStatus,
          ...(effectiveStatus === 'ACTIVE'
            ? {
              published_by_user_id: req.user.id,
              published_at: new Date()
            }
            : {})
        },
        include: fmsDocumentInclude
      });
    });

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: req.user.id,
      action: effectiveStatus === 'ACTIVE' ? 'FMS_UPLOAD' : 'FMS_BACKUP_LODGED',
      remarks: effectiveStatus === 'ACTIVE'
        ? `Uploaded ${document.file_name}`
        : `Lodged ${document.file_name} into backup-only custody`
    });

    const grantActorMap = await buildGrantActorMap([document]);
    const appendAccess = await loadAppendAccess(req.user, document.tenant_id);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, document.tenant_id);
    return res.status(201).json({ document: buildDocumentResponse(document, grantActorMap, req.user, appendAccess, nodeGrantAccess) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const publishApprovedNoteToFms = async (req, res) => {
  try {
    const noteId = parseId(req.params.noteId);
    const ownerNodeId = parseId(req.body.owner_node_id);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: {
        attachments: true,
        tenant: { select: { tenant_code: true } }
      }
    });
    if (!note) return res.status(404).json({ error: 'Approved DMS document not found.' });
    if (note.status !== 'FINAL_APPROVED' && note.status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Only approved DMS documents can be published to FMS.' });
    }

    const ownerNode = await prisma.fmsNode.findUnique({
      where: { id: ownerNodeId },
      include: {
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department_master: { select: { id: true, name: true, code: true, path_key: true } }
      }
    });
    if (!ownerNode) return res.status(404).json({ error: 'Owner node not found.' });

    const classification = assertValidClassification(req.body.classification || note.classification || 'INTERNAL');
    const visibilityMode = normalizeVisibilityMode(req.body.visibility_mode, 'ACTIVE');
    if (visibilityMode === 'BACKUP_ONLY') {
      assertFmsPermission(req.user, FMS_PERMISSIONS.UPLOAD);
      assertCanUploadToNode(req.user, ownerNode);
    } else {
      assertFmsPermission(req.user, FMS_PERMISSIONS.PUBLISH);
      assertCanPublishToNode(req.user, ownerNode, classification);
    }

    const metadata = normalizeFmsMetadata(req.body);
    const sourceAttachmentId = parseId(req.body.attachment_id);
    const sourceAttachment = sourceAttachmentId
      ? note.attachments.find((item) => item.id === sourceAttachmentId)
      : note.attachments.find((item) => item.file_type === 'MAIN') || note.attachments[0];

    const sourceStoredPath = note.approved_file_path || sourceAttachment?.file_path;
    if (!sourceStoredPath) {
      return res.status(400).json({ error: 'No source file is available for FMS publishing.' });
    }

    const sourceName = note.approved_file_name || sourceAttachment?.file_name || `${note.note_id}.pdf`;
    const publicDocumentReference = toPublicDocumentReference(
      note.document_group_key || note.document_code || note.note_id || '',
      note.note_id
    );
    const fileMeta = await assertValidFmsFile({
      absolutePath: resolveStoredPath(sourceStoredPath),
      fileName: sourceName,
      mimeType: note.approved_file_mime || sourceAttachment?.mime_type || (sourceName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    });

    const documentKey = buildStoredDocumentKey({
      documentType: metadata.document_type,
      customerReference: metadata.customer_reference,
      fileName: sourceName,
      idHint: note.note_id
    });

    const copiedPath = await copyFileToFmsStorage({
      sourcePath: sourceStoredPath,
      tenantCode: note.tenant?.tenant_code || `tenant-${note.tenant_id}`,
      nodePathKey: ownerNode.path_key,
      documentKey,
      fileName: sourceName
    });
    const fileHash = await computeFileHash(copiedPath);
    const stat = await fs.stat(resolveStoredPath(copiedPath));

    const document = await prisma.fmsDocument.create({
      data: {
        tenant_id: note.tenant_id,
        owner_node_id: ownerNode.id,
        source_note_id: note.id,
        version_group_key: note.document_group_key || note.note_id,
        version_number: note.version_number || 1,
        previous_version_id: null,
        is_latest_version: true,
        classification,
        document_type: metadata.document_type,
        document_category: metadata.document_category,
        title: String(req.body.title || note.subject || note.note_id).trim(),
        customer_name: metadata.customer_name,
        customer_reference: metadata.customer_reference,
        cif_reference: metadata.cif_reference,
        account_reference: metadata.account_reference,
        identity_reference: metadata.identity_reference,
        id_proof_number: metadata.id_proof_number,
        document_reference: metadata.document_reference || publicDocumentReference,
        department_master_id: ownerNode.department_master_id || null,
        branch_id: ownerNode.branch_id || null,
        file_name: sourceName,
        stored_path: copiedPath,
        mime_type: fileMeta.mime,
        file_extension: fileMeta.extension,
        file_size: Number(stat.size),
        file_hash: fileHash,
        file_kind: fileMeta.file_kind,
        uploaded_by_user_id: visibilityMode === 'BACKUP_ONLY' ? req.user.id : note.initiator_id,
        ...(visibilityMode === 'ACTIVE'
          ? {
            published_by_user_id: req.user.id,
            published_at: new Date()
          }
          : {}),
        tags_json: metadata.tags,
        custom_index_json: metadata.custom_index_json,
        metadata_json: {
          node_id: ownerNode.id,
          node_path_key: ownerNode.path_key,
          department_master_id: ownerNode.department_master_id || null,
          branch_id: ownerNode.branch_id,
          document_type: metadata.document_type,
          document_category: metadata.document_category,
          customer_reference: metadata.customer_reference,
          cif_reference: metadata.cif_reference,
          account_reference: metadata.account_reference,
          identity_reference: metadata.identity_reference,
          id_proof_number: metadata.id_proof_number,
          document_reference: metadata.document_reference || publicDocumentReference,
          tags: metadata.tags,
          custom_index_json: metadata.custom_index_json,
          uploaded_by: note.initiator_id,
          created_at: note.created_at,
          source_note_id: note.id,
          source_document_group_key: note.document_group_key,
          public_document_reference: publicDocumentReference,
          published_by: visibilityMode === 'ACTIVE' ? req.user.id : null,
          visibility_mode: visibilityMode,
          notes: metadata.notes
        },
        search_text: visibilityMode === 'ACTIVE' ? buildFmsSearchText({
          title: String(req.body.title || note.subject || note.note_id).trim(),
          document_type: metadata.document_type,
          document_category: metadata.document_category,
          customer_name: metadata.customer_name,
          customer_reference: metadata.customer_reference,
          cif_reference: metadata.cif_reference,
          account_reference: metadata.account_reference,
          identity_reference: metadata.identity_reference,
          id_proof_number: metadata.id_proof_number,
          document_reference: metadata.document_reference || publicDocumentReference,
          file_name: sourceName,
          department_name: ownerNode.department_master?.name,
          branch_name: ownerNode.branch?.branch_name,
          tags: metadata.tags,
          custom_index_values: Object.values(metadata.custom_index_json || {})
        }) : null,
        status: visibilityMode
      },
      include: fmsDocumentInclude
    });

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: req.user.id,
      action: visibilityMode === 'ACTIVE' ? 'FMS_PUBLISH' : 'FMS_BACKUP_LODGED',
      remarks: visibilityMode === 'ACTIVE'
        ? `Published from DMS note ${publicDocumentReference}`
        : `Backed up from DMS note ${publicDocumentReference}`,
      metadata: { source_note_id: note.id, visibility_mode: visibilityMode }
    });

    const grantActorMap = await buildGrantActorMap([document]);
    const appendAccess = await loadAppendAccess(req.user, document.tenant_id);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, document.tenant_id);
    return res.status(201).json({ document: buildDocumentResponse(document, grantActorMap, req.user, appendAccess, nodeGrantAccess) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const activateFmsDocument = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.PUBLISH);
    const documentId = parseId(req.params.id);
    const document = await prisma.fmsDocument.findUnique({
      where: { id: documentId },
      include: fmsDocumentInclude
    });

    if (!document) {
      return res.status(404).json({ error: 'FMS document not found.' });
    }

    assertCanPublishToNode(req.user, document.owner_node, document.classification);

    if (document.status === 'ACTIVE') {
      return res.status(409).json({ error: 'This file is already visible in the FMS register.' });
    }

    const updatedDocument = await prisma.fmsDocument.update({
      where: { id: document.id },
      data: {
        status: 'ACTIVE',
        published_by_user_id: req.user.id,
        published_at: new Date(),
        metadata_json: {
          ...(document.metadata_json || {}),
          visibility_mode: 'ACTIVE',
          released_by: req.user.id,
          released_at: new Date().toISOString()
        },
        search_text: buildFmsSearchText({
          title: document.title,
          document_type: document.document_type,
          document_category: document.document_category,
          customer_name: document.customer_name,
          customer_reference: document.customer_reference,
          cif_reference: document.cif_reference,
          account_reference: document.account_reference,
          identity_reference: document.identity_reference,
          id_proof_number: document.id_proof_number,
          document_reference: document.document_reference,
          file_name: document.file_name,
          department_name: document.department_master?.name,
          branch_name: document.branch?.branch_name,
          tags: Array.isArray(document.tags_json) ? document.tags_json : [],
          custom_index_values: Object.values(document.custom_index_json || {})
        })
      },
      include: fmsDocumentInclude
    });

    await writeFmsAuditLog({
      tenantId: updatedDocument.tenant_id,
      ownerNodeId: updatedDocument.owner_node_id,
      documentId: updatedDocument.id,
      actorUserId: req.user.id,
      action: 'FMS_RELEASED',
      remarks: `Released ${updatedDocument.file_name} into the visible FMS register`
    });

    const grantActorMap = await buildGrantActorMap([updatedDocument]);
    const appendAccess = await loadAppendAccess(req.user, updatedDocument.tenant_id);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, updatedDocument.tenant_id);
    return res.json({ document: buildDocumentResponse(updatedDocument, grantActorMap, req.user, appendAccess, nodeGrantAccess) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const archiveFmsDocument = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.PUBLISH);
    const document = await assertDocumentManageable(req.user, parseId(req.params.id));

    if (String(document.status || '').toUpperCase() === 'ARCHIVED') {
      return res.status(409).json({ error: 'This FMS document is already archived.' });
    }

    const archived = await prisma.$transaction(async (tx) => {
      const updatedDocument = await tx.fmsDocument.update({
        where: { id: document.id },
        data: {
          status: 'ARCHIVED',
          is_latest_version: false
        }
      });

      if (document.version_group_key) {
        const fallbackLatest = await tx.fmsDocument.findFirst({
          where: {
            version_group_key: document.version_group_key,
            id: { not: document.id },
            status: { not: 'ARCHIVED' }
          },
          orderBy: [
            { version_number: 'desc' },
            { created_at: 'desc' }
          ]
        });

        if (fallbackLatest) {
          await tx.fmsDocument.update({
            where: { id: fallbackLatest.id },
            data: { is_latest_version: true }
          });
        }
      }

      await writeFmsAuditLog({
        tenantId: document.tenant_id,
        ownerNodeId: document.owner_node_id,
        actorUserId: req.user.id,
        documentId: document.id,
        action: 'FMS_RECORD_ARCHIVED',
        remarks: `Archived ${document.title || document.file_name || 'FMS record'} from active register visibility`,
        metadata: {
          document_reference: document.document_reference || document.customer_reference || null,
          archived_status: 'ARCHIVED'
        }
      });

      return updatedDocument;
    });

    return res.json({
      success: true,
      message: 'FMS record archived successfully.',
      document: {
        id: archived.id,
        status: archived.status,
        is_latest_version: archived.is_latest_version
      }
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const streamFmsDocument = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const document = await assertDocumentAccessible(req.user, parseId(req.params.id));
    const appendAccess = await loadAppendAccess(req.user, document.tenant_id);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, document.tenant_id);
    const disposition = String(req.query.disposition || 'inline').toLowerCase() === 'attachment' ? 'attachment' : 'inline';
    if (disposition === 'attachment' && !hasFmsDownloadAccess(req.user, document, appendAccess, nodeGrantAccess)) {
      return res.status(403).json({ error: 'Download is not allowed for your current FMS access level.' });
    }
    const downloadOfficer = disposition === 'attachment'
      ? await validateFmsDownloadEmployee(req, document)
      : null;
    writeSecurityAudit(disposition === 'attachment' ? 'FMS_DOCUMENT_DOWNLOADED' : 'FMS_DOCUMENT_VIEWED', {
      user_id: req.user?.id,
      role: req.user?.role?.name || req.user?.role,
      tenant_id: document.tenant_id,
      branch_id: req.user?.branch_id || document.branch_id || null,
      document_reference: document.document_reference || document.file_name,
      file_name: document.file_name,
      reason: disposition === 'attachment' ? 'download' : 'preview',
      ip: req.ip
    });
    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: (downloadOfficer || req.user)?.id,
      action: disposition === 'attachment' ? 'FMS_CONTROLLED_COPY_ISSUED' : 'FMS_RECORD_VIEWED',
      remarks: buildFmsDownloadRemarks({
        user: downloadOfficer || req.user,
        document,
        accessType: disposition
      }),
      metadata: {
        employee_id: downloadOfficer?.employee_id || req.user?.employee_id || null,
        disposition,
        source_origin: document.source_note_id ? 'DMS' : 'MANUAL'
      }
    });
    if (disposition === 'attachment' && downloadOfficer) {
      await notifyFmsDownloadStakeholders({
        document,
        downloadOfficer
      });
    }

    if (disposition === 'attachment') {
      try {
        const controlledDownload = await approvedFileService.createControlledDownloadBuffer({
          storedPath: document.stored_path,
          note: buildControlledCopyDocumentContext(document),
          downloadContext: buildFmsControlledCopyContext(downloadOfficer || req.user, document)
        });

        if (controlledDownload?.buffer) {
          res.setHeader('Content-Type', controlledDownload.contentType || document.mime_type);
          res.setHeader('Content-Disposition', `${disposition}; filename="${document.file_name.replace(/"/g, '')}"`);
          res.setHeader('Cache-Control', 'private, no-store');
          return res.send(controlledDownload.buffer);
        }
      } catch {
        // fall through to physical file when watermark generation is unavailable
      }
    }

    res.setHeader('Content-Type', document.mime_type);
    res.setHeader('Content-Disposition', `${disposition}; filename="${document.file_name.replace(/"/g, '')}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.sendFile(resolveStoredPath(document.stored_path));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getFmsDocumentDistributions = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.json({ items: [] });
    }

    const document = await assertDocumentAccessible(req.user, parseId(req.params.id));
    const distributions = await prisma.fmsDistribution.findMany({
      where: {
        document_id: document.id,
        ...(isSuperAdmin(req.user) || isBankAdmin(req.user) || hasFmsPermission(req.user, FMS_PERMISSIONS.SHARE)
          ? {}
          : {
            OR: [
              { created_by_user_id: req.user.id },
              {
                recipients: {
                  some: {
                    OR: [
                      { target_user_id: req.user.id },
                      ...(getAccessibleBranchIds(req.user).length > 0 ? [{ target_branch_id: { in: getAccessibleBranchIds(req.user) } }] : []),
                      ...(getAccessibleDepartmentIds(req.user).length > 0 ? [{ target_department_master_id: { in: getAccessibleDepartmentIds(req.user) } }] : []),
                      ...(req.user?.department_id ? [{ target_department_master: { legacy_department_id: Number(req.user.department_id) } }] : [])
                    ]
                  }
                }
              }
            ]
          })
      },
      include: fmsDistributionInclude,
      orderBy: { created_at: 'desc' }
    }).catch((error) => {
      if (isDistributionSchemaCompatibilityError(error)) return [];
      throw error;
    });

    return res.json({ items: distributions.map((distribution) => buildDistributionResponse(distribution, req.user)) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsDistribution = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using controlled circular distribution.' });
    }

    const documentId = parseId(req.params.id);
    const document = await prisma.fmsDocument.findUnique({
      where: { id: documentId },
      include: fmsDocumentInclude
    });
    if (!document) {
      return res.status(404).json({ error: 'FMS document not found.' });
    }

    const targetType = String(req.body.target_type || '').trim().toUpperCase();
    const accessLevel = normalizeFmsAccessLevel(req.body.access_level, FMS_ACCESS_LEVELS.VIEW);
    const targetUserId = parseId(req.body.target_user_id);
    const targetBranchId = parseId(req.body.target_branch_id);
    const targetDepartmentMasterId = parseId(req.body.target_department_master_id);
    const parentDistributionId = parseId(req.body.parent_distribution_id);
    const sourceRecipientId = parseId(req.body.source_recipient_id);
    const dueAt = parseOptionalDate(req.body.due_at);
    const isBankWideMandatory = targetType === 'BANK_WIDE';
    const allowRedistribution = isBankWideMandatory ? false : Boolean(req.body.allow_redistribution);
    const title = String(req.body.title || '').trim();
    const message = String(req.body.message || '').trim();
    const instructionType = normalizeDistributionInstructionType(req.body.instruction_type, 'INFORMATION');

    const parentDistribution = parentDistributionId
      ? await prisma.fmsDistribution.findUnique({
        where: { id: parentDistributionId },
        include: fmsDistributionInclude
      }).catch((error) => {
        if (isDistributionSchemaCompatibilityError(error)) return null;
        throw error;
      })
      : null;
    if (parentDistributionId && !parentDistribution) {
      return res.status(404).json({ error: 'Parent distribution was not found.' });
    }
    if (parentDistribution && Number(parentDistribution.document_id) !== Number(document.id)) {
      return res.status(400).json({ error: 'Parent distribution belongs to another record.' });
    }

    const sourceRecipient = sourceRecipientId
      ? await prisma.fmsDistributionRecipient.findUnique({
        where: { id: sourceRecipientId },
        include: {
          ...distributionRecipientInclude,
          distribution: {
            select: {
              id: true,
              document_id: true,
              status: true,
              parent_distribution_id: true
            }
          }
        }
      }).catch((error) => {
        if (isDistributionSchemaCompatibilityError(error)) return null;
        throw error;
      })
      : null;
    if (sourceRecipientId && !sourceRecipient) {
      return res.status(404).json({ error: 'Source distribution recipient was not found.' });
    }
    if (sourceRecipient && Number(sourceRecipient.distribution?.document_id) !== Number(document.id)) {
      return res.status(400).json({ error: 'Source recipient belongs to another record.' });
    }
    if (sourceRecipient && parentDistributionId && Number(sourceRecipient.distribution?.id) !== Number(parentDistributionId)) {
      return res.status(400).json({ error: 'Source recipient does not belong to the selected parent distribution.' });
    }

    assertDistributionAuthority({
      user: req.user,
      document,
      sourceRecipient
    });

    const resolvedParentDistributionId = parentDistributionId || sourceRecipient?.distribution?.id || null;
    const distributionTarget = targetType === 'DEPARTMENT'
      ? { department: await assertDepartmentTargetInTenant({ tenantId: document.tenant_id, departmentMasterId: targetDepartmentMasterId }) }
      : (targetType === 'BANK_WIDE'
        ? { users: await loadAllBankRecipientUsers(prisma, document.tenant_id) }
        : await assertGrantTargetInTenant({
          tenantId: document.tenant_id,
          grantType: targetType,
          userId: targetUserId,
          branchId: targetBranchId
        }));

    const distribution = await prisma.$transaction(async (tx) => {
      const createdDistribution = await tx.fmsDistribution.create({
        data: {
          tenant_id: document.tenant_id,
          document_id: document.id,
          parent_distribution_id: resolvedParentDistributionId,
          created_by_user_id: req.user.id,
          title,
          instruction_type: isBankWideMandatory ? 'ACKNOWLEDGEMENT' : instructionType,
          access_level: accessLevel,
          message,
          allow_redistribution: allowRedistribution,
          due_at: dueAt,
          status: 'ACTIVE'
        }
      });

      const recipientRows = isBankWideMandatory
        ? (distributionTarget.users || []).map((targetUser) => ({
          distribution_id: createdDistribution.id,
          target_type: 'BANK_WIDE',
          target_user_id: targetUser.id,
          target_branch_id: null,
          target_department_master_id: null,
          assigned_by_user_id: req.user.id,
          can_forward: false,
          status: 'PENDING'
        }))
        : [{
          distribution_id: createdDistribution.id,
          target_type: targetType,
          target_user_id: targetType === 'USER' ? targetUserId : null,
          target_branch_id: targetType === 'BRANCH' ? targetBranchId : null,
          target_department_master_id: targetType === 'DEPARTMENT' ? targetDepartmentMasterId : null,
          assigned_by_user_id: req.user.id,
          can_forward: allowRedistribution,
          status: 'PENDING'
        }];

      await tx.fmsDistributionRecipient.createMany({
        data: recipientRows
      });

      await ensureDistributionVisibility(tx, {
        document,
        targetType,
        accessLevel,
        targetUserId,
        targetBranchId,
        targetDepartmentMaster: distributionTarget.department || null,
        actorUserId: req.user.id,
        expiresAt: dueAt
      });

      if (document.status === 'BACKUP_ONLY') {
        await tx.fmsDocument.update({
          where: { id: document.id },
          data: {
            status: 'ACTIVE',
            published_at: document.published_at || new Date(),
            published_by_user_id: document.published_by_user_id || req.user.id
          }
        });
      }

      if (sourceRecipient && !isBankWideMandatory) {
        await tx.fmsDistributionRecipient.update({
          where: { id: sourceRecipient.id },
          data: {
            forwarded_at: new Date(),
            last_action_note: String(req.body.message || sourceRecipient.last_action_note || '').trim() || sourceRecipient.last_action_note
          }
        });
      }

      return tx.fmsDistribution.findUnique({
        where: { id: createdDistribution.id },
        include: fmsDistributionInclude
      });
    });

    const recipientUsers = await resolveDistributionRecipientUsers(prisma, {
      tenantId: document.tenant_id,
      targetType,
      targetUserId,
      targetBranchId,
      targetDepartmentMaster: distributionTarget.department || null
    }).catch(() => []);

    await Promise.all(recipientUsers.map(async (recipientUser) => {
      const circularTitle = distribution?.title || document.title || 'Controlled circular';
      const accessLabel = accessLevel === 'DOWNLOAD' ? 'View and download' : 'View only';

      await createNotification({
        userId: recipientUser.id,
        tenantId: recipientUser.tenant_id ?? document.tenant_id ?? null,
        branchId: recipientUser.branch_id ?? null,
        title: isBankWideMandatory ? 'Mandatory circular assigned' : 'New controlled circular assigned',
        message: isBankWideMandatory
          ? `${req.user.name} released "${circularTitle}" as a mandatory bank-wide circular. Please open and acknowledge it from your dashboard inbox.`
          : `${req.user.name} assigned "${circularTitle}" to your banking desk for ${instructionType.toLowerCase().replaceAll('_', ' ')} action.`,
        category: 'WORKFLOW',
        entityType: 'FMS_DISTRIBUTION',
        entityId: distribution.id
      }).catch(() => {});

      if (recipientUser.email) {
        await sendOperationalNotificationEmail({
          user: recipientUser,
          tenant: recipientUser.tenant || null,
          subject: `${recipientUser.tenant?.brand_display_name || recipientUser.tenant?.tenant_name || 'DMS'} circular assigned to your desk`,
          headline: isBankWideMandatory ? 'A mandatory bank circular has been released to all users' : 'A controlled circular has been assigned to you',
          intro: isBankWideMandatory
            ? `${req.user.name} released a mandatory bank-wide circular. Open it from your FMS dashboard inbox, acknowledge receipt, and complete any required action before the due date.`
            : `${req.user.name} sent a controlled circular into your banking desk. Review the instruction, open the linked record, and act within the permitted scope.`,
          sections: [
            {
              title: 'Circular assignment',
              items: [
                { label: 'Circular title', value: circularTitle },
                { label: 'Instruction', value: (isBankWideMandatory ? 'ACKNOWLEDGEMENT' : instructionType).replaceAll('_', ' ') },
                { label: 'Access granted', value: accessLabel },
                { label: 'Record reference', value: document.document_reference || document.customer_reference || `Document ${document.id}` },
                { label: 'Due date', value: dueAt ? dueAt.toLocaleString('en-IN') : 'No due date' }
              ]
            }
          ],
          footerNote: isBankWideMandatory
            ? 'This is an item-specific mandatory release. It does not grant wider access to the rest of the FMS library.'
            : allowRedistribution
            ? 'You can forward this circular further down the permitted hierarchy after acknowledging the assignment.'
            : 'Forwarding is not enabled for this circular. Complete the action inside your assigned desk.',
          mailType: 'CONTROLLED_CIRCULAR_ASSIGNED'
        }).catch(() => {});
      }
    }));

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: req.user.id,
      action: 'FMS_DISTRIBUTION_CREATED',
      remarks: `${(isBankWideMandatory ? 'BANK_WIDE_MANDATORY' : instructionType)} circular sent to ${targetType.toLowerCase()}: ${title}`,
      metadata: {
        distribution_id: distribution.id,
        parent_distribution_id: distribution.parent_distribution_id || null,
        target_type: targetType,
        target_user_id: targetUserId,
        target_branch_id: targetBranchId,
        target_department_master_id: targetDepartmentMasterId,
        access_level: accessLevel,
        allow_redistribution: allowRedistribution,
        bank_wide_mandatory: isBankWideMandatory
      }
    });

    return res.status(201).json({ distribution: buildDistributionResponse(distribution, req.user) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsDistributionInbox = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.json({ items: [] });
    }

    const accessibleBranchIds = getAccessibleBranchIds(req.user);
    const accessibleDepartmentIds = getAccessibleDepartmentIds(req.user);
    const recipientWhere = {
      distribution: {
        tenant_id: isSuperAdmin(req.user) ? (parseId(req.query.tenant_id) || req.user.tenant_id || undefined) : req.user.tenant_id
      },
      OR: [
        { target_user_id: req.user.id },
        ...(accessibleBranchIds.length > 0 ? [{ target_branch_id: { in: accessibleBranchIds } }] : []),
        ...(accessibleDepartmentIds.length > 0 ? [{ target_department_master_id: { in: accessibleDepartmentIds } }] : []),
        ...(req.user?.department_id ? [{ target_department_master: { legacy_department_id: Number(req.user.department_id) } }] : [])
      ]
    };

    const recipients = await prisma.fmsDistributionRecipient.findMany({
      where: {
        ...recipientWhere,
        ...(req.query.status ? { status: String(req.query.status).trim().toUpperCase() } : {})
      },
      include: distributionInboxRecipientInclude,
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }]
    }).catch((error) => {
      if (isDistributionSchemaCompatibilityError(error)) return [];
      throw error;
    });

    return res.json({ items: recipients.map(buildDistributionInboxItem) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsMandatoryDistributions = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.json({ items: [] });
    }
    if (!(isSuperAdmin(req.user) || isBankAdmin(req.user) || hasFmsPermission(req.user, FMS_PERMISSIONS.SHARE) || hasFmsPermission(req.user, FMS_PERMISSIONS.PUBLISH))) {
      return res.status(403).json({ error: 'Only FMS administrators can monitor mandatory circular delivery.' });
    }

    const distributions = await prisma.fmsDistribution.findMany({
      where: {
        tenant_id: isSuperAdmin(req.user) ? (parseId(req.query.tenant_id) || req.user.tenant_id || undefined) : req.user.tenant_id,
        recipients: {
          some: {
            target_type: 'BANK_WIDE'
          }
        }
      },
      include: {
        ...fmsDistributionInclude,
        document: {
          select: {
            id: true,
            title: true,
            file_name: true,
            document_reference: true,
            customer_reference: true,
            owner_node: { select: { id: true, name: true, code: true, node_type: true } },
            department_master: { select: { id: true, name: true, code: true, path_key: true } },
            branch: { select: { id: true, branch_name: true, branch_code: true } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    }).catch((error) => {
      if (isDistributionSchemaCompatibilityError(error)) return [];
      throw error;
    });

    return res.json({
      items: distributions.map((distribution) => ({
        ...buildDistributionResponse(distribution, req.user),
        document: distribution.document || null,
        pending_recipients: (distribution.recipients || [])
          .filter((recipient) => !recipient.viewed_at || String(recipient.status || '').toUpperCase() === 'PENDING')
          .map((recipient) => buildDistributionRecipientResponse(recipient, req.user)),
        acknowledged_recipients: (distribution.recipients || [])
          .filter((recipient) => String(recipient.status || '').toUpperCase() === 'ACKNOWLEDGED')
          .map((recipient) => buildDistributionRecipientResponse(recipient, req.user)),
        completed_recipients: (distribution.recipients || [])
          .filter((recipient) => String(recipient.status || '').toUpperCase() === 'COMPLETED')
          .map((recipient) => buildDistributionRecipientResponse(recipient, req.user))
      }))
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const acknowledgeFmsDistributionRecipient = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using controlled circular distribution.' });
    }

    const recipientId = parseId(req.params.id);
    const recipient = await prisma.fmsDistributionRecipient.findUnique({
      where: { id: recipientId },
      include: distributionInboxRecipientInclude
    });
    if (!recipient) {
      return res.status(404).json({ error: 'Distribution recipient not found.' });
    }
    if (!matchesDistributionRecipient(req.user, recipient)) {
      return res.status(403).json({ error: 'You are not allowed to acknowledge this distribution.' });
    }

    const updatedRecipient = await prisma.fmsDistributionRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'ACKNOWLEDGED',
        viewed_at: recipient.viewed_at || new Date(),
        acknowledged_at: new Date(),
        last_action_note: String(req.body.note || '').trim() || recipient.last_action_note
      },
      include: distributionInboxRecipientInclude
    });

    await writeFmsAuditLog({
      tenantId: req.user.tenant_id || null,
      documentId: recipient.distribution?.document?.id || null,
      actorUserId: req.user.id,
      action: 'FMS_DISTRIBUTION_ACKNOWLEDGED',
      remarks: String(req.body.note || '').trim() || updatedRecipient.distribution?.title || 'Circular acknowledged',
      metadata: {
        distribution_recipient_id: updatedRecipient.id,
        distribution_id: updatedRecipient.distribution?.id || null
      }
    });

    return res.json({ recipient: buildDistributionInboxItem(updatedRecipient) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const completeFmsDistributionRecipient = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsDistributionModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using controlled circular distribution.' });
    }

    const recipientId = parseId(req.params.id);
    const recipient = await prisma.fmsDistributionRecipient.findUnique({
      where: { id: recipientId },
      include: distributionInboxRecipientInclude
    });
    if (!recipient) {
      return res.status(404).json({ error: 'Distribution recipient not found.' });
    }
    if (!matchesDistributionRecipient(req.user, recipient)) {
      return res.status(403).json({ error: 'You are not allowed to complete this distribution task.' });
    }

    const updatedRecipient = await prisma.fmsDistributionRecipient.update({
      where: { id: recipient.id },
      data: {
        status: 'COMPLETED',
        viewed_at: recipient.viewed_at || new Date(),
        acknowledged_at: recipient.acknowledged_at || new Date(),
        completed_at: new Date(),
        last_action_note: String(req.body.note || '').trim() || recipient.last_action_note
      },
      include: distributionInboxRecipientInclude
    });

    await writeFmsAuditLog({
      tenantId: req.user.tenant_id || null,
      documentId: recipient.distribution?.document?.id || null,
      actorUserId: req.user.id,
      action: 'FMS_DISTRIBUTION_COMPLETED',
      remarks: String(req.body.note || '').trim() || updatedRecipient.distribution?.title || 'Circular action completed',
      metadata: {
        distribution_recipient_id: updatedRecipient.id,
        distribution_id: updatedRecipient.distribution?.id || null
      }
    });

    return res.json({ recipient: buildDistributionInboxItem(updatedRecipient) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsAccessRequest = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const document = await assertDocumentAccessible(req.user, parseId(req.params.id)).catch(async () => {
      const fallback = await prisma.fmsDocument.findUnique({ where: { id: parseId(req.params.id) }, include: { owner_node: true } });
      if (!fallback) throw Object.assign(new Error('FMS document not found.'), { status: 404 });
      return fallback;
    });

    const targetType = normalizeGrantTarget(req.body.target_type);
    const accessLevel = normalizeFmsAccessLevel(req.body.access_level, FMS_ACCESS_LEVELS.VIEW);
    const targetUserId = parseId(req.body.target_user_id);
    const targetBranchId = parseId(req.body.target_branch_id);
    const encodedTargetType = encodeGrantType(targetType, accessLevel);
    const requestReason = String(req.body.reason || '').trim();
    await assertGrantTargetInTenant({
      tenantId: document.tenant_id,
      grantType: targetType,
      userId: targetUserId,
      branchId: targetBranchId
    });

    const existingActiveGrant = await findActiveGrantForTarget(prisma, {
      documentId: document.id,
      targetType,
      userId: targetUserId,
      branchId: targetBranchId
    });
    if (existingActiveGrant && hasRequiredAccessLevel(parseGrantType(existingActiveGrant.grant_type).accessLevel, accessLevel)) {
      return res.status(409).json({ error: 'Access is already active for the selected target.' });
    }

    const existingPendingRequest = await prisma.fmsAccessRequest.findFirst({
      where: {
        document_id: document.id,
        requester_user_id: req.user.id,
        status: 'PENDING',
        target_type: encodedTargetType,
        target_user_id: targetUserId,
        target_branch_id: targetBranchId
      }
    });
    if (existingPendingRequest) {
      return res.status(409).json({ error: 'A matching access request is already pending for this record.' });
    }

    const request = await prisma.fmsAccessRequest.create({
      data: {
        document_id: document.id,
        requester_user_id: req.user.id,
        requester_branch_id: req.user.branch_id || null,
        owner_node_id: document.owner_node_id,
        target_type: encodedTargetType,
        target_user_id: targetUserId,
        target_branch_id: targetBranchId,
        reason: requestReason,
        expires_at: parseOptionalDate(req.body.expires_at)
      }
    });

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      requestId: request.id,
      actorUserId: req.user.id,
      action: 'FMS_ACCESS_REQUESTED',
      remarks: request.reason
    });

    const ownerAdmins = await listOwnerAdminUsersForNode(document.owner_node || { tenant_id: document.tenant_id, branch_id: null });
    await Promise.all(ownerAdmins
      .filter((adminUser) => Number(adminUser.id) !== Number(req.user.id))
      .map(async (adminUser) => {
        await createNotification({
          userId: adminUser.id,
          tenantId: document.tenant_id ?? null,
          branchId: document.owner_node?.branch_id ?? null,
          title: 'FMS access approval required',
          message: `${req.user.name} requested ${accessLevel === FMS_ACCESS_LEVELS.DOWNLOAD ? 'download' : 'view'} access for "${document.title}".`,
          category: 'WORKFLOW',
          entityType: 'FMS_ACCESS_REQUEST',
          entityId: request.id
        }).catch(() => {});

        if (adminUser.email) {
          await sendOperationalNotificationEmail({
            user: adminUser,
            tenant: null,
            subject: `${document.title || 'FMS record'} access approval required`,
            headline: 'A bank record access request needs approval',
            intro: `${req.user.name} raised a record-level access request that now needs controller review.`,
            sections: [
              {
                title: 'Request details',
                items: [
                  { label: 'Record', value: document.title || document.file_name || `Document ${document.id}` },
                  { label: 'Requested access', value: accessLevel === FMS_ACCESS_LEVELS.DOWNLOAD ? 'View and download' : 'View only' },
                  { label: 'Reason', value: requestReason || 'No reason provided' }
                ]
              }
            ],
            footerNote: 'Open the Library Access desk or the record detail panel to approve or reject this request.',
            mailType: 'FMS_ACCESS_REQUESTED'
          }).catch(() => {});
        }
      }));

    return res.status(201).json({ request });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsAccessRequests = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const where = isSuperAdmin(req.user)
      ? {
        ...(parseId(req.query.tenant_id) ? { document: { tenant_id: parseId(req.query.tenant_id) } } : {})
      }
      : isBankAdmin(req.user)
        ? { document: { tenant_id: req.user.tenant_id } }
      : {
        document: { tenant_id: req.user.tenant_id },
        OR: [
          { requester_user_id: req.user.id },
          { document: { owner_node: { branch_id: { in: getAccessibleBranchIds(req.user) } } } }
        ]
      };
    const requests = await prisma.fmsAccessRequest.findMany({
      where: {
        ...where,
        ...(req.query.status ? { status: String(req.query.status).trim().toUpperCase() } : {})
      },
      include: {
        document: { select: { id: true, title: true, file_name: true, owner_node_id: true } },
        requester: { select: { id: true, name: true, email: true } },
        requester_branch: { select: { id: true, branch_name: true, branch_code: true } },
        target_user: { select: { id: true, name: true, email: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } },
        decided_by: { select: { id: true, name: true } }
      },
      orderBy: { created_at: 'desc' }
    });
    return res.json({
      items: requests.map((request) => {
        const parsedTarget = parseGrantType(request.target_type);
        return {
          ...request,
          target_type: parsedTarget.targetType,
          access_level: parsedTarget.accessLevel
        };
      })
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const decideFmsAccessRequest = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    const requestId = parseId(req.params.id);
    const request = await prisma.fmsAccessRequest.findUnique({
      where: { id: requestId },
      include: {
        document: { include: { owner_node: true } },
        requester: { select: { id: true, name: true, email: true, tenant_id: true, branch_id: true } },
        target_user: { select: { id: true, name: true, email: true, tenant_id: true, branch_id: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    });
    if (!request) return res.status(404).json({ error: 'Access request not found.' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ error: 'This access request has already been decided.' });
    }
    assertCanGovernNodeAccess(req.user, request.document.owner_node, 'decide this access request');

    const decision = String(req.body.decision || '').trim().toUpperCase();
    const nextStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const parsedTarget = parseGrantType(request.target_type);

    const updated = await prisma.$transaction(async (tx) => {
      const decidedRequest = await tx.fmsAccessRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          decision_note: String(req.body.decision_note || '').trim() || null,
          decided_by_user_id: req.user.id,
          decided_at: new Date(),
          expires_at: parseOptionalDate(req.body.expires_at) || request.expires_at
        }
      });

      if (nextStatus === 'APPROVED') {
        const duplicateGrant = await findActiveGrantForTarget(tx, {
          documentId: request.document_id,
          targetType: parsedTarget.targetType,
          userId: request.target_user_id,
          branchId: request.target_branch_id
        });

        if (!duplicateGrant) {
          await tx.fmsDocumentAccessGrant.create({
            data: {
              document_id: request.document_id,
              grant_type: encodeGrantType(parsedTarget.targetType, parsedTarget.accessLevel),
              user_id: request.target_user_id,
              branch_id: request.target_branch_id,
              requested_by_user_id: request.requester_user_id,
              approved_by_user_id: req.user.id,
              expires_at: parseOptionalDate(req.body.expires_at) || request.expires_at
            }
          });
        } else if (!hasRequiredAccessLevel(parseGrantType(duplicateGrant.grant_type).accessLevel, parsedTarget.accessLevel)) {
          await tx.fmsDocumentAccessGrant.update({
            where: { id: duplicateGrant.id },
            data: {
              grant_type: encodeGrantType(parsedTarget.targetType, parsedTarget.accessLevel),
              approved_by_user_id: req.user.id,
              expires_at: parseOptionalDate(req.body.expires_at) || request.expires_at
            }
          });
        }

        if (request.document.status === 'BACKUP_ONLY') {
          await tx.fmsDocument.update({
            where: { id: request.document_id },
            data: {
              status: 'ACTIVE',
              published_at: request.document.published_at || new Date(),
              published_by_user_id: request.document.published_by_user_id || req.user.id
            }
          });
        }
      }

      return decidedRequest;
    });

    await writeFmsAuditLog({
      tenantId: request.document.tenant_id,
      ownerNodeId: request.document.owner_node_id,
      documentId: request.document_id,
      requestId: request.id,
      actorUserId: req.user.id,
      action: nextStatus === 'APPROVED' ? 'FMS_ACCESS_APPROVED' : 'FMS_ACCESS_REJECTED',
      remarks: updated.decision_note || null
    });

    const accessLabel = parsedTarget.accessLevel === FMS_ACCESS_LEVELS.DOWNLOAD ? 'View and download' : 'View only';
    const decisionLabel = nextStatus === 'APPROVED' ? 'approved' : 'rejected';
    const decisionRecipients = [
      request.requester,
      request.target_user && Number(request.target_user.id) !== Number(request.requester_user_id) ? request.target_user : null
    ].filter(Boolean);

    await Promise.all(decisionRecipients.map(async (recipient) => {
      await createNotification({
        userId: recipient.id,
        tenantId: recipient.tenant_id ?? request.document.tenant_id ?? null,
        branchId: recipient.branch_id ?? null,
        title: nextStatus === 'APPROVED' ? 'FMS access approved' : 'FMS access rejected',
        message: `${req.user.name} ${decisionLabel} the ${accessLabel.toLowerCase()} request for "${request.document.title}".`,
        category: 'WORKFLOW',
        entityType: 'FMS_ACCESS_REQUEST',
        entityId: request.id
      }).catch(() => {});

      if (recipient.email) {
        await sendOperationalNotificationEmail({
          user: recipient,
          tenant: null,
          subject: `${request.document.title || 'FMS record'} request ${decisionLabel}`,
          headline: `Your bank record access request was ${decisionLabel}`,
          intro: `${req.user.name} has ${decisionLabel} the requested access for this bank record.`,
          sections: [
            {
              title: 'Decision details',
              items: [
                { label: 'Record', value: request.document.title || request.document.file_name || `Document ${request.document_id}` },
                { label: 'Access', value: accessLabel },
                { label: 'Decision', value: nextStatus },
                { label: 'Decision note', value: updated.decision_note || 'No decision note recorded' }
              ]
            }
          ],
          footerNote: nextStatus === 'APPROVED'
            ? 'Refresh Records Library to use the approved access.'
            : 'If access is still required, contact the record controller with the business reason.',
          mailType: nextStatus === 'APPROVED' ? 'FMS_ACCESS_APPROVED' : 'FMS_ACCESS_REJECTED'
        }).catch(() => {});
      }
    }));

    return res.json({ request: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    const document = await assertDocumentManageable(req.user, parseId(req.params.id));
    const grantType = normalizeGrantTarget(req.body.grant_type);
    const accessLevel = normalizeFmsAccessLevel(req.body.access_level, FMS_ACCESS_LEVELS.VIEW);
    const targetUserId = parseId(req.body.user_id);
    const targetBranchId = parseId(req.body.branch_id);
    const target = await assertGrantTargetInTenant({
      tenantId: document.tenant_id,
      grantType,
      userId: targetUserId,
      branchId: targetBranchId
    });

    const existingGrant = await findActiveGrantForTarget(prisma, {
      documentId: document.id,
      targetType: grantType,
      userId: targetUserId,
      branchId: targetBranchId
    });
    if (existingGrant && hasRequiredAccessLevel(parseGrantType(existingGrant.grant_type).accessLevel, accessLevel)) {
      return res.status(409).json({ error: 'Access is already active for the selected target.' });
    }

    const grant = existingGrant
      ? await prisma.fmsDocumentAccessGrant.update({
        where: { id: existingGrant.id },
        data: {
          grant_type: encodeGrantType(grantType, accessLevel),
          approved_by_user_id: req.user.id,
          requested_by_user_id: existingGrant.requested_by_user_id || req.user.id,
          expires_at: parseOptionalDate(req.body.expires_at)
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, branch_name: true, branch_code: true } }
        }
      })
      : await prisma.fmsDocumentAccessGrant.create({
        data: {
          document_id: document.id,
          grant_type: encodeGrantType(grantType, accessLevel),
          user_id: targetUserId,
          branch_id: targetBranchId,
          approved_by_user_id: req.user.id,
          requested_by_user_id: req.user.id,
          expires_at: parseOptionalDate(req.body.expires_at)
        },
        include: {
          user: { select: { id: true, name: true, email: true } },
          branch: { select: { id: true, branch_name: true, branch_code: true } }
        }
      });

    if (document.status === 'BACKUP_ONLY') {
      await prisma.fmsDocument.update({
        where: { id: document.id },
        data: {
          status: 'ACTIVE',
          published_at: document.published_at || new Date(),
          published_by_user_id: document.published_by_user_id || req.user.id
        }
      });
    }

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: req.user.id,
      action: 'FMS_ACCESS_GRANTED',
      remarks: grantType === 'USER'
        ? `Granted ${accessLevel.toLowerCase()} access to ${target.user?.name || grant.user?.name || grant.user_id}`
        : `Granted ${accessLevel.toLowerCase()} access to ${target.branch?.branch_name || grant.branch?.branch_name || grant.branch_id}`
    });

    return res.status(201).json({ grant });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const revokeFmsGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.REVOKE);
    const grantId = parseId(req.params.id);
    const grant = await prisma.fmsDocumentAccessGrant.findUnique({
      where: { id: grantId },
      include: {
        document: { include: { owner_node: true } }
      }
    });
    if (!grant) return res.status(404).json({ error: 'Grant not found.' });
    await assertDocumentManageable(req.user, grant.document_id);
    if (grant.revoked_at) {
      return res.status(409).json({ error: 'This access grant is already revoked.' });
    }

    const updated = await prisma.fmsDocumentAccessGrant.update({
      where: { id: grantId },
      data: {
        revoked_at: new Date(),
        revoke_reason: String(req.body.revoke_reason || '').trim() || null
      }
    });

    await writeFmsAuditLog({
      tenantId: grant.document.tenant_id,
      ownerNodeId: grant.document.owner_node_id,
      documentId: grant.document_id,
      actorUserId: req.user.id,
      action: 'FMS_ACCESS_REVOKED',
      remarks: updated.revoke_reason || 'Access revoked'
    });

    return res.json({ grant: updated });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsBranchAppendRequests = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsBranchAppendRequestModel) {
      return res.json({ items: [] });
    }
    const tenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    if (!tenantId) {
      return res.json({ items: [] });
    }

    const where = isSuperAdmin(req.user)
      ? { tenant_id: tenantId }
      : isBankAdmin(req.user)
        ? { tenant_id: tenantId }
        : {
          tenant_id: tenantId,
          OR: [
            { requester_user_id: req.user.id },
            { requester_branch_id: { in: getAccessibleBranchIds(req.user) } },
            { source_branch_id: { in: getAccessibleBranchIds(req.user) } }
          ]
        };

    const requests = await prisma.fmsBranchAppendRequest.findMany({
      where: {
        ...where,
        ...(req.query.status ? { status: String(req.query.status).trim().toUpperCase() } : {})
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        requester_branch: { select: { id: true, branch_name: true, branch_code: true } },
        source_branch: { select: { id: true, branch_name: true, branch_code: true } },
        decided_by: { select: { id: true, name: true, email: true } }
      },
      orderBy: { created_at: 'desc' }
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return [];
      throw error;
    });

    return res.json({ items: requests.map(buildAppendRequestResponse) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const createFmsBranchAppendRequest = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsBranchAppendRequestModel || !supportsBranchAppendGrantModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using cross-branch append access.' });
    }
    if (!req.user?.tenant_id) {
      return res.status(400).json({ error: 'Bank scope is required before requesting append access.' });
    }

    await assertAppendFeatureEnabled(req.user.tenant_id);
    const requesterBranchId = req.user.branch_id || parseId(req.body.requester_branch_id);
    const sourceBranchId = parseId(req.body.source_branch_id);
    const { requesterBranch, sourceBranch } = await assertAppendBranches({
      tenantId: req.user.tenant_id,
      requesterBranchId,
      sourceBranchId
    });

    const existingGrant = await findActiveBranchAppendGrant(prisma, {
      tenantId: req.user.tenant_id,
      sourceBranchId: sourceBranch.id,
      targetBranchId: requesterBranch.id
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });
    if (existingGrant && hasRequiredAccessLevel(existingGrant.access_level, FMS_ACCESS_LEVELS.VIEW)) {
      return res.status(409).json({ error: 'Append visibility is already active for this branch pair.' });
    }

    const request = await prisma.fmsBranchAppendRequest.create({
      data: {
        tenant_id: req.user.tenant_id,
        requester_user_id: req.user.id,
        requester_branch_id: requesterBranch.id,
        source_branch_id: sourceBranch.id,
        requested_access_level: FMS_ACCESS_LEVELS.VIEW,
        reason: String(req.body.reason || '').trim(),
        expires_at: parseOptionalDate(req.body.expires_at)
      },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        requester_branch: { select: { id: true, branch_name: true, branch_code: true } },
        source_branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    });

    await writeFmsAuditLog({
      tenantId: req.user.tenant_id,
      actorUserId: req.user.id,
      action: 'FMS_BRANCH_APPEND_REQUESTED',
      remarks: `${requesterBranch.branch_name} requested append visibility of ${sourceBranch.branch_name}`,
      metadata: {
        append_request_id: request.id,
        requester_branch_id: requesterBranch.id,
        source_branch_id: sourceBranch.id,
        access_level: FMS_ACCESS_LEVELS.VIEW,
        reason: request.reason
      }
    });

    return res.status(201).json({ request: buildAppendRequestResponse(request) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const decideFmsBranchAppendRequest = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    if (!supportsBranchAppendRequestModel || !supportsBranchAppendGrantModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using cross-branch append access.' });
    }
    const requestId = parseId(req.params.id);
    const request = await prisma.fmsBranchAppendRequest.findUnique({
      where: { id: requestId },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        requester_branch: { select: { id: true, branch_name: true, branch_code: true } },
        source_branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });

    if (!request) return res.status(404).json({ error: 'Branch append request not found.' });
    if (request.status !== 'PENDING') {
      return res.status(409).json({ error: 'This branch append request has already been decided.' });
    }
    if (!isSuperAdmin(req.user) && !isBankAdmin(req.user)) {
      return res.status(403).json({ error: 'Only bank admin or super admin can decide branch append requests.' });
    }
    if (!isSuperAdmin(req.user) && Number(request.tenant_id) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const decision = String(req.body.decision || '').trim().toUpperCase();
    const nextStatus = decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    const expiresAt = parseOptionalDate(req.body.expires_at) || request.expires_at;

    const updatedRequest = await prisma.$transaction(async (tx) => {
      const decidedRequest = await tx.fmsBranchAppendRequest.update({
        where: { id: requestId },
        data: {
          status: nextStatus,
          decision_note: String(req.body.decision_note || '').trim() || null,
          decided_by_user_id: req.user.id,
          decided_at: new Date(),
          expires_at: expiresAt
        },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          requester_branch: { select: { id: true, branch_name: true, branch_code: true } },
          source_branch: { select: { id: true, branch_name: true, branch_code: true } },
          decided_by: { select: { id: true, name: true, email: true } }
        }
      });

      if (nextStatus === 'APPROVED') {
        const existingGrant = await findActiveBranchAppendGrant(tx, {
          tenantId: request.tenant_id,
          sourceBranchId: request.source_branch_id,
          targetBranchId: request.requester_branch_id
        });

        if (!existingGrant) {
          await tx.fmsBranchAppendGrant.create({
            data: {
              tenant_id: request.tenant_id,
              source_branch_id: request.source_branch_id,
              target_branch_id: request.requester_branch_id,
              access_level: FMS_ACCESS_LEVELS.VIEW,
              reason: request.reason,
              request_id: request.id,
              requested_by_user_id: request.requester_user_id,
              approved_by_user_id: req.user.id,
              expires_at: expiresAt
            }
          });
        } else if (!hasRequiredAccessLevel(existingGrant.access_level, FMS_ACCESS_LEVELS.VIEW)) {
          await tx.fmsBranchAppendGrant.update({
            where: { id: existingGrant.id },
            data: {
              access_level: FMS_ACCESS_LEVELS.VIEW,
              approved_by_user_id: req.user.id,
              expires_at: expiresAt,
              revoked_at: null,
              revoke_reason: null
            }
          });
        }
      }

      return decidedRequest;
    });

    await writeFmsAuditLog({
      tenantId: request.tenant_id,
      actorUserId: req.user.id,
      action: nextStatus === 'APPROVED' ? 'FMS_BRANCH_APPEND_APPROVED' : 'FMS_BRANCH_APPEND_REJECTED',
      remarks: updatedRequest.decision_note || `${request.requester_branch?.branch_name} -> ${request.source_branch?.branch_name}`,
      metadata: {
        append_request_id: request.id,
        requester_branch_id: request.requester_branch_id,
        source_branch_id: request.source_branch_id,
        access_level: FMS_ACCESS_LEVELS.VIEW
      }
    });

    return res.json({ request: buildAppendRequestResponse(updatedRequest) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const listFmsBranchAppendGrants = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    if (!supportsBranchAppendGrantModel) {
      return res.json({ items: [] });
    }
    const tenantId = isSuperAdmin(req.user) ? parseId(req.query.tenant_id) : req.user.tenant_id;
    if (!tenantId) {
      return res.json({ items: [] });
    }

    const where = isSuperAdmin(req.user) || isBankAdmin(req.user)
      ? { tenant_id: tenantId }
      : {
        tenant_id: tenantId,
        OR: [
          { target_branch_id: { in: getAccessibleBranchIds(req.user) } },
          { source_branch_id: { in: getAccessibleBranchIds(req.user) } }
        ]
      };

    const grants = await prisma.fmsBranchAppendGrant.findMany({
      where: {
        ...where,
        ...(req.query.status === 'ACTIVE'
          ? getActiveAppendGrantWhere()
          : {})
      },
      include: {
        source_branch: { select: { id: true, branch_name: true, branch_code: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      },
      orderBy: { created_at: 'desc' }
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return [];
      throw error;
    });

    return res.json({ items: grants.map(buildAppendGrantResponse) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const updateFmsBranchAppendGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.SHARE);
    if (!supportsBranchAppendGrantModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using cross-branch append access.' });
    }
    const grantId = parseId(req.params.id);
    const grant = await prisma.fmsBranchAppendGrant.findUnique({
      where: { id: grantId },
      include: {
        source_branch: { select: { id: true, branch_name: true, branch_code: true, tenant_id: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true, tenant_id: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      }
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });

    if (!grant) return res.status(404).json({ error: 'Branch append grant not found.' });
    if (!isSuperAdmin(req.user) && !isBankAdmin(req.user)) {
      return res.status(403).json({ error: 'Only bank admin or super admin can update append grants.' });
    }
    if (!isSuperAdmin(req.user) && Number(grant.tenant_id) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }

    const updatedGrant = await prisma.fmsBranchAppendGrant.update({
      where: { id: grantId },
      data: {
        access_level: normalizeFmsAccessLevel(req.body.access_level, grant.access_level || FMS_ACCESS_LEVELS.VIEW),
        approved_by_user_id: req.user.id,
        expires_at: parseOptionalDate(req.body.expires_at) || grant.expires_at,
        revoked_at: null,
        revoke_reason: null
      },
      include: {
        source_branch: { select: { id: true, branch_name: true, branch_code: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } },
        requested_by: { select: { id: true, name: true, email: true } },
        approved_by: { select: { id: true, name: true, email: true } }
      }
    });

    await writeFmsAuditLog({
      tenantId: grant.tenant_id,
      actorUserId: req.user.id,
      action: 'FMS_BRANCH_APPEND_UPDATED',
      remarks: `${grant.target_branch?.branch_name} append access updated to ${updatedGrant.access_level.toLowerCase()}`,
      metadata: {
        append_grant_id: updatedGrant.id,
        source_branch_id: updatedGrant.source_branch_id,
        target_branch_id: updatedGrant.target_branch_id,
        access_level: updatedGrant.access_level
      }
    });

    return res.json({ grant: buildAppendGrantResponse(updatedGrant) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const revokeFmsBranchAppendGrant = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.REVOKE);
    if (!supportsBranchAppendGrantModel) {
      return res.status(400).json({ error: 'Apply the latest database migration before using cross-branch append access.' });
    }
    const grantId = parseId(req.params.id);
    const grant = await prisma.fmsBranchAppendGrant.findUnique({
      where: { id: grantId },
      include: {
        source_branch: { select: { id: true, branch_name: true, branch_code: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    }).catch((error) => {
      if (isAppendSchemaCompatibilityError(error)) return null;
      throw error;
    });

    if (!grant) return res.status(404).json({ error: 'Branch append grant not found.' });
    if (!isSuperAdmin(req.user) && !isBankAdmin(req.user)) {
      return res.status(403).json({ error: 'Only bank admin or super admin can revoke append grants.' });
    }
    if (!isSuperAdmin(req.user) && Number(grant.tenant_id) !== Number(req.user.tenant_id)) {
      return res.status(403).json({ error: 'Tenant access denied.' });
    }
    if (grant.revoked_at) {
      return res.status(409).json({ error: 'This branch append grant is already revoked.' });
    }

    const updatedGrant = await prisma.fmsBranchAppendGrant.update({
      where: { id: grantId },
      data: {
        revoked_at: new Date(),
        revoke_reason: String(req.body.revoke_reason || '').trim()
      },
      include: {
        source_branch: { select: { id: true, branch_name: true, branch_code: true } },
        target_branch: { select: { id: true, branch_name: true, branch_code: true } }
      }
    });

    await writeFmsAuditLog({
      tenantId: grant.tenant_id,
      actorUserId: req.user.id,
      action: 'FMS_BRANCH_APPEND_REVOKED',
      remarks: updatedGrant.revoke_reason || `${grant.target_branch?.branch_name} append visibility revoked`,
      metadata: {
        append_grant_id: updatedGrant.id,
        source_branch_id: updatedGrant.source_branch_id,
        target_branch_id: updatedGrant.target_branch_id
      }
    });

    return res.json({ grant: buildAppendGrantResponse(updatedGrant) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getFmsDocumentDetail = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const document = await assertDocumentAccessible(req.user, parseId(req.params.id));
    const sensitiveAccessAllowed = canViewSensitiveFmsFileDetails(req.user);
    const grantActorMap = await buildGrantActorMap([document]);
    const appendAccess = await loadAppendAccess(req.user, document.tenant_id);
    const nodeGrantAccess = await loadNodeGrantAccess(req.user, document.tenant_id);
    const [versionHistory, ownerAdmins, nodeGrants, auditLogs] = await Promise.all([
      prisma.fmsDocument.findMany({
        where: { version_group_key: document.version_group_key },
        select: { id: true, version_number: true, file_name: true, status: true, created_at: true, is_latest_version: true },
        orderBy: { version_number: 'desc' }
      }),
      sensitiveAccessAllowed
        ? listOwnerAdminUsersForNode(document.owner_node || { tenant_id: document.tenant_id, branch_id: null })
        : [],
      sensitiveAccessAllowed && supportsNodeGrantModel
        ? prisma.fmsNodeAccessGrant.findMany({
          where: {
            node_id: document.owner_node_id,
            ...getActiveNodeGrantWhere()
          },
          include: {
            node: { select: { id: true, name: true, code: true, node_type: true, path_key: true, branch_id: true } },
            user: { select: { id: true, name: true, email: true } },
            branch: { select: { id: true, branch_name: true, branch_code: true } },
            department_master: { select: { id: true, name: true, code: true, path_key: true } },
            requested_by: { select: { id: true, name: true, email: true } },
            approved_by: { select: { id: true, name: true, email: true } }
          },
          orderBy: [{ created_at: 'desc' }]
        })
        : [],
      sensitiveAccessAllowed ? prisma.fmsAuditLog.findMany({
        where: { document_id: document.id },
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
              employee_id: true
            }
          }
        },
        orderBy: [
          { created_at: 'desc' },
          { id: 'desc' }
        ]
      }) : []
    ]);
    const baseDocument = buildDocumentResponse(document, grantActorMap, req.user, appendAccess, nodeGrantAccess);
    return res.json({
      document: {
        ...baseDocument,
        access_grants: sensitiveAccessAllowed ? baseDocument.access_grants || [] : [],
        version_history: versionHistory,
        audit_logs: sensitiveAccessAllowed ? auditLogs.map(buildFmsAuditLogResponse) : [],
        can_view_sensitive_file_details: sensitiveAccessAllowed,
        can_delete_document: Boolean(sensitiveAccessAllowed && (isSuperAdmin(req.user) || isBankAdmin(req.user) || hasFmsPermission(req.user, FMS_PERMISSIONS.PUBLISH)))
      },
      owner_admins: sensitiveAccessAllowed ? ownerAdmins : [],
      node_grants: sensitiveAccessAllowed ? nodeGrants.map(buildNodeGrantResponse) : []
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getFmsAuditLogs = async (req, res) => {
  try {
    assertFmsPermission(req.user, FMS_PERMISSIONS.VIEW);
    const document = await assertDocumentAccessible(req.user, parseId(req.params.id));
    if (!canViewSensitiveFmsFileDetails(req.user)) {
      return res.status(403).json({ error: 'Only bank admin or super admin can view detailed FMS file audit.' });
    }
    const logs = await prisma.fmsAuditLog.findMany({
      where: { document_id: document.id },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
            employee_id: true
          }
        }
      },
      orderBy: [
        { created_at: 'desc' },
        { id: 'desc' }
      ]
    });
    return res.json({ items: logs.map(buildFmsAuditLogResponse) });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};
