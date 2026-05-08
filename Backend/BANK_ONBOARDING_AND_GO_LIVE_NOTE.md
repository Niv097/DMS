# Bank Onboarding and Go-Live Note

Use this note every time a bank order comes in.

This is split into:

1. what to collect from the bank
2. what to configure in DMS
3. how to run UAT
4. how to make it live
5. what to do when another bank comes after that

---

## 1. What You Must Collect From The Bank

### A. Branding and identity

- bank display name
- short code
- bank logo
- bank email sender name
- branch names
- branch addresses
- city and state master
- department list
- sub-department list if they use it

Examples:

- `HDFC Bank`
- `HDFC`
- branch: `Varachha Branch`
- city: `Surat`

### B. Domain and access

- UAT domain
- production domain
- whether they want dedicated deployment or shared central deployment
- DNS owner/contact
- SSL certificate owner/contact if they manage it
- public IP / private IP requirements if any
- VPN / firewall / IP whitelist requirement if any

Examples:

- `uat-dms.hdfcbank.com`
- `dms.hdfcbank.com`

### C. SMTP / email details

- SMTP host
- SMTP port
- SMTP secure true/false
- SMTP username
- SMTP password or app password
- from email
- from name
- reply-to email
- whether OTP mail should use same mailbox

Examples:

- `smtp.office365.com`
- `587`
- `notifications@bank.com`
- `support@bank.com`

### D. Database and infrastructure

- PostgreSQL host
- PostgreSQL port
- database name for UAT
- database name for production
- DB username
- DB password
- server OS
- backend host path
- frontend publish path
- upload storage path
- backup storage path
- retention requirement

Examples:

- UAT DB: `dms_hdfc_uat`
- PROD DB: `dms_hdfc_prod`
- uploads: `D:\bank-dms\hdfc\uploads`
- backups: `D:\bank-dms\hdfc\backups`

### E. Security and operations

- password rotation policy
- session timeout policy
- file size limit policy
- allowed file types policy
- audit retention duration
- backup retention duration
- restore RTO/RPO expectation if they have one

### F. User and workflow setup

- super admin contact from your side
- bank admin users
- HO admin users
- uploader users
- recommender users
- approver users
- auditor users
- branch users
- employee ID format
- whether login username is employee ID, email, or both

### G. UAT signoff contacts

- bank IT contact
- bank business owner
- bank UAT coordinator
- escalation contact

---

## 2. What You Must Configure In DMS

### A. Backend env

Fill:

- `DATABASE_URL`
- `JWT_SECRET`
- `APP_PUBLIC_BASE_URL`
- `BRAND_DISPLAY_NAME`
- `BRAND_SHORT_CODE`
- `BRAND_SUBTITLE`
- `BRAND_WATERMARK_TEXT`
- `CORS_ORIGIN`
- `STORAGE_ROOT`
- `BACKUP_OUTPUT_ROOT`
- `ENABLE_DEMO=false`
- `TRUST_PROXY=true`
- `REQUIRE_HTTPS=true`
- `OTP_PREVIEW_IN_RESPONSE=false`
- `EMAIL_DELIVERY_MODE=SMTP`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM_EMAIL`
- `SMTP_FROM_NAME`
- `SMTP_REPLY_TO`

Use:

- [Backend/.env.uat](/c:/dev/DMS-main/Backend/.env.uat)
- [Backend/.env.production](/c:/dev/DMS-main/Backend/.env.production)
- [Backend/.env.example](/c:/dev/DMS-main/Backend/.env.example)

### B. Frontend env

Fill:

- `VITE_ENABLE_DEMO=false`
- API/public base values if your frontend env requires them

### C. Bank master data

Create:

- bank
- cities
- branches
- branch addresses
- departments
- sub-departments
- branch mapping

### D. User setup

Create users with:

- name
- username / employee ID
- email
- role
- branch
- department if used

### E. FMS setup

Configure:

- records library standards
- record sensitivity labels
- record types
- banking desks
- folder hierarchy
- access rules
- FMS role assignment

---

## 3. Development Testing Before UAT

Do this on your own environment first.

### A. Email test

Test:

- user creation mail
- temporary password mail
- password reset mail
- OTP mail
- welcome/password-changed mail

### B. OTP test

Test:

- send OTP
- resend OTP
- verify OTP
- expiry
- wrong OTP attempts

### C. Workflow test

Test:

- upload
- recommend
- approve
- approved artifact generation
- audit log capture

### D. FMS test

Test:

- direct record intake
- auto archive from DMS to FMS
- branch/department sharing
- grant/revoke
- viewer access
- intake role access

---

## 4. UAT Steps For The Bank

### A. Prepare UAT

1. copy UAT env into live backend env
2. install backend dependencies
3. validate Prisma
4. generate Prisma client
5. apply migrations
6. build frontend
7. configure reverse proxy and HTTPS
8. verify email and OTP

Use these rollout files:

- [Backend/CLIENT_ROLLOUT_PLAN.md](/c:/dev/DMS-main/Backend/CLIENT_ROLLOUT_PLAN.md)
- [Backend/UAT_EXECUTION_PLAN.md](/c:/dev/DMS-main/Backend/UAT_EXECUTION_PLAN.md)
- [Backend/GO_LIVE_CHECKLIST.md](/c:/dev/DMS-main/Backend/GO_LIVE_CHECKLIST.md)
- [Backend/UAT_CHECKLIST.md](/c:/dev/DMS-main/Backend/UAT_CHECKLIST.md)

### B. Run UAT role by role

Must test:

- super admin
- bank admin
- HO admin
- uploader
- recommender
- approver
- auditor
- FMS viewer
- FMS intake user

### C. UAT signoff only after

- login works
- email works
- OTP works
- workflow works
- audit works
- FMS works
- restore drill is recorded

---

## 5. How To Make The Bank Live

### A. Before go-live

1. freeze release
2. take DB backup
3. take storage backup
4. confirm production env is correct
5. confirm SSL is active
6. confirm SMTP is active
7. confirm demo mode is off
8. confirm bank branding is correct

### B. Production commands backbone

Backend:

```powershell
cd C:\dev\DMS-main\Backend
npm install
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
npm run preflight:prod
npm run prisma:migrate:deploy
```

Frontend:

```powershell
cd C:\dev\DMS-main\Frontend
npm install
npm run build
```

### C. After go-live

Immediately verify:

- HTTPS access
- login
- OTP email
- workflow upload
- approval flow
- audit log
- FMS open/search
- backup job
- storage backup job

---

## 6. What To Do If Another Bank Gives You Order After 2 Days

There are only two proper models.

### Model A: Dedicated deployment per bank

Recommended for real banking delivery.

Do this:

1. create new UAT env for Bank 2
2. create new production env for Bank 2
3. create new DBs for Bank 2
4. create new domains for Bank 2
5. configure Bank 2 SMTP
6. upload Bank 2 logo/branding
7. create Bank 2 branches/departments/users
8. run Bank 2 UAT
9. go live separately

Example:

- Bank 1:
  - `uat-dms.hdfc.com`
  - `dms.hdfc.com`
- Bank 2:
  - `uat-dms.sbi.com`
  - `dms.sbi.com`

Use separate:

- database
- storage root
- backup root
- SMTP config if bank gives separate mailbox
- branding

### Model B: Shared central multi-bank platform

Use only if business agrees to one central installation.

Do this:

1. create new bank tenant
2. set new branding
3. create city/branch/department masters
4. create users
5. configure FMS folders and roles
6. run tenant-isolation UAT

Keep separate by data:

- bank tenant
- branches
- users
- FMS access
- branding

### Recommended choice

For serious bank delivery:

- prefer `Model A: dedicated deployment per bank`

Reason:

- simpler branding
- cleaner SMTP ownership
- cleaner audit ownership
- safer isolation
- easier rollback

---

## 7. Exact Bank Handover Checklist

Before taking a bank live, you must have:

- bank logo
- bank display name
- short code
- UAT domain
- production domain
- SSL readiness
- SMTP details
- DB details
- storage path
- backup path
- city list
- branch list
- branch addresses
- department list
- user list
- role mapping
- UAT signoff
- backup restore evidence

If any one of the above is missing, do not call it production-ready.

---

## 8. Short Working Rule

For every new bank:

1. collect bank inputs
2. fill env
3. configure branding
4. configure masters
5. create users
6. test mail and OTP
7. run UAT
8. take backup
9. go live
10. monitor

