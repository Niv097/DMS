# Deployment Runbook

## 1. Scope

This runbook is for promoting the existing DMS to a production-style environment for bank onboarding.

## 2. Canonical Prisma Source

Use:

- `Backend/prisma/schema.prisma`

Before deploy, sync the root mirror:

```powershell
cd Backend
npm run prisma:schema:sync
```

## 3. Pre-Deployment Inputs

Prepare:

- production database credentials
- production `JWT_SECRET`
- persistent storage path or mounted volume
- app server environment variables
- deployment role: `PRIMARY` or `MIRROR`
- customer code and deployment label
- backup of the current target database
- reverse proxy / TLS certificate details
- malware scanning decision for uploads

## 4. Required Environment Variables

Use `.env.example` as baseline and set:

```env
NODE_ENV=production
DEPLOYMENT_SITE_ROLE=PRIMARY|MIRROR
DEPLOYMENT_CUSTOMER_CODE=<bank-code>
DEPLOYMENT_LABEL=<bank-code-primary-or-mirror>
MIRROR_SYNC_ENABLED=true|false
MIRROR_SOURCE_LABEL=<required-when-mirror>
ENABLE_DEMO=false
ENFORCE_SECURE_AUTH=true
TRUST_PROXY=true
REQUIRE_HTTPS=true
DATABASE_URL=postgresql://...
JWT_SECRET=<long-random-secret>
STORAGE_ROOT=<persistent-storage-path>
BACKUP_OUTPUT_ROOT=<bank-approved-backup-path>
BACKUP_ARCHIVE_PREFIX=<bank-code>
BACKUP_TRANSFER_ROOT=<absolute-secure-transfer-path>
LOG_RETENTION_DAYS=365
UPLOAD_SCAN_ENABLED=true|false
USE_WINDOWS_DEFENDER_SCAN=false
UPLOAD_SCAN_COMMAND=<enterprise-av-command-optional>
```

Frontend:

```env
VITE_ENABLE_DEMO=false
```

## 5. Deployment Steps

### 5.1 Backup

Take database and storage backups before any migration.

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
powershell -ExecutionPolicy Bypass -File .\scripts\backup-storage.ps1
```

### 5.2 Backend Release Preparation

```powershell
cd Backend
npm install
npm run generate:jwt-secret
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
npm run preflight:prod
```

### 5.3 Migration Deployment

```powershell
cd Backend
npm run prisma:migrate:deploy
```

If the production database was not originally managed by Prisma migrations:

- baseline the database first
- do not use `db push` in production

### 5.4 Seed Policy

Do not run demo seed in production.

The application now blocks demo seeding automatically when:

- `NODE_ENV=production`
- or `ENABLE_DEMO=false`

Preferred production path:

- create initial super admin manually or by controlled onboarding script
- create tenants and branches through approved onboarding flow

### 5.5 Start Application

```powershell
cd Backend
node src/index.js
```

Frontend:

```powershell
cd Frontend
npm install
npm run build
```

Serve the built frontend behind your standard web server or deployment platform.

For primary and mirror deployment patterns, see:

- `BANK_PRIMARY_MIRROR_RUNBOOK.md`
- `DATA_DURABILITY_RUNBOOK.md`

### 5.6 Reverse Proxy and HTTPS

Production must terminate TLS before traffic reaches the backend.

Minimum proxy controls:

- HTTPS only
- `X-Forwarded-Proto=https`
- restricted upstream port exposure
- request size aligned to upload policy
- security headers preserved

Durability controls:

- database must use persistent storage
- `STORAGE_ROOT` must be a persistent absolute path
- `BACKUP_TRANSFER_ROOT` must be a persistent absolute path

Example Nginx expectations:

- public `443` exposed
- backend port `5002` private only
- frontend static build served by Nginx or equivalent
- proxy `/api` and `/notifications` to backend
- enable HSTS once certificate and hostname are stable

Reference template:

- `Backend/nginx/dms.conf.example`

## 6. Post-Deployment Verification

Check:

- `/api/auth/login`
- `/api/auth/me`
- `/api/admin/tenants`
- `/api/admin/branches`
- `/api/admin/users`
- `/api/notes`
- `/api/notifications`

Operational checks:

- upload scan path returns success for a clean file
- rate limiting behaves correctly on repeated login failure
- HTTP requests redirect or fail when HTTPS is required
- audit export works for admin users
- retention job scheduling is in place

Then do one workflow test:

1. create tenant
2. create branch
3. create uploader/recommender/approver
4. first-login password change
5. upload note
6. recommend
7. approve
8. download approved artifact
9. export audit

## 7. Rollback

If application release fails:

1. stop the new backend
2. restore previous application version
3. if migration caused incompatibility, restore database from pre-deploy backup
4. verify login and notes endpoints before reopening access

Restore commands:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\restore-db.ps1 -BackupFile "<path-to-dump>"
```

## 8. Production Restrictions

In production mode:

- demo login buttons should be disabled
- admin cleanup delete endpoints should be disabled
- temp password hint should not be exposed in login response
- demo seed should be blocked
- direct non-authenticated file access should be blocked

## 9. Scheduling Requirements

Configure recurring jobs for:

- database backup
- storage backup
- DR package export where mirror handoff is required: `npm run dr:export`
- log retention pruning: `npm run retention:prune`
- malware signature or scanner updates if upload scanning is enabled

## 10. Release Branch Convention

Recommended release branch naming:

- `release/prod-ready-<date>`
- example: `release/prod-ready-2026-04-20`
