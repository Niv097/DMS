import express from 'express';
import {
  downloadAuditLogsCsv,
  downloadFmsAuditLogsCsv,
  downloadSecurityAuditLogsCsv,
  getAuditLogs,
  getFmsAuditLogs,
  getSecurityAuditLogs
} from '../controllers/audit.js';
import auth from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';

const router = express.Router();

router.get('/', auth, authorize(['ADMIN', 'SUPER_ADMIN']), getAuditLogs);
router.get('/download/csv', auth, authorize(['ADMIN', 'SUPER_ADMIN']), downloadAuditLogsCsv);
router.get('/fms', auth, authorize(['ADMIN', 'SUPER_ADMIN']), getFmsAuditLogs);
router.get('/fms/download/csv', auth, authorize(['ADMIN', 'SUPER_ADMIN']), downloadFmsAuditLogsCsv);
router.get('/security', auth, authorize(['ADMIN', 'SUPER_ADMIN']), getSecurityAuditLogs);
router.get('/security/download/csv', auth, authorize(['ADMIN', 'SUPER_ADMIN']), downloadSecurityAuditLogsCsv);
router.get('/:noteId', auth, authorize(['ADMIN', 'SUPER_ADMIN']), getAuditLogs);

export default router;
