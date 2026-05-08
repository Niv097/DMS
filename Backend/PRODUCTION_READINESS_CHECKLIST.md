# Production Readiness Checklist

## 1. Configuration

- [ ] `NODE_ENV=production`
- [ ] `ENABLE_DEMO=false`
- [ ] `ENFORCE_SECURE_AUTH=true`
- [ ] `TRUST_PROXY=true`
- [ ] `REQUIRE_HTTPS=true`
- [ ] `JWT_SECRET` is long, random, and not the default
- [ ] Production `DATABASE_URL` points to bank-approved database
- [ ] `STORAGE_ROOT` points to persistent secure storage mount
- [ ] `BACKUP_OUTPUT_ROOT` points to approved backup path
- [ ] Frontend `VITE_ENABLE_DEMO=false`

## 2. Prisma and Database

- [ ] Canonical Prisma schema is `Backend/prisma/schema.prisma`
- [ ] `npm run prisma:schema:sync` executed before release
- [ ] `npm run prisma:validate` passes
- [ ] `npm run preflight:prod` passes
- [ ] Migrations tested in UAT before production deploy
- [ ] Backup taken before migration deploy
- [ ] Rollback plan prepared for current release

## 3. Security

- [ ] Login rate limiting enabled
- [ ] General API rate limiting enabled
- [ ] Demo delete/cleanup endpoints disabled in production
- [ ] Demo seed blocked in production
- [ ] First-login password reset flow tested
- [ ] Admin self-modification protections tested
- [ ] SSE/notification stream token path reviewed for production proxy/TLS setup
- [ ] Upload malware scanning enabled or signed off as external bank control
- [ ] HTTPS enforced end to end
- [ ] JWT secret rotated for the target environment

## 4. Storage

- [ ] Upload storage mounted on persistent volume or enterprise document store
- [ ] Temp/preview cleanup policy defined
- [ ] Antivirus / malware scanning integrated or documented externally
- [ ] Approved PDF artifact generation tested against production storage path
- [ ] Storage backup job configured and tested

## 5. Functional UAT

- [ ] Super admin onboarding flow tested
- [ ] Tenant creation tested
- [ ] Branch creation tested
- [ ] User creation/reset-password tested
- [ ] First-login password change tested
- [ ] Initiator upload tested
- [ ] Recommender action tested
- [ ] Approver action tested
- [ ] Approved PDF generation tested
- [ ] Audit export CSV/PDF tested
- [ ] Notifications tested
- [ ] Tenant isolation tested
- [ ] Branch isolation tested
- [ ] Role signoff captured for uploader/recommender/approver/admin/auditor/super admin

## 6. Operational Readiness

- [ ] Deployment runbook approved
- [ ] Backup and restore SOP approved
- [ ] Tenant onboarding SOP approved
- [ ] Named support owners identified
- [ ] Production logging destination configured
- [ ] Infrastructure monitoring configured
- [ ] Log retention pruning scheduled
- [ ] Restore drill evidence recorded

## 7. Release Gate

Do not cut over to production until all sections above are complete and signed off by:

- engineering
- implementation/support
- business owner
- bank UAT stakeholder
