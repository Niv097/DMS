# Backup and Restore SOP

## 1. Database Backup

Before:

- migration deployment
- major release
- tenant onboarding wave

Take a PostgreSQL backup of the target database.

Approved script:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
```

Store backups in:

- secure backup location
- access-controlled storage
- bank-approved retention path

## 2. File Storage Backup

Back up the storage root configured by:

- `STORAGE_ROOT`

This includes:

- uploaded note files
- supporting files
- approved artifacts
- preview assets if retained

Approved script:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\backup-storage.ps1
```

Combined backup:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\backup-all.ps1
```

## 3. Restore Procedure

### Database restore

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\restore-db.ps1 -BackupFile "<path-to-dump>"
```

### Storage restore

- restore the storage volume/directory from the matching backup snapshot

### Primary to mirror package

Export from primary:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\export-dr-package.ps1
```

Import on mirror:

```powershell
cd Backend
powershell -ExecutionPolicy Bypass -File .\scripts\import-dr-package.ps1 -PackageDir "<path-to-package>" -RestoreStorage
```

## 4. Validation After Restore

Verify:

- login works
- tenants and branches load
- notes list loads
- approved PDF download works
- audit export works
- notifications load
- sample role-based workflow still enforces correctly

## 5. Backup Frequency

Recommended:

- daily full DB backup
- pre-release backup
- pre-migration backup
- storage snapshot aligned to DB backup window

## 6. Restore Drill

Run a real restore drill in UAT before production cutover and record:

- backup file name
- restore timestamp
- restoration operator
- validation result
- issues found and resolved
