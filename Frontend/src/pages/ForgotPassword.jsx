import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import api from '../utils/api';
import DatePicker from '../components/DatePicker';
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

const ForgotPassword = () => {
  const location = useLocation();
  const todayISO = new Date().toISOString().slice(0, 10);
  const recoveryState = location.state || {};
  const [form, setForm] = useState({
    identifier: recoveryState.identifier || '',
    employee_id: recoveryState.employee_id || '',
    date_of_birth: recoveryState.date_of_birth || '',
    new_password: '',
    confirm_password: ''
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const payload = {
        ...form,
        identifier: trimEdgeWhitespace(form.identifier),
        employee_id: trimEdgeWhitespace(form.employee_id),
        new_password: trimPasswordEdges(form.new_password),
        confirm_password: trimPasswordEdges(form.confirm_password)
      };
      const response = await api.post('/auth/forgot-password/reset', payload);
      setSuccess(true);
      setMessage(response.data?.message || 'Password reset successfully. Please sign in.');
    } catch (error) {
      setSuccess(false);
      setMessage(error.response?.data?.error || 'Unable to reset password with the provided details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="forgot-shell">
      <style>{`
        .forgot-shell {
          min-height: 100vh;
          display: grid;
          place-items: center;
          background: radial-gradient(circle at top left, #1e3a8a, #0f172a);
          font-family: 'Outfit', sans-serif;
          padding: 24px;
        }
        .forgot-card {
          width: min(520px, 100%);
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 24px;
          padding: 34px;
          color: #e2e8f0;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(18px);
        }
        .forgot-card h1 {
          color: #fff;
          margin: 0 0 8px;
          font-size: 28px;
        }
        .forgot-card p {
          color: #94a3b8;
          margin: 0 0 24px;
          line-height: 1.5;
        }
        .forgot-grid {
          display: grid;
          gap: 16px;
        }
        .forgot-card label {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 600;
        }
        .required-marker {
          color: #fca5a5;
          font-weight: 800;
        }
        .forgot-card input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(59, 79, 128, 0.34);
          color: #f8fbff;
          font-size: 14px;
        }
        .forgot-card input:focus {
          outline: none;
          border-color: #60a5fa;
          box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.12);
        }
        .forgot-btn {
          margin-top: 18px;
          width: 100%;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: #3b82f6;
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .forgot-btn:disabled {
          background: #64748b;
          cursor: not-allowed;
        }
        .forgot-message {
          margin-bottom: 18px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.24);
          color: #fecaca;
          font-size: 13px;
        }
        .forgot-message.success {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.28);
          color: #bbf7d0;
        }
        .forgot-back {
          display: inline-block;
          margin-top: 18px;
          color: #bfdbfe;
          text-decoration: none;
          font-size: 13px;
        }
        .forgot-success-panel {
          border-radius: 16px;
          border: 1px solid rgba(34, 197, 94, 0.24);
          background: rgba(15, 23, 42, 0.14);
          padding: 18px;
          margin-top: 10px;
        }
        .forgot-success-panel strong {
          display: block;
          color: #ecfdf5;
          font-size: 16px;
          margin-bottom: 8px;
        }
        .forgot-success-panel p {
          margin: 0 0 14px;
          color: #cbd5e1;
        }
        .forgot-success-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .forgot-success-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 0 18px;
          border-radius: 12px;
          background: #3b82f6;
          color: #ffffff;
          text-decoration: none;
          font-weight: 700;
        }
      `}</style>

      <div className="forgot-card">
        <h1>Forgot Password</h1>
        <p>{success ? 'Your password has been updated. Continue back to sign in with the new password.' : 'Verify your internal identity using your registered email or username, Employee ID, and Date of Birth.'}</p>

        {recoveryState.identifier && !message && (
          <div className="forgot-message">
            Recovery details were prefilled from your forced password-change session. Complete the identity check to set a new password safely.
          </div>
        )}

        {message && <div className={`forgot-message ${success ? 'success' : ''}`}>{message}</div>}

        {success && (
          <div className="forgot-success-panel">
            <strong>Password Reset Complete</strong>
            <p>Use your new password on the bank sign-in screen. The recovery form is now closed for this session.</p>
            <div className="forgot-success-actions">
              <Link className="forgot-success-link" to="/login">Return to Sign In</Link>
            </div>
          </div>
        )}

        {!success && (
          <>
            <form onSubmit={handleSubmit}>
              <div className="forgot-grid">
                <div>
                  <label>Email or Username<span className="required-marker" aria-hidden="true"> *</span></label>
                  <input
                    type="text"
                    value={form.identifier}
                    onChange={(event) => setForm({ ...form, identifier: event.target.value })}
                    onBlur={() => setForm((current) => ({ ...current, identifier: trimEdgeWhitespace(current.identifier) }))}
                    onPaste={(event) => injectSanitizedPaste(event, trimEdgeWhitespace)}
                    autoComplete="username"
                    required
                  />
                </div>
                <div>
                  <label>Employee ID<span className="required-marker" aria-hidden="true"> *</span></label>
                  <input
                    type="text"
                    value={form.employee_id}
                    onChange={(event) => setForm({ ...form, employee_id: event.target.value.toUpperCase() })}
                    onBlur={() => setForm((current) => ({ ...current, employee_id: trimEdgeWhitespace(current.employee_id).toUpperCase() }))}
                    onPaste={(event) => injectSanitizedPaste(event, (value) => trimEdgeWhitespace(value).toUpperCase())}
                    autoComplete="off"
                    required
                  />
                </div>
                <DatePicker
                  id="forgot-date-of-birth"
                  label="Date of Birth"
                  value={form.date_of_birth}
                  onChange={(dateOfBirth) => setForm({ ...form, date_of_birth: dateOfBirth })}
                  max={todayISO}
                  min="1900-01-01"
                  required
                  helpText="Use the calendar to match the date on file."
                />
                <PasswordField
                  id="forgot-new-password"
                  label="New Password"
                  value={form.new_password}
                  onChange={(event) => setForm({ ...form, new_password: event.target.value })}
                  onBlur={() => setForm((current) => ({ ...current, new_password: trimPasswordEdges(current.new_password) }))}
                  onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                  autoComplete="new-password"
                  showStrength
                  required
                />
                <PasswordField
                  id="forgot-confirm-password"
                  label="Confirm Password"
                  value={form.confirm_password}
                  onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
                  onBlur={() => setForm((current) => ({ ...current, confirm_password: trimPasswordEdges(current.confirm_password) }))}
                  onPaste={(event) => injectSanitizedPaste(event, trimPasswordEdges)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <button type="submit" className="forgot-btn" disabled={saving}>
                {saving ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <Link className="forgot-back" to="/login">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
