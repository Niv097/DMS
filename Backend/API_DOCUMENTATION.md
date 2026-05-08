# API Documentation

## 1. Overview

- Base backend URL: `http://localhost:5002`
- Frontend API base path: `/api`
- Frontend client file: [api.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Frontend/src/utils/api.js)
- Main backend bootstrap: [index.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/index.js)

In the frontend, all calls go through Axios:

```js
const api = axios.create({
  baseURL: '/api',
});
```

That means when frontend runs on `localhost:3001`, requests like:

- `api.get('/notes')`
- `api.post('/auth/login')`

become:

- `http://localhost:3001/api/notes`
- `http://localhost:3001/api/auth/login`

and Vite/proxy forwards them to backend `5002`.

## 2. Authentication Flow

### 2.1 How token is sent

Every request automatically attaches JWT from browser storage:

```js
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

So the request flow is:

1. user logs in
2. backend returns JWT token
3. frontend stores token in `localStorage`
4. later requests send `Authorization: Bearer <token>`
5. backend auth middleware verifies token

## 3. Route Groups

Current mounted route groups from [index.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/index.js):

- `/api/auth`
- `/api/notes`
- `/api/audit`
- `/api/admin`
- `/api/notifications`
- `/api/dashboard/stats`
- `/api/comments`
- `/api/users`
- `/api/departments`
- `/api/verticals`

## 4. Auth APIs

Source: [auth.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/auth.js)

### `POST /api/auth/login`

Purpose:
- login by username or email

Request body:

```json
{
  "identifier": "super.admin@bankdemo.com",
  "password": "Password@123"
}
```

Response:

```json
{
  "token": "<jwt>",
  "passwordChangeRequired": false,
  "tempPasswordHint": "secure temporary password",
  "user": {
    "id": 1,
    "user_id": "DMS-HO-USR-0001",
    "name": "Super Admin",
    "username": "super.admin",
    "email": "super.admin@bankdemo.com",
    "role": "SUPER_ADMIN",
    "department": "Operations",
    "vertical": "Retail",
    "tenant_id": 1,
    "tenant_name": "Default Demo Bank",
    "tenant_code": "DMS",
    "branch_id": 1,
    "branch_name": "Head Office",
    "branch_code": "HO",
    "is_active": true,
    "is_first_login": false,
    "accessible_branch_ids": []
  }
}
```

Important:
- returns `401` for invalid credentials
- returns `403` if account is inactive
- returns `passwordChangeRequired: true` for newly created or reset users

### `GET /api/auth/me`

Purpose:
- fetch current logged-in profile using JWT

Headers:
- `Authorization: Bearer <token>`

Response:

```json
{
  "user": {
    "...": "current user object"
  }
}
```

### `PUT /api/auth/me`

Purpose:
- update own profile details

Typical body:

```json
{
  "name": "Aditi Sharma",
  "email": "aditi.sharma@bankdemo.com",
  "username": "aditi.sharma"
}
```

Behavior:
- validates name and email
- checks duplicate email/username
- updates only current logged-in user

### `POST /api/auth/change-password`

Purpose:
- change password for current user

Request:

```json
{
  "current_password": "Password@123",
  "new_password": "NewPassword@123"
}
```

Behavior:
- if `is_first_login = true`, current password validation is relaxed for temp-password flow
- updates bcrypt hash
- sets `is_first_login = false`
- returns a refreshed token and updated user object

## 5. User, Department, Vertical APIs

Source: [index.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/index.js)

### `GET /api/users`

Purpose:
- get active users for workflow assignment

Roles allowed:
- `INITIATOR`
- `ADMIN`
- `SUPER_ADMIN`

Behavior:
- scoped by current user `tenant_id`
- further restricted by `branch_id` when applicable

### `GET /api/departments`

Purpose:
- returns department master list

Roles allowed:
- `INITIATOR`
- `RECOMMENDER`
- `APPROVER`
- `ADMIN`
- `AUDITOR`
- `SUPER_ADMIN`

### `GET /api/verticals`

Purpose:
- returns vertical master list

Roles allowed:
- `INITIATOR`
- `RECOMMENDER`
- `APPROVER`
- `ADMIN`
- `AUDITOR`
- `SUPER_ADMIN`

## 6. Dashboard APIs

Source:
- [index.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/index.js)
- notes controller

### `GET /api/dashboard/stats`

Purpose:
- returns dashboard summary counters

Typical use:
- total files
- pending approvals
- approved count
- rejected count

### `GET /api/notes/dashboard`

Purpose:
- richer dashboard listing/grouped data for current role context

### `GET /api/notes/active-approved`

Purpose:
- returns currently active approved note/version

## 7. Note APIs

Source: [notes.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/notes.js)

### `POST /api/notes`

Purpose:
- create a new note with one main file and optional supporting files

Roles allowed:
- `INITIATOR`

Upload fields:
- `main_note` max `1`
- `annexures` max `10`

Content type:
- `multipart/form-data`

Typical form fields:
- `subject`
- `note_type`
- `workflow_type`
- `department_id`
- `vertical_id`
- workflow assignee IDs
- comments/reason fields as applicable

Behavior:
- creates note record
- creates attachments
- creates workflow steps
- creates audit trail entries

### `POST /api/notes/scan`

Purpose:
- pre-scan uploaded file for OCR/normalization preview

Roles allowed:
- `INITIATOR`

Upload field:
- `file`

### `GET /api/notes`

Purpose:
- list notes visible to the current user

Roles allowed:
- `INITIATOR`
- `RECOMMENDER`
- `APPROVER`
- `ADMIN`
- `AUDITOR`
- `SUPER_ADMIN`

Typical filters:
- role-based queue filtering
- status filtering
- current view filtering

### `GET /api/notes/my-notes`

Purpose:
- list notes initiated by current initiator/admin context

### `GET /api/notes/:id`

Purpose:
- fetch note detail page data

Response generally includes:
- note master data
- workflow
- attachments
- comments
- version history
- audit data

### `POST /api/notes/:noteId/submit`

Purpose:
- submit a drafted note into workflow

### `POST /api/notes/:noteId/reupload`

Purpose:
- create a new version for an existing document group

Roles allowed:
- `INITIATOR`

Upload fields:
- `main_note`
- `annexures`

### `POST /api/notes/:noteId/action`

Purpose:
- workflow action endpoint for recommender/approver

Roles allowed:
- `RECOMMENDER`
- `APPROVER`

Typical actions handled:
- recommend
- approve
- reject
- return
- refer

### `GET /api/notes/:id/preview-pages`

Purpose:
- returns generated preview image pages for PDF rendering in UI

### `GET /api/notes/:id/generate-pdf`

Purpose:
- generates or returns approved artifact PDF

Behavior:
- approved document pages include watermark
- cover/summary page includes note details, comments, and audit timeline

## 8. Note Audit Export APIs

Source: [notes.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/notes.js)

### `GET /api/notes/:id/audit`

Purpose:
- get note-specific audit log for detail screen

### `GET /api/notes/:id/audit/export/excel`

Purpose:
- download note-specific audit report in Excel-friendly format

### `GET /api/notes/:id/audit/export/pdf`

Purpose:
- download note-specific audit PDF

### `DELETE /api/notes/:id/audit`

Purpose:
- admin-only demo cleanup of note audit log

Roles allowed:
- `ADMIN`
- `SUPER_ADMIN`

### `DELETE /api/notes/:id`

Purpose:
- admin-only demo cleanup of note/version and stored artifacts

Roles allowed:
- `ADMIN`
- `SUPER_ADMIN`

## 9. Global Audit APIs

Source: [audit.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/audit.js)

### `GET /api/audit`

Purpose:
- get audit logs globally for admin screens

Roles allowed:
- `ADMIN`
- `SUPER_ADMIN`

### `GET /api/audit/download/csv`

Purpose:
- download admin audit logs CSV

### `GET /api/audit/:noteId`

Purpose:
- get audit logs for one note from admin route

## 10. Admin APIs

Source:
- [admin.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/admin.js)

All routes are protected by:
- `auth`
- `authorize(['ADMIN', 'SUPER_ADMIN'])`

### `GET /api/admin/tenants`

Purpose:
- list banks/tenants

### `POST /api/admin/tenants`

Purpose:
- create a new bank tenant

Example:

```json
{
  "tenant_name": "HDFC Bank",
  "tenant_code": "HDFC"
}
```

### `GET /api/admin/branches`

Purpose:
- list branches

Can be filtered by tenant depending on controller logic.

### `POST /api/admin/branches`

Purpose:
- create branch under a tenant

Example:

```json
{
  "tenant_id": 2,
  "branch_name": "Ahmedabad",
  "branch_code": "AHD"
}
```

### `GET /api/admin/users`

Purpose:
- list managed users

### `POST /api/admin/users`

Purpose:
- create user from admin panel

Expected business fields:
- `name`
- `email`
- `username`
- `role`
- `tenant_id`
- `branch_id`
- `department_id`
- `vertical_id`

Behavior:
- creates temp password user
- sets first-login required
- assigns generated `user_id`

### `PUT /api/admin/users/:id`

Purpose:
- update managed user

### `POST /api/admin/users/:id/reset-password`

Purpose:
- admin reset password for another user

Behavior:
- resets password to temp password
- sets `is_first_login = true`

### `POST /api/admin/users/bulk-import`

Purpose:
- bulk import users from CSV uploaded from Excel

Content type:
- `multipart/form-data`

Upload field:
- `file`

## 11. Notification APIs

Source: [notifications.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/notifications.js)

### `GET /api/notifications`

Purpose:
- get current user notifications

### `POST /api/notifications/read-all`

Purpose:
- mark all notifications as read

### `POST /api/notifications/:id/read`

Purpose:
- mark one notification as read

### `GET /api/notifications/stream`

Purpose:
- real-time notification stream using SSE

Usage:
- browser opens stream and keeps connection alive
- backend pushes updates in real time

Important:
- this route uses token through querystring in current implementation:
  - `/api/notifications/stream?token=<jwt>`

## 12. Comments API

Source: [index.js](C:/Users/sapra/Downloads/DMS-main\DMS-main/Backend/src/index.js)

### `POST /api/comments`

Purpose:
- add a comment to a note/workflow thread

Roles allowed:
- `INITIATOR`
- `RECOMMENDER`
- `APPROVER`
- `ADMIN`
- `SUPER_ADMIN`

## 13. Request Lifecycle Example

### Example: Login and Dashboard Load

1. frontend calls:

```js
api.post('/auth/login', {
  identifier,
  password
})
```

2. backend checks:
- user exists
- password hash matches
- account is active

3. backend returns:
- token
- user profile
- first-login flag

4. frontend stores token in `localStorage`

5. dashboard page loads and calls:

```js
api.get('/notes')
api.get('/dashboard/stats')
api.get('/departments')
api.get('/verticals')
```

6. axios automatically sends bearer token

7. backend auth middleware verifies token

8. backend returns role-filtered and tenant/branch-filtered data

### Example: Create Note

1. frontend builds `FormData`
2. sends:

```js
api.post('/notes', formData)
```

3. backend:
- parses uploaded files
- stores file metadata
- creates note
- creates attachments
- creates workflow steps
- creates audit logs

4. response returns success and created note context

### Example: Real-Time Notification

1. user logs in and frontend has JWT
2. frontend opens:

```text
/api/notifications/stream?token=<jwt>
```

3. backend keeps SSE channel open
4. when note is recommended/approved/rejected, notification service creates event
5. frontend receives and updates alert count/dropdown instantly

## 14. Security Model

Security layers used in API:

- JWT authentication
- route-level role authorization
- tenant and branch filtering in queries
- bcrypt password hashing
- first-login password reset flow

Main auth middleware files:
- `Backend/src/middleware/auth.js`
- `Backend/src/middleware/rbac.js`

## 15. Current API Documentation Source Files

- [index.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/index.js)
- [auth.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/auth.js)
- [notes.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/notes.js)
- [admin.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/admin.js)
- [audit.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/audit.js)
- [notifications.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Backend/src/routes/notifications.js)
- [api.js](C:/Users/sapra/Downloads/DMS-main/DMS-main/Frontend/src/utils/api.js)
