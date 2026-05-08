# Data Durability Runbook

## 1. Expected Behavior

If the application server process crashes or the server is restarted:

- created users must still exist
- notes and dashboard data must still exist
- workflow history must still exist
- notifications must still exist
- uploaded documents must still exist

This product already stores critical business state in PostgreSQL and file storage, not only in process memory.

## 2. What Persists Already

Persisted in PostgreSQL:
- users
- roles
- tenants and branches
- notes
- workflow steps
- comments
- audit logs
- notifications
- OTP challenges
- authenticated sessions

Persisted in file storage:
- uploaded note files
- annexures
- approved artifacts
- preview and derived files under the configured storage root

## 3. What This Means

If only the Node.js process goes down:
- data remains
- users remain
- dashboard content remains
- the app comes back with the same data after restart

Data is lost only if:
- database storage is lost
- file storage is lost
- someone deletes records or files
- an admin deactivates a user or explicitly changes data

## 4. Production Requirement

For the above guarantee to hold in a bank deployment:

- PostgreSQL must use persistent disk
- `STORAGE_ROOT` must be on persistent mounted storage
- `BACKUP_TRANSFER_ROOT` must be on persistent mounted storage
- backup jobs must run regularly
- mirror export or DR package flow must be scheduled if vendor-side mirror is required

## 5. Bank Deployment Rule

Do not run production with:
- relative `STORAGE_ROOT`
- local temporary folders
- ephemeral container-only storage
- ad hoc manual copy of uploads

Use:
- managed or persistent PostgreSQL
- mounted volume, SAN, NAS, or approved persistent storage for uploads

## 6. Crash Recovery Model

### App process crash

Action:
- restart backend service

Result:
- data remains unchanged

### Full app server crash but disk survives

Action:
- restore application service
- point to same database and same storage root

Result:
- users and dashboard state remain unchanged

### Full server loss

Action:
- restore from primary DB backup and storage backup
- or import DR package on mirror site

Result:
- state is restored up to the latest backup or mirror point

## 7. Admin Deactivation Behavior

User data should remain unless:
- admin deactivates the account
- admin deletes related records through explicit authorized workflow

Deactivation should block access, not silently remove user history.

## 8. Validation Steps

Before go-live for a bank:

1. create a few users
2. create notes and workflow activity
3. stop backend service
4. start backend service again
5. verify all users and note data still exist
6. run backup and restore drill in UAT

## 9. Evidence

Keep these for audit:
- database persistence design approval
- storage mount details
- backup schedule
- restore drill result
- mirror export and import logs if DR mirror is used
