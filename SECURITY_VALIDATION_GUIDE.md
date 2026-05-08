# Security Validation Guide

This guide is intended for UAT validation and audit evidence collection. It does not change UI, business logic, or user workflows.

## 1. Static Analysis with CodeQL

Workflow:
- `.github/workflows/codeql.yml`

Triggers:
- `push`
- `pull_request`
- weekly scheduled run
- manual dispatch

What it covers:
- JavaScript and TypeScript code scanning
- insecure patterns, data flow issues, unsafe handling, and code-smell style findings surfaced by GitHub CodeQL

How to review results in GitHub:
1. Open the repository in GitHub.
2. Go to `Security`.
3. Open `Code scanning alerts`.
4. Filter by severity `High` and `Medium`.
5. Export or screenshot the result set for audit evidence.

Expected evidence:
- successful CodeQL workflow run
- zero unaccepted high-severity alerts before production signoff

## 2. Dynamic Analysis with OWASP ZAP

Workflow:
- `.github/workflows/zap-baseline.yml`

GitHub workflow usage:
1. Open `Actions` in GitHub.
2. Run `OWASP ZAP Baseline`.
3. Set `target_url` to the UAT URL, for example `https://uat.dms.yourbank.com`.
4. Download the uploaded HTML and JSON artifacts after completion.

Local ZAP run against frontend on `http://localhost:3001`:

If ZAP is installed locally:

```powershell
zap-baseline.py -t http://localhost:3001 -r zap-local-report.html -J zap-local-report.json
```

If running ZAP through Docker on Windows or macOS:

```powershell
docker run --rm -v "${PWD}:/zap/wrk/:rw" owasp/zap2docker-stable zap-baseline.py -t http://host.docker.internal:3001 -r zap-local-report.html -J zap-local-report.json
```

Review these common passive findings in the report:
- XSS-related reflections and suspicious patterns
- missing security headers
- missing cookie flags
- open or anonymously accessible endpoints

Expected evidence:
- generated `html` report
- generated `json` report
- issue review notes for all medium or higher alerts

## 3. Dependency Security

Local commands:

```powershell
cd Backend
npm run security:check
```

```powershell
cd Frontend
npm run security:check
```

Current CI behavior:
- runs `npm audit --production --audit-level=high`
- uploads JSON audit reports as artifacts
- fails the job if high production vulnerabilities are present

Safe remediation path:
1. Run `npm audit fix --omit=dev`.
2. If still vulnerable, upgrade the affected package to the lowest patched version.
3. Re-run `npm run security:check`.
4. Rebuild frontend and rerun backend import checks.

## 4. Security Headers Validation

Backend implementation:
- Helmet and CSP: `Backend/src/index.js`
- reverse-proxy transport headers: `Backend/nginx/dms.conf.example`

PowerShell verification command:

```powershell
curl.exe -I https://uat.dms.yourbank.com/
```

Local verification command:

```powershell
curl.exe -I http://localhost:5002/
```

Verify these headers are present:
- `content-security-policy`
- `x-frame-options`
- `x-content-type-options`
- `referrer-policy`

Production proxy should also return:
- `strict-transport-security`

## 5. Auth and Session Validation

Implementation evidence:
- cookie options: `Backend/src/utils/authToken.js`
- env defaults and production secure-mode rules: `Backend/src/config/env.js`
- session timeout and forced invalidation: `Backend/src/utils/sessionStore.js`
- forced logout on expired or invalid session: `Backend/src/middleware/auth.js`

Manual checks:
1. Sign in and confirm auth cookie is `HttpOnly`.
2. In production, confirm auth cookie is `Secure`.
3. Confirm `SameSite` is present on auth and CSRF cookies.
4. Stay idle beyond `SESSION_INACTIVITY_TIMEOUT_MS`.
5. Call an authenticated API or refresh the page.
6. Verify the server returns `401` with session timeout or expired-session response.
7. Verify the app redirects the user back to sign-in on next protected request.

## 6. Access Control Test Cases

Manual test cases:

| Test ID | Scenario | Expected Result |
| ------- | -------- | --------------- |
| AC-01 | Sign in as `UPLOADER` or `INITIATOR` and attempt approval endpoint or approval UI action | Request blocked; API returns `403` |
| AC-02 | Sign in as user from tenant A and request tenant B data by changing query or path parameter | Request blocked; API returns `403 Tenant access denied.` |
| AC-03 | Remove auth cookie or bearer token and call protected endpoint | API returns `401` |
| AC-04 | Use valid login but insufficient role for admin route | API returns `403 Forbidden: Insufficient permissions` |

Helpful API examples:

```powershell
curl.exe -i http://localhost:5002/api/admin/users
```

```powershell
curl.exe -i -H "Authorization: Bearer invalid" http://localhost:5002/api/admin/users
```

## 7. File Upload Security Tests

Implementation evidence:
- extension and MIME gate: `Backend/src/middleware/upload.js`
- file-signature validation and optional AV scan hook: `Backend/src/services/fileSecurityService.js`

Manual test cases:

| Test ID | File | Expected Result |
| ------- | ---- | --------------- |
| FU-01 | Upload a `.exe` renamed to `.pdf` | rejected |
| FU-02 | Upload a plain-text file renamed to `.png` | rejected |
| FU-03 | Upload file larger than `UPLOAD_MAX_FILE_SIZE_BYTES` | blocked by multer file-size limit |
| FU-04 | Upload valid PDF or approved image type | accepted |

Suggested local commands:

```powershell
curl.exe -i -F "file=@C:\temp\fake.pdf;type=application/pdf" http://localhost:5002/api/notes
```

```powershell
curl.exe -i -F "file=@C:\temp\large.pdf;type=application/pdf" http://localhost:5002/api/notes
```

## 8. Infrastructure Security Checklist

Reverse-proxy reference:
- `Backend/nginx/dms.conf.example`

Checklist:
- HTTPS enabled end to end
- valid TLS certificate installed
- backend bound to private interface or localhost only
- reverse proxy terminates TLS and forwards `X-Forwarded-Proto`
- firewall allows only `443` and approved admin paths
- backend port `5002` is not public on the internet
- storage path permissions restricted to service account
- log directory protected from general user access

## 9. Logging and Monitoring Validation

Implementation evidence:
- app logging: `Backend/src/utils/logger.js`
- security audit logging: `Backend/src/utils/securityAudit.js`
- login, password reset, and admin action events: `Backend/src/routes/auth.js`, `Backend/src/controllers/admin.js`

Manual validation:
1. Attempt failed login.
2. Perform successful login.
3. Trigger admin password reset.
4. Review `Backend/logs/security-audit.log`.
5. Confirm events exist for login failure, login success, and admin reset.
6. Confirm plaintext passwords, JWT values, and temporary passwords are not written to logs.

Helpful command:

```powershell
rg -n "LOGIN_|ADMIN_RESET_PASSWORD|PASSWORD_CHANGED|SELF_SERVICE_PASSWORD_RESET" Backend/logs/security-audit.log
```

## 10. Audit Evidence Package

Collect these for UAT or audit:
- CodeQL workflow result screenshot or exported alert list
- ZAP HTML and JSON reports
- dependency audit artifacts from GitHub Actions
- curl header verification output
- access-control test evidence
- file-upload rejection evidence
- infrastructure checklist signoff
- `OWASP_TOP10_REPORT.md`
- `SECURITY_TEST_REPORT.md`
