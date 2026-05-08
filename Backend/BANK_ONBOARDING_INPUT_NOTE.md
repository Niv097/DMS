# Bank Onboarding Input Note

Use this note whenever a new bank gives you domain, database, and server details for DMS rollout.

## 1. Collect From Bank

Ask the bank for these exact items:

1. Production domain
   Example: `https://dms.bank1.com`
2. UAT domain
   Example: `https://uat-dms.bank1.com`
3. Database URL for UAT
   Example: `postgresql://user:password@host:5432/dms_uat`
4. Database URL for production
   Example: `postgresql://user:password@host:5432/dms_prod`
5. Server OS
   `Windows` or `Linux`
6. Persistent storage path for uploaded files
   Example Linux: `/opt/dms/shared/uploads`
   Example Windows: `E:\bank-dms\prod\uploads`
7. Backup path
   Example Linux: `/opt/dms/shared/backups`
   Example Windows: `E:\bank-dms\prod\backups`
8. Transfer path for DR package exchange
   Example Linux: `/opt/dms/transfer`
   Example Windows: `E:\bank-dms\transfer`
9. SMTP details
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL`, `SMTP_REPLY_TO`
10. SSL handling
   Bank reverse proxy / Nginx / IIS team contact
11. Cookie domain
   Usually same as domain host
   Example: `dms.bank1.com`
12. Bank display name and code
   Example: `State Bank of India`
   Example code: `SBI`

## 2. Keep These Ready On Your Side

You must prepare:

1. `JWT_SECRET`
2. vendor mirror domain
   Example: `https://dr.bank1.yourcompany.com`
3. vendor mirror database URL
4. vendor mirror storage path
5. vendor mirror transfer path

## 3. Map The Inputs To Backend Env

Update `Backend\.env.production` like this:

```env
DATABASE_URL=postgresql://user:password@host:5432/dms_prod
JWT_SECRET=replace-with-generated-secret
PORT=5002
NODE_ENV=production

BRAND_DISPLAY_NAME=Bank 1
BRAND_SHORT_CODE=BANK1
BRAND_SUBTITLE=Document Management System
APP_PUBLIC_BASE_URL=https://dms.bank1.com

ENABLE_DEMO=false
ENFORCE_SECURE_AUTH=true
TRUST_PROXY=true
REQUIRE_HTTPS=true

STORAGE_ROOT=/opt/dms/shared/uploads
BACKUP_OUTPUT_ROOT=/opt/dms/shared/backups
BACKUP_TRANSFER_ROOT=/opt/dms/transfer

CORS_ORIGIN=https://dms.bank1.com
AUTH_COOKIE_NAME=dms_auth
AUTH_COOKIE_DOMAIN=dms.bank1.com
COOKIE_SAME_SITE=strict

DEPLOYMENT_SITE_ROLE=PRIMARY
DEPLOYMENT_CUSTOMER_CODE=bank1
DEPLOYMENT_LABEL=bank1-primary
BACKUP_ARCHIVE_PREFIX=bank1
MIRROR_SYNC_ENABLED=false

AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_HOUR=1
AUTO_BACKUP_MINUTE=30
AUTO_BACKUP_MIRROR_EXPORT_ENABLED=true
AUTO_BACKUP_RETENTION_PRUNE_ENABLED=true
AUTO_BACKUP_RUN_ON_STARTUP=false

EMAIL_DELIVERY_MODE=SMTP
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=notifications@bank1.com
SMTP_PASS=replace-with-smtp-password
SMTP_FROM_EMAIL=notifications@bank1.com
SMTP_FROM_NAME=Bank 1 Notifications
SMTP_REPLY_TO=support@bank1.com

LOG_RETENTION_DAYS=365
```

## 4. Vendor Mirror Env

Use the same codebase with mirror env:

```env
DATABASE_URL=postgresql://user:password@vendor-host:5432/dms_bank1_mirror
JWT_SECRET=replace-with-generated-secret
PORT=5002
NODE_ENV=production

BRAND_DISPLAY_NAME=Bank 1
BRAND_SHORT_CODE=BANK1
APP_PUBLIC_BASE_URL=https://dr.bank1.yourcompany.com

ENABLE_DEMO=false
ENFORCE_SECURE_AUTH=true
TRUST_PROXY=true
REQUIRE_HTTPS=true

STORAGE_ROOT=/opt/dms/dr-storage/uploads
BACKUP_OUTPUT_ROOT=/opt/dms/dr-storage/backups
BACKUP_TRANSFER_ROOT=/opt/dms/transfer

CORS_ORIGIN=https://dr.bank1.yourcompany.com
AUTH_COOKIE_NAME=dms_auth
AUTH_COOKIE_DOMAIN=dr.bank1.yourcompany.com
COOKIE_SAME_SITE=strict

DEPLOYMENT_SITE_ROLE=MIRROR
DEPLOYMENT_CUSTOMER_CODE=bank1
DEPLOYMENT_LABEL=bank1-vendor-mirror
BACKUP_ARCHIVE_PREFIX=bank1
MIRROR_SYNC_ENABLED=true
MIRROR_SOURCE_LABEL=bank1-primary

AUTO_BACKUP_ENABLED=true
AUTO_BACKUP_HOUR=1
AUTO_BACKUP_MINUTE=30
AUTO_BACKUP_MIRROR_EXPORT_ENABLED=true
AUTO_BACKUP_RETENTION_PRUNE_ENABLED=true
AUTO_BACKUP_RUN_ON_STARTUP=false
```

## 5. Frontend Env

Update `Frontend\.env.production`:

```env
VITE_ENABLE_DEMO=false
VITE_SESSION_INACTIVITY_TIMEOUT_MS=1800000
VITE_OTP_LOGIN_ENABLED=true
```

## 6. Commands To Run After Bank Shares Details

### Backend

```powershell
cd C:\dev\DMS-main\Backend
Copy-Item .env.production .env -Force
npm run prisma:validate
npx prisma generate --no-engine
npm run prisma:migrate:deploy
node .\scripts\preflight-prod.mjs
```

### Frontend

```powershell
cd C:\dev\DMS-main\Frontend
npm run build
```

## 7. Create Production Folders

### Linux

```bash
sudo mkdir -p /opt/dms/shared/uploads
sudo mkdir -p /opt/dms/shared/backups
sudo mkdir -p /opt/dms/transfer
sudo chown -R www-data:www-data /opt/dms/shared/uploads
sudo chown -R www-data:www-data /opt/dms/shared/backups
```

### Windows

```powershell
New-Item -ItemType Directory -Force -Path E:\bank-dms\prod\uploads
New-Item -ItemType Directory -Force -Path E:\bank-dms\prod\backups
New-Item -ItemType Directory -Force -Path E:\bank-dms\transfer
```

## 8. Final Pre-Go-Live Check

Check these before giving the product:

1. domain resolves correctly
2. backend API opens on correct host
3. frontend build is deployed
4. DB connection works
5. Prisma migration completed
6. upload path exists
7. backup path exists
8. transfer path exists
9. SMTP mail test works
10. login works over HTTPS
11. super admin can see bank
12. daily mirror backup is enabled
13. bank backup policy is set
14. DR export works

## 9. DR Test Commands

```powershell
cd C:\dev\DMS-main\Backend
npm run backup:db
npm run backup:storage
npm run dr:export
```

If vendor mirror must restore:

```powershell
cd C:\dev\DMS-main\Backend
npm run dr:import -- -PackageDir "<package-path>" -RestoreStorage
```

## 10. Short Working Rule

For every new bank:

1. change env values
2. point to that bank database
3. point to that bank storage
4. point to that bank domain
5. keep vendor mirror separate
6. run preflight
7. run migration
8. build and deploy

That is the repeatable bank onboarding flow.
