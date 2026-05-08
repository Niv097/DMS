import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import DatePicker from '../components/DatePicker';
import PasswordField from '../components/PasswordField';

const Profile = () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const { user, refreshProfile, updateProfile, changePassword } = useAuth();
  const { branding } = useBranding();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [capsLockDetected, setCapsLockDetected] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    date_of_birth: '',
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const { brandName } = branding;
  const passwordConfirmationStarted = Boolean(form.confirm_password);
  const passwordConfirmationMatches = passwordConfirmationStarted && form.new_password === form.confirm_password;
  const passwordConfirmationMismatch = passwordConfirmationStarted && Boolean(form.new_password) && form.new_password !== form.confirm_password;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await refreshProfile();
      } catch (error) {
        console.error('Failed to refresh profile', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [refreshProfile]);

  useEffect(() => {
    setForm({
      name: user?.name || '',
      email: user?.email || '',
      date_of_birth: user?.date_of_birth || '',
      current_password: '',
      new_password: '',
      confirm_password: ''
    });
  }, [user?.id, user?.name, user?.email]);

  const handleSave = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      await updateProfile({
        name: form.name,
        email: form.email,
        ...(user?.date_of_birth ? {} : { date_of_birth: form.date_of_birth || undefined })
      });

      if (form.new_password || form.confirm_password || form.current_password) {
        if (!form.current_password) {
          throw new Error('Current password is required to set a new password.');
        }
        if (form.new_password.length < 8) {
          throw new Error('New password must be at least 8 characters.');
        }
        if (form.new_password !== form.confirm_password) {
          throw new Error('New password and confirmation do not match.');
        }

        await changePassword({
          current_password: form.current_password,
          new_password: form.new_password
        });
      }

      setForm((current) => ({
        ...current,
        current_password: '',
        new_password: '',
        confirm_password: ''
      }));
      setMessage('Profile updated successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || error.message || 'Profile update failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="profile-hero">
        <div>
          <div className="profile-kicker">{brandName}</div>
          <h1>My Profile</h1>
          <p>Manage your identity details, password controls, and banking access profile from one controlled workspace.</p>
        </div>
        <div className="profile-seal">
          <span>{user?.role || 'USER'}</span>
        </div>
      </div>

      {message && <div className="profile-alert">{message}</div>}

      <div className="profile-grid">
        <div className="card profile-card form-card">
          <div className="card-header blue">Update Own Details</div>
          <div className="card-body">
            {loading ? (
              <div className="text-muted">Refreshing profile...</div>
            ) : (
              <form onSubmit={handleSave}>
                <div className="form-grid cols-2">
                  <div className="form-group">
                    <label>Full Name<span className="required-marker" aria-hidden="true"> *</span></label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Email<span className="required-marker" aria-hidden="true"> *</span></label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      required
                    />
                  </div>
                  <PasswordField
                    id="profile-current-password"
                    label="Current Password"
                    value={form.current_password}
                    onChange={(event) => setForm({ ...form, current_password: event.target.value })}
                    placeholder="Enter current password"
                    autoComplete="current-password"
                    helpText="Required only if you want to update your password."
                    onCapsLockChange={setCapsLockDetected}
                  />
                  <div className="profile-static">
                    <span>Role</span>
                    <strong>{user?.role || '-'}</strong>
                    <small>Role changes are controlled by administrator.</small>
                  </div>
                  <div className="profile-static">
                    <span>Employee ID</span>
                    <strong>{user?.employee_id || '-'}</strong>
                    <small>Employee ID is controlled by administrator.</small>
                  </div>
                  <DatePicker
                    id="profile-date-of-birth"
                    label="Date of Birth"
                    value={form.date_of_birth}
                    onChange={(dateOfBirth) => setForm({ ...form, date_of_birth: dateOfBirth })}
                    disabled={Boolean(user?.date_of_birth)}
                    max={todayISO}
                    min="1900-01-01"
                    required={!user?.date_of_birth}
                    helpText={user?.date_of_birth ? 'Date of birth is locked after setup.' : 'Can be set once for password recovery.'}
                  />
                </div>

                <div className="form-grid cols-2" style={{ marginTop: '14px' }}>
                  <PasswordField
                    id="profile-new-password"
                    label="New Password"
                    value={form.new_password}
                    onChange={(event) => setForm({ ...form, new_password: event.target.value })}
                    placeholder="Enter new password"
                    autoComplete="new-password"
                    showStrength
                    helpText="Use a strong password not shared with other banking or email accounts."
                    onCapsLockChange={setCapsLockDetected}
                  />
                  <PasswordField
                    id="profile-confirm-password"
                    label="Confirm New Password"
                    value={form.confirm_password}
                    onChange={(event) => setForm({ ...form, confirm_password: event.target.value })}
                    placeholder="Re-enter new password"
                    autoComplete="new-password"
                    helpText="Confirmation must match the new password exactly."
                    onCapsLockChange={setCapsLockDetected}
                  />
                </div>

                {passwordConfirmationStarted && (
                  <div className={`profile-password-match ${passwordConfirmationMatches ? 'match' : ''} ${passwordConfirmationMismatch ? 'mismatch' : ''}`}>
                    {passwordConfirmationMatches
                      ? 'Password match confirmed.'
                      : 'Password does not match. Please check and re-enter.'}
                  </div>
                )}

                {capsLockDetected && (
                  <div className="profile-password-banner">
                    Caps Lock is active. Please verify password entries before saving.
                  </div>
                )}

                <div className="profile-meta-grid">
                  <div>
                    <span>Tenant</span>
                    <strong>{user?.tenant_name || '-'}</strong>
                  </div>
                  <div>
                    <span>Branch</span>
                    <strong>{user?.branch_name || '-'}</strong>
                  </div>
                  <div>
                    <span>Department</span>
                    <strong>{user?.department || '-'}</strong>
                  </div>
                  <div>
                    <span>Vertical</span>
                    <strong>{user?.vertical || '-'}</strong>
                  </div>
                  <div>
                    <span>Session Status</span>
                    <strong className="text-blue">ACTIVE</strong>
                  </div>
                  <div>
                    <span>Credential Activation</span>
                    <strong className={user?.is_first_login ? 'text-amber' : 'text-green'}>
                      {user?.is_first_login ? 'PENDING' : 'COMPLETED'}
                    </strong>
                  </div>
                </div>

                <div className="action-row">
                  <button type="button" className="btn btn-outline" onClick={() => refreshProfile()} disabled={saving}>
                    Refresh
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="card profile-card">
          <div className="card-header blue">Banking Access Summary</div>
          <div className="card-body">
            <div className="profile-summary-grid">
              <div className="profile-summary-card">
                <span>User ID</span>
                <strong>{user?.user_id || user?.username || '-'}</strong>
                <small>Primary login identity for this banking workspace.</small>
              </div>
              <div className="profile-summary-card">
                <span>Role Control</span>
                <strong>{user?.role || '-'}</strong>
                <small>Workflow responsibilities are assigned by bank administration.</small>
              </div>
              <div className="profile-summary-card">
                <span>Bank Scope</span>
                <strong>{user?.tenant_name || '-'}</strong>
                <small>{user?.tenant_code || 'Tenant code not assigned'}</small>
              </div>
              <div className="profile-summary-card">
                <span>Branch Scope</span>
                <strong>{user?.branch_name || '-'}</strong>
                <small>{user?.branch_code || 'Branch code not assigned'}</small>
              </div>
              <div className="profile-summary-card">
                <span>FMS Access</span>
                <strong>{user?.has_fms_access ? 'Enabled' : 'Not Enabled'}</strong>
                <small>{user?.has_fms_access ? 'Archive retrieval is available as per permissions granted.' : 'FMS visibility is controlled separately by administrator.'}</small>
              </div>
              <div className="profile-summary-card">
                <span>Password Recovery</span>
                <strong>{user?.date_of_birth ? 'Configured' : 'Pending'}</strong>
                <small>{user?.date_of_birth ? 'Date of birth is locked and used for controlled recovery checks.' : 'Set once so secure recovery can work later.'}</small>
              </div>
            </div>

            <div className="profile-guidance-box">
              <strong>Banking control notes</strong>
              <ul>
                <li>Branch transfer, role change, and employee ID updates are controlled by bank administration.</li>
                <li>FMS access appears only after the administrator grants it for your role or branch.</li>
                <li>Password changes from this page require your current password for secure confirmation.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .profile-hero {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
          background: #ffffff;
          color: #173c6d;
          border: 1px solid #dde6f0;
          border-radius: 16px;
          padding: 18px 22px;
          margin-bottom: 18px;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
        }
        .required-marker {
          color: #dc2626;
          font-weight: 800;
        }
        .profile-hero h1 {
          font-size: 24px;
          margin: 2px 0 6px;
          letter-spacing: -0.03em;
        }
        .profile-hero p {
          color: #64748b;
          max-width: 720px;
        }
        .profile-kicker {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #7a8da8;
          font-weight: 700;
        }
        .profile-seal {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid #d7e3ef;
          background: #f8fbff;
        }
        .profile-seal span {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: #173c6d;
        }
        .profile-alert {
          border: 1px solid #bfdbfe;
          color: #0f3270;
          background: #eff6ff;
          border-radius: 12px;
          padding: 10px 14px;
          margin-bottom: 16px;
          font-weight: 600;
        }
        .profile-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.5fr) minmax(320px, 0.8fr);
          gap: 18px;
        }
        .profile-card {
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.05);
        }
        .profile-static {
          padding: 12px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f8fafc;
        }
        .profile-static span,
        .profile-meta-grid span {
          display: block;
          color: #6b7280;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 3px;
        }
        .profile-static strong,
        .profile-meta-grid strong {
          display: block;
          color: #111827;
          font-size: 14px;
        }
        .profile-static small {
          display: block;
          color: #9ca3af;
          margin-top: 3px;
        }
        .profile-meta-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
          margin-top: 16px;
        }
        .profile-meta-grid div {
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 12px;
          background: linear-gradient(180deg, #fff, #f8fafc);
        }
        .profile-summary-grid {
          display: grid;
          gap: 8px;
        }
        .profile-summary-card {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 10px 12px;
          background: #fbfdff;
        }
        .profile-summary-card span {
          display: block;
          color: #6b7280;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 3px;
        }
        .profile-summary-card strong {
          display: block;
          color: #111827;
          font-size: 13px;
          margin-bottom: 3px;
        }
        .profile-summary-card small {
          display: block;
          color: #7b8794;
          line-height: 1.4;
          font-size: 12px;
        }
        .profile-guidance-box {
          margin-top: 12px;
          color: #4b617b;
          background: #f8fbff;
          border: 1px solid #dbeafe;
          border-radius: 10px;
          padding: 12px 14px;
        }
        .profile-guidance-box strong {
          display: block;
          color: #173c6d;
          margin-bottom: 6px;
          font-size: 13px;
        }
        .profile-guidance-box ul {
          margin: 0;
          padding-left: 18px;
          line-height: 1.6;
          font-size: 12px;
        }
        .profile-password-banner {
          margin-top: 14px;
          border: 1px solid #fde68a;
          background: #fffbeb;
          color: #92400e;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .profile-password-match {
          margin-top: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #b91c1c;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12px;
          font-weight: 600;
        }
        .profile-password-match.match {
          border-color: #bbf7d0;
          background: #f0fdf4;
          color: #166534;
        }
        @media (max-width: 1024px) {
          .profile-grid { grid-template-columns: 1fr; }
          .profile-meta-grid { grid-template-columns: 1fr; }
          .profile-hero { align-items: flex-start; }
        }
      `}</style>
    </div>
  );
};

export default Profile;
