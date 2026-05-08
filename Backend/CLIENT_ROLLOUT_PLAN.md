# Client Rollout Plan

## 1. Objective

Use this plan when delivering the existing DMS to a real banking client without changing business logic.

This plan covers:

- UAT environment setup
- production environment setup
- deployment preparation
- UAT execution
- production go-live
- post go-live monitoring

## 2. Rollout Stages

### Stage 1: Environment Preparation

Prepare:

- backend `.env.uat`
- backend `.env.production`
- frontend `.env.uat`
- frontend `.env.production`
- target database credentials
- target storage path
- target DNS names
- TLS certificate

Use:

- `Backend/.env.uat`
- `Backend/.env.production`
- `Frontend/.env.uat`
- `Frontend/.env.production`

Generate strong secrets before use:

```powershell
cd Backend
npm run generate:jwt-secret
```

### Stage 2: Infrastructure Readiness

Before UAT or production:

- create the upload/storage root
- create the backup output root
- confirm both paths are writable by the application service account
- prepare reverse proxy configuration
- prepare TLS certificate
- confirm database connectivity from the backend host

### Stage 3: Database Readiness

Use only the canonical Prisma schema path:

- `Backend/prisma/schema.prisma`

Required commands:

```powershell
cd Backend
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
```

Migration deployment:

```powershell
cd Backend
npm run prisma:migrate:deploy
```

Do not use `db push` on the client production database.

### Stage 4: UAT Deployment

1. copy `.env.uat` to `.env`
2. install backend dependencies
3. run migration
4. run UAT backend
5. build frontend with `Frontend/.env.uat`
6. place frontend build behind the reverse proxy
7. confirm HTTPS and cookie behavior

### Stage 5: UAT Execution

Run the role-wise test plan from:

- `Backend/UAT_EXECUTION_PLAN.md`
- `Backend/UAT_CHECKLIST.md`

Required signoff:

- uploader
- recommender
- approver
- admin
- auditor
- super admin
- bank UAT stakeholder

### Stage 6: Production Cutover

1. rotate production secrets
2. take full backup
3. verify `ENABLE_DEMO=false`
4. run `npm run preflight:prod`
5. deploy latest approved release
6. apply migration
7. verify health checks
8. enable user access

### Stage 7: Post Go-Live Monitoring

Monitor closely for the first business day and first week:

- login failures
- workflow failures
- upload failures
- approved artifact generation
- audit export
- notification delivery

## 3. Exit Criteria

Rollout is complete only when:

- UAT signoff is complete
- restore drill evidence exists
- production backup job is active
- storage backup job is active
- retention job is active
- demo mode is disabled
- reverse proxy and HTTPS are active
- bank stakeholder approves go-live
