import express from 'express';
import multer from 'multer';
import auth from '../middleware/auth.js';
import { authorize, requireRole } from '../middleware/rbac.js';
import {
  listCities,
  createCity,
  listTenants,
  getTenantRemoteOverview,
  createTenant,
  exportTenantRecoveryPackage,
  rotateTenantSupportKey,
  updateTenantAuthPolicy,
  updateTenantBackupPolicy,
  updateTenantBranding,
  listBranches,
  createBranch,
  listUsers,
  createUser,
  updateUser,
  runTenantBackupNow,
  resetUserPassword,
  bulkImportUsers
} from '../controllers/admin.js';
import { validateBody, validateParams } from '../middleware/validate.js';
import { createBranchSchema, createCitySchema, createTenantSchema, createUserSchema, tenantIdParamSchema, updateTenantAuthPolicySchema, updateTenantBackupPolicySchema, updateUserSchema, userIdParamSchema } from '../validation/admin.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(auth, requireRole(['ADMIN', 'SUPER_ADMIN']), authorize(['ADMIN', 'SUPER_ADMIN']));

router.get('/tenants', listTenants);
router.get('/tenants/:id/remote-overview', validateParams(tenantIdParamSchema), getTenantRemoteOverview);
router.post('/tenants', validateBody(createTenantSchema), createTenant);
router.post('/tenants/:id/rotate-support-key', validateParams(tenantIdParamSchema), rotateTenantSupportKey);
router.put('/tenants/:id/auth-policy', validateParams(tenantIdParamSchema), validateBody(updateTenantAuthPolicySchema), updateTenantAuthPolicy);
router.put('/tenants/:id/backup-policy', validateParams(tenantIdParamSchema), validateBody(updateTenantBackupPolicySchema), updateTenantBackupPolicy);
router.post('/tenants/:id/run-backup', validateParams(tenantIdParamSchema), runTenantBackupNow);
router.post('/tenants/:id/export-recovery-package', validateParams(tenantIdParamSchema), exportTenantRecoveryPackage);
router.put('/tenants/:id/branding', upload.single('logo'), validateParams(tenantIdParamSchema), updateTenantBranding);
router.get('/cities', listCities);
router.post('/cities', validateBody(createCitySchema), createCity);
router.get('/branches', listBranches);
router.post('/branches', validateBody(createBranchSchema), createBranch);
router.get('/users', listUsers);
router.post('/users', validateBody(createUserSchema), createUser);
router.put('/users/:id', validateParams(userIdParamSchema), validateBody(updateUserSchema), updateUser);
router.post('/users/:id/reset-password', validateParams(userIdParamSchema), resetUserPassword);
router.post('/users/bulk-import', upload.single('file'), bulkImportUsers);

export default router;
