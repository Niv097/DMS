import crypto from 'crypto';
import prisma from '../utils/prisma.js';
import {
  brandDisplayName,
  brandShortCode,
  brandSubtitle,
  deploymentCustomerCode,
  deploymentLabel,
  deploymentSiteRole,
  mobileDeliveryInternalToken,
  supportAccessToken,
  supportOverviewEnabled
} from '../config/env.js';
import { deliverMobileMessage, getMobileDeliveryRuntime, mobileDeliveryEndpointEnabled } from '../services/mobileDeliveryService.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';

const supportsEnterpriseModels = Boolean(prisma.tenant && prisma.branch && prisma.user);
const supportsNotifications = Boolean(prisma.notification);
const supportsFmsDocuments = Boolean(prisma.fmsDocument);

const extractSupportToken = (req) => {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return String(req.headers['x-support-key'] || '').trim();
};

const extractMobileDeliveryToken = (req) => {
  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }
  return String(req.headers['x-mobile-delivery-key'] || req.headers['x-support-key'] || '').trim();
};

const safeSecretMatch = (expected, received) => {
  const expectedBuffer = Buffer.from(String(expected || ''), 'utf8');
  const receivedBuffer = Buffer.from(String(received || ''), 'utf8');
  if (expectedBuffer.length === 0 || expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

const getLicenseStatus = (licenseValidUntil) => {
  if (!licenseValidUntil) return 'Not Recorded';
  const expiresAt = new Date(licenseValidUntil).getTime();
  if (Number.isNaN(expiresAt)) return 'Not Recorded';
  if (expiresAt < Date.now()) return 'Expired';
  const daysRemaining = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (daysRemaining <= 30) return `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  return 'Active';
};

const getPrimaryTenant = async () => {
  if (!supportsEnterpriseModels) return null;
  return prisma.tenant.findFirst({
    orderBy: { id: 'asc' },
    select: {
      id: true,
      tenant_name: true,
      tenant_code: true,
      deployment_mode: true,
      support_access_mode: true,
      support_login_username: true,
      support_contact_name: true,
      support_contact_email: true,
      support_contact_phone: true,
      license_plan: true,
      license_valid_until: true,
      backup_policy_enabled: true,
      backup_frequency: true,
      backup_last_completed_at: true,
      backup_next_due_at: true,
      brand_display_name: true,
      brand_short_code: true,
      brand_subtitle: true
    }
  }).catch(() => null);
};

export const getSupportOverview = async (req, res) => {
  try {
    if (!supportOverviewEnabled || !supportAccessToken) {
      return res.status(404).json({ error: 'Support overview is not enabled on this deployment.' });
    }

    const incomingToken = extractSupportToken(req);
    if (!safeSecretMatch(supportAccessToken, incomingToken)) {
      return res.status(401).json({ error: 'Support token is invalid.' });
    }

    const tenant = await getPrimaryTenant();
    const tenantScope = tenant?.id ? { tenant_id: tenant.id } : {};

    const [branchCount, userCount, noteCount, pendingNoteCount, unreadNotificationCount, fmsDocumentCount] = await Promise.all([
      supportsEnterpriseModels ? prisma.branch.count({ where: tenantScope }).catch(() => 0) : Promise.resolve(0),
      prisma.user.count({ where: tenantScope }).catch(() => 0),
      prisma.note.count({
        where: {
          ...tenantScope,
          ...(supportsEnterpriseModels ? { is_latest_version: true } : {})
        }
      }).catch(() => 0),
      prisma.note.count({
        where: {
          ...tenantScope,
          ...(supportsEnterpriseModels ? { is_latest_version: true } : {}),
          queue_code: { in: ['INCOMING', 'RETURNED_WITH_REMARKS'] }
        }
      }).catch(() => 0),
      supportsNotifications ? prisma.notification.count({
        where: {
          ...tenantScope,
          is_read: false
        }
      }).catch(() => 0) : Promise.resolve(0),
      supportsFmsDocuments ? prisma.fmsDocument.count({
        where: {
          ...tenantScope,
          is_latest_version: true
        }
      }).catch(() => 0) : Promise.resolve(0)
    ]);

    res.json({
      status: 'ONLINE',
      mode: 'DEDICATED',
      checked_at: new Date().toISOString(),
      instance: {
        deployment_label: deploymentLabel,
        deployment_customer_code: deploymentCustomerCode,
        site_role: deploymentSiteRole
      },
      bank: {
        tenant_id: tenant?.id ?? null,
        tenant_name: tenant?.brand_display_name || tenant?.tenant_name || brandDisplayName,
        tenant_code: tenant?.brand_short_code || tenant?.tenant_code || brandShortCode,
        subtitle: tenant?.brand_subtitle || brandSubtitle,
        support_access_mode: tenant?.support_access_mode || 'REMOTE_API',
        support_login_username: tenant?.support_login_username || null,
        support_contact_name: tenant?.support_contact_name || null,
        support_contact_email: tenant?.support_contact_email || null,
        support_contact_phone: tenant?.support_contact_phone || null
      },
      stats: {
        branches: branchCount,
        users: userCount,
        notes: noteCount,
        pending_items: pendingNoteCount,
        unread_notifications: unreadNotificationCount,
        fms_documents: fmsDocumentCount
      },
      backup: {
        enabled: tenant?.backup_policy_enabled ?? true,
        frequency: tenant?.backup_frequency || 'DAILY',
        last_completed_at: tenant?.backup_last_completed_at ?? null,
        next_due_at: tenant?.backup_next_due_at ?? null
      },
      license: {
        plan: tenant?.license_plan ?? null,
        valid_until: tenant?.license_valid_until ?? null,
        status: getLicenseStatus(tenant?.license_valid_until ?? null)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const postSupportMobileDelivery = async (req, res) => {
  try {
    if (!mobileDeliveryEndpointEnabled() || !mobileDeliveryInternalToken) {
      return res.status(404).json({ error: 'Internal mobile delivery endpoint is not enabled on this deployment.' });
    }

    const incomingToken = extractMobileDeliveryToken(req);
    if (!safeSecretMatch(mobileDeliveryInternalToken, incomingToken)) {
      return res.status(401).json({ error: 'Mobile delivery token is invalid.' });
    }

    const result = await deliverMobileMessage({
      to: req.body.to,
      subject: req.body.subject,
      message: req.body.message,
      metadata: req.body.metadata || {},
      payload: req.body.payload || {}
    });

    writeSecurityAudit('SUPPORT_MOBILE_DELIVERY_REQUESTED', {
      channel: 'MOBILE',
      destination: result.destination || null,
      status: result.status || null,
      provider: result.provider || null
    });

    return res.json({
      ok: ['SENT', 'PREVIEWED', 'MANUAL_REQUIRED'].includes(String(result.status || '').toUpperCase()),
      runtime: getMobileDeliveryRuntime(),
      delivery: result
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
