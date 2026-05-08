import fs from 'node:fs/promises';
import prisma from '../src/utils/prisma.js';
import {
  assertValidFmsFile,
  buildFmsSearchText,
  buildStoredDocumentKey,
  computeFileHash,
  copyFileToFmsStorage,
  resolveDefaultFmsOwnerNode,
  writeFmsAuditLog
} from '../src/services/fmsService.js';
import { resolveStoredPath } from '../src/utils/storage.js';
import { toPublicDocumentReference } from '../src/utils/documentReference.js';

const WORKFLOW_APPROVED_STATUSES = ['FINAL_APPROVED', 'ARCHIVED'];

const parseArgs = (argv = []) => {
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '');
    if (!token.startsWith('--')) continue;

    const [rawKey, inlineValue] = token.split('=');
    const key = rawKey.slice(2);
    if (inlineValue !== undefined) {
      flags.set(key, inlineValue);
      continue;
    }

    const next = argv[index + 1];
    if (next && !String(next).startsWith('--')) {
      flags.set(key, String(next));
      index += 1;
    } else {
      flags.set(key, true);
    }
  }
  return flags;
};

const flags = parseArgs(process.argv.slice(2));
const shouldApply = flags.has('apply');
const shouldSyncMissing = flags.has('sync-missing');
const tenantId = flags.has('tenant') ? Number.parseInt(String(flags.get('tenant')), 10) : null;

if (flags.has('tenant') && !Number.isInteger(tenantId)) {
  console.error('Invalid --tenant value. Use a numeric tenant id.');
  process.exit(1);
}

const buildTenantWhere = () => (Number.isInteger(tenantId) ? { tenant_id: tenantId } : {});

const getMainAttachment = (note) => note.attachments?.find((attachment) => attachment.file_type === 'MAIN') || note.attachments?.[0] || null;

const buildPublicReferenceFromNote = (note) => toPublicDocumentReference(
  note?.document_group_key || note?.document_code || note?.note_id || '',
  note?.note_id || null
);

const buildPublicReferenceFromDocument = (document) => toPublicDocumentReference(
  document?.document_reference ||
  document?.metadata_json?.public_document_reference ||
  document?.metadata_json?.document_reference ||
  document?.source_note?.document_group_key ||
  document?.source_note?.document_code ||
  document?.source_note?.note_id ||
  document?.customer_reference ||
  document?.version_group_key,
  document?.customer_reference || null
);

const buildDocumentSearchText = (document, publicReference) => buildFmsSearchText({
  title: document.title,
  document_type: document.document_type,
  document_category: document.document_category,
  customer_name: document.customer_name,
  customer_reference: document.customer_reference || publicReference,
  cif_reference: document.cif_reference,
  account_reference: document.account_reference,
  identity_reference: document.identity_reference,
  id_proof_number: document.id_proof_number,
  document_reference: publicReference || document.document_reference,
  file_name: document.file_name,
  note_id: document.source_note?.note_id,
  document_code: document.source_note?.document_code,
  branch_name: document.branch?.branch_name,
  department_name: document.department_master?.name,
  node_path_key: document.owner_node?.path_key,
  classification: document.classification,
  tags: Array.isArray(document.tags_json) ? document.tags_json : [],
  custom_index_values: Object.values(document.custom_index_json || {}),
  notes: document.metadata_json?.notes
});

const syncExistingFmsDocuments = async () => {
  const documents = await prisma.fmsDocument.findMany({
    where: {
      ...buildTenantWhere(),
      is_latest_version: true
    },
    include: {
      owner_node: true,
      department_master: true,
      branch: { select: { id: true, branch_name: true, branch_code: true } },
      source_note: {
        include: {
          branch: { select: { id: true, branch_name: true, branch_code: true } },
          department: { select: { id: true, name: true } }
        }
      }
    }
  });

  const summary = {
    scanned: documents.length,
    updated: 0,
    candidates: 0,
    samples: []
  };

  for (const document of documents) {
    const publicReference = buildPublicReferenceFromDocument(document);
    const nextCustomerReference = document.customer_reference || publicReference || document.customer_reference;
    const nextDocumentReference = publicReference || document.document_reference || null;
    const nextMetadata = {
      ...(document.metadata_json || {}),
      ...(publicReference ? { public_document_reference: publicReference } : {}),
      ...(nextDocumentReference ? { document_reference: nextDocumentReference } : {})
    };
    const nextSearchText = buildDocumentSearchText({
      ...document,
      customer_reference: nextCustomerReference,
      document_reference: nextDocumentReference,
      metadata_json: nextMetadata
    }, publicReference);

    const needsUpdate =
      document.document_reference !== nextDocumentReference
      || document.customer_reference !== nextCustomerReference
      || JSON.stringify(document.metadata_json || {}) !== JSON.stringify(nextMetadata)
      || (document.search_text || '') !== (nextSearchText || '');

    if (!needsUpdate) continue;

    summary.candidates += 1;
    if (summary.samples.length < 10) {
      summary.samples.push({
        id: document.id,
        title: document.title,
        from_reference: document.document_reference,
        to_reference: nextDocumentReference,
        status: document.status
      });
    }

    if (!shouldApply) continue;

    await prisma.fmsDocument.update({
      where: { id: document.id },
      data: {
        document_reference: nextDocumentReference,
        customer_reference: nextCustomerReference,
        metadata_json: nextMetadata,
        search_text: nextSearchText
      }
    });

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      action: 'FMS_REFERENCE_BACKFILLED',
      remarks: `Backfilled public document reference ${nextDocumentReference || '-'}`,
      metadata: {
        previous_document_reference: document.document_reference || null,
        public_document_reference: publicReference || null
      }
    });

    summary.updated += 1;
  }

  return summary;
};

const syncMissingApprovedNotes = async () => {
  const notes = await prisma.note.findMany({
    where: {
      ...buildTenantWhere(),
      is_latest_version: true,
      status: { in: WORKFLOW_APPROVED_STATUSES }
    },
    include: {
      tenant: { select: { id: true, tenant_code: true } },
      branch: { select: { id: true, branch_name: true, branch_code: true } },
      department: { select: { id: true, name: true } },
      attachments: true,
      fms_documents: { select: { id: true } }
    }
  });

  const summary = {
    scanned: notes.length,
    candidates: 0,
    synced: 0,
    skipped: 0,
    samples: []
  };

  for (const note of notes) {
    if ((note.fms_documents || []).length > 0) {
      continue;
    }

    const publicReference = buildPublicReferenceFromNote(note);
    const sourceAttachment = getMainAttachment(note);
    const sourceStoredPath = note.approved_file_path || sourceAttachment?.file_path;
    if (!sourceStoredPath) {
      summary.skipped += 1;
      continue;
    }

    const absoluteSourcePath = resolveStoredPath(sourceStoredPath);
    const sourceName = note.approved_file_name || sourceAttachment?.file_name || `${note.note_id}.pdf`;

    try {
      await fs.access(absoluteSourcePath);
    } catch {
      summary.skipped += 1;
      continue;
    }

    const ownerNode = await resolveDefaultFmsOwnerNode({
      tenantId: note.tenant_id,
      branchId: note.branch_id || null,
      tenantCode: note.tenant?.tenant_code || 'BANK'
    });

    const documentKey = buildStoredDocumentKey({
      documentType: note.note_type || 'Approved File',
      customerReference: publicReference || note.note_id,
      fileName: sourceName,
      idHint: note.note_id
    });

    summary.candidates += 1;
    if (summary.samples.length < 10) {
      summary.samples.push({
        note_id: note.note_id,
        public_reference: publicReference,
        subject: note.subject
      });
    }

    if (!shouldApply) continue;

    const fileMeta = await assertValidFmsFile({
      absolutePath: absoluteSourcePath,
      fileName: sourceName,
      mimeType: note.approved_file_mime || (sourceName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : '')
    });

    const copiedPath = await copyFileToFmsStorage({
      sourcePath: sourceStoredPath,
      tenantCode: note.tenant?.tenant_code || `tenant-${note.tenant_id}`,
      nodePathKey: ownerNode.path_key,
      documentKey,
      fileName: sourceName
    });

    const absoluteStoredPath = resolveStoredPath(copiedPath);
    const fileHash = await computeFileHash(copiedPath);
    const stat = await fs.stat(absoluteStoredPath);
    const metadata = {
      node_id: ownerNode.id,
      node_path_key: ownerNode.path_key,
      department_master_id: ownerNode.department_master_id || null,
      branch_id: ownerNode.branch_id || note.branch_id || null,
      source_note_id: note.id,
      source_document_group_key: note.document_group_key,
      note_id: note.note_id,
      document_code: note.document_code,
      public_document_reference: publicReference,
      workflow_state: note.workflow_state,
      visibility_mode: 'BACKUP_ONLY',
      auto_archived_from_dms: true,
      approval_note: note.approval_note || null
    };

    const document = await prisma.fmsDocument.create({
      data: {
        tenant_id: note.tenant_id,
        owner_node_id: ownerNode.id,
        source_note_id: note.id,
        version_group_key: note.document_group_key || publicReference || note.note_id,
        version_number: note.version_number || 1,
        previous_version_id: null,
        is_latest_version: true,
        classification: note.classification || 'INTERNAL',
        document_type: note.note_type || 'Approved File',
        document_category: note.workflow_type || null,
        title: String(note.subject || note.note_id).trim(),
        customer_name: null,
        customer_reference: publicReference || note.note_id,
        cif_reference: null,
        account_reference: note.note_id,
        identity_reference: null,
        id_proof_number: null,
        document_reference: publicReference || note.note_id,
        department_master_id: ownerNode.department_master_id || null,
        branch_id: ownerNode.branch_id || note.branch_id || null,
        file_name: sourceName,
        stored_path: copiedPath,
        mime_type: fileMeta.mime,
        file_extension: fileMeta.extension,
        file_size: Number(stat.size),
        file_hash: fileHash,
        file_kind: fileMeta.file_kind,
        uploaded_by_user_id: note.initiator_id,
        published_by_user_id: null,
        tags_json: [],
        custom_index_json: null,
        metadata_json: metadata,
        search_text: buildFmsSearchText({
          title: String(note.subject || note.note_id).trim(),
          document_type: note.note_type || 'Approved File',
          document_category: note.workflow_type || null,
          customer_name: null,
          customer_reference: publicReference || note.note_id,
          account_reference: note.note_id,
          document_reference: publicReference || note.note_id,
          file_name: sourceName,
          note_id: note.note_id,
          document_code: note.document_code,
          branch_name: note.branch?.branch_name,
          department_name: note.department?.name,
          node_path_key: ownerNode.path_key,
          classification: note.classification || 'INTERNAL',
          notes: note.approval_note
        }),
        status: 'BACKUP_ONLY'
      }
    });

    await writeFmsAuditLog({
      tenantId: document.tenant_id,
      ownerNodeId: document.owner_node_id,
      documentId: document.id,
      actorUserId: note.last_action_by_user_id || note.initiator_id,
      action: 'FMS_BACKFILL_SYNC_FROM_DMS',
      remarks: `Historical approved DMS note synced as ${publicReference || note.note_id}`,
      metadata: {
        source_note_id: note.id,
        source_note_reference: note.note_id,
        visibility_mode: 'BACKUP_ONLY'
      }
    });

    summary.synced += 1;
  }

  return summary;
};

const printSummary = (title, summary) => {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  for (const [key, value] of Object.entries(summary)) {
    if (key === 'samples') continue;
    console.log(`${key}: ${value}`);
  }
  if (summary.samples?.length) {
    console.log('samples:');
    for (const item of summary.samples) {
      console.log(`  - ${JSON.stringify(item)}`);
    }
  }
};

const main = async () => {
  console.log(`Running DMS/FMS historical backfill in ${shouldApply ? 'APPLY' : 'DRY-RUN'} mode${Number.isInteger(tenantId) ? ` for tenant ${tenantId}` : ''}.`);
  console.log(`Missing approved note sync: ${shouldSyncMissing ? 'ENABLED' : 'DISABLED'}`);

  const existingDocumentSummary = await syncExistingFmsDocuments();
  printSummary('Existing FMS reference backfill', existingDocumentSummary);

  if (shouldSyncMissing) {
    const missingSyncSummary = await syncMissingApprovedNotes();
    printSummary('Missing approved DMS to FMS sync', missingSyncSummary);
  }

  if (!shouldApply) {
    console.log('\nDry run complete. Re-run with --apply to persist these changes.');
  }
};

main()
  .catch((error) => {
    console.error('\nBackfill failed:');
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
