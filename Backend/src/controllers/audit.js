import fs from 'fs/promises';
import path from 'path';
import prisma from '../utils/prisma.js';
import { securityAuditLogPath } from '../utils/securityAudit.js';
import {
  ensureStoredParentDir,
  getWorkflowStorageRelativeDir,
  sanitizeStorageSegment,
  toStoredRelativePath
} from '../utils/storage.js';

const escapeCsvValue = (value) => {
  const normalized = value == null ? '' : String(value);
  const escaped = normalized.replace(/"/g, '""');
  return `"${escaped}"`;
};

const parseAttachmentMeta = (remarks = '') => {
  const text = String(remarks || '');
  const fileTypeMatch = /File Type:\s*([^|]+)/i.exec(text);
  const fileNameMatch = /File Name:\s*([^|]+)/i.exec(text);

  return {
    file_type: fileTypeMatch?.[1]?.trim() || '',
    file_name: fileNameMatch?.[1]?.trim() || ''
  };
};

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

const buildAuditWhere = (req, extra = {}) => {
  const where = { ...extra };
  if (req.query.document_group_key) {
    where.note = {
      is: {
        document_group_key: String(req.query.document_group_key).trim()
      }
    };
  }
  if (req.user?.role?.name === 'SUPER_ADMIN') {
    if (req.query.tenant_id) where.tenant_id = Number.parseInt(req.query.tenant_id, 10);
    if (req.query.branch_id) where.branch_id = Number.parseInt(req.query.branch_id, 10);
    return where;
  }

  if (req.user?.tenant_id) {
    where.tenant_id = req.user.tenant_id;
  }
  const branchIds = getAccessibleBranchIds(req.user);
  if (branchIds.length) {
    where.branch_id = { in: branchIds };
  }
  return where;
};

const auditNoteSelect = {
  id: true,
  note_id: true,
  document_code: true,
  tenant_id: true,
  branch_id: true,
  branch: {
    select: {
      branch_name: true,
      branch_code: true
    }
  },
  document_group_key: true,
  version_number: true,
  subject: true
};

const fetchAuditLogs = (req, extraWhere = {}) => prisma.auditLog.findMany({
  where: buildAuditWhere(req, extraWhere),
  include: {
    note: {
      select: auditNoteSelect
    }
  },
  orderBy: { timestamp: 'desc' }
});

const buildAuditCsv = (logs = []) => {
  const header = [
    'log_id',
    'file_id',
    'note_id',
    'document_code',
    'tenant_id',
    'branch_id',
    'document_group_key',
    'version_number',
    'attachment_id',
    'file_type',
    'file_name',
    'subject',
    'user',
    'role',
    'action',
    'comments',
    'timestamp'
  ];

  const lines = [
    header.join(','),
    ...logs.map((log) => ([
      log.id,
      log.note?.id ?? '',
      log.note?.note_id ?? '',
      log.note?.document_code ?? '',
      log.note?.tenant_id ?? '',
      log.note?.branch_id ?? '',
      log.note?.document_group_key ?? '',
      log.note?.version_number ?? '',
      log.attachment_id ?? '',
      parseAttachmentMeta(log.remarks).file_type || log.file_type || '',
      parseAttachmentMeta(log.remarks).file_name || log.file_name || '',
      log.note?.subject ?? '',
      log.performed_by,
      log.role,
      log.action,
      log.remarks ?? '',
      log.timestamp.toISOString()
    ].map(escapeCsvValue).join(',')))
  ];

  return lines.join('\n');
};

const persistWorkflowAuditExport = async (documentGroupKey, csvContent) => {
  if (!documentGroupKey) return null;

  const workflowDir = getWorkflowStorageRelativeDir(documentGroupKey);
  const exportRelativePath = toStoredRelativePath(path.posix.join(
    workflowDir,
    'exports',
    `${sanitizeStorageSegment(documentGroupKey, 'workflow')}-audit.csv`
  ));
  const targetPath = await ensureStoredParentDir(exportRelativePath);
  await fs.writeFile(targetPath, csvContent, 'utf8');
  return exportRelativePath;
};

export const getAuditLogs = async (req, res) => {
  try {
    const where = buildAuditWhere(req);

    if (req.params.noteId) {
      where.note_id = Number.parseInt(req.params.noteId, 10);
    }

    const logs = await fetchAuditLogs(req, where);

    res.json(logs.map((log) => ({ ...log, ...parseAttachmentMeta(log.remarks) })));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadAuditLogsCsv = async (_req, res) => {
  try {
    const logs = await fetchAuditLogs(_req);
    const csvContent = buildAuditCsv(logs);
    const documentGroupKey = String(_req.query.document_group_key || '').trim();
    if (documentGroupKey) {
      await persistWorkflowAuditExport(documentGroupKey, csvContent).catch(() => {});
    }
    const downloadFileName = documentGroupKey
      ? `${sanitizeStorageSegment(documentGroupKey, 'workflow')}-audit.csv`
      : 'audit-logs.csv';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${downloadFileName}`);
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const parseSecurityAuditLines = async () => {
  try {
    const raw = await fs.readFile(securityAuditLogPath, 'utf8');
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object' && parsed.message && typeof parsed.message === 'object') {
            return {
              timestamp: parsed.timestamp || null,
              ...parsed.message
            };
          }
          return parsed;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
};

const buildSecurityAuditWhere = (req, items = []) => {
  const tenantId = req.user?.role?.name === 'SUPER_ADMIN'
    ? Number.parseInt(String(req.query.tenant_id || ''), 10) || null
    : req.user?.tenant_id || null;
  const branchId = req.user?.role?.name === 'SUPER_ADMIN'
    ? Number.parseInt(String(req.query.branch_id || ''), 10) || null
    : null;

  return items.filter((item) => {
    if (tenantId && Number(item.tenant_id || 0) !== tenantId) return false;
    if (branchId && Number(item.branch_id || 0) !== branchId) return false;
    return true;
  });
};

const buildSecurityAuditCsv = (items = []) => {
  const header = [
    'timestamp',
    'event',
    'user_id',
    'user_name',
    'role',
    'tenant_id',
    'branch_id',
    'note_id',
    'document_reference',
    'attachment_id',
    'file_name',
    'approved_file_name',
    'reason',
    'reason_display',
    'ip'
  ];

  return [
    header.join(','),
    ...items.map((item) => ([
      item.timestamp || '',
      item.event || '',
      item.user_id || '',
      item.user_name || '',
      item.role || '',
      item.tenant_id || '',
      item.branch_id || '',
      item.note_id || '',
      item.document_reference || '',
      item.attachment_id || '',
      item.file_name || '',
      item.approved_file_name || '',
      item.reason || '',
      item.reason_display || '',
      item.ip || ''
    ].map(escapeCsvValue).join(',')))
  ].join('\n');
};

const buildFmsAuditWhere = (req, extra = {}) => {
  const where = { ...extra };
  const requestedSourceOrigin = String(req.query.source_origin || '').trim().toUpperCase();

  if (requestedSourceOrigin === 'MANUAL' || requestedSourceOrigin === 'FMS') {
    where.document = {
      is: {
        source_note_id: null
      }
    };
  } else if (requestedSourceOrigin === 'DMS') {
    where.document = {
      is: {
        source_note_id: {
          not: null
        }
      }
    };
  }

  if (req.user?.role?.name === 'SUPER_ADMIN') {
    if (req.query.tenant_id) where.tenant_id = Number.parseInt(req.query.tenant_id, 10);
    if (req.query.branch_id) {
      const branchId = Number.parseInt(req.query.branch_id, 10);
      if (branchId) {
        where.OR = [
          { document: { is: { branch_id: branchId } } },
          { owner_node: { is: { branch_id: branchId } } }
        ];
      }
    }
    return where;
  }

  if (req.user?.tenant_id) {
    where.tenant_id = req.user.tenant_id;
  }

  const branchIds = getAccessibleBranchIds(req.user);
  if (branchIds.length) {
    where.OR = [
      { document: { is: { branch_id: { in: branchIds } } } },
      { owner_node: { is: { branch_id: { in: branchIds } } } }
    ];
  }

  return where;
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
  const branch = log?.document?.branch || null;
  const ownerNode = log?.document?.owner_node || log?.owner_node || null;
  return {
    id: log.id,
    tenant_id: log.tenant_id,
    document_id: log.document_id,
    owner_node_id: log.owner_node_id,
    request_id: log.request_id,
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
    metadata,
    document: log.document ? {
      id: log.document.id,
      title: log.document.title,
      file_name: log.document.file_name,
      document_reference: log.document.document_reference || '',
      customer_reference: log.document.customer_reference || '',
      version_group_key: log.document.version_group_key || '',
      version_number: log.document.version_number || 1,
      classification: log.document.classification || '',
      document_type: log.document.document_type || '',
      branch: branch ? {
        id: branch.id,
        branch_name: branch.branch_name,
        branch_code: branch.branch_code
      } : null,
      department_master: log.document.department_master ? {
        id: log.document.department_master.id,
        name: log.document.department_master.name,
        code: log.document.department_master.code,
        path_key: log.document.department_master.path_key
      } : null,
      owner_node: ownerNode ? {
        id: ownerNode.id,
        name: ownerNode.name,
        code: ownerNode.code,
        node_type: ownerNode.node_type,
        path_key: ownerNode.path_key
      } : null
    } : null
  };
};

const fetchFmsAuditLogs = (req, extraWhere = {}) => prisma.fmsAuditLog.findMany({
  where: buildFmsAuditWhere(req, extraWhere),
  include: {
    actor: {
      select: {
        id: true,
        name: true,
        email: true,
        employee_id: true
      }
    },
    owner_node: {
      select: {
        id: true,
        name: true,
        code: true,
        node_type: true,
        path_key: true,
        branch_id: true
      }
    },
    document: {
      select: {
        id: true,
        title: true,
        file_name: true,
        document_reference: true,
        customer_reference: true,
        version_group_key: true,
        version_number: true,
        classification: true,
        document_type: true,
        branch: {
          select: {
            id: true,
            branch_name: true,
            branch_code: true
          }
        },
        department_master: {
          select: {
            id: true,
            name: true,
            code: true,
            path_key: true
          }
        },
        owner_node: {
          select: {
            id: true,
            name: true,
            code: true,
            node_type: true,
            path_key: true
          }
        }
      }
    }
  },
  orderBy: [
    { created_at: 'desc' },
    { id: 'desc' }
  ]
});

const buildFmsAuditCsv = (items = []) => {
  const header = [
    'timestamp',
    'action',
    'performed_by',
    'employee_id',
    'tenant_id',
    'document_id',
    'title',
    'file_name',
    'document_reference',
    'customer_reference',
    'version_number',
    'document_type',
    'classification',
    'department',
    'branch',
    'library_folder',
    'remarks'
  ];

  return [
    header.join(','),
    ...items.map((item) => ([
      item.timestamp ? new Date(item.timestamp).toISOString() : '',
      item.action_label || item.action || '',
      item.performed_by || '',
      item.actor?.employee_id || '',
      item.tenant_id || '',
      item.document?.id || item.document_id || '',
      item.document?.title || '',
      item.document?.file_name || '',
      item.document?.document_reference || '',
      item.document?.customer_reference || '',
      item.document?.version_number || '',
      item.document?.document_type || '',
      item.document?.classification || '',
      item.document?.department_master?.name || '',
      item.document?.branch?.branch_name || '',
      item.document?.owner_node?.name || '',
      item.remarks || ''
    ].map(escapeCsvValue).join(',')))
  ].join('\n');
};

const deriveSecurityReason = (item = {}) => {
  const rawReason = String(item.reason || '').trim();
  if (rawReason) {
    if (rawReason.toUpperCase() === 'MANUAL') return 'Manual sign out';
    if (rawReason.toLowerCase() === 'preview') return 'Preview';
    if (rawReason.toLowerCase() === 'download') return 'Download';
    return rawReason;
  }

  const authMethods = Array.isArray(item.auth_methods) ? item.auth_methods.filter(Boolean) : [];
  if (String(item.event || '').toUpperCase() === 'LOGIN_SUCCESS' && authMethods.length) {
    return `${authMethods.map((method) => String(method).replace(/_/g, ' ')).join(', ')} sign-in`;
  }
  if (String(item.event || '').toUpperCase().includes('LOGIN_OTP')) {
    return 'OTP verification';
  }
  if (String(item.event || '').toUpperCase().includes('TIMEOUT')) {
    return 'Idle timeout';
  }
  return '';
};

const formatSecurityIp = (value) => {
  const ip = String(value || '').trim();
  if (!ip) return '';
  if (ip === '::1') return 'Localhost (::1)';
  if (ip === '127.0.0.1') return 'Localhost (127.0.0.1)';
  return ip;
};

const enrichSecurityAuditItems = async (items = []) => {
  if (!items.length) return [];

  const resolvedUserIds = [...new Set(items
    .map((item) => item.user_id || item.actor_user_id || item.target_user_id)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)))];

  const noteIds = [...new Set(items
    .map((item) => item.note_id)
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)))];

  const [users, notes] = await Promise.all([
    resolvedUserIds.length
      ? prisma.user.findMany({
        where: { id: { in: resolvedUserIds } },
        select: { id: true, name: true, username: true, email: true }
      })
      : [],
    noteIds.length
      ? prisma.note.findMany({
        where: { id: { in: noteIds } },
        select: { id: true, note_id: true, approved_file_name: true, subject: true }
      })
      : []
  ]);

  const userMap = new Map(users.map((user) => [user.id, user]));
  const noteMap = new Map(notes.map((note) => [note.id, note]));

  return items.map((item) => {
    const resolvedUserId = Number(item.user_id || item.actor_user_id || item.target_user_id || 0) || null;
    const resolvedUser = resolvedUserId ? userMap.get(resolvedUserId) : null;
    const resolvedNote = item.note_id ? noteMap.get(Number(item.note_id)) : null;

    return {
      ...item,
      user_name: resolvedUser?.name || resolvedUser?.username || resolvedUser?.email || (resolvedUserId ? `User ${resolvedUserId}` : ''),
      document_reference: item.document_reference || resolvedNote?.note_id || '',
      file_name: item.file_name || item.approved_file_name || resolvedNote?.approved_file_name || '',
      reason_display: deriveSecurityReason(item),
      ip_display: formatSecurityIp(item.ip)
    };
  });
};

export const getSecurityAuditLogs = async (req, res) => {
  try {
    const items = (await enrichSecurityAuditItems(buildSecurityAuditWhere(req, await parseSecurityAuditLines())))
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0))
      .slice(0, 500);
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadSecurityAuditLogsCsv = async (req, res) => {
  try {
    const items = (await enrichSecurityAuditItems(buildSecurityAuditWhere(req, await parseSecurityAuditLines())))
      .sort((left, right) => new Date(right.timestamp || 0) - new Date(left.timestamp || 0));
    const csv = buildSecurityAuditCsv(items);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=security-audit.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getFmsAuditLogs = async (req, res) => {
  try {
    const items = await fetchFmsAuditLogs(req);
    res.json(items.map(buildFmsAuditLogResponse));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const downloadFmsAuditLogsCsv = async (req, res) => {
  try {
    const items = (await fetchFmsAuditLogs(req)).map(buildFmsAuditLogResponse);
    const csvContent = buildFmsAuditCsv(items);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=fms-audit-logs.csv');
    res.send(csvContent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
