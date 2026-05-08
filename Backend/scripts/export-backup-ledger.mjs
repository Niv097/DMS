import fs from 'fs/promises';
import path from 'path';
import prisma from '../src/utils/prisma.js';
import { toPublicDocumentReference } from '../src/utils/documentReference.js';

const args = process.argv.slice(2);

const getArgValue = (flagName, fallback = '') => {
  const index = args.findIndex((item) => item === flagName);
  if (index === -1 || index === args.length - 1) return fallback;
  return String(args[index + 1] || '').trim();
};

const outputDirArg = getArgValue('--outputDir', path.join('.', 'backups', 'catalog'));
const timestamp = getArgValue('--timestamp', new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_'));
const outputDir = path.resolve(process.cwd(), outputDirArg);

const csvEscape = (value) => {
  const normalized = value == null ? '' : String(value);
  if (/[",\r\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

const toCsv = (rows, headers) => {
  const headerLine = headers.map(csvEscape).join(',');
  const bodyLines = rows.map((row) => headers.map((header) => csvEscape(row[header] ?? '')).join(','));
  return `${[headerLine, ...bodyLines].join('\n')}\n`;
};

const formatDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
};

const joinValues = (values = [], emptyLabel = '') => {
  const filtered = values
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  return filtered.length > 0 ? filtered.join(' | ') : emptyLabel;
};

const buildDmsRows = (notes = []) => notes.map((note) => {
  const branchContext = note.branch
    ? { branch_name: note.branch.branch_name, branch_code: note.branch.branch_code }
    : null;
  const mainFiles = (note.attachments || []).filter((item) => item.file_type === 'MAIN');
  const supportingFiles = (note.attachments || []).filter((item) => item.file_type !== 'MAIN');

  return {
    tenant_name: note.tenant?.tenant_name || '',
    tenant_code: note.tenant?.tenant_code || '',
    branch_name: note.branch?.branch_name || '',
    branch_code: note.branch?.branch_code || '',
    public_document_reference: toPublicDocumentReference(note.note_id, note.note_id, branchContext),
    internal_document_reference: note.note_id || '',
    document_group_key: note.document_group_key || '',
    version_number: note.version_number ?? '',
    latest_version: note.is_latest_version ? 'YES' : 'NO',
    subject: note.subject || '',
    note_type: note.note_type || '',
    workflow_type: note.workflow_type || '',
    classification: note.classification || '',
    status: note.status || '',
    workflow_state: note.workflow_state || '',
    queue_code: note.queue_code || '',
    uploaded_by_name: note.initiator?.name || '',
    uploaded_by_email: note.initiator?.email || '',
    current_owner_name: note.current_owner?.name || '',
    current_owner_email: note.current_owner?.email || '',
    next_responsible_name: note.next_responsible?.name || '',
    next_responsible_email: note.next_responsible?.email || '',
    department: note.department?.name || '',
    vertical: note.vertical?.name || '',
    main_file_names: joinValues(mainFiles.map((item) => item.file_name)),
    main_file_paths: joinValues(mainFiles.map((item) => item.file_path)),
    supporting_file_names: joinValues(supportingFiles.map((item) => item.file_name)),
    supporting_file_paths: joinValues(supportingFiles.map((item) => item.file_path)),
    approved_file_name: note.approved_file_name || '',
    approved_file_path: note.approved_file_path || '',
    approved_file_mime: note.approved_file_mime || '',
    submitted_at: formatDate(note.submitted_at),
    approved_at: formatDate(note.approved_at),
    closed_at: formatDate(note.closed_at),
    created_at: formatDate(note.created_at),
    updated_at: formatDate(note.updated_at)
  };
});

const buildFmsRows = (documents = []) => documents.map((document) => {
  const sourceBranchContext = document.source_note?.branch
    ? { branch_name: document.source_note.branch.branch_name, branch_code: document.source_note.branch.branch_code }
    : document.branch
      ? { branch_name: document.branch.branch_name, branch_code: document.branch.branch_code }
      : null;
  const publicSourceReference = document.source_note?.note_id
    ? toPublicDocumentReference(document.source_note.note_id, document.source_note.note_id, sourceBranchContext)
    : '';

  return {
    tenant_name: document.tenant?.tenant_name || '',
    tenant_code: document.tenant?.tenant_code || '',
    branch_name: document.branch?.branch_name || '',
    branch_code: document.branch?.branch_code || '',
    document_reference: document.document_reference || publicSourceReference || '',
    source_note_reference: publicSourceReference,
    title: document.title || '',
    document_type: document.document_type || '',
    document_category: document.document_category || '',
    classification: document.classification || '',
    owner_node_name: document.owner_node?.name || '',
    owner_node_code: document.owner_node?.code || '',
    owner_node_path: document.owner_node?.path_key || '',
    uploaded_by_name: document.uploaded_by?.name || '',
    uploaded_by_email: document.uploaded_by?.email || '',
    published_by_name: document.published_by?.name || '',
    customer_name: document.customer_name || '',
    customer_reference: document.customer_reference || '',
    cif_reference: document.cif_reference || '',
    account_reference: document.account_reference || '',
    identity_reference: document.identity_reference || '',
    id_proof_number: document.id_proof_number || '',
    file_name: document.file_name || '',
    stored_path: document.stored_path || '',
    mime_type: document.mime_type || '',
    file_extension: document.file_extension || '',
    file_size_bytes: document.file_size ?? '',
    file_kind: document.file_kind || '',
    status: document.status || '',
    version_group_key: document.version_group_key || '',
    version_number: document.version_number ?? '',
    latest_version: document.is_latest_version ? 'YES' : 'NO',
    created_at: formatDate(document.created_at),
    published_at: formatDate(document.published_at),
    updated_at: formatDate(document.updated_at)
  };
});

const main = async () => {
  await fs.mkdir(outputDir, { recursive: true });

  const [notes, fmsDocuments] = await Promise.all([
    prisma.note.findMany({
      orderBy: [
        { tenant_id: 'asc' },
        { branch_id: 'asc' },
        { updated_at: 'desc' }
      ],
      select: {
        note_id: true,
        document_group_key: true,
        version_number: true,
        is_latest_version: true,
        subject: true,
        note_type: true,
        workflow_type: true,
        classification: true,
        status: true,
        workflow_state: true,
        queue_code: true,
        submitted_at: true,
        approved_at: true,
        closed_at: true,
        created_at: true,
        updated_at: true,
        approved_file_name: true,
        approved_file_path: true,
        approved_file_mime: true,
        tenant: { select: { tenant_name: true, tenant_code: true } },
        branch: { select: { branch_name: true, branch_code: true } },
        department: { select: { name: true } },
        vertical: { select: { name: true } },
        initiator: { select: { name: true, email: true } },
        current_owner: { select: { name: true, email: true } },
        next_responsible: { select: { name: true, email: true } },
        attachments: {
          select: {
            file_name: true,
            file_path: true,
            file_type: true
          },
          orderBy: { uploaded_at: 'asc' }
        }
      }
    }),
    prisma.fmsDocument.findMany({
      orderBy: [
        { tenant_id: 'asc' },
        { branch_id: 'asc' },
        { updated_at: 'desc' }
      ],
      select: {
        document_reference: true,
        title: true,
        document_type: true,
        document_category: true,
        classification: true,
        customer_name: true,
        customer_reference: true,
        cif_reference: true,
        account_reference: true,
        identity_reference: true,
        id_proof_number: true,
        file_name: true,
        stored_path: true,
        mime_type: true,
        file_extension: true,
        file_size: true,
        file_kind: true,
        status: true,
        version_group_key: true,
        version_number: true,
        is_latest_version: true,
        created_at: true,
        published_at: true,
        updated_at: true,
        tenant: { select: { tenant_name: true, tenant_code: true } },
        branch: { select: { branch_name: true, branch_code: true } },
        owner_node: { select: { name: true, code: true, path_key: true } },
        uploaded_by: { select: { name: true, email: true } },
        published_by: { select: { name: true } },
        source_note: {
          select: {
            note_id: true,
            branch: { select: { branch_name: true, branch_code: true } }
          }
        }
      }
    })
  ]);

  const dmsRows = buildDmsRows(notes);
  const fmsRows = buildFmsRows(fmsDocuments);

  const tenantSummaryMap = new Map();
  for (const row of dmsRows) {
    const key = `${row.tenant_code || 'UNSCOPED'}::${row.branch_code || 'UNSCOPED'}`;
    if (!tenantSummaryMap.has(key)) {
      tenantSummaryMap.set(key, {
        tenant_name: row.tenant_name || '',
        tenant_code: row.tenant_code || '',
        branch_name: row.branch_name || '',
        branch_code: row.branch_code || '',
        dms_documents: 0,
        fms_documents: 0
      });
    }
    tenantSummaryMap.get(key).dms_documents += 1;
  }

  for (const row of fmsRows) {
    const key = `${row.tenant_code || 'UNSCOPED'}::${row.branch_code || 'UNSCOPED'}`;
    if (!tenantSummaryMap.has(key)) {
      tenantSummaryMap.set(key, {
        tenant_name: row.tenant_name || '',
        tenant_code: row.tenant_code || '',
        branch_name: row.branch_name || '',
        branch_code: row.branch_code || '',
        dms_documents: 0,
        fms_documents: 0
      });
    }
    tenantSummaryMap.get(key).fms_documents += 1;
  }

  const summary = {
    generated_at: new Date().toISOString(),
    timestamp,
    output_dir: outputDir,
    dms: {
      total_notes: dmsRows.length,
      latest_versions: dmsRows.filter((item) => item.latest_version === 'YES').length,
      active_workflow_notes: dmsRows.filter((item) => ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'RETURNED_WITH_REMARK'].includes(item.workflow_state)).length,
      closed_notes: dmsRows.filter((item) => ['APPROVED', 'REJECTED'].includes(item.workflow_state)).length
    },
    fms: {
      total_documents: fmsRows.length,
      latest_versions: fmsRows.filter((item) => item.latest_version === 'YES').length,
      linked_to_dms_source_notes: fmsRows.filter((item) => item.source_note_reference).length,
      active_documents: fmsRows.filter((item) => item.status === 'ACTIVE').length
    },
    scope_breakdown: [...tenantSummaryMap.values()].sort((left, right) => (
      `${left.tenant_name} ${left.branch_name}`.localeCompare(`${right.tenant_name} ${right.branch_name}`)
    )),
    catalog_files: [
      'backup-ledger-summary.json',
      'dms-document-ledger.csv',
      'fms-document-ledger.csv'
    ]
  };

  const dmsHeaders = Object.keys(dmsRows[0] || {
    tenant_name: '',
    tenant_code: '',
    branch_name: '',
    branch_code: '',
    public_document_reference: '',
    internal_document_reference: '',
    document_group_key: '',
    version_number: '',
    latest_version: '',
    subject: '',
    note_type: '',
    workflow_type: '',
    classification: '',
    status: '',
    workflow_state: '',
    queue_code: '',
    uploaded_by_name: '',
    uploaded_by_email: '',
    current_owner_name: '',
    current_owner_email: '',
    next_responsible_name: '',
    next_responsible_email: '',
    department: '',
    vertical: '',
    main_file_names: '',
    main_file_paths: '',
    supporting_file_names: '',
    supporting_file_paths: '',
    approved_file_name: '',
    approved_file_path: '',
    approved_file_mime: '',
    submitted_at: '',
    approved_at: '',
    closed_at: '',
    created_at: '',
    updated_at: ''
  });

  const fmsHeaders = Object.keys(fmsRows[0] || {
    tenant_name: '',
    tenant_code: '',
    branch_name: '',
    branch_code: '',
    document_reference: '',
    source_note_reference: '',
    title: '',
    document_type: '',
    document_category: '',
    classification: '',
    owner_node_name: '',
    owner_node_code: '',
    owner_node_path: '',
    uploaded_by_name: '',
    uploaded_by_email: '',
    published_by_name: '',
    customer_name: '',
    customer_reference: '',
    cif_reference: '',
    account_reference: '',
    identity_reference: '',
    id_proof_number: '',
    file_name: '',
    stored_path: '',
    mime_type: '',
    file_extension: '',
    file_size_bytes: '',
    file_kind: '',
    status: '',
    version_group_key: '',
    version_number: '',
    latest_version: '',
    created_at: '',
    published_at: '',
    updated_at: ''
  });

  await Promise.all([
    fs.writeFile(path.join(outputDir, 'backup-ledger-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8'),
    fs.writeFile(path.join(outputDir, 'dms-document-ledger.csv'), toCsv(dmsRows, dmsHeaders), 'utf8'),
    fs.writeFile(path.join(outputDir, 'fms-document-ledger.csv'), toCsv(fmsRows, fmsHeaders), 'utf8')
  ]);

  console.log(`Backup document ledger exported to ${outputDir}`);
};

main()
  .catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
