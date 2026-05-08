import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import PasswordField from '../components/PasswordField';

const trimEdgeWhitespace = (value) => String(value ?? '').replace(/\u00A0/g, ' ').trim();
const trimPasswordEdges = (value) => String(value ?? '').replace(/\u00A0/g, ' ').replace(/^\s+|\s+$/g, '');
const injectSanitizedPaste = (event, sanitizer) => {
  const text = sanitizer(event.clipboardData?.getData('text') || '');
  event.preventDefault();
  const target = event.target;
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? target.value.length;
  target.setRangeText(text, start, end, 'end');
  target.dispatchEvent(new Event('input', { bubbles: true }));
};

const FirstLogin = () => {
  const navigate = useNavigate();
  const { user, authContext, changePassword, logout } = useAuth();
  const { branding } = useBranding();
  const { brandName } = branding;
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [capsLockDetected, setCapsLockDetected] = useState(false);
  const passwordConfirmationStarted = Boolean(confirmPassword);
  const passwordConfirmationMatches = passwordConfirmationStarted && newPassword === confirmPassword;
  const passwordConfirmationMismatch = passwordConfirmationStarted && Boolean(newPassword) && newPassword !== confirmPassword;
  const isFreshActivation = Boolean(user?.is_first_login);
  const isOtpRecovery = Boolean(authContext?.recoveryMode && !isFreshActivation);
  const canUseOtpRecovery = Boolean(user?.tenant_otp_login_enabled && user?.tenant_credential_delivery_enabled);
  const pageTitle = isFreshActivation ? 'First-Time Password Change' : 'Password Reset Required';
  const pageSubtitle = isFreshActivation ? 'Welcome, ' + (user?.name || 'User') : 'Hello, ' + (user?.name || 'User');
  const introCopy = isFreshActivation
    ? 'This is your first authenticated session. Please replace the temporary password issued by the administrator before continuing into the system.'
    : isOtpRecovery
      ? 'You signed in through OTP recovery. For bank-grade security, you must create a new password before you can continue.'
      : 'Your password was reset by an administrator. Use the temporary password shared through a secure channel, then set a new one immediately.';

  const handleSignOut = () => {
    setMessage('');
    logout();
    navigate('/login', { replace: true });
  };

  const handleOtpRecovery = () => {
    setMessage('');
    logout();
    navigate('/login/otp', {
      replace: true,
      state: {
        recoveryHint: {
          identifier: user?.email || user?.username || ''
        },
        identifier: user?.email || user?.username || '',
        autoRequestOtp: Boolean(user?.email || user?.username)
      }
    });
  };

  const handleSelfServiceReset = () => {
    setMessage('');
    logout();
    navigate('/forgot-password', {
      replace: true,
      state: {
        identifier: user?.email || user?.username || '',
        employee_id: user?.employee_id || '',
        date_of_birth: user?.date_of_birth || ''
      }
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');

    if (newPassword.length < 8) {
      setMessage('New password must be at least 8 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Password confirmation does not match.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        new_password: trimPasswordEdges(newPassword)
      };
      if (!isOtpRecovery) {
        payload.current_password = trimPasswordEdges(currentPassword) || undefined;
      }

      await changePassword(payload);
      navigate('/dashboard');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="first-login-shell">
      <div className="first-login-panel">
        <div className="first-login-side">
          <div className="first-login-side-inner">
            <div className="first-login-kicker">{isFreshActivation ? 'Secure Access Setup' : 'Secure Password Reset'}</div>
            <h1>{brandName} Credential Activation</h1>
            <p>{introCopy}</p>

            <div className="first-login-info-grid">
              <div className="first-login-info-card">
                <span className="label">User</span>
                <strong>{user?.name || 'User'}</strong>
              </div>
              <div className="first-login-info-card">
                <span className="label">Role</span>
                <strong>{user?.role || 'Assigned User'}</strong>
              </div>
              <div className="first-login-info-card">
                <span className="label">Email</span>
                <strong>{user?.email || 'Not available'}</strong>
              </div>
              <div className="first-login-info-card">
                <span className="label">Access Rule</span>
                <strong>Password update required</strong>
              </div>
            </div>

            <div className="first-login-guidance">
              <div>
                {isOtpRecovery
                  ? 'OTP verification proved your identity for this recovery session.'
                  : isFreshActivation
                    ? 'Use the temporary password provided by the administrator.'
                    : 'Use the temporary password shared through a secure channel.'}
              </div>
              <div>Choose a new password with at least 8 characters.</div>
              <div>You will be redirected to the dashboard after successful update.</div>
            </div>

            {!isOtpRecovery && (
              <div className="first-login-recovery-card">
                <strong>Temporary password unavailable?</strong>
                <p>Do not try to guess it. Use one of the controlled recovery options below.</p>
                <div className="first-login-recovery-actions">
                  {canUseOtpRecovery ? (
                    <button type="button" className="btn btn-outline" onClick={handleOtpRecovery}>Use OTP Recovery</button>
                  ) : null}
                  <button type="button" className="btn btn-outline" onClick={handleSelfServiceReset}>Use Self-Service Reset</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="first-login-form-panel">
          <div className="first-login-form-header">
            <div className="first-login-form-title">{pageTitle}</div>
            <div className="first-login-form-subtitle">{pageSubtitle}</div>
          </div>

          <div className="first-login-form-body">
            {message && (
              <div className="first-login-alert">
                {message}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                {!isOtpRecovery && (
                  <PasswordField
                    id="temporary-password"
                    label="Temporary Password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    onBlur={() => setCurrentPassword((current) => trimPasswordEdges(current))}
                    onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                    placeholder="Enter issued temporary password"
                    autoComplete="current-password"
                    helpText="Use the temporary password shared by the administrator."
                    onCapsLockChange={setCapsLockDetected}
                  />
                )}

                <PasswordField
                  id="new-password"
                  label="New Password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  onBlur={() => setNewPassword((current) => trimPasswordEdges(current))}
                  onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                  placeholder="Create new password"
                  required
                  autoComplete="new-password"
                  showStrength
                  helpText="Use at least 8 characters with a mix of upper/lower case, numbers, and symbols."
                  onCapsLockChange={setCapsLockDetected}
                />

                <PasswordField
                  id="confirm-new-password"
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  onBlur={() => setConfirmPassword((current) => trimPasswordEdges(current))}
                  onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                  placeholder="Re-enter new password"
                  required
                  autoComplete="new-password"
                  helpText="Re-enter the new password exactly as above."
                  onCapsLockChange={setCapsLockDetected}
                />
              </div>

              {passwordConfirmationStarted && (
                <div className={`first-login-alert ${passwordConfirmationMatches ? 'success' : ''} ${passwordConfirmationMismatch ? 'warning' : ''}`}>
                  {passwordConfirmationMatches
                    ? 'Password match confirmed.'
                    : 'Password does not match. Please check and re-enter.'}
                </div>
              )}

              <div className="first-login-password-note">
                {capsLockDetected
                  ? 'Caps Lock is active on this device. Verify entries before submitting.'
                  : isOtpRecovery
                    ? 'No password hash or old password is exposed to the browser. OTP recovery is treated as the proof for this one restricted session only.'
                    : 'The temporary password is never auto-filled because only its hash is stored. If you do not know it, use OTP or self-service recovery instead.'}
              </div>

              <div className="action-row first-login-actions">
                <button type="button" className="btn btn-outline" onClick={handleSignOut}>Sign Out</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FirstLogin;
