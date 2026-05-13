import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import prisma from '../utils/prisma.js';
import approvedFileService from './approvedFileService.js';
import logger from '../utils/logger.js';
import {
  buildVersionFileStoredRelativePath,
  ensureStoredParentDir,
  resolveStoredPath
} from '../utils/storage.js';

const FINAL_NOTE_STATUSES = new Set(['FINAL_APPROVED', 'ARCHIVED']);
const MAIN_ATTACHMENT_TYPE = 'MAIN';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff']);

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const getMainAttachment = (note) => (
  (note?.attachments || []).find((attachment) => attachment.file_type === MAIN_ATTACHMENT_TYPE)
  || (note?.attachments || [])[0]
  || null
);

const buildPlaceholderPdf = async ({ title, lines = [] }) => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([842, 595]);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdf.embedFont(StandardFonts.Helvetica);

  page.drawRectangle({
    x: 36,
    y: 36,
    width: 770,
    height: 523,
    borderColor: rgb(0.72, 0.12, 0.12),
    borderWidth: 1.2
  });

  page.drawText('Recovered Placeholder Artifact', {
    x: 58,
    y: 525,
    size: 24,
    font: boldFont,
    color: rgb(0.72, 0.12, 0.12)
  });

  page.drawText(String(title || 'Original file missing from storage'), {
    x: 58,
    y: 488,
    size: 18,
    font: boldFont,
    color: rgb(0.08, 0.16, 0.29)
  });

  page.drawText('This placeholder was generated because the original uploaded file is not available in server storage.', {
    x: 58,
    y: 456,
    size: 12,
    font: regularFont,
    color: rgb(0.26, 0.35, 0.47)
  });

  let cursorY = 410;
  for (const line of lines.filter(Boolean).slice(0, 12)) {
    page.drawText(`- ${String(line)}`, {
      x: 64,
      y: cursorY,
      size: 12,
      font: regularFont,
      color: rgb(0.18, 0.24, 0.33)
    });
    cursorY -= 24;
  }

  page.drawText('Action required: restore the original document from bank backup or re-upload from the live operator flow.', {
    x: 58,
    y: 72,
    size: 11,
    font: regularFont,
    color: rgb(0.55, 0.17, 0.12)
  });

  return Buffer.from(await pdf.save());
};

const buildPlaceholderImageBuffer = async ({ title, lines = [], format = 'png', width = 1600, height = 1000 }) => {
  const lineMarkup = lines
    .filter(Boolean)
    .slice(0, 10)
    .map((line, index) => (
      `<text x="88" y="${320 + (index * 56)}" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#344054">${escapeHtml(line)}</text>`
    ))
    .join('');

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f8fbff"/>
          <stop offset="100%" stop-color="#e2ebf7"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <rect x="48" y="48" width="${width - 96}" height="${height - 96}" rx="28" fill="#ffffff" stroke="#d0dae7" stroke-width="3"/>
      <text x="88" y="132" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#b42318">Recovered Placeholder Artifact</text>
      <text x="88" y="206" font-family="Arial, Helvetica, sans-serif" font-size="48" font-weight="700" fill="#173252">${escapeHtml(title || 'Original file missing')}</text>
      <text x="88" y="260" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#55708e">The original uploaded file is not present in server storage. This generated placeholder keeps the workflow accessible.</text>
      ${lineMarkup}
      <text x="88" y="${height - 92}" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#8a2c0d">Restore from backup or re-upload from the live bank flow when the original content is required.</text>
    </svg>
  `;

  let pipeline = sharp(Buffer.from(svg));
  if (format === 'jpeg') pipeline = pipeline.jpeg({ quality: 92 });
  else if (format === 'webp') pipeline = pipeline.webp({ quality: 92 });
  else if (format === 'tiff') pipeline = pipeline.tiff();
  else if (format === 'gif') pipeline = pipeline.gif();
  else pipeline = pipeline.png();
  return pipeline.toBuffer();
};

const buildPlaceholderTextBuffer = ({ title, lines = [] }) => Buffer.from([
  'RECOVERED PLACEHOLDER ARTIFACT',
  '',
  String(title || 'Original file missing from storage'),
  '',
  ...lines.filter(Boolean).map((line) => `- ${line}`),
  '',
  'Restore from backup or re-upload from the live bank workflow to recover the original content.'
].join('\n'), 'utf8');

export const createPlaceholderStoredFile = async ({
  storedPath,
  title,
  lines = [],
  fileName = '',
  preferredKind = 'document'
}) => {
  if (!storedPath) return '';

  const extension = path.extname(fileName || storedPath).toLowerCase();
  const targetPath = await ensureStoredParentDir(storedPath);

  if (extension === '.pdf') {
    const buffer = await buildPlaceholderPdf({ title, lines });
    await fs.writeFile(targetPath, buffer);
    return storedPath;
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    const format = extension === '.jpg' || extension === '.jpeg'
      ? 'jpeg'
      : extension === '.webp'
        ? 'webp'
        : extension === '.gif'
          ? 'gif'
          : extension === '.tif' || extension === '.tiff'
            ? 'tiff'
            : 'png';
    const size = preferredKind === 'logo'
      ? { width: 1200, height: 420 }
      : { width: 1600, height: 1000 };
    const buffer = await buildPlaceholderImageBuffer({ title, lines, format, ...size });
    await fs.writeFile(targetPath, buffer);
    return storedPath;
  }

  await fs.writeFile(targetPath, buildPlaceholderTextBuffer({ title, lines }));
  return storedPath;
};

export const doesStoredPathExist = async (storedPath) => {
  if (!storedPath) return false;

  try {
    await fs.access(resolveStoredPath(storedPath));
    return true;
  } catch {
    return false;
  }
};

const copyStoredFile = async (sourceStoredPath, targetStoredPath) => {
  const targetPath = await ensureStoredParentDir(targetStoredPath);
  await fs.copyFile(resolveStoredPath(sourceStoredPath), targetPath);
  return targetStoredPath;
};

const buildApprovedArtifactStoredPath = (note, fileName) => buildVersionFileStoredRelativePath({
  documentGroupKey: note.document_group_key || note.note_id || `note-${note.id}`,
  versionNumber: note.version_number || 1,
  bucket: 'approved',
  fileName: fileName || `${note.note_id || `note-${note.id}`}-approved${path.extname(fileName || '.pdf')}`,
  fallbackBase: 'approved-artifact'
});

const loadNoteWithAttachments = async (noteOrId) => {
  if (typeof noteOrId === 'object' && noteOrId?.attachments) {
    return noteOrId;
  }

  const noteId = typeof noteOrId === 'object' ? noteOrId?.id : Number(noteOrId);
  if (!noteId) return null;

  return prisma.note.findUnique({
    where: { id: Number(noteId) },
    include: { attachments: true }
  });
};

const loadFmsDocument = async (documentOrId) => {
  if (typeof documentOrId === 'object' && documentOrId?.id) {
    return documentOrId;
  }

  const documentId = typeof documentOrId === 'object' ? documentOrId?.id : Number(documentOrId);
  if (!documentId) return null;

  return prisma.fmsDocument.findUnique({
    where: { id: Number(documentId) }
  });
};

export const ensureNoteApprovedArtifactAvailable = async (noteOrId) => {
  let note = await loadNoteWithAttachments(noteOrId);
  if (!note || !FINAL_NOTE_STATUSES.has(String(note.status || '').toUpperCase())) {
    return note;
  }

  if (await doesStoredPathExist(note.approved_file_path)) {
    return note;
  }

  const mainAttachment = getMainAttachment(note);
  if (await doesStoredPathExist(mainAttachment?.file_path)) {
    const artifact = await approvedFileService.createApprovedArtifact(note, mainAttachment);
    if (artifact?.approved_file_path && await doesStoredPathExist(artifact.approved_file_path)) {
      note = await prisma.note.update({
        where: { id: note.id },
        data: artifact,
        include: { attachments: true }
      });
      logger.warn('Recovered missing approved artifact from main attachment.', {
        note_id: note.id,
        note_reference: note.note_id
      });
      return note;
    }
  }

  const fmsCopy = await prisma.fmsDocument.findFirst({
    where: {
      source_note_id: note.id
    },
    select: {
      stored_path: true,
      file_name: true,
      mime_type: true
    },
    orderBy: [
      { published_at: 'desc' },
      { created_at: 'desc' }
    ]
  });

  if (await doesStoredPathExist(fmsCopy?.stored_path)) {
    const targetStoredPath = note.approved_file_path || buildApprovedArtifactStoredPath(note, fmsCopy.file_name);
    await copyStoredFile(fmsCopy.stored_path, targetStoredPath);
    note = await prisma.note.update({
      where: { id: note.id },
      data: {
        approved_file_path: targetStoredPath,
        approved_file_name: note.approved_file_name || fmsCopy.file_name,
        approved_file_mime: note.approved_file_mime || fmsCopy.mime_type || null
      },
      include: { attachments: true }
    });
    logger.warn('Recovered missing approved artifact from FMS published copy.', {
      note_id: note.id,
      note_reference: note.note_id
    });
  }

  const fallbackApprovedPath = note.approved_file_path || buildApprovedArtifactStoredPath(note, note.approved_file_name || `${note.note_id || `note-${note.id}`}-approved.pdf`);
  await createPlaceholderStoredFile({
    storedPath: fallbackApprovedPath,
    fileName: note.approved_file_name || `${note.note_id || `note-${note.id}`}-approved.pdf`,
    title: note.subject || note.note_id || 'Approved document unavailable',
    lines: [
      `Document Reference: ${note.note_id || note.document_group_key || note.id}`,
      `Workflow State: ${note.workflow_state || note.status || 'UNKNOWN'}`,
      'Original approved artifact could not be recovered from current server storage.'
    ]
  });
  note = await prisma.note.update({
    where: { id: note.id },
    data: {
      approved_file_path: fallbackApprovedPath,
      approved_file_name: note.approved_file_name || path.basename(fallbackApprovedPath),
      approved_file_mime: note.approved_file_mime || 'application/pdf'
    },
    include: { attachments: true }
  });
  logger.warn('Generated placeholder approved artifact for missing note file.', {
    note_id: note.id,
    note_reference: note.note_id
  });

  return note;
};

export const ensureNoteAttachmentAvailable = async ({ note, attachment }) => {
  if (!attachment?.file_path) return attachment;
  if (await doesStoredPathExist(attachment.file_path)) return attachment;

  await createPlaceholderStoredFile({
    storedPath: attachment.file_path,
    fileName: attachment.file_name,
    title: attachment.file_name || 'Document unavailable',
    lines: [
      `Document Reference: ${note?.note_id || note?.document_group_key || note?.id || '-'}`,
      `Attachment Type: ${attachment.file_type || 'UNKNOWN'}`,
      'Original uploaded attachment is not available in current server storage.'
    ]
  });
  logger.warn('Generated placeholder note attachment for missing stored file.', {
    note_id: note?.id || null,
    attachment_id: attachment.id
  });
  return attachment;
};

export const ensureFmsDocumentStoredFileAvailable = async (documentOrId) => {
  const document = await loadFmsDocument(documentOrId);
  if (!document) return document;

  if (await doesStoredPathExist(document.stored_path)) {
    return document;
  }

  if (!document.source_note_id) {
    return document;
  }

  const sourceNote = await ensureNoteApprovedArtifactAvailable(document.source_note_id);
  const mainAttachment = getMainAttachment(sourceNote);
  const candidateSourcePath = await doesStoredPathExist(sourceNote?.approved_file_path)
    ? sourceNote.approved_file_path
    : (await doesStoredPathExist(mainAttachment?.file_path) ? mainAttachment.file_path : '');

  if (!candidateSourcePath) {
    return document;
  }

  await copyStoredFile(candidateSourcePath, document.stored_path);
  logger.warn('Recovered missing FMS stored file from source note.', {
    fms_document_id: document.id,
    source_note_id: document.source_note_id
  });
  return document;
};

export const ensureTenantLogoStoredFileAvailable = async (tenantOrId) => {
  const tenant = typeof tenantOrId === 'object' && tenantOrId?.id
    ? tenantOrId
    : await prisma.tenant.findUnique({
      where: { id: Number(tenantOrId) },
      select: {
        id: true,
        tenant_name: true,
        tenant_code: true,
        brand_logo_path: true
      }
    });

  if (!tenant?.brand_logo_path) {
    return tenant;
  }

  if (await doesStoredPathExist(tenant.brand_logo_path)) {
    return tenant;
  }

  await createPlaceholderStoredFile({
    storedPath: tenant.brand_logo_path,
    fileName: path.basename(tenant.brand_logo_path),
    preferredKind: 'logo',
    title: tenant.tenant_name || 'Bank Logo',
    lines: [
      `Tenant Code: ${tenant.tenant_code || tenant.id}`,
      'Original brand logo was not available in current server storage.'
    ]
  });
  logger.warn('Generated placeholder tenant logo for missing stored file.', {
    tenant_id: tenant.id,
    tenant_name: tenant.tenant_name
  });
  return tenant;
};
