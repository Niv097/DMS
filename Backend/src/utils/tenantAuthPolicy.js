export const isTenantCredentialDeliveryEnabled = (tenant = null) => Boolean(
  tenant?.credential_delivery_enabled === true
);

export const isTenantOtpLoginEnabled = (tenant = null) => Boolean(
  tenant?.otp_login_enabled === true
  && isTenantCredentialDeliveryEnabled(tenant)
);

export const buildTenantCredentialDeliverySummary = (tenant = null) => {
  if (isTenantCredentialDeliveryEnabled(tenant)) {
    return 'Credential automation is enabled for this bank.';
  }
  return 'Credential automation is disabled for this bank. Mobile and email are stored, but OTP, temporary-password delivery, and automated credential notifications stay off until super admin enables them.';
};
