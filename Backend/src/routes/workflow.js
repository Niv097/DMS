import express from 'express';
import { recommend, approve, returnForChanges, refer } from '../controllers/workflow.js';
import auth from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';

const router = express.Router();

router.post('/recommend', auth, authorize(['RECOMMENDER', 'APPROVER']), recommend);
router.post('/approve', auth, authorize(['APPROVER']), approve);
router.post('/return', auth, authorize(['RECOMMENDER', 'APPROVER']), returnForChanges);
router.post('/refer', auth, authorize(['RECOMMENDER', 'APPROVER']), refer);

export default router;
