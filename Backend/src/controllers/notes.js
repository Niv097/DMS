import prisma from '../utils/prisma.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import approvedFileService from '../services/approvedFileService.js';
import previewService from '../services/previewService.js';
import uploadNormalizationService from '../services/uploadNormalizationService.js';
import {
  assertValidFmsFile,
  buildFmsSearchText,
  buildStoredDocumentKey,
  computeFileHash,
  copyFileToFmsStorage,
  resolveDefaultFmsOwnerNode,
  writeFmsAuditLog
} from '../services/fmsService.js';
import { createNotification } from '../services/notificationService.js';
import { sendOperationalNotificationEmail } from '../services/emailService.js';
import { ensureNoteApprovedArtifactAvailable, ensureNoteAttachmentAvailable } from '../services/storageRecoveryService.js';
import { extractTextFromImage, extractTextFromPdf, deriveFieldsFromText } from '../utils/ocr.js';
import { enableDemoFeatures } from '../config/env.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import {
  buildVersionFileStoredRelativePath,
  ensureVersionArchiveDirs,
  getVersionArchiveSubdirs,
  moveFileToStoredRelativePath,
  pruneEmptyStoredParents,
  resolveStoredPath,
  sanitizeStorageSegment,
  toStoredRelativePath,
  writeStoredJsonFile
} from '../utils/storage.js';
import logger from '../utils/logger.js';
import { toPublicDocumentReference } from '../utils/documentReference.js';
import { normalizeDisplayFileName } from '../utils/fileName.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ACTIVE_NOTE_STATUSES = new Set(['UPLOADED', 'RECOMMENDED']);
const FINALIZED_STATUSES = new Set(['FINAL_APPROVED', 'ARCHIVED', 'SUPERSEDED']);
const WORKFLOW_STATES = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  RETURNED_WITH_REMARK: 'RETURNED_WITH_REMARK',
  RESUBMITTED: 'RESUBMITTED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};
const ACTIVE_WORKFLOW_STATES = new Set([
  WORKFLOW_STATES.SUBMITTED,
  WORKFLOW_STATES.UNDER_REVIEW,
  WORKFLOW_STATES.RESUBMITTED
]);
const CLOSED_WORKFLOW_STATES = new Set([
  WORKFLOW_STATES.APPROVED,
  WORKFLOW_STATES.REJECTED
]);
const QUEUE_CODES = {
  DRAFTS: 'DRAFTS',
  INCOMING: 'INCOMING',
  RETURNED_WITH_REMARKS: 'RETURNED_WITH_REMARKS',
  APPROVED_CLOSED_HISTORY: 'APPROVED_CLOSED_HISTORY'
};
const WORKFLOW_STATE_LABELS = {
  [WORKFLOW_STATES.DRAFT]: 'Draft',
  [WORKFLOW_STATES.SUBMITTED]: 'Submitted',
  [WORKFLOW_STATES.UNDER_REVIEW]: 'Under Review',
  [WORKFLOW_STATES.RETURNED_WITH_REMARK]: 'Returned',
  [WORKFLOW_STATES.RESUBMITTED]: 'Resubmitted',
  [WORKFLOW_STATES.APPROVED]: 'Approved',
  [WORKFLOW_STATES.REJECTED]: 'Rejected'
};
const QUEUE_LABELS = {
  [QUEUE_CODES.DRAFTS]: 'Drafts',
  [QUEUE_CODES.INCOMING]: 'Incoming Queue',
  [QUEUE_CODES.RETURNED_WITH_REMARKS]: 'Returned',
  [QUEUE_CODES.APPROVED_CLOSED_HISTORY]: 'Approved / Closed History'
};
const NOTE_VIEW_ALIASES = {
  MY_NOTES: 'DRAFTS',
  RETURNED: 'RETURNED',
  RECOMMEND: 'INCOMING',
  APPROVE: 'INCOMING'
};
const ATTACHMENT_TYPES = {
  MAIN: 'MAIN',
  SUPPORTING: 'SUPPORTING'
};
const NOTE_ACCESS_LEVELS = {
  VIEW: 'VIEW',
  DOWNLOAD: 'DOWNLOAD'
};
const ROLE_LABELS = {
  INITIATOR: 'UPLOADER',
  RECOMMENDER: 'RECOMMENDER',
  APPROVER: 'APPROVER',
  ADMIN: 'ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  AUDITOR: 'AUDITOR',
  CONTROLLER: 'CONTROLLER'
};

const normalizeRole = (role) => ROLE_LABELS[role] || role;
const cleanComment = (value) => String(value || '').trim();
const parseId = (value) => Number.parseInt(value, 10);
const normalizeEmployeeId = (value) => String(value || '').trim().toUpperCase();
const normalizeNoteAccessLevel = (value) => (
  String(value || NOTE_ACCESS_LEVELS.VIEW).trim().toUpperCase() === NOTE_ACCESS_LEVELS.DOWNLOAD
    ? NOTE_ACCESS_LEVELS.DOWNLOAD
    : NOTE_ACCESS_LEVELS.VIEW
);
const DEMO_DOWNLOAD_EMPLOYEE_ID = '123456';
const isPrismaUniqueConstraintError = (error) => error?.code === 'P2002';
const isPrivilegedWorkflowViewer = (user) => ['ADMIN', 'SUPER_ADMIN', 'AUDITOR'].includes(user?.role?.name);
const canViewSensitiveDmsFileDetails = (user) => ['ADMIN', 'SUPER_ADMIN'].includes(user?.role?.name || user?.role);
const WORKFLOW_TIMEZONE = 'Asia/Kolkata';
const canUserReassignWorkflow = (user, note) => {
  const workflowState = getWorkflowState(note);
  if (!ACTIVE_WORKFLOW_STATES.has(workflowState)) {
    return false;
  }

  if (isSuperAdmin(user) || user?.role?.name === 'ADMIN') {
    return true;
  }

  return user?.role?.name === 'INITIATOR' && Number(note?.initiator_id) === Number(user?.id);
};
const requireComment = (value, message) => {
  const comment = cleanComment(value);
  if (!comment) {
    throw new Error(message);
  }
  return comment;
};
const normalizeHighlights = (highlights = []) => (Array.isArray(highlights) ? highlights : [])
  .map((highlight) => ({
    page_number: parseId(highlight.page_number),
    x: Number(highlight.x),
    y: Number(highlight.y),
    width: Number(highlight.width),
    height: Number(highlight.height)
  }))
  .filter((highlight) => (
    Number.isInteger(highlight.page_number) &&
    highlight.page_number > 0 &&
    Number.isFinite(highlight.x) &&
    Number.isFinite(highlight.y) &&
    Number.isFinite(highlight.width) &&
    Number.isFinite(highlight.height) &&
    highlight.width > 0 &&
    highlight.height > 0
  ));

const getAccessibleBranchIds = (user) => {
  const ids = new Set();
  if (user?.branch_id) ids.add(user.branch_id);
  for (const access of user?.branch_accesses || []) {
    if (access.branch_id) ids.add(access.branch_id);
  }
  if (Array.isArray(user?.accessible_branch_ids)) {
    for (const branchId of user.accessible_branch_ids) {
      if (branchId) ids.add(branchId);
    }
  }
  return [...ids];
};

const isSuperAdmin = (user) => user?.role?.name === 'SUPER_ADMIN';
const getActiveStep = (note) => note?.workflow_steps?.find((step) => step.status === 'PENDING') || null;

function getWorkflowState(note) {
  if (note?.workflow_state) {
    return note.workflow_state;
  }

  if (!note) {
    return WORKFLOW_STATES.DRAFT;
  }

  if (FINALIZED_STATUSES.has(note.status)) {
    return WORKFLOW_STATES.APPROVED;
  }
  if (note.status === 'REJECTED') {
    return WORKFLOW_STATES.RETURNED_WITH_REMARK;
  }
  if (note.status === 'RECOMMENDED') {
    return WORKFLOW_STATES.UNDER_REVIEW;
  }
  if ((note.workflow_steps || []).length > 0) {
    return WORKFLOW_STATES.SUBMITTED;
  }

  return WORKFLOW_STATES.DRAFT;
}

function getQueueCode(note) {
  if (note?.queue_code) {
    return note.queue_code;
  }

  const workflowState = getWorkflowState(note);
  if (workflowState === WORKFLOW_STATES.DRAFT) return QUEUE_CODES.DRAFTS;
  if (workflowState === WORKFLOW_STATES.RETURNED_WITH_REMARK) return QUEUE_CODES.RETURNED_WITH_REMARKS;
  if (CLOSED_WORKFLOW_STATES.has(workflowState)) return QUEUE_CODES.APPROVED_CLOSED_HISTORY;
  return QUEUE_CODES.INCOMING;
}

function getCurrentOwnerUserId(note) {
  if (note?.current_owner_user_id) {
    return note.current_owner_user_id;
  }

  const workflowState = getWorkflowState(note);
  if (workflowState === WORKFLOW_STATES.DRAFT || workflowState === WORKFLOW_STATES.RETURNED_WITH_REMARK) {
    return note?.initiator_id || null;
  }

  const activeStep = getActiveStep(note);
  return activeStep?.assigned_user_id || note?.initiator_id || null;
}

function getNextResponsibleUserId(note) {
  if (note?.next_responsible_user_id !== undefined && note?.next_responsible_user_id !== null) {
    return note.next_responsible_user_id;
  }

  const workflowState = getWorkflowState(note);
  if (CLOSED_WORKFLOW_STATES.has(workflowState)) return null;
  if (workflowState === WORKFLOW_STATES.DRAFT) return null;
  if (workflowState === WORKFLOW_STATES.RETURNED_WITH_REMARK) return note?.initiator_id || null;

  const activeStep = getActiveStep(note);
  return activeStep?.assigned_user_id || null;
}

function getLastActionByUserId(note) {
  if (note?.last_action_by_user_id) {
    return note.last_action_by_user_id;
  }

  const completedSteps = (note?.workflow_steps || [])
    .filter((step) => step.assigned_user_id && step.action_date)
    .sort((left, right) => new Date(right.action_date).getTime() - new Date(left.action_date).getTime());

  return completedSteps[0]?.assigned_user_id || note?.initiator_id || null;
}

function getLegacyStatusForWorkflow(workflowState, { currentActorRole = null, isFinalVersion = true } = {}) {
  if (!isFinalVersion) {
    return 'SUPERSEDED';
  }

  switch (workflowState) {
    case WORKFLOW_STATES.APPROVED:
      return 'FINAL_APPROVED';
    case WORKFLOW_STATES.REJECTED:
    case WORKFLOW_STATES.RETURNED_WITH_REMARK:
      return 'REJECTED';
    case WORKFLOW_STATES.UNDER_REVIEW:
      return currentActorRole === 'APPROVER' ? 'RECOMMENDED' : 'UPLOADED';
    case WORKFLOW_STATES.SUBMITTED:
    case WORKFLOW_STATES.RESUBMITTED:
    case WORKFLOW_STATES.DRAFT:
    default:
      return 'UPLOADED';
  }
}

function decorateNote(note) {
  if (!note) return note;

  const workflowState = getWorkflowState(note);
  const queueCode = getQueueCode(note);
  const currentOwnerUserId = getCurrentOwnerUserId(note);
  const nextResponsibleUserId = getNextResponsibleUserId(note);
  const lastActionByUserId = getLastActionByUserId(note);

  return {
    ...note,
    public_document_reference: toPublicDocumentReference(
      note.document_group_key || note.document_code || note.note_id || '',
      note.note_id || '',
      note.branch || null
    ),
    workflow_state: workflowState,
    workflow_state_label: WORKFLOW_STATE_LABELS[workflowState] || workflowState,
    queue_code: queueCode,
    queue_label: QUEUE_LABELS[queueCode] || queueCode,
    current_owner_user_id: currentOwnerUserId,
    next_responsible_user_id: nextResponsibleUserId,
    last_action_by_user_id: lastActionByUserId
  };
}

function buildAccessWhere(user, extra = {}) {
  const where = { ...extra };
  if (isSuperAdmin(user)) {
    return where;
  }

  if (user?.tenant_id) {
    where.tenant_id = user.tenant_id;
  }

  const branchIds = getAccessibleBranchIds(user);
  if (branchIds.length > 0) {
    where.branch_id = { in: branchIds };
  } else if (user?.branch_id) {
    where.branch_id = user.branch_id;
  }

  return where;
}

function buildRelevantNoteWhere(user, extra = {}) {
  const baseWhere = buildAccessWhere(user, extra);
  if (isPrivilegedWorkflowViewer(user)) {
    return baseWhere;
  }

  return {
    AND: [
      baseWhere,
      {
        OR: [
          { initiator_id: user.id },
          { current_owner_user_id: user.id },
          { next_responsible_user_id: user.id },
          { last_action_by_user_id: user.id },
          { workflow_steps: { some: { assigned_user_id: user.id } } },
          {
            note_movements: {
              some: {
                OR: [
                  { acted_by_user_id: user.id },
                  { from_user_id: user.id },
                  { to_user_id: user.id }
                ]
              }
            }
          },
          {
            note_access_grants: {
              some: {
                granted_user_id: user.id,
                is_active: true
              }
            }
          }
        ]
      }
    ]
  };
}

function addWhereCondition(where, condition) {
  if (!condition || Object.keys(condition).length === 0) {
    return where;
  }

  if (Array.isArray(where?.AND)) {
    where.AND.push(condition);
    return where;
  }

  return {
    AND: [where, condition]
  };
}

function buildNoteSearchCondition(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return null;

  return {
    OR: [
      { note_id: { contains: query, mode: 'insensitive' } },
      { document_code: { contains: query, mode: 'insensitive' } },
      { document_group_key: { contains: query, mode: 'insensitive' } },
      { subject: { contains: query, mode: 'insensitive' } },
      { note_type: { contains: query, mode: 'insensitive' } },
      { workflow_type: { contains: query, mode: 'insensitive' } },
      { classification: { contains: query, mode: 'insensitive' } },
      { attachments: { some: { file_name: { contains: query, mode: 'insensitive' } } } },
      { initiator: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { current_owner: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { next_responsible: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { last_action_by: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { department: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { vertical: { is: { name: { contains: query, mode: 'insensitive' } } } },
      { branch: { is: { branch_name: { contains: query, mode: 'insensitive' } } } },
      { branch: { is: { branch_code: { contains: query, mode: 'insensitive' } } } },
      {
        workflow_steps: {
          some: {
            assigned_user: {
              is: { name: { contains: query, mode: 'insensitive' } }
            }
          }
        }
      },
      {
        note_movements: {
          some: {
            OR: [
              { from_user: { is: { name: { contains: query, mode: 'insensitive' } } } },
              { to_user: { is: { name: { contains: query, mode: 'insensitive' } } } },
              { acted_by: { is: { name: { contains: query, mode: 'insensitive' } } } }
            ]
          }
        }
      }
    ]
  };
}

function isDirectWorkflowParticipant(user, note) {
  const userId = user?.id;
  return Boolean(
    note?.initiator_id === userId ||
    getCurrentOwnerUserId(note) === userId ||
    getNextResponsibleUserId(note) === userId ||
    getLastActionByUserId(note) === userId ||
    (note?.workflow_steps || []).some((step) => step.assigned_user_id === userId) ||
    (note?.note_movements || []).some((movement) => (
      movement.acted_by_user_id === userId ||
      movement.from_user_id === userId ||
      movement.to_user_id === userId
    ))
  );
}

async function getActiveNoteGrantForUser(note, userId) {
  if (!note?.id || !userId) {
    return null;
  }

  if (Array.isArray(note.note_access_grants)) {
    return note.note_access_grants.find((grant) => (
      grant.is_active &&
      Number(grant.granted_user_id) === Number(userId)
    )) || null;
  }

  return prisma.noteAccessGrant.findFirst({
    where: {
      note_id: note.id,
      granted_user_id: userId,
      is_active: true
    },
    orderBy: { created_at: 'desc' }
  });
}

async function resolveNoteAccessScope(user, note) {
  if (!note) {
    throw new Error('Note not found');
  }

  if (isPrivilegedWorkflowViewer(user) || isSuperAdmin(user)) {
    return { mode: 'privileged', grant: null };
  }

  if (user?.tenant_id && note.tenant_id && user.tenant_id !== note.tenant_id) {
    const error = new Error('Cross-tenant access is not allowed.');
    error.status = 403;
    throw error;
  }

  if (isDirectWorkflowParticipant(user, note)) {
    return { mode: 'workflow', grant: null };
  }

  const explicitGrant = await getActiveNoteGrantForUser(note, user?.id);
  if (explicitGrant) {
    return { mode: 'grant', grant: explicitGrant };
  }

  const branchIds = getAccessibleBranchIds(user);
  if (note.branch_id && branchIds.length > 0 && !branchIds.includes(note.branch_id)) {
    const error = new Error('Branch access is not allowed.');
    error.status = 403;
    throw error;
  }

  const visibleNote = await prisma.note.findFirst({
    where: buildRelevantNoteWhere(user, { id: note.id }),
    select: { id: true }
  });

  if (!visibleNote) {
    const error = new Error('You are not allowed to view this file.');
    error.status = 403;
    throw error;
  }

  return { mode: 'workflow', grant: null };
}

async function assertNoteAccess(user, note) {
  return resolveNoteAccessScope(user, note);
}

async function assertNoteDownloadAccess(user, note) {
  const accessScope = await resolveNoteAccessScope(user, note);
  if (accessScope.mode !== 'grant') {
    return accessScope;
  }

  if (normalizeNoteAccessLevel(accessScope.grant?.access_level) === NOTE_ACCESS_LEVELS.DOWNLOAD) {
    return accessScope;
  }

  const error = new Error('This DMS file was shared for viewing only. Download permission must be granted separately.');
  error.status = 403;
  throw error;
}

function buildWorkflowUpdate({
  workflowState,
  queueCode,
  currentOwnerUserId = null,
  nextResponsibleUserId = null,
  lastActionByUserId = null,
  legacyStatus = null,
  submittedAt,
  closedAt
}) {
  const data = {
    workflow_state: workflowState,
    queue_code: queueCode,
    current_owner_user_id: currentOwnerUserId,
    next_responsible_user_id: nextResponsibleUserId,
    last_action_by_user_id: lastActionByUserId,
    last_moved_at: new Date()
  };

  if (legacyStatus) data.status = legacyStatus;
  if (submittedAt !== undefined) data.submitted_at = submittedAt;
  if (closedAt !== undefined) data.closed_at = closedAt;

  return data;
}

async function createMovementLog(tx, {
  noteId,
  note = null,
  fromState = null,
  toState,
  fromQueue = null,
  toQueue = null,
  fromUserId = null,
  toUserId = null,
  actedByUserId,
  actionType,
  remarkText = null
}) {
  const targetNote = note || await tx.note.findUnique({
    where: { id: noteId },
    select: {
      tenant_id: true,
      branch_id: true,
      workflow_state: true,
      queue_code: true,
      current_owner_user_id: true
    }
  });

  await tx.noteMovement.create({
    data: {
      note_id: noteId,
      tenant_id: targetNote?.tenant_id || null,
      branch_id: targetNote?.branch_id || null,
      from_state: fromState ?? targetNote?.workflow_state ?? null,
      to_state: toState,
      from_queue: fromQueue ?? targetNote?.queue_code ?? null,
      to_queue: toQueue ?? null,
      from_user_id: fromUserId ?? targetNote?.current_owner_user_id ?? null,
      to_user_id: toUserId ?? null,
      acted_by_user_id: actedByUserId,
      action_type: actionType,
      remark_text: remarkText || null
    }
  });
}

async function generateDocumentReferences({
  tenantId = null,
  branchId = null,
  tenantCode = 'GEN',
  branchCode = 'HQ',
  branchName = ''
} = {}) {
  const currentYear = new Date().getFullYear();
  const internalPrefix = `DOC/${tenantCode}/${branchCode}/${currentYear}/`;
  const publicBranchSegment = String(
    toPublicDocumentReference(`DMS/${branchCode}/${currentYear}/0000`, '', {
      branch_name: branchName,
      branch_code: branchCode
    })
      .replace(/\/0000$/, '')
      .replace(/^DMS-/, '')
  ).trim();
  const publicPrefix = publicBranchSegment
    ? `DMS-${publicBranchSegment}/${currentYear}/`
    : `DMS/${branchCode}/${currentYear}/`;

  const notes = await prisma.note.findMany({
    where: {
      ...(tenantId ? { tenant_id: tenantId } : {}),
      ...(branchId ? { branch_id: branchId } : {})
    },
    select: {
      note_id: true,
      document_code: true,
      document_group_key: true
    }
  });

  const maxExistingNumber = notes.reduce((highest, note) => {
    const candidates = [
      note.document_group_key,
      note.document_code,
      note.note_id
    ].filter(Boolean);

    for (const source of candidates) {
      const normalized = String(source);
      const matchesCurrentYear = [
        /^DMS-[^/]+\/(\d{4})\/(\d+)$/i,
        /^DMS\/[^/]+\/(\d{4})\/(\d+)$/i,
        /^DOC\/[^/]+\/[^/]+\/(\d{4})\/(\d+)$/i,
        /^DOC\/[^/]+\/(\d{4})\/(\d+)$/i
      ]
        .map((expression) => expression.exec(normalized))
        .find(Boolean);

      if (!matchesCurrentYear) continue;
      if (Number.parseInt(matchesCurrentYear[1], 10) !== currentYear) continue;
      highest = Math.max(highest, Number.parseInt(matchesCurrentYear[2], 10));
    }

    return highest;
  }, 0);

  const nextNumber = String(maxExistingNumber + 1).padStart(4, '0');

  return {
    noteId: `${internalPrefix}${nextNumber}`,
    documentCode: `${internalPrefix}${nextNumber}`,
    publicReference: `${publicPrefix}${nextNumber}`
  };
}

function formatPublicDocumentReferenceValue(value, fallback = '', branchContext = null) {
  return toPublicDocumentReference(value, fallback, branchContext);
}

function formatWorkflowTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: WORKFLOW_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
}

function buildAuditActorLabel(user) {
  if (!user) return null;

  return [
    user.employee_id ? `Emp ID: ${user.employee_id}` : null,
    user.user_id ? `User Ref: ${user.user_id}` : null
  ].filter(Boolean).join(' | ') || null;
}

async function validateDownloadEmployee(req, note) {
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

  if (
    req.user?.employee_id
    && normalizeEmployeeId(req.user.employee_id) !== enteredEmployeeId
  ) {
    const error = new Error('Entered employee ID does not match your bank profile.');
    error.status = 403;
    throw error;
  }

  if (
    note?.tenant_id
    && downloadOfficer?.tenant_id
    && Number(note.tenant_id) !== Number(downloadOfficer.tenant_id)
  ) {
    const error = new Error('This employee ID is not authorized for the current bank file.');
    error.status = 403;
    throw error;
  }

  return downloadOfficer;
}

function buildControlledDownloadContext(user, note) {
  return {
    title: 'APPROVED COPY',
    officerName: user?.name || 'Bank User',
    employeeId: user?.employee_id || '',
    role: normalizeRole(user?.role?.name || user?.role || ''),
    downloadedAt: formatWorkflowTimestamp(new Date()),
    noteReference: formatPublicDocumentReferenceValue(
      note?.document_group_key || note?.document_code || note?.note_id || '',
      '',
      note?.branch || null
    )
  };
}

async function createDirectAuditLog({
  note,
  attachment = null,
  user,
  action,
  remarks = null
}) {
  if (!note?.id || !user) return;

  await prisma.auditLog.create({
    data: {
      note_id: note.id,
      tenant_id: note.tenant_id || null,
      branch_id: note.branch_id || null,
      version_number: note.version_number || null,
      attachment_id: attachment?.id || null,
      file_type: attachment?.file_type || null,
      file_name: attachment?.file_name || note?.approved_file_name || null,
      action,
      performed_by: user.name,
      role: normalizeRole(user.role?.name || user.role),
      remarks: remarks || null
    }
  });
}

function buildFileAccessAuditRemarks({
  user,
  label,
  fileName,
  fileType = null
}) {
  return [
    label,
    buildAuditActorLabel(user),
    fileType ? `File Type: ${fileType}` : null,
    fileName ? `File Name: ${fileName}` : null,
    `Date & Time: ${formatWorkflowTimestamp(new Date())}`
  ].filter(Boolean).join(' | ');
}

function buildInternalUploadPrefix(file, fallbackBase = 'file') {
  const tokenSource = String(file?.filename || file?.originalname || fallbackBase);
  const extension = path.extname(tokenSource);
  const baseToken = path.basename(tokenSource, extension);
  const safeToken = sanitizeStorageSegment(baseToken, fallbackBase).slice(-48);
  return safeToken ? `${safeToken}-` : '';
}

async function reserveUniqueNoteIdentifier({ tenantId = null, branchId = null, tenantCode, branchCode, branchName = '', attempts = 8 }) {
  let candidate = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    candidate = await generateDocumentReferences({
      tenantId,
      branchId,
      tenantCode,
      branchCode,
      branchName
    });
    const existing = await prisma.note.findFirst({
      where: {
        OR: [
          { note_id: candidate.noteId },
          { document_code: candidate.documentCode },
          { document_group_key: candidate.publicReference, tenant_id: tenantId || null, branch_id: branchId || null }
        ]
      },
      select: { id: true }
    });
    if (!existing) return candidate;
  }

  throw new Error(`Unable to reserve a unique document reference after ${attempts} attempts.`);
}

async function createAuditLog(tx, { noteId, note = null, user, action, remarks = null, roleOverride = null }) {
  const targetNote = note || await tx.note.findUnique({
    where: { id: noteId },
    select: { tenant_id: true, branch_id: true, version_number: true }
  });
  await tx.auditLog.create({
    data: {
      note_id: noteId,
      tenant_id: targetNote?.tenant_id || null,
      branch_id: targetNote?.branch_id || null,
      version_number: targetNote?.version_number || null,
      action,
      performed_by: user.name,
      role: roleOverride || normalizeRole(user.role.name),
      remarks: remarks || null
    }
  });
}

async function createAttachmentAuditLog(tx, {
  noteId,
  attachment,
  user,
  action,
  remarks = null,
  roleOverride = null
}) {
  const attachmentMeta = [
    attachment?.file_type ? `File Type: ${attachment.file_type}` : null,
    attachment?.file_name ? `File Name: ${attachment.file_name}` : null,
    remarks || null
  ].filter(Boolean).join(' | ');

  const targetNote = await tx.note.findUnique({
    where: { id: noteId },
    select: { tenant_id: true, branch_id: true, version_number: true }
  });

  await tx.auditLog.create({
    data: {
      note_id: noteId,
      tenant_id: targetNote?.tenant_id || null,
      branch_id: targetNote?.branch_id || null,
      version_number: targetNote?.version_number || null,
      attachment_id: attachment?.id || null,
      file_type: attachment?.file_type || null,
      file_name: attachment?.file_name || null,
      action,
      performed_by: user.name,
      role: roleOverride || normalizeRole(user.role.name),
      remarks: attachmentMeta || null
    }
  });
}

async function validateWorkflowUser(userId, roleName, actor = null) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true }
  });

  if (!user || user.role?.name !== roleName) {
    throw new Error(`Selected user is not a valid ${roleName.toLowerCase()}`);
  }

  if (actor && !isSuperAdmin(actor)) {
    if (actor.tenant_id && user.tenant_id && actor.tenant_id !== user.tenant_id) {
      throw new Error(`Selected ${roleName.toLowerCase()} belongs to another tenant.`);
    }

    const branchIds = getAccessibleBranchIds(actor);
    if (user.branch_id && branchIds.length > 0 && !branchIds.includes(user.branch_id)) {
      throw new Error(`Selected ${roleName.toLowerCase()} is outside your branch access.`);
    }
  }

  return user;
}

function normalizeWorkflowAssigneeIds(primaryValue, listValue = []) {
  const fromArray = Array.isArray(listValue) ? listValue : [listValue];
  const seeded = primaryValue != null && primaryValue !== '' ? [primaryValue, ...fromArray] : fromArray;
  const parsed = seeded
    .map((value) => parseId(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  return [...new Set(parsed)];
}

async function getWorkflowReassignCandidates(note, actor) {
  const activeStep = getActiveStep(note);
  if (!activeStep?.role_type || !canUserReassignWorkflow(actor, note)) {
    return [];
  }

  const where = {
    is_active: true,
    tenant_id: note.tenant_id || actor?.tenant_id || null,
    role: { name: activeStep.role_type }
  };

  if (!isSuperAdmin(actor)) {
    const branchIds = getAccessibleBranchIds(actor);
    if (branchIds.length > 0) {
      where.branch_id = { in: branchIds };
    }
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      username: true,
      employee_id: true,
      branch_id: true,
      role: { select: { name: true } },
      branch: { select: { id: true, branch_name: true, branch_code: true } }
    },
    orderBy: { name: 'asc' }
  });

  return users.map((candidate) => ({
    id: candidate.id,
    name: candidate.name,
    role: normalizeRole(candidate.role?.name),
    branch_id: candidate.branch_id,
    branch_name: candidate.branch?.branch_name || '-',
    branch_code: candidate.branch?.branch_code || '',
    username: candidate.username || candidate.employee_id || '',
    is_current_owner: Number(candidate.id) === Number(activeStep.assigned_user_id)
  }));
}

function getWorkflowDisplayStatus(note) {
  return getWorkflowState(note);
}

function getFileUrlPath(fileName) {
  return toStoredRelativePath(fileName);
}

async function moveUploadedFileToVersion(note, file, bucket, { prefix = '', fallbackBase = 'file' } = {}) {
  const storagePrefix = `${prefix}${buildInternalUploadPrefix(file, fallbackBase)}`;
  const targetRelativePath = buildVersionFileStoredRelativePath({
    documentGroupKey: note.document_group_key || note.note_id || `note-${note.id}`,
    versionNumber: note.version_number || 1,
    bucket,
    fileName: file.originalname || file.filename,
    fallbackBase,
    prefix: storagePrefix
  });

  await moveFileToStoredRelativePath(file.path, targetRelativePath);

  const managedPaths = [targetRelativePath];
  const normalizedBackupSource = `${file.path}.original.pdf`;
  if ((file.originalname || file.filename || '').toLowerCase().endsWith('.pdf')) {
    const normalizedBackupTarget = buildVersionFileStoredRelativePath({
      documentGroupKey: note.document_group_key || note.note_id || `note-${note.id}`,
      versionNumber: note.version_number || 1,
      bucket: `${bucket}/originals`,
      fileName: `${path.basename(file.originalname || file.filename, path.extname(file.originalname || file.filename || ''))}.original.pdf`,
      fallbackBase: `${fallbackBase}-original`,
      prefix: storagePrefix
    });

    await fs.access(normalizedBackupSource)
      .then(() => moveFileToStoredRelativePath(normalizedBackupSource, normalizedBackupTarget))
      .then(() => managedPaths.push(normalizedBackupTarget))
      .catch(() => {});
  }

  return {
    ...file,
    path: resolveStoredPath(targetRelativePath),
    filename: path.posix.basename(targetRelativePath),
    storedRelativePath: targetRelativePath,
    managedPaths
  };
}

async function organizeUploadedFilesForVersion(note, mainFile, supportingFiles = []) {
  await ensureVersionArchiveDirs(note.document_group_key || note.note_id || `note-${note.id}`, note.version_number || 1);

  const movedMainFile = await moveUploadedFileToVersion(note, mainFile, 'attachments/main', {
    fallbackBase: 'main-document'
  });

  const movedSupportingFiles = [];
  for (const [index, file] of supportingFiles.entries()) {
    movedSupportingFiles.push(await moveUploadedFileToVersion(note, file, 'attachments/supporting', {
      prefix: `${String(index + 1).padStart(2, '0')}-`,
      fallbackBase: `supporting-${index + 1}`
    }));
  }

  return {
    mainFile: movedMainFile,
    supportingFiles: movedSupportingFiles,
    managedPaths: [
      ...movedMainFile.managedPaths,
      ...movedSupportingFiles.flatMap((file) => file.managedPaths || [])
    ]
  };
}

async function cloneSupportingAttachmentsToVersion(note, supportingAttachments = [], startingIndex = 0) {
  const retainedFiles = [];

  for (const [index, attachment] of supportingAttachments.entries()) {
    const targetRelativePath = buildVersionFileStoredRelativePath({
      documentGroupKey: note.document_group_key || note.note_id || `note-${note.id}`,
      versionNumber: note.version_number || 1,
      bucket: 'attachments/supporting',
      fileName: attachment.file_name || `supporting-${index + 1}`,
      fallbackBase: `supporting-${startingIndex + index + 1}`,
      prefix: `${String(startingIndex + index + 1).padStart(2, '0')}-`
    });

    await fs.copyFile(resolveStoredPath(attachment.file_path), resolveStoredPath(targetRelativePath));

    retainedFiles.push({
      originalname: attachment.file_name,
      filename: path.posix.basename(targetRelativePath),
      storedRelativePath: targetRelativePath,
      file_name: attachment.file_name,
      file_path: getFileUrlPath(targetRelativePath),
      carriedForward: true,
      sourceAttachmentId: attachment.id,
      managedPaths: [targetRelativePath]
    });
  }

  return retainedFiles;
}

async function writeVersionMetadata(note, {
  mainFile = null,
  supportingFiles = [],
  approvedFile = null,
  stage = 'ACTIVE'
} = {}) {
  const documentGroupKey = note.document_group_key || note.note_id || `note-${note.id}`;
  const versionNumber = note.version_number || 1;
  const metadataPath = buildVersionFileStoredRelativePath({
    documentGroupKey,
    versionNumber,
    bucket: 'metadata',
    fileName: 'manifest.json',
    fallbackBase: 'manifest'
  });

  const payload = {
    document_group_key: documentGroupKey,
    note_id: note.note_id || `#${note.id}`,
    document_code: note.document_code || null,
    version_number: versionNumber,
    workflow_type: note.workflow_type || null,
    status: note.status || null,
    workflow_state: getWorkflowState(note),
    queue_code: getQueueCode(note),
    current_owner_user_id: getCurrentOwnerUserId(note),
    next_responsible_user_id: getNextResponsibleUserId(note),
    subject: note.subject || null,
    tenant_id: note.tenant_id || null,
    branch_id: note.branch_id || null,
    stage,
    files: {
      main: mainFile ? {
        file_name: mainFile.file_name || mainFile.originalname || null,
        file_path: mainFile.file_path || mainFile.storedRelativePath || null
      } : null,
      supporting: supportingFiles.map((file) => ({
        file_name: file.file_name || file.originalname || null,
        file_path: file.file_path || file.storedRelativePath || null
      })),
      approved: approvedFile ? {
        file_name: approvedFile.approved_file_name || approvedFile.file_name || null,
        file_path: approvedFile.approved_file_path || approvedFile.file_path || null,
        mime: approvedFile.approved_file_mime || approvedFile.file_mime || null
      } : null
    },
    updated_at: new Date().toISOString()
  };

  await writeStoredJsonFile(metadataPath, payload);
  return metadataPath;
}

function getMainAttachment(note) {
  return note.attachments?.find((attachment) => attachment.file_type === ATTACHMENT_TYPES.MAIN || attachment.file_type === 'main_note') || null;
}

function getSupportingAttachments(note) {
  return (note.attachments || []).filter((attachment) => attachment.file_type === ATTACHMENT_TYPES.SUPPORTING || attachment.file_type === 'annexure');
}

function normalizeAttachmentForOutput(attachment) {
  if (!attachment) return attachment;
  return {
    ...attachment,
    file_name: normalizeDisplayFileName(attachment.file_name || '')
  };
}

function normalizeNoteAttachmentsForOutput(note) {
  if (!note) return note;

  return {
    ...note,
    attachments: (note.attachments || []).map(normalizeAttachmentForOutput)
  };
}

async function notifyUserSafe(payload) {
  if (!payload?.userId) return;
  try {
    await createNotification(payload);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        id: true,
        name: true,
        email: true,
        tenant_id: true,
        branch_id: true,
        tenant: {
          select: {
            id: true,
            tenant_name: true,
            tenant_code: true,
            brand_display_name: true,
            brand_short_code: true,
            brand_subtitle: true
          }
        }
      }
    }).catch(() => null);
    if (user?.email) {
      await sendOperationalNotificationEmail({
        user,
        tenant: user.tenant || null,
        subject: `${user.tenant?.brand_display_name || user.tenant?.tenant_name || 'DMS'} workflow alert`,
        headline: payload.title || 'Workflow alert',
        intro: payload.message || 'A workflow item in your banking desk requires your attention.',
        sections: [
          {
            title: 'Workflow desk update',
            items: [
              { label: 'Alert category', value: payload.category || 'WORKFLOW' },
              ...(payload.entityId ? [{ label: 'Reference ID', value: String(payload.entityId) }] : [])
            ]
          }
        ],
        footerNote: 'Sign in to your banking workspace to open the queue, review the latest remarks, and complete the pending action.',
        mailType: 'WORKFLOW_ALERT'
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Notification error:', error.message);
  }
}

function buildAttachmentData(noteId, mainFile, supportingFiles = []) {
  const attachments = [{
    note_id: noteId,
    file_name: mainFile.originalname,
    file_path: getFileUrlPath(mainFile.storedRelativePath || mainFile.filename),
    file_type: ATTACHMENT_TYPES.MAIN
  }];

  for (const file of supportingFiles) {
    attachments.push({
      note_id: noteId,
      file_name: file.originalname,
      file_path: getFileUrlPath(file.storedRelativePath || file.filename),
      file_type: ATTACHMENT_TYPES.SUPPORTING
    });
  }

  return attachments;
}

function escapeCsvValue(value) {
  const normalized = value == null ? '' : String(value);
  return `"${normalized.replace(/"/g, '""')}"`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPublicDocumentReference(value, fallback = '-', branchContext = null) {
  return toPublicDocumentReference(value, fallback, branchContext);
}

async function getNoteWithExportData(noteId) {
  return prisma.note.findUnique({
    where: { id: parseId(noteId) },
    include: {
      initiator: { select: { name: true, email: true } },
      tenant: { select: { tenant_name: true, tenant_code: true, brand_display_name: true, brand_logo_path: true } },
      branch: { select: { branch_name: true, branch_code: true, branch_address: true, city: { select: { city_name: true, state_name: true } } } },
      department: { select: { name: true } },
      vertical: { select: { name: true } },
      audit_logs: { orderBy: { timestamp: 'asc' } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { created_at: 'asc' }
      }
    }
  });
}

async function getApprovedArtifactContext(noteId) {
  const note = await prisma.note.findUnique({
    where: { id: parseId(noteId) },
    include: {
      initiator: { select: { name: true, email: true } },
      tenant: { select: { tenant_name: true, tenant_code: true, brand_display_name: true, brand_logo_path: true } },
      branch: { select: { branch_name: true, branch_code: true, branch_address: true, city: { select: { city_name: true, state_name: true } } } },
      attachments: true,
      audit_logs: { orderBy: { timestamp: 'asc' } },
      comments: {
        include: { user: { select: { name: true } } },
        orderBy: { created_at: 'asc' }
      }
    }
  });

  if (!note) {
    return null;
  }

  const workflowAuditHistory = note.document_group_key
    ? await prisma.note.findMany({
      where: { document_group_key: note.document_group_key },
      select: {
        version_number: true,
        audit_logs: { orderBy: { timestamp: 'asc' } }
      },
      orderBy: { version_number: 'asc' }
    }).then((versions) => versions.flatMap((version) => (
      (version.audit_logs || []).map((log) => ({
        ...log,
        version_number: version.version_number || null
      }))
    )))
    : [...(note.audit_logs || [])];

  return {
    ...note,
    workflow_audit_history: workflowAuditHistory
  };
}

function getAuditExportRows(note) {
  return (note.audit_logs || []).map((log) => ({
    timestamp: formatWorkflowTimestamp(log.timestamp),
    action: log.action,
    role: log.role,
    performed_by: log.performed_by,
    remarks: log.remarks || '-',
    current_status: getWorkflowState(note)
  }));
}

async function buildVersionHistory(documentGroupKey) {
  return prisma.note.findMany({
    where: { document_group_key: documentGroupKey },
    include: {
      initiator: { select: { id: true, name: true } },
      tenant: { select: { tenant_name: true, tenant_code: true, brand_display_name: true } },
      branch: { select: { branch_name: true, branch_code: true, branch_address: true, city: { select: { city_name: true } } } },
      attachments: true,
      workflow_steps: {
        include: { assigned_user: { select: { id: true, name: true, role: true } } },
        orderBy: { sequence: 'asc' }
      }
    },
    orderBy: { version_number: 'desc' }
  });
}

async function refreshApprovedArtifactIfNeeded(note) {
  if (!note || (note.status !== 'FINAL_APPROVED' && note.status !== 'ARCHIVED')) {
    return note;
  }

  const artifactNote = await getApprovedArtifactContext(note.id);
  if (!artifactNote) {
    return note;
  }

  const mainAttachment = getMainAttachment(artifactNote);
  const artifact = await approvedFileService.createApprovedArtifact(artifactNote, mainAttachment);
  if (!artifact) {
    return ensureNoteApprovedArtifactAvailable(artifactNote);
  }

  const updatedNote = await prisma.note.update({
    where: { id: note.id },
    data: artifact,
    include: { attachments: true }
  });
  await writeVersionMetadata(updatedNote, {
    mainFile: mainAttachment,
    supportingFiles: getSupportingAttachments(updatedNote),
    approvedFile: artifact,
    stage: updatedNote.status
  }).catch(() => {});
  return ensureNoteApprovedArtifactAvailable(updatedNote);
}

async function autoArchiveApprovedNoteToFms(noteId, actorUser) {
  const approvedNote = await prisma.note.findUnique({
    where: { id: parseId(noteId) },
    include: {
      tenant: { select: { tenant_code: true } },
      branch: { select: { branch_name: true, branch_code: true } },
      attachments: true,
      fms_documents: {
        select: { id: true, status: true },
        take: 1
      }
    }
  });

  if (!approvedNote || !['FINAL_APPROVED', 'ARCHIVED'].includes(approvedNote.status)) {
    return null;
  }

  if ((approvedNote.fms_documents || []).length > 0) {
    return approvedNote.fms_documents[0];
  }

  const mainAttachment = getMainAttachment(approvedNote);
  const sourceStoredPath = approvedNote.approved_file_path || mainAttachment?.file_path;
  if (!sourceStoredPath) {
    return null;
  }

  const sourceName = approvedNote.approved_file_name || mainAttachment?.file_name || `${approvedNote.note_id}.pdf`;
  const publicDocumentReference = formatPublicDocumentReferenceValue(
    approvedNote.document_group_key || approvedNote.document_code || approvedNote.note_id,
    approvedNote.note_id,
    approvedNote.branch || null
  );
  const fileMeta = await assertValidFmsFile({
    absolutePath: resolveStoredPath(sourceStoredPath),
    fileName: sourceName,
    mimeType: approvedNote.approved_file_mime || mainAttachment?.mime_type || (sourceName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
  });

  const ownerNode = await resolveDefaultFmsOwnerNode({
    tenantId: approvedNote.tenant_id,
    branchId: approvedNote.branch_id || null,
    tenantCode: approvedNote.tenant?.tenant_code || 'BANK'
  });

  const documentKey = buildStoredDocumentKey({
    documentType: approvedNote.note_type || 'approved-file',
    customerReference: publicDocumentReference,
    fileName: sourceName,
    idHint: approvedNote.note_id
  });

  const copiedPath = await copyFileToFmsStorage({
    sourcePath: sourceStoredPath,
    tenantCode: approvedNote.tenant?.tenant_code || `tenant-${approvedNote.tenant_id}`,
    nodePathKey: ownerNode.path_key,
    documentKey,
    fileName: sourceName
  });

  const fileHash = await computeFileHash(copiedPath);
  const stat = await fs.stat(resolveStoredPath(copiedPath));
  const archivedDocument = await prisma.fmsDocument.create({
    data: {
      tenant_id: approvedNote.tenant_id,
      owner_node_id: ownerNode.id,
      source_note_id: approvedNote.id,
      version_group_key: approvedNote.document_group_key || approvedNote.note_id,
      version_number: approvedNote.version_number || 1,
      previous_version_id: null,
      is_latest_version: true,
      classification: approvedNote.classification || 'INTERNAL',
      document_type: approvedNote.note_type || 'Approved File',
      document_category: approvedNote.workflow_type || null,
      title: String(approvedNote.subject || approvedNote.note_id).trim(),
      customer_name: null,
      customer_reference: publicDocumentReference,
      cif_reference: null,
      account_reference: approvedNote.note_id,
      identity_reference: null,
      id_proof_number: null,
      document_reference: publicDocumentReference,
      department_master_id: ownerNode.department_master_id || null,
      branch_id: ownerNode.branch_id || approvedNote.branch_id || null,
      file_name: sourceName,
      stored_path: copiedPath,
      mime_type: fileMeta.mime,
      file_extension: fileMeta.extension,
      file_size: Number(stat.size),
      file_hash: fileHash,
      file_kind: fileMeta.file_kind,
      uploaded_by_user_id: approvedNote.initiator_id,
      tags_json: [],
      custom_index_json: null,
      metadata_json: {
        node_id: ownerNode.id,
        node_path_key: ownerNode.path_key,
        department_master_id: ownerNode.department_master_id || null,
        branch_id: ownerNode.branch_id,
        source_note_id: approvedNote.id,
        source_document_group_key: approvedNote.document_group_key,
        note_id: approvedNote.note_id,
        document_code: approvedNote.document_code,
        public_document_reference: publicDocumentReference,
        workflow_state: approvedNote.workflow_state,
        visibility_mode: 'ACTIVE',
        auto_archived_from_dms: true,
        approval_note: approvedNote.approval_note || null
      },
      search_text: buildFmsSearchText({
        title: String(approvedNote.subject || approvedNote.note_id).trim(),
        document_type: approvedNote.note_type || 'Approved File',
        document_category: approvedNote.workflow_type || null,
        customer_name: null,
        customer_reference: publicDocumentReference,
        account_reference: approvedNote.note_id,
        document_reference: publicDocumentReference,
        file_name: sourceName,
        note_id: approvedNote.note_id,
        document_code: approvedNote.document_code,
        branch_name: approvedNote.branch?.branch_name,
        department_name: approvedNote.department?.name,
        node_path_key: ownerNode.path_key,
        classification: approvedNote.classification || 'INTERNAL',
        notes: approvedNote.approval_note
      }),
      status: 'ACTIVE',
      published_by_user_id: actorUser?.id || approvedNote.last_action_by_user_id || approvedNote.initiator_id,
      published_at: new Date()
    }
  });

  await writeFmsAuditLog({
    tenantId: archivedDocument.tenant_id,
    ownerNodeId: archivedDocument.owner_node_id,
    documentId: archivedDocument.id,
    actorUserId: actorUser?.id || approvedNote.last_action_by_user_id || approvedNote.initiator_id,
    action: 'FMS_AUTO_ARCHIVED_FROM_DMS',
    remarks: `Automatically archived from approved DMS file ${publicDocumentReference}`,
    metadata: {
      source_note_id: approvedNote.id,
      visibility_mode: 'ACTIVE'
    }
  });

  return archivedDocument;
}

async function removeStoredFiles(paths = []) {
  for (const filePath of paths.filter(Boolean)) {
    const resolved = resolveStoredPath(filePath);
    await fs.rm(resolved, { force: true }).catch(() => {});
    await pruneEmptyStoredParents(filePath).catch(() => {});
  }
}

const runTransaction = (callback) => prisma.$transaction(callback, {
  maxWait: 10000,
  timeout: 30000
});

const sendStoredFile = async (res, storedPath, {
  downloadName = path.basename(String(storedPath || 'file')),
  disposition = 'inline',
  contentType = null,
  cacheControl = 'private, no-store'
} = {}) => {
  const resolved = resolveStoredPath(storedPath);
  await fs.access(resolved);
  res.setHeader('Content-Disposition', `${disposition}; filename="${downloadName.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', cacheControl);
  if (contentType) {
    res.setHeader('Content-Type', contentType);
  }
  res.sendFile(resolved);
};

const sendBufferedFile = (res, buffer, {
  downloadName = 'file',
  disposition = 'attachment',
  contentType = 'application/octet-stream',
  cacheControl = 'private, no-store'
} = {}) => {
  res.setHeader('Content-Disposition', `${disposition}; filename="${String(downloadName || 'file').replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Type', contentType);
  res.send(buffer);
};

export const createNote = async (req, res) => {
  const { subject, note_type, workflow_type, vertical_id, department_id } = req.body;
  const classification = String(req.body.classification || 'INTERNAL').trim().toUpperCase();
  const initiator_id = req.user.id;
  let managedPaths = [];

  try {
    if (!req.files?.main_note?.[0] || req.files.main_note.length !== 1) {
      return res.status(400).json({ error: 'Main note document is required.' });
    }

    const uploadComment = requireComment(req.body.comment_text, 'Uploader comment is required when creating a file.');

    req.files.main_note = await uploadNormalizationService.normalizeUploadedFiles(req.files.main_note);
    if (req.files.annexures?.length) {
      req.files.annexures = await uploadNormalizationService.normalizeUploadedFiles(req.files.annexures);
    }

    const tenantCode = req.user.tenant?.tenant_code || 'GEN';
    const branchCode = req.user.branch?.branch_code || 'HQ';
    let note = null;
    let lastCreateError = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const references = await reserveUniqueNoteIdentifier({
        tenantId: req.user.tenant_id || null,
        branchId: req.user.branch_id || null,
        tenantCode,
        branchCode,
        branchName: req.user.branch?.branch_name || ''
      });
      const note_id = references.noteId;
      const document_code = references.documentCode;
      const document_group_key = references.publicReference;

      try {
        note = await runTransaction(async (tx) => {
      const created = await tx.note.create({
        data: {
          note_id,
          document_code,
          document_group_key,
          version_number: 1,
          subject,
          note_type,
          workflow_type: workflow_type || 'STRICT',
          classification,
          initiator_id,
          tenant_id: req.user.tenant_id || null,
          branch_id: req.user.branch_id || null,
          vertical_id: parseId(vertical_id),
          department_id: parseId(department_id),
          status: 'UPLOADED',
          workflow_state: WORKFLOW_STATES.DRAFT,
          queue_code: QUEUE_CODES.DRAFTS,
          current_owner_user_id: initiator_id,
          next_responsible_user_id: null,
          last_action_by_user_id: initiator_id
        }
      });

      const organizedFiles = await organizeUploadedFilesForVersion(created, req.files.main_note[0], req.files.annexures || []);
      managedPaths = organizedFiles.managedPaths;
      const mainFile = organizedFiles.mainFile;
      const createdAttachments = [];
      for (const attachment of buildAttachmentData(created.id, mainFile, organizedFiles.supportingFiles)) {
        createdAttachments.push(await tx.attachment.create({ data: attachment }));
      }
      await tx.comment.create({
        data: {
          note_id: created.id,
          user_id: initiator_id,
          comment_text: uploadComment
        }
      });
      await createAuditLog(tx, {
        noteId: created.id,
        note: created,
        user: req.user,
        action: 'UPLOAD',
        remarks: `${uploadComment}${mainFile.normalizedRotation ? ` | Auto-straightened by ${mainFile.normalizedRotation}°` : ''}`
      });

      await createMovementLog(tx, {
        noteId: created.id,
        note: created,
        fromState: null,
        toState: WORKFLOW_STATES.DRAFT,
        fromQueue: null,
        toQueue: QUEUE_CODES.DRAFTS,
        fromUserId: null,
        toUserId: initiator_id,
        actedByUserId: initiator_id,
        actionType: 'DRAFT_CREATED',
        remarkText: uploadComment
      });

      const mainAttachment = createdAttachments.find((attachment) => attachment.file_type === ATTACHMENT_TYPES.MAIN);
      if (!mainAttachment) {
        throw new Error('Exactly one MAIN file is required per version.');
      }

      await createAttachmentAuditLog(tx, {
        noteId: created.id,
        attachment: mainAttachment,
        user: req.user,
        action: 'UPLOAD_MAIN',
        remarks: `${uploadComment}${mainFile.normalizedRotation ? ` | Auto-straightened by ${mainFile.normalizedRotation}Â°` : ''}`
      });

      for (const attachment of createdAttachments.filter((item) => item.file_type === ATTACHMENT_TYPES.SUPPORTING)) {
        await createAttachmentAuditLog(tx, {
          noteId: created.id,
          attachment,
          user: req.user,
          action: 'UPLOAD_SUPPORTING',
          remarks: 'Supporting file uploaded'
        });
      }

      await writeVersionMetadata(created, {
        mainFile: mainAttachment,
        supportingFiles: createdAttachments.filter((item) => item.file_type === ATTACHMENT_TYPES.SUPPORTING),
        stage: 'UPLOADED'
      });

          return created;
        });
        break;
      } catch (error) {
        lastCreateError = error;
        if (isPrismaUniqueConstraintError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (!note) {
      throw lastCreateError || new Error('Unable to create a unique draft for this upload.');
    }

    res.status(201).json(note);
  } catch (error) {
    await removeStoredFiles(managedPaths);
    res.status(500).json({ error: error.message });
  }
};

export const submitNote = async (req, res) => {
  const { noteId } = req.params;
  const userId = req.user.id;

  try {
    const note = await prisma.note.findUnique({
      where: { id: parseId(noteId) },
      include: { workflow_steps: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);
    if (note.initiator_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to submit this file' });
    }
    const currentWorkflowState = getWorkflowState(note);
    if (note.workflow_steps.length > 0) {
      const orderedExistingSteps = [...note.workflow_steps].sort((left, right) => left.sequence - right.sequence);
      const firstPendingStep = orderedExistingSteps.find((step) => step.status === 'PENDING')
        || orderedExistingSteps.find((step) => ['PENDING', 'WAITING'].includes(step.status))
        || orderedExistingSteps[0];

      if (currentWorkflowState === WORKFLOW_STATES.DRAFT && firstPendingStep?.assigned_user_id) {
        await prisma.note.update({
          where: { id: note.id },
          data: buildWorkflowUpdate({
            workflowState: WORKFLOW_STATES.SUBMITTED,
            queueCode: QUEUE_CODES.INCOMING,
            currentOwnerUserId: firstPendingStep.assigned_user_id,
            nextResponsibleUserId: firstPendingStep.assigned_user_id,
            lastActionByUserId: note.last_action_by_user_id || userId,
            legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.SUBMITTED),
            submittedAt: note.submitted_at || new Date(),
            closedAt: null
          })
        });
      }

      return res.json({
        message: 'Workflow is already configured for this file',
        note_id: note.note_id,
        already_configured: true
      });
    }
    if (currentWorkflowState !== WORKFLOW_STATES.DRAFT) {
      return res.status(409).json({ error: 'Only draft files can be submitted into workflow.' });
    }

    const recommenderIds = normalizeWorkflowAssigneeIds(req.body.recommender_id, req.body.recommenders);
    const approverId = parseId(req.body.approver_id || req.body.approvers?.[0]);
    const initialComment = requireComment(req.body.comment_text, 'Comment is required when starting workflow.');

    if (!recommenderIds.length || !approverId) {
      return res.status(400).json({ error: 'At least one recommender and one approver are required.' });
    }

    if (recommenderIds.includes(approverId)) {
      return res.status(400).json({ error: 'Recommenders and approver must be different users.' });
    }

    for (const recommenderId of recommenderIds) {
      await validateWorkflowUser(recommenderId, 'RECOMMENDER', req.user);
    }
    await validateWorkflowUser(approverId, 'APPROVER', req.user);

    const workflowSteps = [
      ...recommenderIds.map((recommenderId, index) => ({
        note_id: note.id,
        sequence: index + 1,
        role_type: 'RECOMMENDER',
        assigned_user_id: recommenderId,
        status: index === 0 ? 'PENDING' : 'WAITING'
      })),
      {
        note_id: note.id,
        sequence: recommenderIds.length + 1,
        role_type: 'APPROVER',
        assigned_user_id: approverId,
        status: 'WAITING'
      }
    ];

    const firstRecommenderId = recommenderIds[0];

    await runTransaction(async (tx) => {
      await tx.workflowStep.createMany({
        data: workflowSteps
      });

      const latestInitiatorComment = await tx.comment.findFirst({
        where: {
          note_id: note.id,
          user_id: userId
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      if (!latestInitiatorComment || cleanComment(latestInitiatorComment.comment_text) !== initialComment) {
        await tx.comment.create({
          data: {
            note_id: note.id,
            user_id: userId,
            comment_text: initialComment
          }
        });
      }

      await tx.note.update({
        where: { id: note.id },
        data: buildWorkflowUpdate({
          workflowState: WORKFLOW_STATES.SUBMITTED,
          queueCode: QUEUE_CODES.INCOMING,
          currentOwnerUserId: firstRecommenderId,
          nextResponsibleUserId: firstRecommenderId,
          lastActionByUserId: userId,
          legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.SUBMITTED),
          submittedAt: new Date(),
          closedAt: null
        })
      });

      await createAuditLog(tx, {
        noteId: note.id,
        user: req.user,
        action: 'SUBMITTED',
        remarks: initialComment
      });

      const noteWithAttachments = await tx.note.findUnique({
        where: { id: note.id },
        include: { attachments: true }
      });
      const mainAttachment = getMainAttachment(noteWithAttachments);
      if (mainAttachment) {
        await createAttachmentAuditLog(tx, {
          noteId: note.id,
          attachment: mainAttachment,
          user: req.user,
          action: 'WORKFLOW_STARTED',
          remarks: `Assigned ${recommenderIds.length} recommender step(s) and final approver ${approverId}`
        });
      }

      await createMovementLog(tx, {
        noteId: note.id,
        note,
        fromState: WORKFLOW_STATES.DRAFT,
        toState: WORKFLOW_STATES.SUBMITTED,
        fromQueue: QUEUE_CODES.DRAFTS,
        toQueue: QUEUE_CODES.INCOMING,
        fromUserId: userId,
        toUserId: firstRecommenderId,
        actedByUserId: userId,
        actionType: 'SUBMIT',
        remarkText: initialComment
      });
    });

    await notifyUserSafe({
      userId: firstRecommenderId,
      tenantId: req.user.tenant_id || null,
      branchId: req.user.branch_id || null,
      title: 'New file submitted for recommendation',
      message: `${req.user.name} submitted ${note.note_id} (${note.subject}) for your recommendation.`,
      category: 'WORKFLOW',
      entityType: 'NOTE',
      entityId: note.id
    });

    res.json({ message: 'Workflow configured successfully', note_id: note.note_id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const reuploadNoteVersion = async (req, res) => {
  const { noteId } = req.params;
  let managedPaths = [];

  try {
    if (!req.files?.main_note?.[0] || req.files.main_note.length !== 1) {
      return res.status(400).json({ error: 'Main note document is required for re-upload.' });
    }

    const commentText = requireComment(req.body.comment_text, 'Comment is required when creating a new version.');

    req.files.main_note = await uploadNormalizationService.normalizeUploadedFiles(req.files.main_note);
    if (req.files.annexures?.length) {
      req.files.annexures = await uploadNormalizationService.normalizeUploadedFiles(req.files.annexures);
    }

    const sourceNote = await prisma.note.findUnique({
      where: { id: parseId(noteId) },
      include: {
        workflow_steps: { orderBy: { sequence: 'asc' } }
      }
    });

    if (!sourceNote) return res.status(404).json({ error: 'Source file not found' });
    await assertNoteAccess(req.user, sourceNote);
    if (sourceNote.initiator_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the uploader can create a new version' });
    }

    const latestVersion = await prisma.note.findFirst({
      where: buildAccessWhere(req.user, { document_group_key: sourceNote.document_group_key }),
      orderBy: { version_number: 'desc' },
      include: {
        workflow_steps: { orderBy: { sequence: 'asc' } },
        attachments: true
      }
    });

    if (!latestVersion) {
      return res.status(404).json({ error: 'Latest version not found' });
    }

    if (ACTIVE_NOTE_STATUSES.has(latestVersion.status) || ACTIVE_WORKFLOW_STATES.has(getWorkflowState(latestVersion))) {
      return res.status(409).json({ error: 'A version is already moving through the workflow. Wait for it to complete.' });
    }
    if (getWorkflowState(latestVersion) !== WORKFLOW_STATES.RETURNED_WITH_REMARK) {
      return res.status(409).json({ error: 'A new version can only be created after the file is returned.' });
    }

    const orderedWorkflowSteps = [...(latestVersion.workflow_steps || [])].sort((left, right) => left.sequence - right.sequence);
    const firstWorkflowStep = orderedWorkflowSteps[0];
    const approverStep = [...orderedWorkflowSteps].reverse().find((step) => step.role_type === 'APPROVER');
    if (!firstWorkflowStep || !approverStep) {
      return res.status(400).json({ error: 'Cannot clone workflow because the prior version is incomplete.' });
    }

    const tenantCode = req.user.tenant?.tenant_code || 'GEN';
    const branchCode = req.user.branch?.branch_code || 'HQ';
    let createdVersion = null;
    let lastVersionError = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const references = await reserveUniqueNoteIdentifier({
        tenantId: latestVersion.tenant_id || null,
        branchId: latestVersion.branch_id || null,
        tenantCode,
        branchCode,
        branchName: req.user.branch?.branch_name || latestVersion.branch?.branch_name || ''
      });
      const newNoteId = references.noteId;
      try {
        createdVersion = await prisma.$transaction(async (tx) => {
      await tx.note.update({
        where: { id: latestVersion.id },
        data: { is_latest_version: false }
      });

        const nextVersion = await tx.note.create({
        data: {
          note_id: newNoteId,
          document_code: references.documentCode,
          document_group_key: latestVersion.document_group_key,
          version_number: latestVersion.version_number + 1,
          previous_version_id: latestVersion.id,
          subject: req.body.subject || latestVersion.subject,
          note_type: req.body.note_type || latestVersion.note_type,
          workflow_type: latestVersion.workflow_type,
          classification: latestVersion.classification,
          initiator_id: latestVersion.initiator_id,
          tenant_id: latestVersion.tenant_id,
          branch_id: latestVersion.branch_id,
          department_id: latestVersion.department_id,
          vertical_id: latestVersion.vertical_id,
          status: 'UPLOADED',
          workflow_state: WORKFLOW_STATES.RESUBMITTED,
          queue_code: QUEUE_CODES.INCOMING,
          current_owner_user_id: firstWorkflowStep.assigned_user_id,
          next_responsible_user_id: firstWorkflowStep.assigned_user_id,
          last_action_by_user_id: req.user.id,
          submitted_at: new Date()
        }
      });

      const organizedFiles = await organizeUploadedFilesForVersion(nextVersion, req.files.main_note[0], req.files.annexures || []);
      const retainedSupportingFiles = await cloneSupportingAttachmentsToVersion(
        nextVersion,
        getSupportingAttachments(latestVersion),
        organizedFiles.supportingFiles.length
      );
      managedPaths = [
        ...organizedFiles.managedPaths,
        ...retainedSupportingFiles.flatMap((file) => file.managedPaths || [])
      ];
      const mainFile = organizedFiles.mainFile;
      const versionSupportingFiles = [...organizedFiles.supportingFiles, ...retainedSupportingFiles];
      const createdAttachments = [];
      for (const attachment of buildAttachmentData(nextVersion.id, mainFile, versionSupportingFiles)) {
        createdAttachments.push(await tx.attachment.create({ data: attachment }));
      }
      await tx.workflowStep.createMany({
        data: orderedWorkflowSteps.map((step, index) => ({
          note_id: nextVersion.id,
          sequence: index + 1,
          role_type: step.role_type,
          assigned_user_id: step.assigned_user_id,
          status: index === 0 ? 'PENDING' : 'WAITING'
        }))
      });

      await tx.comment.create({
        data: {
          note_id: nextVersion.id,
          user_id: req.user.id,
          comment_text: commentText
        }
      });

      await createAuditLog(tx, {
        noteId: nextVersion.id,
        note: nextVersion,
        user: req.user,
        action: 'RESUBMITTED',
        remarks: commentText
      });

      await createAuditLog(tx, {
        noteId: nextVersion.id,
        note: nextVersion,
        user: req.user,
        action: 'UPLOAD',
        remarks: `Replacement file uploaded as a new version${mainFile.normalizedRotation ? ` and auto-straightened by ${mainFile.normalizedRotation}°` : ''}`
      });

      const mainAttachment = createdAttachments.find((attachment) => attachment.file_type === ATTACHMENT_TYPES.MAIN);
      if (!mainAttachment) {
        throw new Error('Exactly one MAIN file is required per version.');
      }

      await createAttachmentAuditLog(tx, {
        noteId: nextVersion.id,
        attachment: mainAttachment,
        user: req.user,
        action: 'VERSION_CREATED',
        remarks: `Created version ${nextVersion.version_number} from version ${latestVersion.version_number}`
      });

      await createAttachmentAuditLog(tx, {
        noteId: nextVersion.id,
        attachment: mainAttachment,
        user: req.user,
        action: 'UPLOAD_MAIN',
        remarks: `Replacement main file uploaded as a new version${mainFile.normalizedRotation ? ` and auto-straightened by ${mainFile.normalizedRotation}Â°` : ''}`
      });

      for (const attachment of createdAttachments.filter((item) => item.file_type === ATTACHMENT_TYPES.SUPPORTING)) {
        const carriedForwardSource = versionSupportingFiles.find((file) => (
          file.carriedForward && file.file_name === attachment.file_name
        ));
        await createAttachmentAuditLog(tx, {
          noteId: nextVersion.id,
          attachment,
          user: req.user,
          action: carriedForwardSource ? 'SUPPORTING_CARRIED_FORWARD' : 'UPLOAD_SUPPORTING',
          remarks: carriedForwardSource
            ? `Supporting file retained from version ${latestVersion.version_number}`
            : 'Supporting file uploaded for new version'
        });
      }

      await createMovementLog(tx, {
        noteId: nextVersion.id,
        note: nextVersion,
        fromState: WORKFLOW_STATES.RETURNED_WITH_REMARK,
        toState: WORKFLOW_STATES.RESUBMITTED,
        fromQueue: QUEUE_CODES.RETURNED_WITH_REMARKS,
        toQueue: QUEUE_CODES.INCOMING,
        fromUserId: req.user.id,
        toUserId: firstWorkflowStep.assigned_user_id,
        actedByUserId: req.user.id,
        actionType: 'RESUBMIT',
        remarkText: commentText
      });

      await writeVersionMetadata(nextVersion, {
        mainFile: mainAttachment,
        supportingFiles: createdAttachments.filter((item) => item.file_type === ATTACHMENT_TYPES.SUPPORTING),
        stage: 'RESUBMITTED'
      });

          return nextVersion;
        });
        break;
      } catch (error) {
        lastVersionError = error;
        if (isPrismaUniqueConstraintError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (!createdVersion) {
      throw lastVersionError || new Error('Unable to create a unique version reference for this upload.');
    }

    res.status(201).json({ message: 'New version uploaded successfully', note: createdVersion });
  } catch (error) {
    await removeStoredFiles(managedPaths);
    res.status(500).json({ error: error.message });
  }
};

export const reassignWorkflowOwner = async (req, res) => {
  const { noteId } = req.params;
  const actorUserId = req.user.id;

  try {
    const note = await prisma.note.findUnique({
      where: { id: parseId(noteId) },
      include: {
        workflow_steps: {
          include: { assigned_user: { include: { role: true } } },
          orderBy: { sequence: 'asc' }
        },
        current_owner: { include: { role: true } },
        next_responsible: { include: { role: true } },
        attachments: true
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    await assertNoteAccess(req.user, note);

    if (!canUserReassignWorkflow(req.user, note)) {
      return res.status(403).json({ error: 'You are not allowed to reassign this workflow.' });
    }

    const workflowState = getWorkflowState(note);
    if (!ACTIVE_WORKFLOW_STATES.has(workflowState)) {
      return res.status(409).json({ error: 'Only active workflow files can be reassigned.' });
    }

    const activeStep = getActiveStep(note);
    if (!activeStep?.assigned_user_id || !activeStep?.role_type) {
      return res.status(400).json({ error: 'No active workflow owner is available to reassign.' });
    }

    const targetUserId = parseId(req.body.target_user_id);
    const reason = requireComment(req.body.reason, 'Reason is required when reassigning workflow.');

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target workflow user is required.' });
    }

    if (Number(targetUserId) === Number(activeStep.assigned_user_id)) {
      return res.status(400).json({ error: 'Select a different workflow user for reassignment.' });
    }

    const targetUser = await validateWorkflowUser(targetUserId, activeStep.role_type, req.user);
    const oldOwner = activeStep.assigned_user;

    await runTransaction(async (tx) => {
      await tx.workflowStep.update({
        where: { id: activeStep.id },
        data: {
          assigned_user_id: targetUser.id
        }
      });

      await tx.note.update({
        where: { id: note.id },
        data: buildWorkflowUpdate({
          workflowState,
          queueCode: getQueueCode(note),
          currentOwnerUserId: targetUser.id,
          nextResponsibleUserId: targetUser.id,
          lastActionByUserId: actorUserId,
          legacyStatus: note.status,
          submittedAt: note.submitted_at,
          closedAt: null
        })
      });

      await tx.comment.create({
        data: {
          note_id: note.id,
          user_id: actorUserId,
          comment_text: `Workflow reassigned from ${oldOwner?.name || 'previous owner'} to ${targetUser.name}. Reason: ${reason}`
        }
      });

      await createAuditLog(tx, {
        noteId: note.id,
        note,
        user: req.user,
        action: 'WORKFLOW_REASSIGNED',
        remarks: `Reassigned ${activeStep.role_type.toLowerCase()} from ${oldOwner?.name || '-'} to ${targetUser.name}. Reason: ${reason}`
      });

      const mainAttachment = getMainAttachment(note);
      if (mainAttachment) {
        await createAttachmentAuditLog(tx, {
          noteId: note.id,
          attachment: mainAttachment,
          user: req.user,
          action: 'WORKFLOW_REASSIGNED',
          remarks: `Reassigned to ${targetUser.name}. Reason: ${reason}`
        });
      }

      await createMovementLog(tx, {
        noteId: note.id,
        note,
        fromState: workflowState,
        toState: workflowState,
        fromQueue: getQueueCode(note),
        toQueue: getQueueCode(note),
        fromUserId: activeStep.assigned_user_id,
        toUserId: targetUser.id,
        actedByUserId: actorUserId,
        actionType: 'REASSIGN',
        remarkText: reason
      });
    });

    await notifyUserSafe({
      userId: targetUser.id,
      tenantId: note.tenant_id || null,
      branchId: note.branch_id || null,
      title: 'Workflow reassigned to you',
      message: `${req.user.name} reassigned ${note.note_id} (${note.subject}) to you. Reason: ${reason}`,
      category: 'WORKFLOW',
      entityType: 'NOTE',
      entityId: note.id
    });

    return res.json({ message: 'Workflow reassigned successfully.' });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getDashboard = async (req, res) => {
  try {
    const where = buildRelevantNoteWhere(req.user, { is_latest_version: true });

    const notes = await prisma.note.findMany({
      where,
      include: {
        initiator: { select: { id: true, name: true } },
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department: true,
        vertical: true,
        current_owner: { select: { id: true, name: true } },
        next_responsible: { select: { id: true, name: true } },
        last_action_by: { select: { id: true, name: true } },
        workflow_steps: {
          include: { assigned_user: { select: { id: true, name: true } } },
          orderBy: { sequence: 'asc' }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(notes.map((note) => decorateNote(note)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNotes = async (req, res) => {
  const { view, vertical, department, status, q } = req.query;
  const userId = req.user.id;

  try {
    const normalizedView = NOTE_VIEW_ALIASES[String(view || '').trim().toUpperCase()] || String(view || '').trim().toUpperCase();
    const hasTrackingQuery = Boolean(String(q || '').trim());
    let where = buildRelevantNoteWhere(req.user, { is_latest_version: true });

    if (vertical && vertical !== 'all') where = addWhereCondition(where, { vertical_id: parseId(vertical) });
    if (department && department !== 'all') where = addWhereCondition(where, { department_id: parseId(department) });

    if (!hasTrackingQuery && normalizedView === 'DRAFTS') {
      where = addWhereCondition(where, {
        initiator_id: userId,
        workflow_state: WORKFLOW_STATES.DRAFT,
        queue_code: QUEUE_CODES.DRAFTS
      });
    } else if (!hasTrackingQuery && normalizedView === 'RETURNED') {
      where = addWhereCondition(where, {
        current_owner_user_id: userId,
        workflow_state: WORKFLOW_STATES.RETURNED_WITH_REMARK,
        queue_code: QUEUE_CODES.RETURNED_WITH_REMARKS
      });
    } else if (!hasTrackingQuery && normalizedView === 'INCOMING') {
      where = addWhereCondition(where, {
        current_owner_user_id: userId,
        queue_code: QUEUE_CODES.INCOMING,
        workflow_state: { in: [...ACTIVE_WORKFLOW_STATES] }
      });
    } else if (!hasTrackingQuery && normalizedView === 'SENT') {
      where = addWhereCondition(where, {
        last_action_by_user_id: userId,
        queue_code: QUEUE_CODES.INCOMING,
        workflow_state: { in: [...ACTIVE_WORKFLOW_STATES] },
        NOT: { current_owner_user_id: userId }
      });
    } else if (!hasTrackingQuery && normalizedView === 'HISTORY') {
      where = addWhereCondition(where, {
        workflow_state: { in: [...CLOSED_WORKFLOW_STATES] },
        queue_code: QUEUE_CODES.APPROVED_CLOSED_HISTORY
      });
    } else if (!hasTrackingQuery && req.user.role.name === 'INITIATOR') {
      where = addWhereCondition(where, { initiator_id: userId });
    }

    if (status && status !== 'all') {
      where = addWhereCondition(where, { workflow_state: String(status).trim().toUpperCase() });
    }

    const searchCondition = buildNoteSearchCondition(q);
    if (searchCondition) {
      where = addWhereCondition(where, searchCondition);
    }

    const notes = await prisma.note.findMany({
      where,
      include: {
        initiator: { select: { id: true, name: true } },
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department: true,
        vertical: true,
        current_owner: { select: { id: true, name: true } },
        next_responsible: { select: { id: true, name: true } },
        last_action_by: { select: { id: true, name: true } },
        workflow_steps: {
          include: { assigned_user: { select: { id: true, name: true } } },
          orderBy: { sequence: 'asc' }
        }
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(notes.map((note) => decorateNote(note)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getMyNotes = async (req, res) => {
  try {
    const notes = await prisma.note.findMany({
      where: buildRelevantNoteWhere(req.user, {
        initiator_id: req.user.id,
        is_latest_version: true
      }),
      include: {
        department: true,
        vertical: true,
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        current_owner: { select: { id: true, name: true } },
        next_responsible: { select: { id: true, name: true } },
        last_action_by: { select: { id: true, name: true } }
      },
      orderBy: { updated_at: 'desc' }
    });

    res.json(notes.map((note) => decorateNote(note)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getNoteById = async (req, res) => {
  const { id } = req.params;

  try {
    const note = await prisma.note.findUnique({
      where: { id: parseId(id) },
      include: {
        initiator: true,
        tenant: {
          select: {
            id: true,
            tenant_name: true,
            tenant_code: true
          }
        },
        branch: {
          select: {
            id: true,
            branch_name: true,
            branch_code: true,
            tenant_id: true
          }
        },
        department: true,
        vertical: true,
        current_owner: { include: { role: true } },
        next_responsible: { include: { role: true } },
        last_action_by: { include: { role: true } },
        attachments: true,
        comments: {
          include: { user: { select: { name: true, role: { select: { name: true } } } } },
          orderBy: { created_at: 'asc' }
        },
        workflow_steps: {
          include: { assigned_user: { include: { role: true } } },
          orderBy: { sequence: 'asc' }
        },
        audit_logs: { orderBy: { timestamp: 'desc' } }
        ,
        note_access_grants: {
          where: { is_active: true },
          include: {
            granted_user: {
              select: {
                id: true,
                name: true,
                employee_id: true,
                email: true,
                role: { select: { name: true } },
                branch: { select: { branch_name: true, branch_code: true } }
              }
            },
            granted_by: {
              select: {
                id: true,
                name: true,
                employee_id: true,
                role: { select: { name: true } }
              }
            }
          },
          orderBy: { created_at: 'desc' }
        },
        note_movements: {
          include: {
            from_user: { select: { id: true, name: true, role: true } },
            to_user: { select: { id: true, name: true, role: true } },
            acted_by: { select: { id: true, name: true, role: true } }
          },
          orderBy: { created_at: 'desc' }
        },
        fms_documents: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            title: true,
            classification: true,
            owner_node_id: true,
            created_at: true
          }
        },
        rejection_highlights: {
          orderBy: [
            { page_number: 'asc' },
            { created_at: 'asc' }
          ]
        }
      }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const [version_history, current_active_approved, workflow_reassign_candidates] = await Promise.all([
      buildVersionHistory(note.document_group_key),
      prisma.note.findFirst({
        where: buildAccessWhere(req.user, { status: 'FINAL_APPROVED' }),
        include: {
          attachments: true,
          initiator: { select: { name: true } },
          branch: { select: { id: true, branch_name: true, branch_code: true } }
        },
        orderBy: { approved_at: 'desc' }
      }),
      getWorkflowReassignCandidates(note, req.user)
    ]);

    const normalizedNote = normalizeNoteAttachmentsForOutput(note);
    const decoratedNote = decorateNote(normalizedNote);

    res.json({
      ...decoratedNote,
      main_attachment: getMainAttachment(normalizedNote),
      supporting_attachments: getSupportingAttachments(normalizedNote),
      audit_logs: normalizedNote.audit_logs,
      note_access_grants: normalizedNote.note_access_grants || [],
      note_movements: normalizedNote.note_movements,
      rejection_highlights: normalizedNote.rejection_highlights,
      workflow_display_status: getWorkflowDisplayStatus(note),
      version_history: version_history.map((version) => decorateNote(version)),
      current_active_approved: current_active_approved ? normalizeNoteAttachmentsForOutput(current_active_approved) : current_active_approved,
      fms_publications: normalizedNote.fms_documents || [],
      can_reassign_workflow: canUserReassignWorkflow(req.user, note),
      workflow_reassign_candidates,
      can_view_sensitive_file_details: canViewSensitiveDmsFileDetails(req.user)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getCurrentApprovedNote = async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: buildAccessWhere(req.user, { status: 'FINAL_APPROVED' }),
      include: {
        initiator: { select: { name: true } },
        attachments: true,
        branch: { select: { id: true, branch_name: true, branch_code: true } },
        department: true,
        vertical: true
      },
      orderBy: { approved_at: 'desc' }
    });

    res.json(note ? decorateNote(note) : null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getPreviewPages = async (req, res) => {
  try {
    let note = await prisma.note.findUnique({
      where: { id: parseId(req.params.id) },
      include: { attachments: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    note = await refreshApprovedArtifactIfNeeded(note);

    const mainAttachment = getMainAttachment(note);
    const previewPath = (note.status === 'FINAL_APPROVED' || note.status === 'ARCHIVED') && note.approved_file_path
      ? note.approved_file_path
      : mainAttachment?.file_path;

    if (!previewPath) {
      return res.json({ pages: [] });
    }

    let pages = [];
    try {
      pages = await previewService.generatePreviewPages(note, previewPath);
    } catch {
      pages = [];
    }

    res.json({
      pages: pages.map((page) => ({
        page_number: page.page_number,
        image_url: `/api/notes/${note.id}/previews/${page.page_number}/image?v=${page.cache_buster || Date.now()}`,
        width: page.width,
        height: page.height
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const streamPreviewImage = async (req, res) => {
  try {
    let note = await prisma.note.findUnique({
      where: { id: parseId(req.params.id) },
      include: { attachments: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);
    note = await refreshApprovedArtifactIfNeeded(note);

    const mainAttachment = getMainAttachment(note);
    const previewPath = (note.status === 'FINAL_APPROVED' || note.status === 'ARCHIVED') && note.approved_file_path
      ? note.approved_file_path
      : mainAttachment?.file_path;

    if (!previewPath) {
      return res.status(404).json({ error: 'Preview not available.' });
    }

    await previewService.generatePreviewPages(note, previewPath);
    const pageNumber = parseId(req.params.pageNumber);
    const previewImagePath = toStoredRelativePath(path.posix.join(
      getVersionArchiveSubdirs(note.document_group_key || note.note_id || `note-${note.id}`, note.version_number || 1).previews,
      `page-${pageNumber}.jpg`
    ));
    await sendStoredFile(res, previewImagePath, {
      downloadName: `${note.note_id || `note-${note.id}`}-preview-${pageNumber}.jpg`,
      disposition: 'inline',
      contentType: 'image/jpeg',
      cacheControl: 'private, max-age=60'
    });
  } catch (error) {
    logger.error('Preview image streaming failed', { message: error.message, noteId: req.params.id, pageNumber: req.params.pageNumber });
    res.status(500).json({ error: 'Unable to load preview image.' });
  }
};

export const streamAttachmentFile = async (req, res) => {
  try {
    const note = await prisma.note.findUnique({
      where: { id: parseId(req.params.id) },
      include: { attachments: true }
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const attachment = note.attachments.find((item) => item.id === parseId(req.params.attachmentId));
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found.' });
    }
    await ensureNoteAttachmentAvailable({ note, attachment });
    const attachmentName = normalizeDisplayFileName(attachment.file_name || '');

    const disposition = String(req.query.disposition || 'inline').toLowerCase() === 'attachment' ? 'attachment' : 'inline';
    if (disposition === 'attachment') {
      await assertNoteDownloadAccess(req.user, note);
    }
    const downloadOfficer = disposition === 'attachment' ? req.user : null;
    writeSecurityAudit(disposition === 'attachment' ? 'DMS_ATTACHMENT_DOWNLOADED' : 'DMS_ATTACHMENT_VIEWED', {
      user_id: req.user?.id,
      role: req.user?.role?.name || req.user?.role,
      tenant_id: note.tenant_id,
      branch_id: req.user?.branch_id || note.branch_id,
      note_id: note.id,
      document_reference: note.note_id,
      attachment_id: attachment.id,
      file_name: attachmentName,
      ip: req.ip
    });
    if (disposition === 'attachment') {
      await createDirectAuditLog({
        note,
        attachment: { ...attachment, file_name: attachmentName },
        user: downloadOfficer || req.user,
        action: attachment.file_type === ATTACHMENT_TYPES.SUPPORTING ? 'DOWNLOAD_SUPPORTING_DOCUMENT' : 'DOWNLOAD_MAIN_DOCUMENT',
        remarks: buildFileAccessAuditRemarks({
          user: downloadOfficer || req.user,
          label: attachment.file_type === ATTACHMENT_TYPES.SUPPORTING ? 'Supporting document downloaded' : 'Main document downloaded',
          fileName: attachmentName,
          fileType: attachment.file_type
        })
      });

      const controlledDownload = await approvedFileService.createControlledDownloadBuffer({
        storedPath: attachment.file_path,
        note,
        downloadContext: buildControlledDownloadContext(downloadOfficer || req.user, note)
      });

      if (controlledDownload?.buffer) {
        return sendBufferedFile(res, controlledDownload.buffer, {
          downloadName: attachmentName,
          disposition,
          contentType: controlledDownload.contentType
        });
      }
    }
    await sendStoredFile(res, attachment.file_path, {
      downloadName: attachmentName,
      disposition
    });
  } catch (error) {
    logger.error('Attachment streaming failed', { message: error.message, noteId: req.params.id, attachmentId: req.params.attachmentId });
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to access attachment.' });
  }
};

export const streamApprovedArtifactFile = async (req, res) => {
  try {
    let note = await prisma.note.findUnique({
      where: { id: parseId(req.params.id) },
      include: { attachments: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);
    if (note.status !== 'FINAL_APPROVED' && note.status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Approved artifact is available only after final approval.' });
    }

    note = await refreshApprovedArtifactIfNeeded(note);
    if (!note.approved_file_path) {
      return res.status(404).json({ error: 'Approved artifact not found.' });
    }

    const disposition = String(req.query.disposition || 'inline').toLowerCase() === 'attachment' ? 'attachment' : 'inline';
    if (disposition === 'attachment') {
      await assertNoteDownloadAccess(req.user, note);
    }
    const downloadOfficer = disposition === 'attachment' ? req.user : null;
    writeSecurityAudit(disposition === 'attachment' ? 'DMS_APPROVED_ARTIFACT_DOWNLOADED' : 'DMS_APPROVED_ARTIFACT_VIEWED', {
      user_id: req.user?.id,
      role: req.user?.role?.name || req.user?.role,
      tenant_id: note.tenant_id,
      branch_id: req.user?.branch_id || note.branch_id,
      note_id: note.id,
      document_reference: note.note_id,
      approved_file_name: note.approved_file_name,
      ip: req.ip
    });
    if (disposition === 'attachment') {
      await createDirectAuditLog({
        note,
        user: downloadOfficer || req.user,
        action: 'DOWNLOAD_APPROVED_ARTIFACT',
        remarks: buildFileAccessAuditRemarks({
          user: downloadOfficer || req.user,
          label: 'Approved artifact downloaded',
          fileName: note.approved_file_name
        })
      });

      try {
        note = await refreshApprovedArtifactIfNeeded(note);
      } catch (refreshError) {
        logger.error('Approved artifact refresh after download audit failed', {
          message: refreshError.message,
          noteId: req.params.id
        });
      }

      try {
        const controlledDownload = await approvedFileService.createControlledDownloadBuffer({
          storedPath: note.approved_file_path,
          note,
          downloadContext: buildControlledDownloadContext(downloadOfficer || req.user, note)
        });

        if (controlledDownload?.buffer) {
          return sendBufferedFile(res, controlledDownload.buffer, {
            downloadName: note.approved_file_name || `${note.note_id}-approved${path.extname(note.approved_file_path)}`,
            disposition,
            contentType: controlledDownload.contentType
          });
        }
      } catch (controlledDownloadError) {
        logger.error('Approved artifact controlled download fallback triggered', {
          message: controlledDownloadError.message,
          noteId: req.params.id
        });
      }
    }
    await sendStoredFile(res, note.approved_file_path, {
      downloadName: note.approved_file_name || `${note.note_id}-approved${path.extname(note.approved_file_path)}`,
      disposition,
      cacheControl: 'private, no-store'
    });
  } catch (error) {
    logger.error('Approved artifact streaming failed', { message: error.message, noteId: req.params.id });
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to access approved artifact.' });
  }
};

async function loadActiveNoteAccessGrants(noteId) {
  return prisma.noteAccessGrant.findMany({
    where: {
      note_id: noteId,
      is_active: true
    },
    include: {
      granted_user: {
        select: {
          id: true,
          name: true,
          employee_id: true,
          email: true,
          role: { select: { name: true } },
          branch: { select: { branch_name: true, branch_code: true } }
        }
      },
      granted_by: {
        select: {
          id: true,
          name: true,
          employee_id: true,
          role: { select: { name: true } }
        }
      }
    },
    orderBy: { created_at: 'desc' }
  });
}

function buildNoteAccessGrantAuditRemark({ targetUser, accessLevel, remarks = null }) {
  return [
    `Specific DMS ${String(accessLevel || NOTE_ACCESS_LEVELS.VIEW).toLowerCase()} access granted`,
    targetUser?.name ? `Granted To: ${targetUser.name}` : null,
    targetUser?.employee_id ? `Employee ID: ${targetUser.employee_id}` : null,
    remarks || null
  ].filter(Boolean).join(' | ');
}

function buildNoteAccessRevokeAuditRemark({ targetUser, reason = null }) {
  return [
    'Specific DMS access revoked',
    targetUser?.name ? `Revoked For: ${targetUser.name}` : null,
    targetUser?.employee_id ? `Employee ID: ${targetUser.employee_id}` : null,
    reason || null
  ].filter(Boolean).join(' | ');
}

export const createNoteAccessGrant = async (req, res) => {
  const noteId = parseId(req.params.noteId);
  const grantedUserId = parseId(req.body.granted_user_id);
  const accessLevel = normalizeNoteAccessLevel(req.body.access_level);
  const remarks = cleanComment(req.body.remarks);

  if (!noteId || !grantedUserId) {
    return res.status(400).json({ error: 'Valid note and target user are required.' });
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: {
        workflow_steps: true,
        note_movements: true
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    await assertNoteAccess(req.user, note);

    const targetUser = await prisma.user.findFirst({
      where: {
        id: grantedUserId,
        is_active: true,
        ...(note.tenant_id ? { tenant_id: note.tenant_id } : {})
      },
      include: {
        role: true,
        branch: { select: { branch_name: true, branch_code: true } }
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target bank user not found in this bank scope.' });
    }

    await prisma.$transaction(async (tx) => {
      const existingGrant = await tx.noteAccessGrant.findFirst({
        where: {
          note_id: noteId,
          granted_user_id: grantedUserId,
          is_active: true
        },
        orderBy: { created_at: 'desc' }
      });

      if (existingGrant) {
        await tx.noteAccessGrant.update({
          where: { id: existingGrant.id },
          data: {
            access_level: accessLevel,
            remarks: remarks || existingGrant.remarks || null,
            granted_by_user_id: req.user.id,
            revoked_at: null,
            revoked_by_user_id: null,
            revoke_reason: null,
            is_active: true
          }
        });
      } else {
        await tx.noteAccessGrant.create({
          data: {
            note_id: noteId,
            granted_user_id: grantedUserId,
            granted_by_user_id: req.user.id,
            access_level: accessLevel,
            remarks: remarks || null
          }
        });
      }

      await createAuditLog(tx, {
        noteId,
        note,
        user: req.user,
        action: accessLevel === NOTE_ACCESS_LEVELS.DOWNLOAD ? 'SPECIFIC_DMS_DOWNLOAD_ACCESS_GRANTED' : 'SPECIFIC_DMS_VIEW_ACCESS_GRANTED',
        remarks: buildNoteAccessGrantAuditRemark({
          targetUser,
          accessLevel,
          remarks
        })
      });
    });

    await createNotification({
      userId: targetUser.id,
      tenantId: note.tenant_id ?? targetUser.tenant_id ?? null,
      branchId: targetUser.branch_id ?? note.branch_id ?? null,
      title: 'Specific DMS file access granted',
      message: `${req.user?.name || 'Bank admin'} granted ${accessLevel === NOTE_ACCESS_LEVELS.DOWNLOAD ? 'view and download' : 'view-only'} access for ${note.subject || note.note_id}.`,
      category: 'ACCESS',
      entityType: 'NOTE',
      entityId: note.id
    }).catch(() => {});

    const grants = await loadActiveNoteAccessGrants(noteId);
    return res.json({
      message: accessLevel === NOTE_ACCESS_LEVELS.DOWNLOAD
        ? 'Specific DMS view and download access granted.'
        : 'Specific DMS view access granted.',
      grants
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const revokeNoteAccessGrant = async (req, res) => {
  const noteId = parseId(req.params.noteId);
  const grantId = parseId(req.params.grantId);
  const reason = cleanComment(req.body.reason);

  if (!noteId || !grantId) {
    return res.status(400).json({ error: 'Valid note access grant is required.' });
  }

  try {
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: {
        workflow_steps: true,
        note_movements: true
      }
    });

    if (!note) {
      return res.status(404).json({ error: 'Note not found.' });
    }

    await assertNoteAccess(req.user, note);

    const activeGrant = await prisma.noteAccessGrant.findFirst({
      where: {
        id: grantId,
        note_id: noteId,
        is_active: true
      },
      include: {
        granted_user: {
          select: {
            id: true,
            name: true,
            employee_id: true
          }
        }
      }
    });

    if (!activeGrant) {
      return res.status(404).json({ error: 'Specific DMS access grant not found.' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.noteAccessGrant.update({
        where: { id: activeGrant.id },
        data: {
          is_active: false,
          revoked_at: new Date(),
          revoked_by_user_id: req.user.id,
          revoke_reason: reason || null
        }
      });

      await createAuditLog(tx, {
        noteId,
        note,
        user: req.user,
        action: 'SPECIFIC_DMS_ACCESS_REVOKED',
        remarks: buildNoteAccessRevokeAuditRemark({
          targetUser: activeGrant.granted_user,
          reason
        })
      });
    });

    await createNotification({
      userId: activeGrant.granted_user.id,
      tenantId: note.tenant_id ?? null,
      branchId: note.branch_id ?? null,
      title: 'Specific DMS file access revoked',
      message: `${req.user?.name || 'Bank admin'} revoked your direct access to ${note.subject || note.note_id}.`,
      category: 'ACCESS',
      entityType: 'NOTE',
      entityId: note.id
    }).catch(() => {});

    const grants = await loadActiveNoteAccessGrants(noteId);
    return res.json({
      message: 'Specific DMS access revoked.',
      grants
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
};

export const getAuditLogs = async (req, res) => {
  try {
    const note = await prisma.note.findUnique({ where: { id: parseId(req.params.id) } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const logs = await prisma.auditLog.findMany({
      where: {
        note_id: parseId(req.params.id),
        ...(isSuperAdmin(req.user) ? {} : { tenant_id: req.user.tenant_id || undefined })
      },
      orderBy: { timestamp: 'desc' }
    });

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const clearNoteAuditLogs = async (req, res) => {
  if (!enableDemoFeatures) {
    return res.status(403).json({ error: 'Audit cleanup is disabled in production mode.' });
  }
  try {
    const noteId = parseId(req.params.id);
    const note = await prisma.note.findUnique({ where: { id: noteId } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    await prisma.auditLog.deleteMany({ where: { note_id: noteId, ...(note.tenant_id ? { tenant_id: note.tenant_id } : {}) } });
    res.json({ message: 'Audit logs cleared for this file.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const deleteNoteForDemo = async (req, res) => {
  if (!enableDemoFeatures) {
    return res.status(403).json({ error: 'Note deletion is disabled in production mode.' });
  }
  try {
    const noteId = parseId(req.params.id);
    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { attachments: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    await prisma.$transaction(async (tx) => {
      await tx.rejectionHighlight.deleteMany({ where: { note_id: noteId } });
      await tx.workflowStep.deleteMany({ where: { note_id: noteId } });
      await tx.comment.deleteMany({ where: { note_id: noteId } });
      await tx.auditLog.deleteMany({ where: { note_id: noteId } });
      await tx.attachment.deleteMany({ where: { note_id: noteId } });
      await tx.note.delete({ where: { id: noteId } });
    });

    await removeStoredFiles([
      ...note.attachments.map((attachment) => attachment.file_path),
      note.approved_file_path
    ]);
    await fs.rm(
      resolveStoredPath(getVersionArchiveSubdirs(note.document_group_key || note.note_id || `note-${note.id}`, note.version_number || 1).previews),
      { recursive: true, force: true }
    ).catch(() => {});
    await fs.rm(resolveStoredPath(path.posix.join('previews', `note-${noteId}`)), { recursive: true, force: true }).catch(() => {});

    res.json({ message: 'File version, stored documents, and logs deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const downloadNoteAuditExcel = async (req, res) => {
  try {
    const note = await getNoteWithExportData(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const rows = getAuditExportRows(note);
    const fileName = `${note.note_id || `note-${note.id}`}-audit-report.xls`.replace(/[^\w.-]+/g, '_');

    const html = `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: Arial, sans-serif; }
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; vertical-align: top; }
            th { background: #e2e8f0; }
            .meta td:first-child { width: 180px; font-weight: bold; background: #f8fafc; }
          </style>
        </head>
        <body>
          <h2>File Audit Report</h2>
          <table class="meta">
            <tr><td>File ID</td><td>${escapeHtml(note.note_id)}</td></tr>
            <tr><td>Public Ref</td><td>${escapeHtml(formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id, '-', note.branch || null))}</td></tr>
            <tr><td>Subject</td><td>${escapeHtml(note.subject)}</td></tr>
            <tr><td>Current Status</td><td>${escapeHtml(note.status)}</td></tr>
            <tr><td>Version</td><td>v${escapeHtml(note.version_number)}</td></tr>
            <tr><td>Department</td><td>${escapeHtml(note.department?.name || '-')}</td></tr>
            <tr><td>Vertical</td><td>${escapeHtml(note.vertical?.name || '-')}</td></tr>
            <tr><td>Uploader</td><td>${escapeHtml(note.initiator?.name || '-')}</td></tr>
            <tr><td>Exported At</td><td>${escapeHtml(formatWorkflowTimestamp(new Date()))}</td></tr>
          </table>
          <br />
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Role</th>
                <th>Performed By</th>
                <th>Remarks</th>
                <th>Current Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length === 0
                ? '<tr><td colspan="6">No audit entries found.</td></tr>'
                : rows.map((row) => `
                  <tr>
                    <td>${escapeHtml(row.timestamp)}</td>
                    <td>${escapeHtml(row.action)}</td>
                    <td>${escapeHtml(row.role)}</td>
                    <td>${escapeHtml(row.performed_by)}</td>
                    <td>${escapeHtml(row.remarks)}</td>
                    <td>${escapeHtml(row.current_status)}</td>
                  </tr>
                `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const downloadNoteAuditPdf = async (req, res) => {
  try {
    const note = await getNoteWithExportData(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const rows = getAuditExportRows(note);
    const pdfDoc = await PDFDocument.create();
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595, 842]);
    let { height } = page.getSize();
    let y = height - 34;
    const left = 40;
    const tableWidth = 595 - (left * 2);
    const aqua = rgb(0.86, 0.94, 0.94);
    const border = rgb(0.7, 0.78, 0.79);
    const dark = rgb(0.1, 0.17, 0.24);
    const body = rgb(0.12, 0.12, 0.12);

    const wrapText = (textValue, font, size, maxWidth) => {
      const text = String(textValue || '-').replace(/\s+/g, ' ').trim();
      if (!text) return ['-'];
      const words = text.split(' ');
      const lines = [];
      let current = '';

      for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
          current = candidate;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }

      if (current) lines.push(current);
      return lines.length > 0 ? lines : ['-'];
    };

    const drawCell = (x, topY, cellWidth, value, opts = {}) => {
      const font = opts.bold ? boldFont : regularFont;
      const size = opts.size || 10;
      const lines = wrapText(value, font, size, cellWidth - 12);
      const lineHeight = size + 3;
      const cellHeight = Math.max(opts.minHeight || 24, (lines.length * lineHeight) + 10);

      page.drawRectangle({
        x,
        y: topY - cellHeight,
        width: cellWidth,
        height: cellHeight,
        borderColor: border,
        borderWidth: 1,
        color: opts.fill || rgb(1, 1, 1)
      });

      let lineY = topY - size - 7;
      for (const line of lines) {
        page.drawText(line, {
          x: x + 6,
          y: lineY,
          size,
          font,
          color: body
        });
        lineY -= lineHeight;
      }

      return cellHeight;
    };

    const sectionTitle = (label) => {
      page.drawRectangle({ x: left, y: y - 22, width: tableWidth, height: 22, color: aqua, borderColor: border, borderWidth: 1 });
      const titleWidth = boldFont.widthOfTextAtSize(label, 13);
      page.drawText(label, { x: left + ((tableWidth - titleWidth) / 2), y: y - 15, size: 13, font: boldFont, color: dark });
      y -= 22;
    };

    const drawRow = (cells) => {
      const heights = cells.map((cell) => {
        const font = cell.bold ? boldFont : regularFont;
        const size = cell.size || 10;
        const lines = wrapText(cell.value, font, size, cell.width - 12);
        const lineHeight = size + 3;
        return Math.max(cell.minHeight || 24, (lines.length * lineHeight) + 10);
      });

      const rowHeight = Math.max(...heights);
      let x = left;
      for (const cell of cells) {
        drawCell(x, y, cell.width, cell.value, { ...cell, minHeight: rowHeight });
        x += cell.width;
      }
      y -= rowHeight;
    };

    const auditTitle = `${note.tenant?.brand_display_name || note.tenant?.tenant_name || 'Bank'} Audit Extract`;
    page.drawText(auditTitle, {
      x: left,
      y,
      size: 9,
      font: boldFont,
      color: rgb(0.22, 0.38, 0.55)
    });
    y -= 14;

    sectionTitle('NOTE DETAILS');
    drawRow([
      { width: 95, value: 'NOTE ID :', fill: aqua, bold: true, size: 11, minHeight: 28 },
      { width: 285, value: formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || `#${note.id}`, '-', note.branch || null), size: 11, minHeight: 28 },
      { width: 95, value: 'STATUS :', fill: aqua, bold: true, size: 11, minHeight: 28 },
      { width: tableWidth - 475, value: note.status, bold: true, size: 10, minHeight: 28 }
    ]);
    drawRow([
      { width: 95, value: 'SUBJECT :', fill: aqua, bold: true, size: 11, minHeight: 38 },
      { width: tableWidth - 95, value: note.subject || '-', size: 11, minHeight: 38 }
    ]);

    sectionTitle('COMMENT LOG');
    drawRow([
      { width: 60, value: 'Page#', fill: aqua, bold: true, minHeight: 24 },
      { width: 160, value: 'Doc Reference', fill: aqua, bold: true, minHeight: 24 },
      { width: 210, value: 'Comment', fill: aqua, bold: true, minHeight: 24 },
      { width: tableWidth - 430, value: 'Name', fill: aqua, bold: true, minHeight: 24 }
    ]);

    if ((note.comments || []).length === 0) {
      drawRow([{ width: tableWidth, value: 'No comments available.', minHeight: 24 }]);
    } else {
      for (const comment of note.comments.slice(0, 6)) {
        drawRow([
          { width: 60, value: '-', minHeight: 26 },
          { width: 160, value: note.note_id || '-', minHeight: 26 },
          { width: 210, value: comment.comment_text || '-', minHeight: 26 },
          { width: tableWidth - 430, value: comment.user?.name || '-', minHeight: 26 }
        ]);
      }
    }

    sectionTitle('AUDIT LOG');
    const auditLines = rows.length === 0
      ? ['No audit entries found.']
      : rows.map((row) => `${row.action} by ${row.performed_by} (${row.role}) on ${row.timestamp}${row.remarks && row.remarks !== '-' ? ` - ${row.remarks}` : ''}`);

    for (const line of auditLines) {
      const estimatedHeight = Math.max(32, (wrapText(line, regularFont, 10, tableWidth - 12).length * 13) + 10);
      if (y - estimatedHeight < 40) {
        page = pdfDoc.addPage([595, 842]);
        ({ height } = page.getSize());
        y = height - 34;
        page.drawText(auditTitle, {
          x: left,
          y,
          size: 9,
          font: boldFont,
          color: rgb(0.22, 0.38, 0.55)
        });
        y -= 14;
        sectionTitle('AUDIT LOG');
      }
      drawRow([{ width: tableWidth, value: line, size: 10, minHeight: 32 }]);
    }

    const pdfBytes = await pdfDoc.save();
    const fileName = `${note.note_id || `note-${note.id}`}-audit-report.pdf`.replace(/[^\w.-]+/g, '_');
    const disposition = String(req.query.disposition || 'attachment').toLowerCase() === 'inline' ? 'inline' : 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename=${fileName}`);
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const generateApprovedPDF = async (req, res) => {
  try {
    let note = await prisma.note.findUnique({
      where: { id: parseId(req.params.id) },
      include: { attachments: true }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);
    if (note.status !== 'FINAL_APPROVED' && note.status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Approved file is available only after final approval.' });
    }

    note = await refreshApprovedArtifactIfNeeded(note);
    note = await ensureNoteApprovedArtifactAvailable(note);

    let approvedPath = note.approved_file_path;
    if (!approvedPath || !approvedPath.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Approved PDF is not available for this file type.' });
    }

    const disposition = String(req.query.disposition || 'attachment').toLowerCase() === 'inline' ? 'inline' : 'attachment';
    if (disposition === 'attachment') {
      await assertNoteDownloadAccess(req.user, note);
    }
    const downloadOfficer = disposition === 'attachment' ? req.user : null;
    if (disposition === 'attachment') {
      await createDirectAuditLog({
        note,
        user: downloadOfficer || req.user,
        action: 'DOWNLOAD_APPROVED_ARTIFACT',
        remarks: buildFileAccessAuditRemarks({
          user: downloadOfficer || req.user,
          label: 'Approved artifact downloaded',
          fileName: note.approved_file_name || path.basename(approvedPath)
        })
      });

      try {
        note = await refreshApprovedArtifactIfNeeded(note);
        approvedPath = note.approved_file_path || approvedPath;
      } catch (refreshError) {
        logger.error('Approved PDF refresh after download audit failed', {
          message: refreshError.message,
          noteId: req.params.id
        });
      }
    }

    if (disposition === 'attachment') {
      try {
        const controlledDownload = await approvedFileService.createControlledDownloadBuffer({
          storedPath: approvedPath,
          note,
          downloadContext: buildControlledDownloadContext(downloadOfficer || req.user, note)
        });

        if (controlledDownload?.buffer) {
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
          return sendBufferedFile(res, controlledDownload.buffer, {
            downloadName: path.basename(approvedPath),
            disposition,
            contentType: controlledDownload.contentType,
            cacheControl: 'no-store, no-cache, must-revalidate, private'
          });
        }
      } catch (controlledDownloadError) {
        logger.error('Approved PDF controlled download fallback triggered', {
          message: controlledDownloadError.message,
          noteId: req.params.id
        });
      }
    }

    const absolutePath = resolveStoredPath(approvedPath);
    const fileBuffer = await fs.readFile(absolutePath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename=${path.basename(approvedPath)}`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(fileBuffer);
  } catch (error) {
    logger.error('Approved PDF generation failed', { message: error.message, noteId: req.params.id });
    res.status(error.status || 500).json({ error: error.message });
  }
};

export const handleWorkflowAction = async (req, res) => {
  const { noteId } = req.params;
  const cleanAction = String(req.body.action_type || '').trim().toUpperCase();
  const userId = req.user.id;

  try {
    const comment = requireComment(req.body.comment, `Comment is required for ${cleanAction || 'this action'}.`);
    const highlights = normalizeHighlights(req.body.highlights);

    const note = await prisma.note.findUnique({
      where: { id: parseId(noteId) },
      include: {
        attachments: true,
        rejection_highlights: true,
        workflow_steps: {
          include: { assigned_user: { include: { role: true } } },
          orderBy: { sequence: 'asc' }
        }
      }
    });

    if (!note) return res.status(404).json({ error: 'Note not found' });
    await assertNoteAccess(req.user, note);

    const activeStep = note.workflow_steps.find((step) => step.status === 'PENDING');
    if (!activeStep || activeStep.assigned_user_id !== userId) {
      return res.status(403).json({ error: 'You are not assigned to the current active workflow step.' });
    }

    const currentWorkflowState = getWorkflowState(note);
    const allowedActions = activeStep.role_type === 'RECOMMENDER'
      ? ['RECOMMEND', 'RETURN']
      : ['APPROVE', 'RETURN', 'REJECT'];

    if (!allowedActions.includes(cleanAction)) {
      return res.status(400).json({ error: `Action ${cleanAction} is not allowed for ${activeStep.role_type}` });
    }

    if (activeStep.role_type === 'APPROVER' && currentWorkflowState !== WORKFLOW_STATES.UNDER_REVIEW) {
      return res.status(409).json({ error: 'This file must be recommended before approval.' });
    }

    if (activeStep.role_type === 'RECOMMENDER' && ![WORKFLOW_STATES.SUBMITTED, WORKFLOW_STATES.RESUBMITTED, WORKFLOW_STATES.UNDER_REVIEW].includes(currentWorkflowState)) {
      return res.status(409).json({ error: 'This file is not in the recommender stage.' });
    }

    const mainAttachment = getMainAttachment(note);

    const result = await runTransaction(async (tx) => {
      await tx.workflowStep.update({
        where: { id: activeStep.id },
        data: {
          status: cleanAction === 'RETURN' ? 'RETURNED_WITH_REMARK' : cleanAction === 'REJECT' ? 'REJECTED' : 'COMPLETED',
          action_date: new Date()
        }
      });

      await tx.comment.create({
        data: {
          note_id: note.id,
          user_id: userId,
          comment_text: comment
        }
      });

      if (cleanAction === 'RECOMMEND') {
        const nextStep = note.workflow_steps.find((step) => step.sequence === activeStep.sequence + 1);
        if (!nextStep || !['RECOMMENDER', 'APPROVER'].includes(nextStep.role_type)) {
          throw new Error('Next workflow step is missing from the workflow.');
        }

        await tx.workflowStep.update({
          where: { id: nextStep.id },
          data: { status: 'PENDING' }
        });

        const updatedNote = await tx.note.update({
          where: { id: note.id },
          data: buildWorkflowUpdate({
            workflowState: WORKFLOW_STATES.UNDER_REVIEW,
            queueCode: QUEUE_CODES.INCOMING,
            currentOwnerUserId: nextStep.assigned_user_id,
            nextResponsibleUserId: nextStep.assigned_user_id,
            lastActionByUserId: userId,
            legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.UNDER_REVIEW, { currentActorRole: 'APPROVER' }),
            submittedAt: note.submitted_at ?? new Date(),
            closedAt: null
          })
        });

        await createAuditLog(tx, {
          noteId: note.id,
          user: req.user,
          action: 'RECOMMEND',
          remarks: comment || 'File recommended for final approval.'
        });
        if (mainAttachment) {
          await createAttachmentAuditLog(tx, {
            noteId: note.id,
            attachment: mainAttachment,
            user: req.user,
            action: 'RECOMMEND',
            remarks: comment || 'Main file recommended for final approval.'
          });
        }

        await createMovementLog(tx, {
          noteId: note.id,
          note,
          fromState: currentWorkflowState,
          toState: WORKFLOW_STATES.UNDER_REVIEW,
          fromQueue: getQueueCode(note),
          toQueue: QUEUE_CODES.INCOMING,
          fromUserId: userId,
          toUserId: nextStep.assigned_user_id,
          actedByUserId: userId,
          actionType: 'RECOMMEND',
          remarkText: comment
        });

        return updatedNote;
      }

      if (cleanAction === 'RETURN') {
        if (activeStep.role_type === 'RECOMMENDER') {
          await tx.rejectionHighlight.deleteMany({
            where: { note_id: note.id }
          });

          if (highlights.length > 0) {
            await tx.rejectionHighlight.createMany({
              data: highlights.map((highlight) => ({
                note_id: note.id,
                document_group_key: note.document_group_key,
                version_number: note.version_number,
                page_number: highlight.page_number,
                x: highlight.x,
                y: highlight.y,
                width: highlight.width,
                height: highlight.height,
                created_by_user_id: userId
              }))
            });
          }
        }

        const updatedNote = await tx.note.update({
          where: { id: note.id },
          data: buildWorkflowUpdate({
            workflowState: WORKFLOW_STATES.RETURNED_WITH_REMARK,
            queueCode: QUEUE_CODES.RETURNED_WITH_REMARKS,
            currentOwnerUserId: note.initiator_id,
            nextResponsibleUserId: note.initiator_id,
            lastActionByUserId: userId,
            legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.RETURNED_WITH_REMARK),
            submittedAt: note.submitted_at ?? new Date(),
            closedAt: null
          })
        });

        await createAuditLog(tx, {
          noteId: note.id,
          user: req.user,
          action: 'RETURN',
          remarks: comment
        });
        if (mainAttachment) {
          await createAttachmentAuditLog(tx, {
            noteId: note.id,
            attachment: mainAttachment,
            user: req.user,
            action: 'RETURN',
            remarks: comment
          });
        }

        await createMovementLog(tx, {
          noteId: note.id,
          note,
          fromState: currentWorkflowState,
          toState: WORKFLOW_STATES.RETURNED_WITH_REMARK,
          fromQueue: getQueueCode(note),
          toQueue: QUEUE_CODES.RETURNED_WITH_REMARKS,
          fromUserId: userId,
          toUserId: note.initiator_id,
          actedByUserId: userId,
          actionType: 'RETURN',
          remarkText: comment
        });

        return updatedNote;
      }

      if (cleanAction === 'REJECT') {
        const updatedNote = await tx.note.update({
          where: { id: note.id },
          data: buildWorkflowUpdate({
            workflowState: WORKFLOW_STATES.REJECTED,
            queueCode: QUEUE_CODES.APPROVED_CLOSED_HISTORY,
            currentOwnerUserId: note.initiator_id,
            nextResponsibleUserId: null,
            lastActionByUserId: userId,
            legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.REJECTED),
            submittedAt: note.submitted_at ?? new Date(),
            closedAt: new Date()
          })
        });

        await createAuditLog(tx, {
          noteId: note.id,
          user: req.user,
          action: 'REJECT',
          remarks: comment
        });
        if (mainAttachment) {
          await createAttachmentAuditLog(tx, {
            noteId: note.id,
            attachment: mainAttachment,
            user: req.user,
            action: 'REJECT',
            remarks: comment
          });
        }

        await createMovementLog(tx, {
          noteId: note.id,
          note,
          fromState: currentWorkflowState,
          toState: WORKFLOW_STATES.REJECTED,
          fromQueue: getQueueCode(note),
          toQueue: QUEUE_CODES.APPROVED_CLOSED_HISTORY,
          fromUserId: userId,
          toUserId: note.initiator_id,
          actedByUserId: userId,
          actionType: 'REJECT',
          remarkText: comment
        });

        return updatedNote;
      }

      await tx.note.updateMany({
        where: {
          document_group_key: note.document_group_key,
          status: 'FINAL_APPROVED',
          id: { not: note.id }
        },
        data: {
          status: 'SUPERSEDED',
          archived_at: new Date()
        }
      });

      const updatedNote = await tx.note.update({
        where: { id: note.id },
        data: {
          ...buildWorkflowUpdate({
            workflowState: WORKFLOW_STATES.APPROVED,
            queueCode: QUEUE_CODES.APPROVED_CLOSED_HISTORY,
            currentOwnerUserId: note.initiator_id,
            nextResponsibleUserId: null,
            lastActionByUserId: userId,
            legacyStatus: getLegacyStatusForWorkflow(WORKFLOW_STATES.APPROVED),
            submittedAt: note.submitted_at ?? new Date(),
            closedAt: new Date()
          }),
          approved_at: new Date(),
          approved_by_name: req.user.name,
          approved_by_role: normalizeRole(req.user.role.name),
          approval_note: comment || 'Final approval completed.'
        }
      });

      await createAuditLog(tx, {
        noteId: note.id,
        note,
        user: req.user,
        action: 'APPROVE',
        remarks: comment || 'File moved to FINAL_APPROVED.'
      });
      if (mainAttachment) {
        await createAttachmentAuditLog(tx, {
          noteId: note.id,
          attachment: mainAttachment,
          user: req.user,
          action: 'APPROVE',
          remarks: comment || 'Main file moved to FINAL_APPROVED.'
        });
      }

      await createMovementLog(tx, {
        noteId: note.id,
        note,
        fromState: currentWorkflowState,
        toState: WORKFLOW_STATES.APPROVED,
        fromQueue: getQueueCode(note),
        toQueue: QUEUE_CODES.APPROVED_CLOSED_HISTORY,
        fromUserId: userId,
        toUserId: note.initiator_id,
        actedByUserId: userId,
        actionType: 'APPROVE',
        remarkText: comment
      });

      return updatedNote;
    });

    if (cleanAction === 'APPROVE') {
      const artifactNote = await getApprovedArtifactContext(note.id);
      const artifact = artifactNote
        ? await approvedFileService.createApprovedArtifact(artifactNote, getMainAttachment(artifactNote))
        : null;
      if (artifact) {
        await prisma.note.update({
          where: { id: note.id },
          data: artifact
        });
      }

      try {
        await autoArchiveApprovedNoteToFms(note.id, req.user);
      } catch (archiveError) {
        logger.error(`Automatic FMS archive failed for note ${note.id}: ${archiveError.message}`);
      }
    }

    if (cleanAction === 'RECOMMEND') {
      const approverStep = note.workflow_steps.find((step) => step.sequence === activeStep.sequence + 1);
      await notifyUserSafe({
        userId: approverStep?.assigned_user_id,
        tenantId: note.tenant_id || null,
        branchId: note.branch_id || null,
        title: approverStep?.role_type === 'APPROVER' ? 'File is ready for approval' : 'File forwarded for recommendation',
        message: approverStep?.role_type === 'APPROVER'
          ? `${req.user.name} recommended ${note.note_id} (${note.subject}). It is now awaiting your approval.`
          : `${req.user.name} recommended ${note.note_id} (${note.subject}). It is now awaiting your recommendation.`,
        category: 'WORKFLOW',
        entityType: 'NOTE',
        entityId: note.id
      });
      await notifyUserSafe({
        userId: note.initiator_id,
        tenantId: note.tenant_id || null,
        branchId: note.branch_id || null,
        title: 'File recommended successfully',
        message: `${note.note_id} (${note.subject}) has been recommended and moved to the approver stage.`,
        category: 'WORKFLOW',
        entityType: 'NOTE',
        entityId: note.id
      });
    }

    if (cleanAction === 'RETURN') {
      await notifyUserSafe({
        userId: note.initiator_id,
        tenantId: note.tenant_id || null,
        branchId: note.branch_id || null,
        title: 'File returned',
        message: `${req.user.name} returned ${note.note_id} (${note.subject}). Review the comments and resubmit after corrections.`,
        category: 'WORKFLOW',
        entityType: 'NOTE',
        entityId: note.id
      });
    }

    if (cleanAction === 'REJECT') {
      await notifyUserSafe({
        userId: note.initiator_id,
        tenantId: note.tenant_id || null,
        branchId: note.branch_id || null,
        title: 'File rejected',
        message: `${note.note_id} (${note.subject}) has been rejected by ${req.user.name}.`,
        category: 'WORKFLOW',
        entityType: 'NOTE',
        entityId: note.id
      });
    }

    if (cleanAction === 'APPROVE') {
      await notifyUserSafe({
        userId: note.initiator_id,
        tenantId: note.tenant_id || null,
        branchId: note.branch_id || null,
        title: 'File approved',
        message: `${note.note_id} (${note.subject}) has been final approved by ${req.user.name}.`,
        category: 'APPROVAL',
        entityType: 'NOTE',
        entityId: note.id
      });
    }

    res.json({
      message: `Workflow action ${cleanAction} completed successfully`,
      workflow_state: cleanAction === 'APPROVE'
        ? WORKFLOW_STATES.APPROVED
        : cleanAction === 'RECOMMEND'
          ? WORKFLOW_STATES.UNDER_REVIEW
          : cleanAction === 'RETURN'
            ? WORKFLOW_STATES.RETURNED_WITH_REMARK
            : WORKFLOW_STATES.REJECTED
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const scanNoteDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded for scan.' });
    }

    const originalName = req.file.originalname || '';
    const baseName = originalName.replace(/\.[^/.]+$/, '');
    const fallback = baseName.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'New Document';

    let text = '';
    try {
      if (req.file.mimetype?.startsWith('image/')) {
        text = await extractTextFromImage(req.file.path);
      } else if (req.file.mimetype === 'application/pdf') {
        text = await extractTextFromPdf(req.file.path, { firstPageOnly: true });
      }
    } catch {
      text = '';
    }

    const fields = deriveFieldsFromText(text || '', fallback);
    res.json(fields);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.user.id;
    const baseWhere = buildRelevantNoteWhere(req.user, { is_latest_version: true });

    const [totalNotes, drafts, incoming, sent, returned, closed] = await Promise.all([
      prisma.note.count({ where: baseWhere }),
      prisma.note.count({
        where: addWhereCondition(
          buildRelevantNoteWhere(req.user, { is_latest_version: true }),
          {
            initiator_id: userId,
            workflow_state: WORKFLOW_STATES.DRAFT,
            queue_code: QUEUE_CODES.DRAFTS
          }
        )
      }),
      prisma.note.count({
        where: addWhereCondition(
          buildRelevantNoteWhere(req.user, { is_latest_version: true }),
          {
            current_owner_user_id: userId,
            queue_code: QUEUE_CODES.INCOMING,
            workflow_state: { in: [...ACTIVE_WORKFLOW_STATES] }
          }
        )
      }),
      prisma.note.count({
        where: addWhereCondition(
          buildRelevantNoteWhere(req.user, { is_latest_version: true }),
          {
            last_action_by_user_id: userId,
            queue_code: QUEUE_CODES.INCOMING,
            workflow_state: { in: [...ACTIVE_WORKFLOW_STATES] },
            NOT: { current_owner_user_id: userId }
          }
        )
      }),
      prisma.note.count({
        where: addWhereCondition(
          buildRelevantNoteWhere(req.user, { is_latest_version: true }),
          {
            current_owner_user_id: userId,
            workflow_state: WORKFLOW_STATES.RETURNED_WITH_REMARK,
            queue_code: QUEUE_CODES.RETURNED_WITH_REMARKS
          }
        )
      }),
      prisma.note.count({
        where: addWhereCondition(
          buildRelevantNoteWhere(req.user, { is_latest_version: true }),
          {
            workflow_state: { in: [...CLOSED_WORKFLOW_STATES] },
            queue_code: QUEUE_CODES.APPROVED_CLOSED_HISTORY
          }
        )
      })
    ]);

    res.json({
      totalNotes,
      drafts,
      incoming,
      sent,
      returned,
      closed,
      pendingReview: incoming,
      approved: closed,
      rejected: returned
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const addComment = async (req, res) => {
  try {
    const commentText = requireComment(req.body.comment_text, 'Comment text is required.');
    const comment = await prisma.comment.create({
      data: {
        note_id: parseId(req.body.note_id),
        user_id: req.user.id,
        comment_text: commentText
      },
      include: { user: { select: { name: true } } }
    });

    res.status(201).json(comment);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
