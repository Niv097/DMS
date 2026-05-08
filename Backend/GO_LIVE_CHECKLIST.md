# DMS Delivery Execution Runbook - 10 Days

## Day 1 - Freeze and Secrets

1. Freeze code for UAT branch.
2. Generate UAT JWT secret:

```powershell
cd C:\dev\DMS-main\Backend
npm run generate:jwt-secret
```

3. Generate production JWT secret:

```powershell
cd C:\dev\DMS-main\Backend
node .\scripts\generate-jwt-secret.mjs
```

4. Create `Backend\.env.uat`:

```env
DATABASE_URL=postgresql://postgres:replace-with-uat-password@db-uat-host:5432/dms_uat
JWT_SECRET=replace-with-generated-uat-jwt-secret
PORT=5002
NODE_ENV=production
ENABLE_DEMO=false
ENFORCE_SECURE_AUTH=true
TRUST_PROXY=true
REQUIRE_HTTPS=true
STORAGE_ROOT=D:\bank-dms\uat\uploads
BACKUP_OUTPUT_ROOT=D:\bank-dms\uat\backups
CORS_ORIGIN=https://uat-dms.yourbank.com
JWT_EXPIRES_IN=8h
AUTH_COOKIE_NAME=dms_auth
AUTH_COOKIE_MAX_AGE_MS=28800000
COOKIE_SAME_SITE=strict
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
FAILED_LOGIN_WINDOW_MS=900000
FAILED_LOGIN_THRESHOLD=5
FAILED_LOGIN_LOCK_DURATION_MS=900000
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=240
CRITICAL_RATE_LIMIT_WINDOW_MS=60000
CRITICAL_RATE_LIMIT_MAX=30
SESSION_INACTIVITY_TIMEOUT_MS=1800000
SESSION_CLEANUP_INTERVAL_MS=600000
UPLOAD_MAX_FILE_SIZE_BYTES=26214400
ALLOWED_UPLOAD_MIME_TYPES=application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/tiff
ALLOWED_UPLOAD_EXTENSIONS=.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff
UPLOAD_SCAN_ENABLED=false
USE_WINDOWS_DEFENDER_SCAN=false
UPLOAD_SCAN_COMMAND=
UPLOAD_SCAN_TIMEOUT_MS=120000
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SPECIAL=true
LOG_RETENTION_DAYS=180
```

5. Create `Backend\.env.production`:

```env
DATABASE_URL=postgresql://postgres:replace-with-production-password@db-prod-host:5432/dms_prod
JWT_SECRET=replace-with-generated-production-jwt-secret
PORT=5002
NODE_ENV=production
ENABLE_DEMO=false
ENFORCE_SECURE_AUTH=true
TRUST_PROXY=true
REQUIRE_HTTPS=true
STORAGE_ROOT=E:\bank-dms\prod\uploads
BACKUP_OUTPUT_ROOT=E:\bank-dms\prod\backups
CORS_ORIGIN=https://dms.yourbank.com
JWT_EXPIRES_IN=8h
AUTH_COOKIE_NAME=dms_auth
AUTH_COOKIE_MAX_AGE_MS=28800000
COOKIE_SAME_SITE=strict
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=10
FAILED_LOGIN_WINDOW_MS=900000
FAILED_LOGIN_THRESHOLD=5
FAILED_LOGIN_LOCK_DURATION_MS=900000
API_RATE_LIMIT_WINDOW_MS=60000
API_RATE_LIMIT_MAX=240
CRITICAL_RATE_LIMIT_WINDOW_MS=60000
CRITICAL_RATE_LIMIT_MAX=30
SESSION_INACTIVITY_TIMEOUT_MS=1800000
SESSION_CLEANUP_INTERVAL_MS=600000
UPLOAD_MAX_FILE_SIZE_BYTES=26214400
ALLOWED_UPLOAD_MIME_TYPES=application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/tiff
ALLOWED_UPLOAD_EXTENSIONS=.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff
UPLOAD_SCAN_ENABLED=true
USE_WINDOWS_DEFENDER_SCAN=false
UPLOAD_SCAN_COMMAND=
UPLOAD_SCAN_TIMEOUT_MS=120000
PASSWORD_MIN_LENGTH=10
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_DIGIT=true
PASSWORD_REQUIRE_SPECIAL=true
LOG_RETENTION_DAYS=365
```

6. Create `Frontend\.env.uat`:

```env
VITE_ENABLE_DEMO=false
```

7. Create `Frontend\.env.production`:

```env
VITE_ENABLE_DEMO=false
```

## Day 2 - Server Folder Setup

1. Create Linux deployment folders:

```bash
sudo mkdir -p /opt/dms/releases
sudo mkdir -p /opt/dms/shared/backend
sudo mkdir -p /opt/dms/shared/uploads
sudo mkdir -p /opt/dms/shared/backups/db
sudo mkdir -p /opt/dms/shared/backups/storage
sudo mkdir -p /opt/dms/shared/logs
sudo mkdir -p /var/www/dms/current
sudo chown -R $USER:$USER /opt/dms /var/www/dms
```

2. Target deployment structure:

```text
/opt/dms/
  releases/
    2026-04-21-uat/
    2026-04-30-prod/
  shared/
    backend/
      .env
    uploads/
    backups/
      db/
      storage/
    logs/
/var/www/dms/
  current/
```

3. Create upload and backup paths:

```bash
sudo mkdir -p /opt/dms/shared/uploads
sudo mkdir -p /opt/dms/shared/backups/db
sudo mkdir -p /opt/dms/shared/backups/storage
sudo chmod 750 /opt/dms/shared/uploads
sudo chmod 750 /opt/dms/shared/backups
sudo chown -R www-data:www-data /opt/dms/shared/uploads
```

4. Windows deployment path option:

```powershell
New-Item -ItemType Directory -Force -Path D:\bank-dms\uat\uploads
New-Item -ItemType Directory -Force -Path D:\bank-dms\uat\backups
New-Item -ItemType Directory -Force -Path E:\bank-dms\prod\uploads
New-Item -ItemType Directory -Force -Path E:\bank-dms\prod\backups
```

## Day 3 - UAT Database Rollout

1. Set UAT env file as live backend env:

```powershell
Copy-Item C:\dev\DMS-main\Backend\.env.uat C:\dev\DMS-main\Backend\.env -Force
```

2. Backup UAT database:

```powershell
cd C:\dev\DMS-main\Backend
npm run backup:db
```

3. Direct PostgreSQL backup command:

```powershell
pg_dump -Fc -d "postgresql://postgres:replace-with-uat-password@db-uat-host:5432/dms_uat" -f "D:\bank-dms\uat\backups\dms_uat_pre_uat.dump"
```

4. Validate and generate Prisma client:

```powershell
cd C:\dev\DMS-main\Backend
npm install
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
```

5. Apply Prisma migration:

```powershell
cd C:\dev\DMS-main\Backend
npm run prisma:migrate:deploy
```

6. If existing DB is not under Prisma migration history, execute only the pending SQL manually:

```powershell
cd C:\dev\DMS-main\Backend
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260420193000_auth_persistence_hardening/migration.sql
```

7. Restore UAT DB if migration fails:

```powershell
cd C:\dev\DMS-main\Backend
npm run restore:db -- -BackupFile "D:\bank-dms\uat\backups\dms_uat_pre_uat.dump"
```

## Day 4 - UAT Deployment

1. Backend deployment:

```powershell
cd C:\dev\DMS-main\Backend
npm install
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
npm run preflight:prod
pm2 delete dms-backend
pm2 start src/index.js --name dms-backend
pm2 save
```

2. Frontend deployment:

```powershell
cd C:\dev\DMS-main\Frontend
npm install
npm run build
```

3. Copy frontend build to web root:

```bash
rsync -av --delete /opt/dms/releases/2026-04-21-uat/Frontend/dist/ /var/www/dms/current/
```

4. Copy backend env to server:

```bash
cp /opt/dms/releases/2026-04-21-uat/Backend/.env.uat /opt/dms/shared/backend/.env
```

## Day 5 - Nginx and SSL

1. Create Nginx config `/etc/nginx/sites-available/dms.conf`:

```nginx
server {
    listen 80;
    server_name dms.yourbank.com uat-dms.yourbank.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name dms.yourbank.com;

    ssl_certificate /etc/letsencrypt/live/dms.yourbank.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dms.yourbank.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/dms/current;
    index index.html;
    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:5002/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:5002/api/notifications/stream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    location / {
        try_files $uri /index.html;
    }
}

server {
    listen 443 ssl http2;
    server_name uat-dms.yourbank.com;

    ssl_certificate /etc/letsencrypt/live/uat-dms.yourbank.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/uat-dms.yourbank.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:10m;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    root /var/www/dms/current;
    index index.html;
    client_max_body_size 25m;

    location /api/ {
        proxy_pass http://127.0.0.1:5002/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /api/notifications/stream {
        proxy_pass http://127.0.0.1:5002/api/notifications/stream;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header Connection "";
        proxy_buffering off;
        chunked_transfer_encoding off;
    }

    location / {
        try_files $uri /index.html;
    }
}
```

2. Enable Nginx config:

```bash
sudo ln -sf /etc/nginx/sites-available/dms.conf /etc/nginx/sites-enabled/dms.conf
sudo nginx -t
sudo systemctl reload nginx
```

3. Certbot SSL:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d dms.yourbank.com -d uat-dms.yourbank.com --redirect --agree-tos -m admin@yourbank.com
```

4. Verify HTTPS:

```bash
curl -I http://dms.yourbank.com
curl -I https://dms.yourbank.com
curl -I https://uat-dms.yourbank.com
```

## Day 6 - UAT Execution

### Login Test

Steps:
1. Open `https://uat-dms.yourbank.com`
2. Log in as uploader
3. Log out
4. Enter wrong password 5 times
5. Enter correct password

Expected result:
1. Valid login succeeds
2. Logout succeeds
3. Wrong password returns `Invalid username or password`
4. Repeated failures return `Multiple failed attempts detected`
5. Correct password succeeds and clears failed-attempt state

### Workflow Test - Upload to Approve

Steps:
1. Log in as uploader
2. Upload one PDF
3. Submit workflow
4. Log in as recommender
5. Open queue
6. Recommend file
7. Log in as approver
8. Open queue
9. Approve file

Expected result:
1. File is created
2. Recommender can see assigned file
3. Approver can see recommended file
4. Final status is `FINAL_APPROVED`
5. Active approved file card updates

### Versioning Test

Steps:
1. Open one existing file
2. Create next version
3. Upload replacement document
4. Submit version

Expected result:
1. New version number increments by 1
2. Previous version remains visible in history
3. Latest version is marked active

### Audit Log Test

Steps:
1. Perform login
2. Upload one file
3. Recommend file
4. Approve file
5. Open audit logs

Expected result:
1. Login events exist
2. Upload event exists
3. Workflow action events exist
4. Approve event exists
5. Audit screen loads without error

### Role Restriction Test

Steps:
1. Log in as uploader
2. Try opening admin URL directly
3. Log in as recommender
4. Try opening upload page directly
5. Log in as approver
6. Try opening admin URL directly

Expected result:
1. Uploader cannot access admin pages
2. Recommender cannot access upload page
3. Approver cannot access admin pages
4. User is redirected to allowed screens

### Session Timeout Test

Steps:
1. Log in
2. Leave session idle for 30 minutes
3. Refresh page

Expected result:
1. Session expires
2. User is redirected to login
3. Login works again with correct password

## Day 7 - UAT Closure

1. Record defects.
2. Fix defects.
3. Rebuild frontend:

```powershell
cd C:\dev\DMS-main\Frontend
npm install
npm run build
```

4. Restart backend:

```powershell
cd C:\dev\DMS-main\Backend
pm2 restart dms-backend
```

5. Re-run all UAT tests.
6. Obtain written UAT sign-off.

## Day 8 - Production Pre-Go-Live

1. Set production backend env:

```powershell
Copy-Item C:\dev\DMS-main\Backend\.env.production C:\dev\DMS-main\Backend\.env -Force
```

2. Install dependencies:

```powershell
cd C:\dev\DMS-main\Backend
npm install
cd C:\dev\DMS-main\Frontend
npm install
```

3. Production DB backup:

```powershell
cd C:\dev\DMS-main\Backend
npm run backup:db
```

4. Production storage backup:

```powershell
cd C:\dev\DMS-main\Backend
npm run backup:storage
```

5. Production preflight:

```powershell
cd C:\dev\DMS-main\Backend
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
npm run preflight:prod
```

## Day 9 - Production Deployment

1. Apply DB migration:

```powershell
cd C:\dev\DMS-main\Backend
npm run prisma:migrate:deploy
```

2. If required, run additive SQL manually:

```powershell
cd C:\dev\DMS-main\Backend
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260420193000_auth_persistence_hardening/migration.sql
```

3. Start backend with PM2:

```powershell
cd C:\dev\DMS-main\Backend
pm2 delete dms-backend
pm2 start src/index.js --name dms-backend
pm2 save
```

4. Build frontend:

```powershell
cd C:\dev\DMS-main\Frontend
npm run build
```

5. Publish frontend:

```bash
rsync -av --delete /opt/dms/releases/2026-04-30-prod/Frontend/dist/ /var/www/dms/current/
sudo systemctl reload nginx
```

6. Verify backend is bound only on internal port:

```bash
ss -ltnp | grep 5002
sudo ufw deny 5002
```

## Day 10 - Go Live and Validation

### Go-Live Sequence

1. Confirm business freeze start.
2. Run production DB backup.
3. Run production storage backup.
4. Confirm `.env` files in place.
5. Confirm SSL valid.
6. Apply DB migration.
7. Start backend in PM2.
8. Deploy frontend `dist`.
9. Reload Nginx.
10. Open production access.

### Post-Deployment Validation

Run immediately:

```bash
curl -I https://dms.yourbank.com
curl -I https://dms.yourbank.com/api/auth/me
pm2 status
pm2 logs dms-backend --lines 100
sudo nginx -t
sudo systemctl status nginx
```

Application validation:
1. Login as uploader.
2. Open dashboard.
3. Upload one file.
4. Recommend as recommender.
5. Approve as approver.
6. Open audit logs.
7. Download approved file.
8. Confirm notifications load.

Expected result:
1. HTTPS only
2. Login succeeds
3. Role-based screens open
4. Workflow succeeds end to end
5. Audit logs visible
6. Approved artifact available

## Failure and Rollback

### If backend start fails

```powershell
pm2 logs dms-backend --lines 200
pm2 delete dms-backend
Copy-Item C:\deploy\previous\Backend\.env C:\deploy\current\Backend\.env -Force
cd C:\deploy\previous\Backend
pm2 start src/index.js --name dms-backend
pm2 save
```

### If frontend deployment fails

```bash
rsync -av --delete /var/www/dms/previous/ /var/www/dms/current/
sudo systemctl reload nginx
```

### If DB migration fails

```powershell
cd C:\dev\DMS-main\Backend
npm run restore:db -- -BackupFile "E:\bank-dms\prod\backups\dms_prod_pre_go_live.dump"
```

### Direct DB restore

```powershell
pg_restore --clean --if-exists -d "postgresql://postgres:replace-with-production-password@db-prod-host:5432/dms_prod" "E:\bank-dms\prod\backups\dms_prod_pre_go_live.dump"
```

### Full service rollback

1. Stop backend.
2. Restore previous backend release.
3. Restore previous frontend build.
4. Restore production DB backup.
5. Reload Nginx.
6. Start backend.
7. Validate login and dashboard.

Commands:

```powershell
pm2 delete dms-backend
```

```bash
rsync -av --delete /opt/dms/releases/previous/Frontend/dist/ /var/www/dms/current/
sudo systemctl reload nginx
```

```powershell
cd C:\dev\DMS-main\Backend
npm run restore:db -- -BackupFile "E:\bank-dms\prod\backups\dms_prod_pre_go_live.dump"
pm2 start src/index.js --name dms-backend
pm2 save
```

## Final Release Commands

### Backend

```powershell
cd C:\dev\DMS-main\Backend
npm install
npm run prisma:schema:sync
npm run prisma:validate
npm run prisma:generate
npm run preflight:prod
npm run prisma:migrate:deploy
pm2 start src/index.js --name dms-backend
pm2 save
```

### Frontend

```powershell
cd C:\dev\DMS-main\Frontend
npm install
npm run build
```

### Frontend Publish

```bash
rsync -av --delete Frontend/dist/ /var/www/dms/current/
sudo systemctl reload nginx
```
