import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;

const emptyBackupPolicyForm = {
  backup_policy_enabled: true,
  backup_frequency: 'DAILY',
  backup_retention_days: 30,
  backup_window_hour: 18,
  backup_window_minute: 0,
  vendor_mirror_enabled: true
};

const emptyAuthPolicyForm = {
  credential_delivery_enabled: false,
  otp_login_enabled: false
};

const buildBankPreviewLink = (tenant) => {
  if (typeof window === 'undefined' || !tenant) return '';
  const tenantCode = tenant.brand_short_code || tenant.tenant_code;
  if (!tenantCode) return '';
  return `${window.location.origin}/login?bank=${encodeURIComponent(tenantCode)}`;
};

const buildBankHostLoginLink = (tenant) => {
  if (typeof window === 'undefined' || !tenant?.deployment_host) return '';
  const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
  return `${protocol}//${tenant.deployment_host}/login`;
};

const copyText = async (value = '') => {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

const AdminBankTechnical = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [remoteOverview, setRemoteOverview] = useState(null);
  const [loadingRemoteOverview, setLoadingRemoteOverview] = useState(false);
  const [rotatingSupportKey, setRotatingSupportKey] = useState(false);
  const [latestSupportKey, setLatestSupportKey] = useState('');
  const [runningBackupAction, setRunningBackupAction] = useState('');
  const [savingBackupPolicy, setSavingBackupPolicy] = useState(false);
  const [backupPolicyForm, setBackupPolicyForm] = useState(emptyBackupPolicyForm);
  const [savingAuthPolicy, setSavingAuthPolicy] = useState(false);
  const [authPolicyForm, setAuthPolicyForm] = useState(emptyAuthPolicyForm);

  const tenantId = String(id || '');
  const selectedTenant = useMemo(
    () => tenants.find((tenant) => String(tenant.id) === tenantId) || null,
    [tenantId, tenants]
  );
  const previewLoginLink = selectedTenant ? buildBankPreviewLink(selectedTenant) : '';
  const hostLoginLink = selectedTenant ? buildBankHostLoginLink(selectedTenant) : '';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const selectedBankName = selectedTenant?.brand_display_name || selectedTenant?.tenant_name || 'Bank Technical Desk';
  const selectedBankCode = selectedTenant?.brand_short_code || selectedTenant?.tenant_code || 'BANK';
  const selectedBankInitials = selectedBankCode.slice(0, 2) || 'BK';

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const response = await api.get('/admin/tenants');
      setTenants(response.data || []);
      if (!preserveMessage) setMessage('');
    } catch (error) {
      if (!preserveMessage) {
        setMessage(error.response?.data?.error || 'Unable to load bank technical details.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!selectedTenant) return;
    setBackupPolicyForm({
      backup_policy_enabled: selectedTenant.backup_policy_enabled ?? true,
      backup_frequency: selectedTenant.backup_frequency || 'DAILY',
      backup_retention_days: selectedTenant.backup_retention_days ?? 30,
      backup_window_hour: selectedTenant.backup_window_hour ?? 18,
      backup_window_minute: selectedTenant.backup_window_minute ?? 0,
      vendor_mirror_enabled: selectedTenant.vendor_mirror_enabled ?? true
    });
    setAuthPolicyForm({
      credential_delivery_enabled: Boolean(selectedTenant.credential_delivery_enabled),
      otp_login_enabled: Boolean(selectedTenant.otp_login_enabled)
    });
    setRemoteOverview(null);
    setLatestSupportKey('');
  }, [selectedTenant]);

  const handleSaveAuthPolicy = async (event) => {
    event.preventDefault();
    if (!selectedTenant) return;
    setSavingAuthPolicy(true);
    setMessage('');
    try {
      await api.put(`/admin/tenants/${selectedTenant.id}/auth-policy`, {
        credential_delivery_enabled: Boolean(authPolicyForm.credential_delivery_enabled),
        otp_login_enabled: Boolean(authPolicyForm.credential_delivery_enabled && authPolicyForm.otp_login_enabled)
      });
      await loadData({ preserveMessage: true });
      setMessage('Bank authentication policy saved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to save bank authentication policy.');
    } finally {
      setSavingAuthPolicy(false);
    }
  };

  const loadRemoteOverview = async () => {
    if (!selectedTenant) return;
    setLoadingRemoteOverview(true);
    setMessage('');
    try {
      const response = await api.get(`/admin/tenants/${selectedTenant.id}/remote-overview`);
      setRemoteOverview(response.data || null);
      if (response.data?.overview?.message) {
        setMessage(response.data.overview.message);
      }
    } catch (error) {
      setRemoteOverview({
        overview: {
          status: 'OFFLINE',
          message: error.response?.data?.error || 'Unable to load bank deployment overview right now.'
        }
      });
      setMessage(error.response?.data?.error || 'Unable to load bank deployment overview right now.');
    } finally {
      setLoadingRemoteOverview(false);
    }
  };

  const handleRotateSupportKey = async () => {
    if (!selectedTenant) return;
    setRotatingSupportKey(true);
    setMessage('');
    try {
      const response = await api.post(`/admin/tenants/${selectedTenant.id}/rotate-support-key`);
      setLatestSupportKey(response.data?.support_api_key || '');
      await loadData({ preserveMessage: true });
      setMessage(response.data?.message || 'Support token generated successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to generate support token right now.');
    } finally {
      setRotatingSupportKey(false);
    }
  };

  const handleSaveBackupPolicy = async (event) => {
    event.preventDefault();
    if (!selectedTenant) return;
    setSavingBackupPolicy(true);
    setMessage('');
    try {
      await api.put(`/admin/tenants/${selectedTenant.id}/backup-policy`, {
        backup_policy_enabled: Boolean(backupPolicyForm.backup_policy_enabled),
        backup_frequency: backupPolicyForm.backup_frequency,
        backup_retention_days: Number(backupPolicyForm.backup_retention_days || 30),
        backup_window_hour: Number(backupPolicyForm.backup_window_hour ?? 18),
        backup_window_minute: Number(backupPolicyForm.backup_window_minute ?? 0),
        vendor_mirror_enabled: Boolean(backupPolicyForm.vendor_mirror_enabled)
      });
      await loadData({ preserveMessage: true });
      setMessage('Backup policy saved.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to save backup policy.');
    } finally {
      setSavingBackupPolicy(false);
    }
  };

  const handleRunBankBackupNow = async () => {
    if (!selectedTenant) return;
    setRunningBackupAction('backup');
    setMessage('');
    try {
      const response = await api.post(`/admin/tenants/${selectedTenant.id}/run-backup`);
      await loadData({ preserveMessage: true });
      setMessage(response.data?.message || 'Bank backup completed successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to run bank backup right now.');
    } finally {
      setRunningBackupAction('');
    }
  };

  const handleExportBankRecoveryPackage = async () => {
    if (!selectedTenant) return;
    setRunningBackupAction('export');
    setMessage('');
    try {
      const response = await api.post(`/admin/tenants/${selectedTenant.id}/export-recovery-package`);
      await loadData({ preserveMessage: true });
      setMessage(response.data?.message || 'Bank recovery package exported successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to export bank recovery package right now.');
    } finally {
      setRunningBackupAction('');
    }
  };

  const handleCopy = async (value, label) => {
    const copied = await copyText(value);
    setMessage(copied ? `${label} copied.` : `Unable to copy ${label.toLowerCase()} right now.`);
  };

  const handleBackToBanks = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/admin/banks');
  };

  const handleSwitchBank = (event) => {
    const nextTenantId = String(event.target.value || '').trim();
    if (!nextTenantId || nextTenantId === tenantId) return;
    navigate(`/admin/banks/${nextTenantId}/technical`);
  };

  return (
    <div>
      <style>{`
        .admin-bank-tech-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
          flex-wrap: wrap;
        }
        .admin-bank-tech-switch-shell {
          flex: 1 1 360px;
          width: min(100%, 720px);
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border: 1px solid #d6e4f7;
          border-radius: 18px;
          background: linear-gradient(180deg, #fbfdff 0%, #f3f8ff 100%);
          box-shadow: 0 12px 28px rgba(23, 60, 109, 0.08);
        }
        .admin-bank-tech-switch-name {
          color: #173c6d;
          font-size: 16px;
          font-weight: 800;
          line-height: 1.25;
          word-break: break-word;
        }
        .admin-bank-tech-select-wrap {
          min-width: 0;
          flex: 1 1 220px;
        }
        @media (max-width: 760px) {
          .admin-bank-tech-switch-shell {
            flex-direction: column;
            align-items: stretch;
          }
        }
      `}</style>
      <div className="page-header admin-bank-tech-header">
        <div>
          <h1>Bank Technical Page</h1>
          <p>Support visibility, token handling, demo links, and recovery settings stay here so the main bank setup page remains clean.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'stretch', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {isSuperAdmin && tenants.length > 0 ? (
            <div className="admin-bank-tech-switch-shell">
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'linear-gradient(180deg, #1f4f93 0%, #173c6d 100%)',
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  flexShrink: 0
                }}
              >
                {selectedBankInitials}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Viewing Technical Desk
                </div>
                <div className="admin-bank-tech-switch-name">
                  {selectedBankName}
                </div>
                <div style={{ color: '#60748c', fontSize: '12px', marginTop: '2px' }}>
                  {selectedBankCode} · Switch bank for live demo
                </div>
              </div>
              <div className="admin-bank-tech-select-wrap">
                <label style={{ display: 'block', color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Switch Bank
                </label>
                <select
                  value={tenantId}
                  onChange={handleSwitchBank}
                  style={{
                    width: '100%',
                    minHeight: '42px',
                    border: '1px solid #bfd1e8',
                    borderRadius: '12px',
                    background: '#ffffff',
                    color: '#173c6d',
                    fontWeight: 700,
                    padding: '0 12px',
                    boxShadow: 'inset 0 1px 2px rgba(15, 23, 42, 0.04)'
                  }}
                >
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {(tenant.brand_display_name || tenant.tenant_name)} ({tenant.brand_short_code || tenant.tenant_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
          <button type="button" className="btn btn-outline" onClick={handleBackToBanks} style={{ alignSelf: 'center' }}>Back To Banks</button>
        </div>
      </div>

      {message && (
        <div style={{ marginBottom: '16px', border: '1px solid #d6e4f7', background: '#f8fbff', color: '#173c6d', padding: '12px 14px', borderRadius: '10px', fontWeight: 600 }}>
          {message}
        </div>
      )}

      {loading ? (
        <div className="card"><div className="card-body">Loading technical desk...</div></div>
      ) : !selectedTenant ? (
        <div className="card"><div className="card-body">Bank not found.</div></div>
      ) : !isSuperAdmin ? (
        <div className="card"><div className="card-body">Only super admin can open the technical page.</div></div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: '18px' }}>
            <div className="card-header blue">Selected Bank Technical Summary</div>
            <div className="card-body">
              <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">Bank</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.brand_display_name || selectedTenant.tenant_name}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">Code</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.brand_short_code || selectedTenant.tenant_code}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">Mode</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.deployment_mode || 'SHARED'}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">Support</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{remoteOverview?.overview?.status || selectedTenant.support_last_status || 'Not Checked'}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">Credential Delivery</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.credential_delivery_enabled ? 'Enabled' : 'Manual Only'}</div>
                </div>
                <div className="stat-card" style={{ padding: '14px 12px' }}>
                  <div className="stat-label">OTP Sign-In</div>
                  <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.otp_login_enabled ? 'Enabled' : 'Disabled'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="two-col">
            <div className="card form-card">
              <div className="card-header blue">Bank Authentication Controls</div>
              <div className="card-body">
                <form onSubmit={handleSaveAuthPolicy}>
                  <div style={{ padding: '14px 16px', border: '1px solid #dbe4ef', borderRadius: '14px', background: '#fbfdff', marginBottom: '16px' }}>
                    <div style={{ color: '#173c6d', fontWeight: 700, marginBottom: '6px' }}>Current Bank Delivery Policy</div>
                    <div className="text-muted text-sm" style={{ lineHeight: 1.7 }}>
                      Store user mobile number and email for every bank, but keep OTP, temporary-password delivery, and automated credential notifications off until this bank is ready.
                    </div>
                  </div>

                  <div className="form-grid cols-1">
                    <div className="form-group">
                      <label>Credential Delivery Automation</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 600, color: '#173c6d' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(authPolicyForm.credential_delivery_enabled)}
                          onChange={(event) => setAuthPolicyForm((current) => ({
                            credential_delivery_enabled: event.target.checked,
                            otp_login_enabled: event.target.checked ? current.otp_login_enabled : false
                          }))}
                        />
                        This bank can send credential delivery through configured email or mobile channels
                      </label>
                      <small className="text-muted text-sm">When off, user mobile and email are still stored, but provisioning and reset delivery stay manual.</small>
                    </div>

                    <div className="form-group">
                      <label>OTP Sign-In / Recovery</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 600, color: '#173c6d' }}>
                        <input
                          type="checkbox"
                          checked={Boolean(authPolicyForm.otp_login_enabled)}
                          onChange={(event) => setAuthPolicyForm((current) => ({
                            ...current,
                            otp_login_enabled: event.target.checked
                          }))}
                          disabled={!authPolicyForm.credential_delivery_enabled}
                        />
                        This bank can use OTP sign-in and OTP recovery
                      </label>
                      <small className="text-muted text-sm">OTP stays dependent on credential delivery automation. If delivery is off, OTP is forced off too.</small>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', padding: '14px 16px', border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', color: '#173c6d' }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>Effective Bank Mode</strong>
                    <div className="text-muted text-sm">Credential delivery: {authPolicyForm.credential_delivery_enabled ? 'Enabled' : 'Manual only'}</div>
                    <div className="text-muted text-sm">OTP sign-in: {authPolicyForm.credential_delivery_enabled && authPolicyForm.otp_login_enabled ? 'Enabled' : 'Disabled'}</div>
                  </div>

                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={savingAuthPolicy}>
                      {savingAuthPolicy ? 'Saving...' : 'Save Authentication Policy'}
                    </button>
                  </div>
                </form>
              </div>
            </div>

            <div className="card form-card">
              <div className="card-header blue">Demo And Visibility</div>
              <div className="card-body">
                <div style={{ marginBottom: '16px', padding: '14px', border: '1px solid #dbe4ef', borderRadius: '14px', background: '#fbfdff' }}>
                  <div style={{ color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Demo Login Link
                  </div>
                  <div style={{ padding: '12px 14px', border: '1px solid #dbe4ef', borderRadius: '12px', background: '#f8fbff', color: '#173c6d', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.6, wordBreak: 'break-all' }}>
                    {previewLoginLink}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '10px' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => handleCopy(previewLoginLink, 'Demo link')}>Copy Link</button>
                    <a className="btn btn-outline btn-sm" href={previewLoginLink} target="_blank" rel="noreferrer">Open Demo Login</a>
                  </div>
                </div>

                <div style={{ marginBottom: '16px', padding: '14px', border: '1px solid #dbe4ef', borderRadius: '14px', background: '#ffffff' }}>
                  <div style={{ color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Real Bank Domain
                  </div>
                  <div style={{ padding: '12px 14px', border: '1px solid #dbe4ef', borderRadius: '12px', background: hostLoginLink ? '#f8fbff' : '#fbfcfe', color: hostLoginLink ? '#173c6d' : '#6f8197', fontFamily: hostLoginLink ? 'var(--font-mono)' : 'var(--font)', fontSize: '12px', lineHeight: 1.6, wordBreak: 'break-all' }}>
                    {hostLoginLink || 'No real domain saved yet.'}
                  </div>
                </div>

                <div style={{ padding: '14px', border: '1px solid #dbe4ef', borderRadius: '14px', background: '#fbfdff' }}>
                  <div style={{ color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Deployment Visibility
                  </div>
                  <div style={{ marginBottom: '10px' }} className="text-muted text-sm">
                    Support URL: {selectedTenant.support_base_url || 'Not configured'}
                  </div>
                  <div style={{ marginBottom: '10px' }} className="text-muted text-sm">
                    Support login: {selectedTenant.support_login_username || 'Not recorded'}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={loadRemoteOverview} disabled={loadingRemoteOverview}>
                      {loadingRemoteOverview ? 'Refreshing...' : 'Refresh Deployment View'}
                    </button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={handleRotateSupportKey} disabled={rotatingSupportKey}>
                      {rotatingSupportKey ? 'Generating...' : 'Generate Support Token'}
                    </button>
                    {selectedTenant.support_login_url ? (
                      <a className="btn btn-outline btn-sm" href={selectedTenant.support_login_url} target="_blank" rel="noreferrer">Open Bank Login</a>
                    ) : null}
                  </div>
                  {latestSupportKey ? (
                    <div style={{ marginTop: '12px', padding: '12px 14px', border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff' }}>
                      <div style={{ color: '#173c6d', fontSize: '13px', fontWeight: 700, marginBottom: '6px' }}>New Support Token</div>
                      <div style={{ padding: '12px 14px', border: '1px solid #dbe4ef', borderRadius: '12px', background: '#f8fbff', color: '#173c6d', fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: 1.6, wordBreak: 'break-all' }}>
                        {latestSupportKey}
                      </div>
                    </div>
                  ) : null}
                  {remoteOverview?.overview?.stats ? (
                    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginTop: '12px' }}>
                      <div className="stat-card" style={{ padding: '14px 12px' }}><div className="stat-label">Branches</div><div className="stat-value" style={{ fontSize: '16px' }}>{remoteOverview.overview.stats.branches ?? 0}</div></div>
                      <div className="stat-card" style={{ padding: '14px 12px' }}><div className="stat-label">Users</div><div className="stat-value" style={{ fontSize: '16px' }}>{remoteOverview.overview.stats.users ?? 0}</div></div>
                      <div className="stat-card" style={{ padding: '14px 12px' }}><div className="stat-label">Notes</div><div className="stat-value" style={{ fontSize: '16px' }}>{remoteOverview.overview.stats.notes ?? 0}</div></div>
                      <div className="stat-card" style={{ padding: '14px 12px' }}><div className="stat-label">Pending</div><div className="stat-value" style={{ fontSize: '16px' }}>{remoteOverview.overview.stats.pending_items ?? 0}</div></div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="card form-card">
              <div className="card-header blue">Backup And Recovery</div>
              <div className="card-body">
                <form onSubmit={handleSaveBackupPolicy}>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Bank Auto Backup</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 600, color: '#173c6d' }}>
                        <input type="checkbox" checked={Boolean(backupPolicyForm.backup_policy_enabled)} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, backup_policy_enabled: event.target.checked })} />
                        Bank wants scheduled backup handling
                      </label>
                    </div>
                    <div className="form-group">
                      <label>Bank Backup Frequency<RequiredMark /></label>
                      <select value={backupPolicyForm.backup_frequency} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, backup_frequency: event.target.value })} required>
                        <option value="DAILY">Daily</option>
                        <option value="WEEKLY">Weekly</option>
                        <option value="MONTHLY">Monthly</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Retention Days<RequiredMark /></label>
                      <input type="number" min="7" max="365" value={backupPolicyForm.backup_retention_days} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, backup_retention_days: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Bank Close Backup Hour<RequiredMark /></label>
                      <input type="number" min="0" max="23" value={backupPolicyForm.backup_window_hour} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, backup_window_hour: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Bank Close Backup Minute<RequiredMark /></label>
                      <input type="number" min="0" max="59" value={backupPolicyForm.backup_window_minute} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, backup_window_minute: event.target.value })} required />
                    </div>
                    <div className="form-group">
                      <label>Vendor Mirror</label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 600, color: '#173c6d' }}>
                        <input type="checkbox" checked={Boolean(backupPolicyForm.vendor_mirror_enabled)} onChange={(event) => setBackupPolicyForm({ ...backupPolicyForm, vendor_mirror_enabled: event.target.checked })} />
                        Maintain vendor-side mirror coverage
                      </label>
                    </div>
                  </div>

                  <div style={{ marginTop: '12px', padding: '14px 16px', border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', color: '#173c6d' }}>
                    <strong style={{ display: 'block', marginBottom: '6px' }}>Current Bank Backup Status</strong>
                    <div className="text-muted text-sm">Last bank backup: {selectedTenant.backup_last_completed_at ? new Date(selectedTenant.backup_last_completed_at).toLocaleString() : '-'}</div>
                    <div className="text-muted text-sm">Next due: {selectedTenant.backup_next_due_at ? new Date(selectedTenant.backup_next_due_at).toLocaleString() : (backupPolicyForm.backup_policy_enabled ? 'Due on next scheduler run' : '-')}</div>
                    <div className="text-muted text-sm">Close window: {String(backupPolicyForm.backup_window_hour ?? 18).padStart(2, '0')}:{String(backupPolicyForm.backup_window_minute ?? 0).padStart(2, '0')}</div>
                    <div style={{ marginTop: '14px', display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                      <button type="button" className="btn btn-outline" onClick={handleRunBankBackupNow} disabled={runningBackupAction === 'backup' || runningBackupAction === 'export'}>
                        {runningBackupAction === 'backup' ? 'Creating Backup...' : 'Backup Now'}
                      </button>
                      <button type="button" className="btn btn-outline" onClick={handleExportBankRecoveryPackage} disabled={runningBackupAction === 'backup' || runningBackupAction === 'export'}>
                        {runningBackupAction === 'export' ? 'Exporting Package...' : 'Export Recovery Package'}
                      </button>
                    </div>
                  </div>

                  <div className="action-row">
                    <button type="submit" className="btn btn-primary" disabled={savingBackupPolicy}>
                      {savingBackupPolicy ? 'Saving...' : 'Save Backup Policy'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AdminBankTechnical;
