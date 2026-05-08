# Production Release Branch Guidance

## Recommended Branch

Create a release branch before bank-facing deployment:

```powershell
git checkout -b release/prod-ready-2026-04-20
```

## Purpose

This branch should contain:

- production config hardening
- schema freeze
- migration-reviewed changes
- no demo-only UI exposure
- approved documentation pack

## Merge Rules

- merge only reviewed changes
- no ad hoc seed/demo edits
- no destructive admin shortcuts unless gated by production flag
