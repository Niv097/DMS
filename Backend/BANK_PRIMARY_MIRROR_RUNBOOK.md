# Bank Primary and Mirror Runbook

## 1. Goal

Use the same DMS codebase for:

- the bank's primary production site
- your company disaster-recovery or mirror site

The only required application-level changes between customers should be environment values such as:

- `DATABASE_URL`
- `STORAGE_ROOT`
- `BACKUP_TRANSFER_ROOT`
- `CORS_ORIGIN`
- cookie domain
- deployment labels

## 2. Recommended Model

Primary site:
- hosted in the bank network
- read/write production database
- live document storage

Mirror site:
- hosted at your company DR site or another approved DR site
- restored from backup package or updated from secure transfer
- not used for daily active production traffic unless failover is declared

## 3. Environment Profiles

### 3.1 Bank primary example

```env
NODE_ENV=production
DEPLOYMENT_SITE_ROLE=PRIMARY
DEPLOYMENT_CUSTOMER_CODE=bankxyz
DEPLOYMENT_LABEL=bankxyz-primary
MIRROR_SYNC_ENABLED=false
DATABASE_URL=postgresql://user:pass@bank-db:5432/dms_prod
STORAGE_ROOT=/opt/dms/shared/uploads
CORS_ORIGIN=https://dms.bankxyz.com
AUTH_COOKIE_DOMAIN=dms.bankxyz.com
BACKUP_ARCHIVE_PREFIX=bankxyz
BACKUP_TRANSFER_ROOT=/opt/dms/transfer
```

### 3.2 Vendor mirror example

```env
NODE_ENV=production
DEPLOYMENT_SITE_ROLE=MIRROR
DEPLOYMENT_CUSTOMER_CODE=bankxyz
DEPLOYMENT_LABEL=bankxyz-vendor-mirror
MIRROR_SYNC_ENABLED=true
MIRROR_SOURCE_LABEL=bankxyz-primary
DATABASE_URL=postgresql://user:pass@vendor-dr-db:5432/dms_mirror
STORAGE_ROOT=/opt/dms/dr-storage/uploads
CORS_ORIGIN=https://dr.bankxyz.vendor.com
AUTH_COOKIE_DOMAIN=dr.bankxyz.vendor.com
BACKUP_ARCHIVE_PREFIX=bankxyz
BACKUP_TRANSFER_ROOT=/opt/dms/transfer
```

## 4. One-Time Release Flow for a New Bank

1. Copy `.env.example` to `.env`
2. Set bank-specific database and hostname values
3. Run:

```powershell
cd Backend
npm run prisma:validate
npm run preflight:prod
```

4. On primary site, deploy normally
5. On mirror site, deploy the same code with mirror `.env`

## 5. Primary-to-Mirror Data Movement

### Primary side export

```powershell
cd Backend
npm run dr:export
```

This creates:
- database dump
- storage zip
- `manifest.json`

under `BACKUP_TRANSFER_ROOT`

### Mirror side import

```powershell
cd Backend
npm run dr:import -- -PackageDir "<path-to-package>" -RestoreStorage
```

This restores:
- PostgreSQL database from the exported dump
- storage files from the exported zip

## 6. Operating Principle

For each new bank customer:
- keep the same application code
- set customer-specific values in `.env`
- point `DATABASE_URL` to the correct DB
- point `STORAGE_ROOT` to the correct storage mount
- set `DEPLOYMENT_SITE_ROLE` to `PRIMARY` or `MIRROR`

## 7. Practical Outcome

That means your team should not need to change application code when:
- onboarding a new bank
- preparing the vendor-side mirror
- moving from one production database host to another

You mainly change:
- database connection
- storage path
- transfer path
- public origin and cookie domain
- deployment labels

## 8. Audit Notes

Keep these as evidence for each bank onboarding:
- primary `.env` values review
- mirror `.env` values review
- `npm run preflight:prod` result
- DR export timestamp
- DR import timestamp
- restore validation checklist

Also review:
- `DATA_DURABILITY_RUNBOOK.md`
