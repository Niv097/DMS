import express from 'express';
import auth from '../middleware/auth.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications
} from '../services/notificationService.js';

const router = express.Router();

router.get('/stream', streamNotifications);
router.get('/', auth, listNotifications);
router.post('/read-all', auth, markAllNotificationsRead);
router.post('/:id/read', auth, markNotificationRead);

export default router;
