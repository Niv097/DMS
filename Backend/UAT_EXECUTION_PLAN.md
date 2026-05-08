# UAT Execution Plan

## 1. Purpose

Run controlled UAT for a banking client before production go-live.

## 2. UAT Participants

Assign one named tester for each role:

- SUPER_ADMIN
- ADMIN
- INITIATOR / UPLOADER
- RECOMMENDER
- APPROVER
- AUDITOR

Also assign:

- implementation coordinator
- issue tracker owner
- business stakeholder

## 3. Test Data Setup

Create one tenant and at least one branch for UAT.

Create UAT users for:

- super admin
- bank admin
- uploader
- recommender
- approver
- auditor

Prepare at least:

- one main PDF
- one supporting file
- one replacement version file

## 4. Execution Flow

### Step 1: Authentication and Session

Validate:

- first login password change
- normal login
- logout
- invalid/expired session behavior

### Step 2: Role Access

Validate each tester sees only the allowed menus, actions, and files.

### Step 3: Workflow Scenario

Execute one full happy-path flow:

1. uploader logs in
2. uploader creates note with main and supporting files
3. uploader submits to recommender and approver
4. recommender reviews and recommends
5. approver final approves
6. approved artifact is downloaded
7. audit export is downloaded

### Step 4: Rejection and Versioning Scenario

Execute one rejection/rework flow:

1. uploader creates note
2. recommender rejects
3. uploader reuploads new version
4. recommender recommends
5. approver approves
6. verify previous version is superseded/archived correctly

### Step 5: Isolation Scenario

Validate:

- tenant isolation
- branch isolation
- multi-branch access only where configured

### Step 6: Operational Scenario

Validate:

- file upload and retrieval
- audit exports
- notifications
- production-disabled demo access

## 5. Issue Handling

For every issue found:

- capture role
- capture steps to reproduce
- capture expected result
- capture actual result
- assign owner
- retest after fix

## 6. Signoff

UAT completes only after:

- all critical defects are closed
- all major defects are accepted or resolved
- role-wise signoff is recorded
- business stakeholder approves production move
