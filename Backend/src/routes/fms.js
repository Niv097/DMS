import express from 'express';
import auth from '../middleware/auth.js';
import { requireFmsFeatureAccess, requireFmsPermission } from '../middleware/fms.js';
import upload from '../middleware/upload.js';
import { validateBody } from '../middleware/validate.js';
import {
  createFmsAccessRequest,
  createFmsBranchAppendRequest,
  createFmsDepartment,
  createFmsDistribution,
  createFmsGrant,
  completeFmsDistributionRecipient,
  getFmsLibraryStandards,
  createFmsNodeGrant,
  createFmsNode,
  archiveFmsDocument,
  acknowledgeFmsDistributionRecipient,
  decideFmsBranchAppendRequest,
  decideFmsAccessRequest,
  activateFmsDocument,
  getFmsAuditLogs,
  getFmsBootstrap,
  getFmsDocumentDetail,
  getFmsDocumentDistributions,
  listFmsMandatoryDistributions,
  listFmsDistributionInbox,
  listFmsBranchAppendGrants,
  listFmsBranchAppendRequests,
  listFmsDepartments,
  listFmsNodeGrants,
  listFmsSearchSuggestions,
  listFmsAccessRequests,
  listFmsCircularDocuments,
  listFmsDocuments,
  listFmsNodes,
  publishApprovedNoteToFms,
  revokeFmsBranchAppendGrant,
  revokeFmsGrant,
  revokeFmsNodeGrant,
  streamFmsDocument,
  updateFmsLibraryStandards,
  updateFmsDepartment,
  updateFmsBranchAppendGrant,
  uploadFmsDocument
} from '../controllers/fms.js';
import { FMS_PERMISSIONS } from '../services/fmsService.js';
import {
  createFmsNodeSchema,
  createFmsDepartmentSchema,
  fmsDistributionRecipientActionSchema,
  fmsDistributionSchema,
  fmsAccessDecisionSchema,
  fmsAccessRequestSchema,
  fmsBranchAppendDecisionSchema,
  fmsBranchAppendGrantRevokeSchema,
  fmsBranchAppendGrantUpdateSchema,
  fmsBranchAppendRequestSchema,
  fmsGrantSchema,
  fmsNodeGrantRevokeSchema,
  fmsNodeGrantSchema,
  fmsPublishNoteSchema,
  fmsRevokeGrantSchema,
  fmsUploadSchema,
  updateFmsLibraryStandardsSchema,
  updateFmsDepartmentSchema
} from '../validation/fms.js';

const router = express.Router();

router.use(auth);
router.use(requireFmsFeatureAccess);

router.get('/bootstrap', getFmsBootstrap);
router.get('/library-standards', requireFmsPermission(FMS_PERMISSIONS.VIEW), getFmsLibraryStandards);
router.put('/library-standards', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(updateFmsLibraryStandardsSchema), updateFmsLibraryStandards);
router.get('/department-masters', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsDepartments);
router.post('/department-masters', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(createFmsDepartmentSchema), createFmsDepartment);
router.put('/department-masters/:id', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(updateFmsDepartmentSchema), updateFmsDepartment);
router.get('/nodes', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsNodes);
router.post('/nodes', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(createFmsNodeSchema), createFmsNode);
router.get('/nodes/:id/grants', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsNodeGrants);
router.post('/nodes/:id/grants', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(fmsNodeGrantSchema), createFmsNodeGrant);
router.post('/nodes/grants/:id/revoke', requireFmsPermission(FMS_PERMISSIONS.REVOKE), validateBody(fmsNodeGrantRevokeSchema), revokeFmsNodeGrant);
router.get('/documents/suggestions', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsSearchSuggestions);
router.get('/documents', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsDocuments);
router.get('/circular-documents', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsCircularDocuments);
router.post('/documents/upload', requireFmsPermission(FMS_PERMISSIONS.UPLOAD), upload.single('file'), validateBody(fmsUploadSchema), uploadFmsDocument);
router.post('/documents/publish/note/:noteId', validateBody(fmsPublishNoteSchema), publishApprovedNoteToFms);
router.post('/documents/:id/activate', requireFmsPermission(FMS_PERMISSIONS.PUBLISH), activateFmsDocument);
router.delete('/documents/:id', requireFmsPermission(FMS_PERMISSIONS.PUBLISH), archiveFmsDocument);
router.get('/documents/:id', requireFmsPermission(FMS_PERMISSIONS.VIEW), getFmsDocumentDetail);
router.get('/documents/:id/distributions', requireFmsPermission(FMS_PERMISSIONS.VIEW), getFmsDocumentDistributions);
router.post('/documents/:id/distributions', requireFmsPermission(FMS_PERMISSIONS.VIEW), validateBody(fmsDistributionSchema), createFmsDistribution);
router.get('/documents/:id/file', requireFmsPermission(FMS_PERMISSIONS.VIEW), streamFmsDocument);
router.get('/documents/:id/audit', requireFmsPermission(FMS_PERMISSIONS.VIEW), getFmsAuditLogs);
router.post('/documents/:id/access-requests', requireFmsPermission(FMS_PERMISSIONS.VIEW), validateBody(fmsAccessRequestSchema), createFmsAccessRequest);
router.post('/documents/:id/grants', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(fmsGrantSchema), createFmsGrant);
router.get('/access-requests', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsAccessRequests);
router.post('/access-requests/:id/decision', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(fmsAccessDecisionSchema), decideFmsAccessRequest);
router.post('/grants/:id/revoke', requireFmsPermission(FMS_PERMISSIONS.REVOKE), validateBody(fmsRevokeGrantSchema), revokeFmsGrant);
router.get('/distribution-inbox', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsDistributionInbox);
router.get('/mandatory-distributions', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsMandatoryDistributions);
router.post('/distribution-recipients/:id/acknowledge', requireFmsPermission(FMS_PERMISSIONS.VIEW), validateBody(fmsDistributionRecipientActionSchema), acknowledgeFmsDistributionRecipient);
router.post('/distribution-recipients/:id/complete', requireFmsPermission(FMS_PERMISSIONS.VIEW), validateBody(fmsDistributionRecipientActionSchema), completeFmsDistributionRecipient);
router.get('/append-requests', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsBranchAppendRequests);
router.post('/append-requests', requireFmsPermission(FMS_PERMISSIONS.VIEW), validateBody(fmsBranchAppendRequestSchema), createFmsBranchAppendRequest);
router.post('/append-requests/:id/decision', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(fmsBranchAppendDecisionSchema), decideFmsBranchAppendRequest);
router.get('/append-grants', requireFmsPermission(FMS_PERMISSIONS.VIEW), listFmsBranchAppendGrants);
router.post('/append-grants/:id/update', requireFmsPermission(FMS_PERMISSIONS.SHARE), validateBody(fmsBranchAppendGrantUpdateSchema), updateFmsBranchAppendGrant);
router.post('/append-grants/:id/revoke', requireFmsPermission(FMS_PERMISSIONS.REVOKE), validateBody(fmsBranchAppendGrantRevokeSchema), revokeFmsBranchAppendGrant);

export default router;
