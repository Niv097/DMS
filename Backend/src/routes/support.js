import express from 'express';
import { getSupportOverview, postSupportMobileDelivery } from '../controllers/support.js';
import { validateBody } from '../middleware/validate.js';
import { supportMobileDeliverySchema } from '../validation/support.js';

const router = express.Router();

router.get('/overview', getSupportOverview);
router.post('/mobile-delivery', validateBody(supportMobileDeliverySchema), postSupportMobileDelivery);

export default router;
