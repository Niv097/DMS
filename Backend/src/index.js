import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import morgan from 'morgan';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

import prisma from './utils/prisma.js';
import authMiddleware from './middleware/auth.js';
import { authorize } from './middleware/rbac.js';
import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import auditRoutes from './routes/audit.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notifications.js';
import fmsRoutes from './routes/fms.js';
import brandingRoutes from './routes/branding.js';
import opsRoutes from './routes/ops.js';
import supportRoutes from './routes/support.js';
import { addComment, getDashboardStats } from './controllers/notes.js';
import {
  apiRateLimitMax,
  apiRateLimitWindowMs,
  assertProductionConfig,
  corsOrigins,
  criticalRateLimitMax,
  criticalRateLimitWindowMs,
  isProduction,
  loginRateLimitMax,
  loginRateLimitWindowMs
} from './config/env.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import { requireHttpsMiddleware } from './middleware/requireHttps.js';
import { trustProxy } from './config/env.js';
import { cleanupExpiredSessions, startSessionCleanupJob } from './utils/sessionStore.js';
import { ensureStorageRoot, getStorageRoot } from './utils/storage.js';
import { startBackupAutomation } from './services/backupAutomationService.js';
import { startNotificationReminderAutomation } from './services/notificationAutomationService.js';

dotenv.config();
assertProductionConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5002;
const adminWriteRateLimiter = createRateLimiter({
  keyPrefix: 'critical-admin',
  windowMs: criticalRateLimitWindowMs,
  maxRequests: criticalRateLimitMax,
  message: 'Critical action rate limit exceeded. Please retry shortly.'
});
app.disable('x-powered-by');
if (trustProxy) {
  app.set('trust proxy', 1);
}

app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
  hsts: trustProxy ? undefined : false,
  noSniff: true,
  referrerPolicy: { policy: 'no-referrer' },
  permissionsPolicy: {
    features: {
      camera: [],
      geolocation: [],
      microphone: [],
      payment: [],
      usb: []
    }
  }
}));
const cspDirectives = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  frameAncestors: ["'self'"],
  frameSrc: ["'self'", 'blob:', 'data:'],
  objectSrc: ["'none'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:'],
  connectSrc: isProduction
    ? ["'self'"]
    : [
      "'self'",
      'http://localhost:5002',
      'ws://localhost:5002',
      'http://localhost:5003',
      'ws://localhost:5003',
      'http://localhost:3000',
      'ws://localhost:3000',
      'http://localhost:3001',
      'ws://localhost:3001',
      'http://localhost:3002',
      'ws://localhost:3002',
      'http://localhost:3003',
      'ws://localhost:3003'
    ]
};
if (trustProxy) {
  cspDirectives.upgradeInsecureRequests = [];
}
app.use(helmet.contentSecurityPolicy({
  useDefaults: true,
  directives: cspDirectives
}));
app.use(morgan('dev'));
app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.length === 0 || corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin is not allowed by CORS policy.'));
  },
  credentials: true
}));
app.use(requireHttpsMiddleware);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(createRateLimiter({
  keyPrefix: 'api',
  windowMs: apiRateLimitWindowMs,
  maxRequests: apiRateLimitMax,
  message: 'API rate limit exceeded. Please retry shortly.'
}));

// Routes
app.use('/api/branding', brandingRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return adminWriteRateLimiter(req, res, next);
  }
  return next();
}, adminRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/ops', opsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/fms', fmsRoutes);
app.get('/api/dashboard/stats', authMiddleware, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), getDashboardStats);
app.post('/api/comments', authMiddleware, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'SUPER_ADMIN']), addComment);

// Admin / User info routes
app.get('/api/users', authMiddleware, authorize(['INITIATOR', 'ADMIN', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const where = {
      is_active: true,
      ...(req.user.tenant_id ? { tenant_id: req.user.tenant_id } : {})
    };
    if (req.user.branch_id) {
      where.branch_id = req.user.branch_id;
    }
    const users = await prisma.user.findMany({
      where,
      include: {
        role: true,
        department: true,
        vertical: true,
        tenant: {
          select: {
            id: true,
            tenant_name: true,
            tenant_code: true
          }
        },
        branch: {
          select: {
            id: true,
            branch_name: true,
            branch_code: true,
            tenant_id: true
          }
        }
      }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Departments and Verticals
app.get('/api/departments', authMiddleware, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const departments = await prisma.department.findMany();
    res.json(departments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/verticals', authMiddleware, authorize(['INITIATOR', 'RECOMMENDER', 'APPROVER', 'ADMIN', 'AUDITOR', 'SUPER_ADMIN']), async (req, res) => {
  try {
    const verticals = await prisma.vertical.findMany();
    res.json(verticals);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('DMS API is running...');
});

app.use(notFoundHandler);
app.use(errorHandler);

const startServer = async () => {
  await ensureStorageRoot();
  logger.info('Storage root ready', { storage_root: getStorageRoot() });

  cleanupExpiredSessions().catch((error) => {
    logger.error('Initial session cleanup failed', { message: error.message, stack: error.stack });
  });
  startSessionCleanupJob(logger);
  startBackupAutomation(logger);
  startNotificationReminderAutomation(logger);

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`, { env: process.env.NODE_ENV || 'development' });
    console.log(`Server running on port ${PORT}`);
  });
};

startServer().catch((error) => {
  logger.error('Server startup failed', { message: error.message, stack: error.stack });
  process.exit(1);
});

export { app, prisma };
