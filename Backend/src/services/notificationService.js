import prisma from '../utils/prisma.js';
import { extractTokenFromRequest, verifyAuthToken } from '../utils/authToken.js';

const clientsByUser = new Map();

const serializeNotification = (notification) => ({
  ...notification,
  created_at: notification.created_at instanceof Date
    ? notification.created_at.toISOString()
    : notification.created_at
});

const sendEvent = (res, event, payload) => {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const addClient = (userId, res) => {
  if (!clientsByUser.has(userId)) {
    clientsByUser.set(userId, new Set());
  }
  clientsByUser.get(userId).add(res);
};

const removeClient = (userId, res) => {
  const clients = clientsByUser.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) {
    clientsByUser.delete(userId);
  }
};

export const verifyStreamToken = async (token) => {
  if (!token) {
    const error = new Error('No token provided.');
    error.status = 401;
    throw error;
  }

  const decoded = verifyAuthToken(token);
  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
    include: { role: true }
  });

  if (!user) {
    const error = new Error('User not found.');
    error.status = 401;
    throw error;
  }

  return user;
};

export const publishNotification = (userId, payload) => {
  const clients = clientsByUser.get(userId);
  if (!clients || clients.size === 0) return;

  for (const client of clients) {
    sendEvent(client, 'notification', payload);
  }
};

export const createNotification = async ({
  userId,
  tenantId = null,
  branchId = null,
  title,
  message,
  category = 'GENERAL',
  entityType = null,
  entityId = null
}) => {
  const notification = await prisma.notification.create({
    data: {
      user_id: userId,
      tenant_id: tenantId,
      branch_id: branchId,
      title,
      message,
      category,
      entity_type: entityType,
      entity_id: entityId
    }
  });

  publishNotification(userId, {
    type: 'created',
    notification: serializeNotification(notification)
  });

  return notification;
};

export const streamNotifications = async (req, res) => {
  try {
    const cookieOrHeaderToken = extractTokenFromRequest(req);
    const user = await verifyStreamToken(cookieOrHeaderToken);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    addClient(user.id, res);

    const unreadCount = await prisma.notification.count({
      where: {
        user_id: user.id,
        is_read: false
      }
    });

    sendEvent(res, 'connected', {
      user_id: user.id,
      unread_count: unreadCount
    });

    const heartbeat = setInterval(() => {
      sendEvent(res, 'heartbeat', { ts: Date.now() });
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeClient(user.id, res);
      res.end();
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Unable to start notification stream.' });
  }
};

export const listNotifications = async (req, res) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit || '15', 10) || 15, 50);
    const items = await prisma.notification.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      take: limit
    });

    const unread_count = await prisma.notification.count({
      where: {
        user_id: req.user.id,
        is_read: false
      }
    });

    res.json({
      items: items.map(serializeNotification),
      unread_count
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to load notifications.' });
  }
};

export const markNotificationRead = async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    await prisma.notification.updateMany({
      where: {
        id,
        user_id: req.user.id
      },
      data: { is_read: true }
    });

    const unread_count = await prisma.notification.count({
      where: {
        user_id: req.user.id,
        is_read: false
      }
    });

    publishNotification(req.user.id, {
      type: 'read',
      notification_id: id,
      unread_count
    });

    res.json({ success: true, unread_count });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to update notification.' });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        user_id: req.user.id,
        is_read: false
      },
      data: { is_read: true }
    });

    publishNotification(req.user.id, {
      type: 'read_all',
      unread_count: 0
    });

    res.json({ success: true, unread_count: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Unable to update notifications.' });
  }
};
