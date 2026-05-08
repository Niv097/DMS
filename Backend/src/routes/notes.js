import express from 'express';
import { createNote, submitNote, reuploadNoteVersion, getDashboard, getNotes, getNoteById, handleWorkflowAction, getMyNotes, getAuditLogs, generateApprovedPDF, scanNoteDocument, getCurrentApprovedNote, getPreviewPages, downloadNoteAuditExcel, downloadNoteAuditPdf, deleteNoteForDemo, streamAttachmentFile, streamApprovedArtifactFile, streamPreviewImage, reassignWorkflowOwner, createNoteAccessGrant, revokeNoteAccessGrant } from '../controllers/notes.js';
import auth from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import upload from '../middleware/upload.js';
import { validateBody } from '../middleware/validate.js';
import { createNoteSchema, reuploadNoteSchema, submitNoteSchema, workflowActionSchema, reassignWorkflowSchema, noteAccessGrantSchema, revokeNoteAccessGrantSchema } from '../validation/notes.js';

const router = express.Router();

// Route to handle multiple PDF uploads
const cpUpload = upload.fields([
    { name: 'main_note', maxCount: 1 }, 
    { name: 'annexures', maxCount: 10 }
]);

router.post('/', auth, authorize(['INITIATOR']), cpUpload, validateBody(createNoteSchema), createNote);
router.post('/scan', auth, authorize(['INITIATOR']), upload.single('file'), scanNoteDocument);
router.get('/', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getNotes);
router.get('/dashboard', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getDashboard);
router.get('/my-notes', auth, authorize(['INITIATOR', 'ADMIN', 'SUPER_ADMIN']), getMyNotes);
router.get('/active-approved', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getCurrentApprovedNote);
router.get('/:id/preview-pages', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getPreviewPages);
router.get('/:id/previews/:pageNumber/image', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), streamPreviewImage);
router.get('/:id/attachments/:attachmentId', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), streamAttachmentFile);
router.get('/:id/approved-file', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), streamApprovedArtifactFile);
router.get('/:id/audit/export/excel', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), downloadNoteAuditExcel);
router.get('/:id/audit/export/pdf', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), downloadNoteAuditPdf);
router.post('/:noteId/submit', auth, authorize(['INITIATOR']), validateBody(submitNoteSchema), submitNote);
router.post('/:noteId/reupload', auth, authorize(['INITIATOR']), cpUpload, validateBody(reuploadNoteSchema), reuploadNoteVersion);
router.post('/:noteId/action', auth, authorize(['RECOMMENDER', 'APPROVER']), validateBody(workflowActionSchema), handleWorkflowAction);
router.post('/:noteId/reassign', auth, authorize(['INITIATOR', 'ADMIN', 'SUPER_ADMIN']), validateBody(reassignWorkflowSchema), reassignWorkflowOwner);
router.post('/:noteId/access-grants', auth, authorize(['ADMIN', 'SUPER_ADMIN']), validateBody(noteAccessGrantSchema), createNoteAccessGrant);
router.post('/:noteId/access-grants/:grantId/revoke', auth, authorize(['ADMIN', 'SUPER_ADMIN']), validateBody(revokeNoteAccessGrantSchema), revokeNoteAccessGrant);
router.get('/:id/audit', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getAuditLogs);
router.delete('/:id/audit', auth, authorize(['ADMIN', 'SUPER_ADMIN']), (req, res) => {
  res.status(405).json({ error: 'Audit logs are immutable and cannot be deleted.' });
});
router.delete('/:id', auth, authorize(['ADMIN', 'SUPER_ADMIN']), deleteNoteForDemo);
router.get('/:id/generate-pdf', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), generateApprovedPDF);
router.get('/:id', auth, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getNoteById);

export default router;
