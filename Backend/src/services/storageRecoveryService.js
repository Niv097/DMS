import fs from 'fs/promises';
import path from 'path';
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

const getMainAttachment = (note) => (
  (note?.attachments || []).find((attachment) => attachment.file_type === MAIN_ATTACHMENT_TYPE)
  || (note?.attachments || [])[0]
  || null
);

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

  return note;
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
