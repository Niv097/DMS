import fs from 'fs';
import path from 'path';
import prisma from '../src/utils/prisma.js';
import {
  createPlaceholderStoredFile,
  doesStoredPathExist,
  ensureFmsDocumentStoredFileAvailable,
  ensureNoteApprovedArtifactAvailable,
  ensureTenantLogoStoredFileAvailable
} from '../src/services/storageRecoveryService.js';
import {
  ensureStoredParentDir,
  getStorageRoot,
  resolveStoredPath
} from '../src/utils/storage.js';

const shouldApply = process.argv.includes('--apply');
const storageRoot = getStorageRoot();

const storageIndex = new Map();

const walkDirectory = async (dirPath) => {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(absolutePath);
      continue;
    }

    const key = entry.name.toLowerCase();
    const bucket = storageIndex.get(key) || [];
    bucket.push(absolutePath);
    storageIndex.set(key, bucket);
  }
};

const absoluteToStoredPath = (absolutePath) => {
  const relative = path.relative(storageRoot, absolutePath).replace(/\\/g, '/');
  return `uploads/${relative}`;
};

const copyCandidateIntoStoredPath = async (candidateAbsolutePath, targetStoredPath) => {
  const targetPath = await ensureStoredParentDir(targetStoredPath);
  await fs.promises.copyFile(candidateAbsolutePath, targetPath);
};

const resolveUniqueCandidate = (storedPath) => {
  const fileName = path.basename(String(storedPath || '')).toLowerCase();
  const candidates = storageIndex.get(fileName) || [];
  return candidates.length === 1 ? candidates[0] : null;
};

const report = [];

const pushReportEntry = ({ type, id, label, storedPath, status, detail }) => {
  report.push({
    type,
    id,
    label,
    stored_path: storedPath || null,
    absolute_path: storedPath ? resolveStoredPath(storedPath) : null,
    status,
    detail: detail || null
  });
};

await walkDirectory(storageRoot);

const tenants = await prisma.tenant.findMany({
  select: {
    id: true,
    tenant_name: true,
    brand_logo_path: true
  }
});

for (const tenant of tenants) {
  if (!tenant.brand_logo_path) continue;

  if (await doesStoredPathExist(tenant.brand_logo_path)) {
    continue;
  }

  let repaired = false;
  if (shouldApply) {
    const uniqueCandidate = resolveUniqueCandidate(tenant.brand_logo_path);
    if (uniqueCandidate) {
      await copyCandidateIntoStoredPath(uniqueCandidate, tenant.brand_logo_path);
      repaired = true;
      pushReportEntry({
        type: 'TENANT_LOGO',
        id: tenant.id,
        label: tenant.tenant_name,
        storedPath: tenant.brand_logo_path,
        status: 'REPAIRED',
        detail: `Copied from ${absoluteToStoredPath(uniqueCandidate)}`
      });
    } else {
      await ensureTenantLogoStoredFileAvailable(tenant);
      repaired = await doesStoredPathExist(tenant.brand_logo_path);
      if (repaired) {
        pushReportEntry({
          type: 'TENANT_LOGO',
          id: tenant.id,
          label: tenant.tenant_name,
          storedPath: tenant.brand_logo_path,
          status: 'REPAIRED_PLACEHOLDER',
          detail: 'Generated placeholder logo because no source file was available.'
        });
      }
    }
  }

  if (!repaired) {
    pushReportEntry({
      type: 'TENANT_LOGO',
      id: tenant.id,
      label: tenant.tenant_name,
      storedPath: tenant.brand_logo_path,
      status: 'MISSING',
      detail: 'No unique candidate found in storage.'
    });
  }
}

const notes = await prisma.note.findMany({
  select: {
    id: true,
    note_id: true,
    approved_file_path: true,
    attachments: {
      select: {
        id: true,
        file_name: true,
        file_path: true,
        file_type: true
      }
    }
  }
});

for (const note of notes) {
  if (note.approved_file_path && !(await doesStoredPathExist(note.approved_file_path))) {
    const before = note.approved_file_path;
    let repaired = false;

    if (shouldApply) {
      const recoveredNote = await ensureNoteApprovedArtifactAvailable(note.id);
      repaired = await doesStoredPathExist(recoveredNote?.approved_file_path || before);
    }

    pushReportEntry({
      type: 'NOTE_APPROVED',
      id: note.id,
      label: note.note_id,
      storedPath: before,
      status: repaired ? 'REPAIRED' : 'MISSING',
      detail: repaired ? 'Recovered from main attachment, FMS published copy, or generated placeholder.' : 'Automatic repair was not possible.'
    });
  }

  for (const attachment of note.attachments) {
    if (!attachment.file_path || await doesStoredPathExist(attachment.file_path)) {
      continue;
    }

    let repaired = false;
    if (shouldApply) {
      const uniqueCandidate = resolveUniqueCandidate(attachment.file_path);
      if (uniqueCandidate) {
        await copyCandidateIntoStoredPath(uniqueCandidate, attachment.file_path);
        repaired = true;
      } else {
        await createPlaceholderStoredFile({
          storedPath: attachment.file_path,
          fileName: attachment.file_name,
          title: attachment.file_name,
          lines: [
            `Document Reference: ${note.note_id}`,
            `Attachment Type: ${attachment.file_type}`,
            'Original uploaded attachment could not be recovered from server storage.'
          ]
        });
        repaired = await doesStoredPathExist(attachment.file_path);
      }
    }

    pushReportEntry({
      type: 'NOTE_ATTACHMENT',
      id: attachment.id,
      label: `${note.note_id} :: ${attachment.file_type} :: ${attachment.file_name}`,
      storedPath: attachment.file_path,
      status: repaired ? 'REPAIRED' : 'MISSING',
      detail: repaired ? 'Copied from unique basename match in storage or generated placeholder.' : 'No unique candidate found in storage.'
    });
  }
}

const fmsDocuments = await prisma.fmsDocument.findMany({
  select: {
    id: true,
    title: true,
    file_name: true,
    stored_path: true
  }
});

for (const document of fmsDocuments) {
  if (!document.stored_path || await doesStoredPathExist(document.stored_path)) {
    continue;
  }

  let repaired = false;
    if (shouldApply) {
      const recoveredDocument = await ensureFmsDocumentStoredFileAvailable(document.id);
      repaired = await doesStoredPathExist(recoveredDocument?.stored_path || document.stored_path);

      if (!repaired) {
        const uniqueCandidate = resolveUniqueCandidate(document.stored_path);
        if (uniqueCandidate) {
          await copyCandidateIntoStoredPath(uniqueCandidate, document.stored_path);
          repaired = true;
        } else {
          await createPlaceholderStoredFile({
            storedPath: document.stored_path,
            fileName: document.file_name,
            title: document.title || document.file_name,
            lines: [
              `FMS Document ID: ${document.id}`,
              `Original File Name: ${document.file_name}`,
              'Original FMS file could not be recovered from server storage.'
            ]
          });
          repaired = await doesStoredPathExist(document.stored_path);
        }
      }
    }

  pushReportEntry({
    type: 'FMS_DOCUMENT',
    id: document.id,
    label: `${document.title} :: ${document.file_name}`,
    storedPath: document.stored_path,
    status: repaired ? 'REPAIRED' : 'MISSING',
    detail: repaired
      ? 'Recovered from source note, copied from unique basename match in storage, or generated placeholder.'
      : 'Automatic repair was not possible.'
  });
}

const reportPath = path.resolve(process.cwd(), 'storage-reconciliation-report.json');
await fs.promises.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(`Storage reconciliation mode: ${shouldApply ? 'APPLY' : 'REPORT'}`);
console.log(`Items reported: ${report.length}`);
console.log(`Report written to: ${reportPath}`);

await prisma.$disconnect();
