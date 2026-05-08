# Production DB Migration Plan

## Objective

Move bank environments to the canonical Prisma-managed schema without using ad hoc local fixes such as `db push` on production databases.

## Canonical Source

Use only:

- `Backend/prisma/schema.prisma`

The mirrored root schema must be synced before release:

```powershell
cd Backend
npm run prisma:schema:sync
```

## Production Rule

Never use the following on a live bank production database:

- `npx prisma db push`
- manual column edits without tracked migration
- demo seed

## Migration Path

### 1. Pre-Migration Validation

- confirm current production backup exists
- confirm rollback owner is assigned
- confirm target release tag/branch is frozen
- run:

```powershell
cd Backend
npm run prisma:schema:sync
npm run prisma:validate
npm run preflight:prod
```

### 2. Baseline Existing Bank Database

If the client database already exists and Prisma migration history is not present:

- create a baseline migration
- mark baseline as applied
- do not alter live data during baseline

This is a one-time setup per environment.

### 3. Release Migration Deployment

Use only:

```powershell
cd Backend
npm run prisma:migrate:deploy
```

### 4. Post-Migration Verification

Verify:

- login
- tenant and branch access
- note listing
- workflow actions
- approved artifact generation
- audit export

### 5. Rollback Strategy

If migration fails or causes incompatibility:

1. stop the new app version
2. restore previous release
3. restore database from the backup taken immediately before deployment
4. validate core APIs before reopening access

## Environment Strategy Per Bank

Recommended production model:

- dedicated database per bank
- dedicated storage path or bucket per bank
- separate secrets per bank environment

The same codebase is reused, but data infrastructure is isolated.

## Evidence to Capture

For each bank production release, retain:

- migration command output
- backup file name
- restore test evidence
- UAT signoff
- release approver name and timestamp
