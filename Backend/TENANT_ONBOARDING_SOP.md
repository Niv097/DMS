# Tenant Onboarding SOP

## 1. Purpose

Use this process when onboarding a new bank such as:

- HDFC Bank
- SBI
- ICICI

No code change or redeployment should be required for normal onboarding.

## 2. Onboarding Inputs

Collect:

- bank name
- bank code
- branch names and branch codes
- bank admin details
- uploader/recommender/approver details
- department and vertical mapping

## 3. Onboarding Steps

### Step 1: Super Admin Login

Login using super admin account.

### Step 2: Create Tenant

Create:

- `tenant_name`
- `tenant_code`

Example:

- `tenant_name = HDFC Bank`
- `tenant_code = HDFC`

### Step 3: Create Branch

Create branch under tenant.

Example:

- `branch_name = Ahmedabad`
- `branch_code = AHD`

### Step 4: Create Bank Users

Create:

- bank admin
- uploader
- recommender
- approver
- optional auditor

### Step 5: First Login Activation

Each new user:

- receives temporary password
- logs in first time
- changes password
- proceeds to dashboard

### Step 6: UAT with Bank

Run one full note workflow for that tenant/branch.

## 4. Validation Checks

- tenant appears in admin listing
- branch appears under correct tenant
- users map to correct tenant and branch
- users cannot see other banks
- workflow works only inside allowed bank/branch scope

## 5. Post-Onboarding Signoff

Take signoff from:

- implementation team
- client admin
- business/project owner
