import express from 'express';
import prisma from '../utils/prisma.js';
import {
  brandDisplayName,
  brandLogoUrl,
  brandShortCode,
  brandSubtitle,
  brandWatermarkText
} from '../config/env.js';
import { ensureTenantLogoStoredFileAvailable } from '../services/storageRecoveryService.js';
import { resolveStoredPath } from '../utils/storage.js';

const router = express.Router();

const normalizeCode = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const normalizeHost = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  return raw.split(',')[0].trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0].trim();
};

const getRequestHost = (req) => normalizeHost(
  req.headers['x-forwarded-host']
  || req.headers.host
  || req.hostname
);

const buildBrandingPayload = (tenant = null) => ({
  tenant_id: tenant?.id ?? null,
  brand_name: String(tenant?.brand_display_name || tenant?.tenant_name || brandDisplayName).trim() || brandDisplayName,
  short_code: normalizeCode(tenant?.brand_short_code || tenant?.tenant_code || brandShortCode) || brandShortCode,
  subtitle: String(tenant?.brand_subtitle || brandSubtitle).trim() || brandSubtitle,
  logo_url: tenant?.brand_logo_path ? `/api/branding/logo/${tenant.id}` : (brandLogoUrl || null),
  watermark_text: String(brandWatermarkText || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd').trim() || 'LUMIEN INNOVATIVE VENTURES Pvt Ltd'
});

const brandingSelect = {
  id: true,
  tenant_name: true,
  tenant_code: true,
  deployment_host: true,
  brand_display_name: true,
  brand_short_code: true,
  brand_logo_path: true,
  brand_watermark_text: true,
  brand_subtitle: true
};

router.get('/', async (req, res) => {
  try {
    const tenantId = Number.parseInt(String(req.query.tenant_id || ''), 10);
    const tenantCode = normalizeCode(req.query.tenant_code);
    const requestHost = getRequestHost(req);

    let tenant = null;

    if (Number.isInteger(tenantId)) {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: brandingSelect
      });
    } else if (tenantCode) {
      tenant = await prisma.tenant.findFirst({
        where: {
          OR: [
            { tenant_code: tenantCode },
            { brand_short_code: tenantCode }
          ]
        },
        select: brandingSelect
      });
    } else if (requestHost) {
      tenant = await prisma.tenant.findFirst({
        where: { deployment_host: requestHost },
        select: brandingSelect
      });
    }

    res.json(buildBrandingPayload(tenant));
  } catch {
    res.json(buildBrandingPayload(null));
  }
});

router.get('/logo/:id', async (req, res) => {
  try {
    const tenantId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(tenantId)) {
      return res.status(404).end();
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        brand_logo_path: true
      }
    });

    if (!tenant?.brand_logo_path) {
      return res.status(404).end();
    }

    await ensureTenantLogoStoredFileAvailable(tenant);
    return res.sendFile(resolveStoredPath(tenant.brand_logo_path));
  } catch {
    return res.status(404).end();
  }
});

export default router;
