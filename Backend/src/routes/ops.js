import express from 'express';
import auth from '../middleware/auth.js';
import { authorize, requireRole } from '../middleware/rbac.js';
import {
  createRecoveryPackage,
  getRecoveryVaultOverview,
  getSecurityOperationsOverview,
  importRecoveryPackage,
  pruneRetentionArtifacts,
  runRecoveryAutomationNow
} from '../controllers/ops.js';

const router = express.Router();

router.use(auth, requireRole(['ADMIN', 'SUPER_ADMIN']), authorize(['ADMIN', 'SUPER_ADMIN']));

router.get('/security-overview', getSecurityOperationsOverview);
router.get('/recovery-vault', requireRole(['SUPER_ADMIN']), authorize(['SUPER_ADMIN']), getRecoveryVaultOverview);
router.post('/recovery-vault/run-automation', requireRole(['SUPER_ADMIN']), authorize(['SUPER_ADMIN']), runRecoveryAutomationNow);
router.post('/recovery-vault/export', requireRole(['SUPER_ADMIN']), authorize(['SUPER_ADMIN']), createRecoveryPackage);
router.post('/recovery-vault/import', requireRole(['SUPER_ADMIN']), authorize(['SUPER_ADMIN']), importRecoveryPackage);
router.post('/recovery-vault/prune-retention', requireRole(['SUPER_ADMIN']), authorize(['SUPER_ADMIN']), pruneRetentionArtifacts);

export default router;
