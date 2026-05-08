import { z } from 'zod';

const optionalNumericId = z.union([z.string(), z.number()]).transform((value) => {
  if (value === '' || value == null) return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) ? parsed : null;
}).nullable().optional();

const optionalAutoCode = z.string().trim().optional().transform((value) => {
  if (!value) return undefined;
  return value;
});

const optionalBackupFrequency = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional();
const optionalBackupWindowHour = z.coerce.number().int().min(0, 'Backup hour must be between 0 and 23.').max(23, 'Backup hour must be between 0 and 23.').optional();
const optionalBackupWindowMinute = z.coerce.number().int().min(0, 'Backup minute must be between 0 and 59.').max(59, 'Backup minute must be between 0 and 59.').optional();
const optionalEmailField = z.string().trim().optional().refine((value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
  message: 'Enter a valid email address.'
});
const optionalDeploymentMode = z.enum(['SHARED', 'DEDICATED']).optional();
const optionalSupportAccessMode = z.enum(['REMOTE_API', 'ANYDESK', 'VPN', 'BANK_ESCALATION']).optional();
const optionalDateField = z.string().trim().optional().refine((value) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value), {
  message: 'Date must be YYYY-MM-DD.'
});
const optionalMobileNumberField = z.string().trim().optional().refine((value) => !value || /^\+?[0-9()\-\s]{10,20}$/.test(value), {
  message: 'Enter a valid mobile number.'
});
const optionalDeliveryMode = z.enum(['EMAIL', 'MOBILE', 'BOTH']).optional();

export const createTenantSchema = z.object({
  tenant_name: z.string().trim().min(2, 'Tenant name is required.'),
  tenant_code: z.string().trim().min(2, 'Tenant code is required.'),
  deployment_host: z.string().trim().max(255, 'Login domain is too long.').optional(),
  deployment_mode: optionalDeploymentMode,
  support_base_url: z.string().trim().max(255, 'Support API base URL is too long.').optional(),
  support_access_mode: optionalSupportAccessMode,
  support_login_username: z.string().trim().max(120, 'Support login username is too long.').optional(),
  support_contact_name: z.string().trim().max(160, 'Support contact name is too long.').optional(),
  support_contact_email: optionalEmailField,
  support_contact_phone: z.string().trim().max(40, 'Support contact phone is too long.').optional(),
  license_plan: z.string().trim().max(120, 'License plan is too long.').optional(),
  license_valid_until: optionalDateField,
  brand_display_name: z.string().trim().max(160, 'Visible bank name is too long.').optional(),
  brand_short_code: z.string().trim().max(32, 'Short code is too long.').optional(),
  brand_subtitle: z.string().trim().max(160, 'Subtitle is too long.').optional(),
  brand_watermark_text: z.string().trim().max(160, 'Watermark is too long.').optional(),
  email_from_name: z.string().trim().max(160, 'Sender name is too long.').optional(),
  email_from_address: optionalEmailField,
  email_reply_to: optionalEmailField,
  cross_branch_append_enabled: z.boolean().optional(),
  backup_policy_enabled: z.boolean().optional(),
  backup_frequency: optionalBackupFrequency,
  backup_retention_days: z.coerce.number().int().min(7, 'Retention must be at least 7 days.').max(365, 'Retention cannot exceed 365 days.').optional(),
  backup_window_hour: optionalBackupWindowHour,
  backup_window_minute: optionalBackupWindowMinute,
  vendor_mirror_enabled: z.boolean().optional()
});

export const updateTenantBackupPolicySchema = z.object({
  backup_policy_enabled: z.boolean().optional(),
  backup_frequency: optionalBackupFrequency,
  backup_retention_days: z.coerce.number().int().min(7, 'Retention must be at least 7 days.').max(365, 'Retention cannot exceed 365 days.').optional(),
  backup_window_hour: optionalBackupWindowHour,
  backup_window_minute: optionalBackupWindowMinute,
  vendor_mirror_enabled: z.boolean().optional()
});

export const updateTenantAuthPolicySchema = z.object({
  credential_delivery_enabled: z.boolean().optional(),
  otp_login_enabled: z.boolean().optional()
});

export const createBranchSchema = z.object({
  tenant_id: optionalNumericId,
  city_id: optionalNumericId,
  branch_name: z.string().trim().min(2, 'Branch name is required.'),
  branch_code: optionalAutoCode,
  branch_address: z.string().trim().max(255, 'Branch address is too long.').optional()
});

export const createCitySchema = z.object({
  tenant_id: optionalNumericId,
  city_name: z.string().trim().min(2, 'City name is required.'),
  city_code: optionalAutoCode,
  state_name: z.string().trim().max(120, 'State name is too long.').optional(),
  state_code: z.string().trim().max(16, 'State code is too long.').optional()
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name is required.'),
  email: optionalEmailField,
  username: z.string().trim().min(3, 'Username is required.').optional(),
  employee_id: z.string().trim().min(2, 'Employee ID is required.').max(64, 'Employee ID is too long.'),
  mobile_number: optionalMobileNumberField,
  credential_delivery_mode: optionalDeliveryMode,
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD.'),
  role: z.string().trim().min(1, 'Role is required.'),
  tenant_id: optionalNumericId,
  branch_id: optionalNumericId,
  department_id: optionalNumericId,
  vertical_id: optionalNumericId,
  accessible_branch_ids: z.array(z.union([z.string(), z.number()])).optional(),
  fms_enabled: z.boolean().optional(),
  fms_permissions: z.array(z.string().trim().min(1)).optional(),
  fms_owned_department_id: optionalNumericId,
  override_department_assignment: z.boolean().optional()
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z.string().trim().email('Valid email is required.').optional(),
  username: z.string().trim().min(3).optional(),
  employee_id: z.string().trim().min(2).max(64).optional(),
  mobile_number: optionalMobileNumberField,
  credential_delivery_mode: optionalDeliveryMode,
  date_of_birth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD.').optional(),
  role: z.string().trim().min(1).optional(),
  is_active: z.boolean().optional(),
  branch_id: optionalNumericId,
  department_id: optionalNumericId,
  vertical_id: optionalNumericId,
  accessible_branch_ids: z.array(z.union([z.string(), z.number()])).optional(),
  fms_enabled: z.boolean().optional(),
  fms_permissions: z.array(z.string().trim().min(1)).optional(),
  fms_owned_department_id: optionalNumericId,
  override_department_assignment: z.boolean().optional()
});

export const userIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Valid user id is required.')
});

export const tenantIdParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'Valid tenant id is required.')
});
