import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const errors = [];
const warnings = [];

const required = (name) => {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    errors.push(`${name} is required.`);
  }
  return value;
};

const nodeEnv = String(process.env.NODE_ENV || '').trim().toLowerCase();
const deploymentSiteRole = String(process.env.DEPLOYMENT_SITE_ROLE || 'PRIMARY').trim().toUpperCase();
const mirrorSyncEnabled = String(process.env.MIRROR_SYNC_ENABLED || '').trim().toLowerCase();
const enableDemo = String(process.env.ENABLE_DEMO || '').trim().toLowerCase();
const secureAuth = String(process.env.ENFORCE_SECURE_AUTH || '').trim().toLowerCase();
const trustProxy = String(process.env.TRUST_PROXY || '').trim().toLowerCase();
const requireHttps = String(process.env.REQUIRE_HTTPS || '').trim().toLowerCase();

if (nodeEnv !== 'production') {
  errors.push('NODE_ENV must be production for release preflight.');
}
if (!['PRIMARY', 'MIRROR'].includes(deploymentSiteRole)) {
  errors.push('DEPLOYMENT_SITE_ROLE must be PRIMARY or MIRROR.');
}
if (enableDemo !== 'false') {
  errors.push('ENABLE_DEMO must be false for production delivery.');
}
if (secureAuth !== 'true') {
  errors.push('ENFORCE_SECURE_AUTH must be true for production delivery.');
}
if (trustProxy !== 'true') {
  errors.push('TRUST_PROXY must be true behind the reverse proxy.');
}
if (requireHttps !== 'true') {
  errors.push('REQUIRE_HTTPS must be true for production delivery.');
}

const jwtSecret = required('JWT_SECRET');
if (jwtSecret && jwtSecret.length < 32) {
  errors.push('JWT_SECRET should be at least 32 characters.');
}
if (jwtSecret === 'super-secret-bank-key' || jwtSecret === 'dev-dms-bank-jwt-secret-change-before-prod') {
  errors.push('JWT_SECRET is still using a non-production placeholder.');
}

required('DATABASE_URL');
required('CORS_ORIGIN');
const storageRoot = required('STORAGE_ROOT');
required('AUTH_COOKIE_NAME');
required('DEPLOYMENT_CUSTOMER_CODE');
required('DEPLOYMENT_LABEL');
required('BACKUP_ARCHIVE_PREFIX');
const backupTransferRoot = required('BACKUP_TRANSFER_ROOT');

if (deploymentSiteRole === 'MIRROR' && mirrorSyncEnabled !== 'true') {
  errors.push('MIRROR_SYNC_ENABLED must be true when DEPLOYMENT_SITE_ROLE=MIRROR.');
}
if (deploymentSiteRole === 'MIRROR' && !String(process.env.MIRROR_SOURCE_LABEL || '').trim()) {
  errors.push('MIRROR_SOURCE_LABEL is required when DEPLOYMENT_SITE_ROLE=MIRROR.');
}

if (storageRoot) {
  try {
    await fs.access(path.resolve(process.cwd(), storageRoot));
  } catch {
    warnings.push(`STORAGE_ROOT does not exist yet at ${path.resolve(process.cwd(), storageRoot)}.`);
  }
  if (!path.isAbsolute(storageRoot)) {
    errors.push('STORAGE_ROOT must be an absolute persistent path in production.');
  }
}

if (backupTransferRoot && !path.isAbsolute(backupTransferRoot)) {
  errors.push('BACKUP_TRANSFER_ROOT must be an absolute path in production.');
}

const docsToCheck = [
  'DEPLOYMENT_RUNBOOK.md',
  'BACKUP_RESTORE_SOP.md',
  'UAT_CHECKLIST.md',
  'PRODUCTION_READINESS_CHECKLIST.md'
];

for (const doc of docsToCheck) {
  try {
    await fs.access(path.resolve(process.cwd(), doc));
  } catch {
    errors.push(`${doc} is missing from Backend/.`);
  }
}

if (warnings.length > 0) {
  console.log('Preflight warnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}

if (errors.length > 0) {
  console.error('Production preflight failed:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('Production preflight passed.');
