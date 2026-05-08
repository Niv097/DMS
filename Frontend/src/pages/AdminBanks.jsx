import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;
const normalizeCode = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');

const emptyTenantForm = {
  tenant_name: '',
  tenant_code: '',
  deployment_host: '',
  deployment_mode: 'SHARED',
  support_base_url: '',
  support_access_mode: 'REMOTE_API',
  support_login_username: '',
  support_contact_name: '',
  support_contact_email: '',
  support_contact_phone: '',
  license_plan: '',
  license_valid_until: '',
  cross_branch_append_enabled: false,
  backup_policy_enabled: true,
  backup_frequency: 'DAILY',
  backup_retention_days: 30,
  backup_window_hour: 18,
  backup_window_minute: 0,
  vendor_mirror_enabled: true
};

const emptyBrandingForm = {
  tenant_name: '',
  tenant_code: '',
  deployment_host: '',
  deployment_mode: 'SHARED',
  support_base_url: '',
  support_access_mode: 'REMOTE_API',
  support_login_username: '',
  support_contact_name: '',
  support_contact_email: '',
  support_contact_phone: '',
  license_plan: '',
  license_valid_until: '',
  brand_display_name: '',
  brand_short_code: '',
  brand_subtitle: '',
  email_from_name: '',
  email_from_address: '',
  email_reply_to: '',
  cross_branch_append_enabled: false
};

const formatDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const AdminBanks = () => {
  const { user } = useAuth();
  const { reloadBranding } = useBranding();
  const [tenants, setTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [tenantForm, setTenantForm] = useState(emptyTenantForm);
  const [brandingForm, setBrandingForm] = useState(emptyBrandingForm);
  const [logoFile, setLogoFile] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingTenant, setSavingTenant] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);
  const [showCreateAdvanced, setShowCreateAdvanced] = useState(false);
  const [showBrandingAdvanced, setShowBrandingAdvanced] = useState(false);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isCreateDedicated = tenantForm.deployment_mode === 'DEDICATED';
  const isBrandingDedicated = brandingForm.deployment_mode === 'DEDICATED';

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const response = await api.get('/admin/tenants');
      const tenantRows = response.data || [];
      setTenants(tenantRows);

      const fallbackTenantId = isSuperAdmin
        ? (selectedTenantId || tenantRows[0]?.id || '')
        : (user?.tenant_id || tenantRows[0]?.id || '');

      setSelectedTenantId(String(fallbackTenantId || ''));
      if (!preserveMessage) setMessage('');
    } catch (error) {
      if (!preserveMessage) {
        setMessage(error.response?.data?.error || 'Unable to load bank profile.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedTenant = useMemo(() => (
    tenants.find((tenant) => String(tenant.id) === String(selectedTenantId)) || null
  ), [selectedTenantId, tenants]);

  useEffect(() => {
    if (!selectedTenant) return;
    setBrandingForm({
      tenant_name: selectedTenant.tenant_name || '',
      tenant_code: selectedTenant.tenant_code || '',
      deployment_host: selectedTenant.deployment_host || '',
      deployment_mode: selectedTenant.deployment_mode || 'SHARED',
      support_base_url: selectedTenant.support_base_url || '',
      support_access_mode: selectedTenant.support_access_mode || 'REMOTE_API',
      support_login_username: selectedTenant.support_login_username || '',
      support_contact_name: selectedTenant.support_contact_name || '',
      support_contact_email: selectedTenant.support_contact_email || '',
      support_contact_phone: selectedTenant.support_contact_phone || '',
      license_plan: selectedTenant.license_plan || '',
      license_valid_until: formatDateInput(selectedTenant.license_valid_until),
      brand_display_name: selectedTenant.brand_display_name || selectedTenant.tenant_name || '',
      brand_short_code: selectedTenant.brand_short_code || selectedTenant.tenant_code || '',
      brand_subtitle: selectedTenant.brand_subtitle || 'Document Management System',
      email_from_name: selectedTenant.email_from_name || '',
      email_from_address: selectedTenant.email_from_address || '',
      email_reply_to: selectedTenant.email_reply_to || '',
      cross_branch_append_enabled: Boolean(selectedTenant.cross_branch_append_enabled)
    });
    setLogoFile(null);
    setShowBrandingAdvanced(false);
  }, [selectedTenant]);

  const handleCreateTenant = async (event) => {
    event.preventDefault();
    setSavingTenant(true);
    setMessage('');
    try {
      const response = await api.post('/admin/tenants', {
        ...tenantForm,
        tenant_code: normalizeCode(tenantForm.tenant_code),
        deployment_mode: tenantForm.deployment_mode,
        support_base_url: tenantForm.support_base_url,
        support_access_mode: tenantForm.support_access_mode,
        support_login_username: tenantForm.support_login_username,
        support_contact_name: tenantForm.support_contact_name,
        support_contact_email: tenantForm.support_contact_email,
        support_contact_phone: tenantForm.support_contact_phone,
        license_plan: tenantForm.license_plan,
        license_valid_until: tenantForm.license_valid_until,
        cross_branch_append_enabled: Boolean(tenantForm.cross_branch_append_enabled)
        ,
        backup_policy_enabled: Boolean(tenantForm.backup_policy_enabled),
        backup_frequency: tenantForm.backup_frequency,
        backup_retention_days: Number(tenantForm.backup_retention_days || 30),
        backup_window_hour: Number(tenantForm.backup_window_hour ?? 18),
        backup_window_minute: Number(tenantForm.backup_window_minute ?? 0),
        vendor_mirror_enabled: Boolean(tenantForm.vendor_mirror_enabled)
      });
      setTenantForm(emptyTenantForm);
      setShowCreateAdvanced(false);
      await loadData({ preserveMessage: true });
      setSelectedTenantId(String(response.data?.id || ''));
      setMessage('Bank created successfully. Its own login domain can now drive automatic branding before login.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to create bank.');
    } finally {
      setSavingTenant(false);
    }
  };

  const handleSaveBranding = async (event) => {
    event.preventDefault();
    if (!selectedTenant) return;

    setSavingBranding(true);
    setMessage('');
    try {
      const formData = new FormData();
      const payload = {
        tenant_name: brandingForm.tenant_name,
        tenant_code: normalizeCode(brandingForm.tenant_code),
        deployment_host: brandingForm.deployment_host,
        deployment_mode: brandingForm.deployment_mode
      };

      if (isSuperAdmin && isBrandingDedicated) {
        payload.support_base_url = brandingForm.support_base_url;
        payload.support_login_username = brandingForm.support_login_username;
        payload.support_contact_email = brandingForm.support_contact_email;
        payload.license_valid_until = brandingForm.license_valid_until;
      }

      if (showBrandingAdvanced) {
        payload.brand_display_name = brandingForm.brand_display_name;
        payload.brand_short_code = normalizeCode(brandingForm.brand_short_code);
        payload.brand_subtitle = brandingForm.brand_subtitle;
        payload.email_from_name = brandingForm.email_from_name;
        payload.email_from_address = brandingForm.email_from_address;
        payload.email_reply_to = brandingForm.email_reply_to;
        payload.cross_branch_append_enabled = brandingForm.cross_branch_append_enabled;

        if (isSuperAdmin) {
          payload.support_access_mode = brandingForm.support_access_mode;
          payload.support_contact_name = brandingForm.support_contact_name;
          payload.support_contact_phone = brandingForm.support_contact_phone;
          payload.license_plan = brandingForm.license_plan;
        }
      }

      Object.entries(payload).forEach(([key, value]) => {
        formData.append(key, value ?? '');
      });
      if (logoFile) {
        formData.append('logo', logoFile);
      }

      await api.put(`/admin/tenants/${selectedTenant.id}/branding`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      await loadData({ preserveMessage: true });
      await reloadBranding(selectedTenant.id);
      setShowBrandingAdvanced(false);
      setMessage('Bank branding saved. Login screen, top bar, and user workspace will now follow this bank profile.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to save bank branding.');
    } finally {
      setSavingBranding(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1>{isSuperAdmin ? 'Super Admin Bank Control Desk' : 'Bank Profile & Branding'}</h1>
          <p>{isSuperAdmin
            ? 'Create bank profiles, apply branding, and generate bank-specific UAT login identity from one central control desk.'
            : 'Manage your bank name, logo, login identity, and backup expectation from one controlled bank profile desk.'}
          </p>
        </div>
      </div>

      {message && (
        <div style={{
          marginBottom: '16px',
          border: '1px solid #d6e4f7',
          background: '#f8fbff',
          color: '#173c6d',
          padding: '12px 14px',
          borderRadius: '10px',
          fontWeight: 600
        }}>
          {message}
        </div>
      )}

      {isSuperAdmin && (
        <div className="card form-card" style={{ marginBottom: '18px' }}>
          <div className="card-header blue">Create Bank</div>
          <div className="card-body">
            <form onSubmit={handleCreateTenant}>
              <div style={{
                marginBottom: '18px',
                padding: '14px 16px',
                border: '1px solid #dbe4ef',
                borderRadius: '14px',
                background: '#f8fbff',
                color: '#173c6d'
              }}>
                <strong style={{ display: 'block', marginBottom: '6px' }}>Keep this simple</strong>
                <div className="text-muted text-sm">Step 1: create the bank with basic details.</div>
                <div className="text-muted text-sm">Step 2: after the bank is created, select it below only if you want to change branding or dedicated-bank support details.</div>
              </div>

              <div className="form-grid cols-2">
                <div className="form-group">
                  <label>Bank Name<RequiredMark /></label>
                  <input
                    type="text"
                    value={tenantForm.tenant_name}
                    onChange={(event) => setTenantForm({ ...tenantForm, tenant_name: event.target.value })}
                    placeholder="Example: XYZ Bank Ltd"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Bank Code<RequiredMark /></label>
                  <input
                    type="text"
                    value={tenantForm.tenant_code}
                    onChange={(event) => setTenantForm({ ...tenantForm, tenant_code: normalizeCode(event.target.value).slice(0, 8) })}
                    placeholder="Example: XYZ"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Login Domain / URL</label>
                  <input
                    type="text"
                    value={tenantForm.deployment_host}
                    onChange={(event) => setTenantForm({ ...tenantForm, deployment_host: event.target.value })}
                    placeholder="Example: dms.xyzbank.com"
                  />
                </div>
                <div className="form-group">
                  <label>Deployment Model<RequiredMark /></label>
                  <select
                    value={tenantForm.deployment_mode}
                    onChange={(event) => setTenantForm({ ...tenantForm, deployment_mode: event.target.value })}
                    required
                  >
                    <option value="SHARED">Shared Control DB</option>
                    <option value="DEDICATED">Dedicated Bank DB</option>
                  </select>
                </div>
              </div>

              {isCreateDedicated && (
                <div style={{
                  marginTop: '16px',
                  padding: '16px',
                  border: '1px solid #dbe4ef',
                  borderRadius: '14px',
                  background: '#ffffff'
                }}>
                  <div style={{ color: '#173c6d', fontWeight: 700, marginBottom: '12px' }}>Dedicated Bank Support Details</div>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Support API Base URL</label>
                      <input
                        type="text"
                        value={tenantForm.support_base_url}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_base_url: event.target.value })}
                        placeholder="Example: https://dms.xyzbank.com"
                      />
                      <small className="text-muted text-sm">Usually this is the same as the bank app URL.</small>
                    </div>
                    <div className="form-group">
                      <label>Support Admin Username</label>
                      <input
                        type="text"
                        value={tenantForm.support_login_username}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_login_username: event.target.value })}
                        placeholder="Example: vendor.support.xyz"
                      />
                    </div>
                    <div className="form-group">
                      <label>Support Contact Email</label>
                      <input
                        type="email"
                        value={tenantForm.support_contact_email}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_contact_email: event.target.value })}
                        placeholder="Example: it.ops@xyzbank.com"
                      />
                    </div>
                    <div className="form-group">
                      <label>License Valid Until</label>
                      <input
                        type="date"
                        value={tenantForm.license_valid_until}
                        onChange={(event) => setTenantForm({ ...tenantForm, license_valid_until: event.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateAdvanced((current) => !current)}
                >
                  {showCreateAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingTenant}>
                  {savingTenant ? 'Saving...' : 'Create Bank'}
                </button>
              </div>

              {showCreateAdvanced && (
                <div style={{
                  marginTop: '16px',
                  paddingTop: '16px',
                  borderTop: '1px solid #e2e8f0'
                }}>
                  <div className="form-grid cols-2">
                    <div className="form-group">
                      <label>Support Access Mode</label>
                      <select
                        value={tenantForm.support_access_mode}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_access_mode: event.target.value })}
                      >
                        <option value="REMOTE_API">Remote API</option>
                        <option value="ANYDESK">AnyDesk / Screen Share</option>
                        <option value="VPN">VPN / Secure Network</option>
                        <option value="BANK_ESCALATION">Bank Escalation Only</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Support Contact Phone</label>
                      <input
                        type="text"
                        value={tenantForm.support_contact_phone}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_contact_phone: event.target.value })}
                        placeholder="Example: +91 98xxxxxx10"
                      />
                    </div>
                    <div className="form-group">
                      <label>Support Contact Name</label>
                      <input
                        type="text"
                        value={tenantForm.support_contact_name}
                        onChange={(event) => setTenantForm({ ...tenantForm, support_contact_name: event.target.value })}
                        placeholder="Example: Core Banking Infra Desk"
                      />
                    </div>
                    <div className="form-group">
                      <label>License Plan</label>
                      <input
                        type="text"
                        value={tenantForm.license_plan}
                        onChange={(event) => setTenantForm({ ...tenantForm, license_plan: event.target.value })}
                        placeholder="Example: Enterprise Annual"
                      />
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {selectedTenant && (
        <div
          className="card"
          style={{
            marginBottom: '18px',
            border: '1px solid #d7e0ea',
            borderRadius: '18px',
            overflow: 'hidden',
            boxShadow: '0 12px 28px rgba(15, 35, 64, 0.06)'
          }}
        >
          <div className="card-header blue">Selected Bank</div>
          <div className="card-body">
            <div className="form-grid cols-2" style={{ alignItems: 'start' }}>
              <div
                style={{
                  display: 'grid',
                  gap: '14px',
                  padding: '18px',
                  border: '1px solid #dbe4ef',
                  borderRadius: '16px',
                  background: 'linear-gradient(180deg, #fbfdff 0%, #f5f9fe 100%)'
                }}
              >
                <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {selectedTenant.brand_logo_url ? (
                    <img
                      src={selectedTenant.brand_logo_url}
                      alt={`${selectedTenant.brand_display_name || selectedTenant.tenant_name} logo`}
                      style={{ width: '68px', height: '68px', objectFit: 'contain', borderRadius: '14px', background: '#ffffff', border: '1px solid #dbe4ef', padding: '8px' }}
                    />
                  ) : (
                    <div style={{ width: '68px', height: '68px', borderRadius: '14px', background: '#173c6d', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '22px' }}>
                      {(selectedTenant.brand_short_code || selectedTenant.tenant_code || 'BK').slice(0, 2)}
                    </div>
                  )}
                  <div>
                    <div style={{ color: '#6d8098', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '4px' }}>
                      Active Bank Identity
                    </div>
                    <div style={{ color: '#173c6d', fontSize: '24px', fontWeight: 800, lineHeight: 1.2 }}>
                      {selectedTenant.brand_display_name || selectedTenant.tenant_name}
                    </div>
                    <div style={{ color: '#60748c', fontSize: '13px', marginTop: '4px' }}>
                      {(selectedTenant.brand_subtitle || 'Document Management System')} | {(selectedTenant.brand_short_code || selectedTenant.tenant_code)}
                    </div>
                  </div>
                </div>
                <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                  <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <div className="stat-label">Code</div>
                    <div className="stat-value" style={{ fontSize: '18px' }}>{selectedTenant.brand_short_code || selectedTenant.tenant_code}</div>
                  </div>
                  <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <div className="stat-label">Mode</div>
                    <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.deployment_mode || 'SHARED'}</div>
                  </div>
                  <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <div className="stat-label">Domain</div>
                    <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.deployment_host ? 'Added' : 'Pending'}</div>
                  </div>
                  <div className="stat-card" style={{ padding: '14px 12px' }}>
                    <div className="stat-label">Logo</div>
                    <div className="stat-value" style={{ fontSize: '16px' }}>{selectedTenant.brand_logo_url ? 'Uploaded' : 'Initials'}</div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-header">{isSuperAdmin ? 'Bank Directory' : 'Your Bank'}</div>
          <div className="card-body" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: '24px' }}>Loading bank records...</div>
            ) : tenants.length === 0 ? (
              <div style={{ padding: '24px' }}>No bank profile available yet.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bank</th>
                      <th>Code</th>
                      <th>Model</th>
                      <th>Login Domain</th>
                      <th>Support</th>
                      <th>License</th>
                      {isSuperAdmin ? <th>Technical</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((tenant) => (
                      <tr
                        key={tenant.id}
                        onClick={() => setSelectedTenantId(String(tenant.id))}
                        style={{ cursor: 'pointer', background: String(selectedTenantId) === String(tenant.id) ? '#f8fbff' : undefined }}
                      >
                        <td>{tenant.brand_display_name || tenant.tenant_name}</td>
                        <td>{tenant.brand_short_code || tenant.tenant_code}</td>
                        <td>{tenant.deployment_mode || 'SHARED'}</td>
                        <td>{tenant.deployment_host || '-'}</td>
                        <td>{tenant.support_last_status || (tenant.support_api_key_configured ? 'Configured' : 'Pending')}</td>
                        <td>{tenant.license_status || 'Not Recorded'}</td>
                        {isSuperAdmin ? (
                          <td onClick={(event) => event.stopPropagation()}>
                            <Link
                              className="btn btn-outline btn-sm"
                              to={`/admin/banks/${tenant.id}/technical`}
                            >
                              Technical Page
                            </Link>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card form-card">
          <div className="card-header blue">{isSuperAdmin ? 'Bank Profile' : 'Bank Branding'}</div>
          <div className="card-body">
            {!selectedTenant ? (
              <div className="text-muted">Select a bank to manage its main profile.</div>
            ) : (
              <form onSubmit={handleSaveBranding}>
                <div style={{
                  marginBottom: '18px',
                  padding: '14px 16px',
                  border: '1px solid #dbe4ef',
                  borderRadius: '14px',
                  background: '#f8fbff',
                  color: '#173c6d'
                }}>
                  <strong style={{ display: 'block', marginBottom: '6px' }}>Basic profile only</strong>
                  <div className="text-muted text-sm">Use this desk for the main bank setup only.</div>
                  <div className="text-muted text-sm">Open advanced only if this bank needs custom branding or mail identity.</div>
                </div>

                <div className="form-grid cols-2">
                  <div className="form-group">
                    <label>Bank Name<RequiredMark /></label>
                    <input
                      type="text"
                      value={brandingForm.tenant_name}
                      onChange={(event) => setBrandingForm({ ...brandingForm, tenant_name: event.target.value })}
                      readOnly={!isSuperAdmin}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Bank Code<RequiredMark /></label>
                    <input
                      type="text"
                      value={brandingForm.tenant_code}
                      onChange={(event) => setBrandingForm({ ...brandingForm, tenant_code: normalizeCode(event.target.value).slice(0, 8) })}
                      readOnly={!isSuperAdmin}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Login Domain / URL</label>
                    <input
                      type="text"
                      value={brandingForm.deployment_host}
                      onChange={(event) => setBrandingForm({ ...brandingForm, deployment_host: event.target.value })}
                      readOnly={!isSuperAdmin}
                      placeholder="Example: hdfc.yourdms.com"
                    />
                  </div>
                  {isSuperAdmin && (
                    <div className="form-group">
                      <label>Deployment Model<RequiredMark /></label>
                      <select
                        value={brandingForm.deployment_mode}
                        onChange={(event) => setBrandingForm({ ...brandingForm, deployment_mode: event.target.value })}
                        required
                      >
                        <option value="SHARED">Shared Control DB</option>
                        <option value="DEDICATED">Dedicated Bank DB</option>
                      </select>
                      <small className="text-muted text-sm">Use dedicated mode when the bank keeps its own PostgreSQL and its own deployment.</small>
                    </div>
                  )}
                  {isSuperAdmin && isBrandingDedicated && (
                    <div className="form-group">
                      <label>Support API Base URL</label>
                      <input
                        type="text"
                        value={brandingForm.support_base_url}
                        onChange={(event) => setBrandingForm({ ...brandingForm, support_base_url: event.target.value })}
                        placeholder="Example: https://xyzbank-dms.example.com"
                      />
                      <small className="text-muted text-sm">Usually same as the bank app URL.</small>
                    </div>
                  )}
                  {isSuperAdmin && isBrandingDedicated && (
                    <div className="form-group">
                      <label>Support Admin Username</label>
                      <input
                        type="text"
                        value={brandingForm.support_login_username}
                        onChange={(event) => setBrandingForm({ ...brandingForm, support_login_username: event.target.value })}
                        placeholder="Example: support.superadmin"
                      />
                    </div>
                  )}
                  {isSuperAdmin && isBrandingDedicated && (
                    <div className="form-group">
                      <label>Support Contact Email</label>
                      <input
                        type="email"
                        value={brandingForm.support_contact_email}
                        onChange={(event) => setBrandingForm({ ...brandingForm, support_contact_email: event.target.value })}
                        placeholder="Example: infra@xyzbank.com"
                      />
                    </div>
                  )}
                  {isSuperAdmin && isBrandingDedicated && (
                    <div className="form-group">
                      <label>License Valid Until</label>
                      <input
                        type="date"
                        value={brandingForm.license_valid_until}
                        onChange={(event) => setBrandingForm({ ...brandingForm, license_valid_until: event.target.value })}
                      />
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginTop: '18px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setShowBrandingAdvanced((current) => !current)}
                  >
                    {showBrandingAdvanced ? 'Hide Advanced Profile Settings' : 'Show Advanced Profile Settings'}
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={savingBranding}>
                    {savingBranding ? 'Saving...' : 'Save Profile'}
                  </button>
                </div>

                {showBrandingAdvanced && (
                  <div style={{ marginTop: '18px', paddingTop: '18px', borderTop: '1px solid #e2e8f0' }}>
                    <div className="form-grid cols-2">
                      <div className="form-group">
                        <label>Visible Bank Name<RequiredMark /></label>
                        <input
                          type="text"
                          value={brandingForm.brand_display_name}
                          onChange={(event) => setBrandingForm({ ...brandingForm, brand_display_name: event.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Visible Short Code<RequiredMark /></label>
                        <input
                          type="text"
                          value={brandingForm.brand_short_code}
                          onChange={(event) => setBrandingForm({ ...brandingForm, brand_short_code: normalizeCode(event.target.value).slice(0, 8) })}
                          required
                        />
                      </div>
                      {isSuperAdmin && isBrandingDedicated && (
                        <div className="form-group">
                          <label>Support Access Mode</label>
                          <select
                            value={brandingForm.support_access_mode}
                            onChange={(event) => setBrandingForm({ ...brandingForm, support_access_mode: event.target.value })}
                          >
                            <option value="REMOTE_API">Remote API</option>
                            <option value="ANYDESK">AnyDesk / Screen Share</option>
                            <option value="VPN">VPN / Secure Network</option>
                            <option value="BANK_ESCALATION">Bank Escalation Only</option>
                          </select>
                        </div>
                      )}
                      {isSuperAdmin && isBrandingDedicated && (
                        <div className="form-group">
                          <label>Support Contact Name</label>
                          <input
                            type="text"
                            value={brandingForm.support_contact_name}
                            onChange={(event) => setBrandingForm({ ...brandingForm, support_contact_name: event.target.value })}
                            placeholder="Example: Core Banking Infra Desk"
                          />
                        </div>
                      )}
                      {isSuperAdmin && isBrandingDedicated && (
                        <div className="form-group">
                          <label>Support Contact Phone</label>
                          <input
                            type="text"
                            value={brandingForm.support_contact_phone}
                            onChange={(event) => setBrandingForm({ ...brandingForm, support_contact_phone: event.target.value })}
                            placeholder="Example: +91 98xxxxxx10"
                          />
                        </div>
                      )}
                      {isSuperAdmin && isBrandingDedicated && (
                        <div className="form-group">
                          <label>License Plan</label>
                          <input
                            type="text"
                            value={brandingForm.license_plan}
                            onChange={(event) => setBrandingForm({ ...brandingForm, license_plan: event.target.value })}
                            placeholder="Example: Enterprise Annual"
                          />
                        </div>
                      )}
                      <div className="form-group">
                        <label>Brand Subtitle</label>
                        <input
                          type="text"
                          value={brandingForm.brand_subtitle}
                          onChange={(event) => setBrandingForm({ ...brandingForm, brand_subtitle: event.target.value })}
                          placeholder="Example: Document Management System"
                        />
                      </div>
                      <div className="form-group">
                        <label>Sender Name</label>
                        <input
                          type="text"
                          value={brandingForm.email_from_name}
                          onChange={(event) => setBrandingForm({ ...brandingForm, email_from_name: event.target.value })}
                          placeholder="Example: Baroda Central Co-Operative Bank Ltd"
                        />
                      </div>
                      <div className="form-group">
                        <label>Sender Email</label>
                        <input
                          type="email"
                          value={brandingForm.email_from_address}
                          onChange={(event) => setBrandingForm({ ...brandingForm, email_from_address: event.target.value })}
                          placeholder="Example: notifications@barodadms.com"
                        />
                      </div>
                      <div className="form-group">
                        <label>Reply-To Email</label>
                        <input
                          type="email"
                          value={brandingForm.email_reply_to}
                          onChange={(event) => setBrandingForm({ ...brandingForm, email_reply_to: event.target.value })}
                          placeholder="Example: support@barodadms.com"
                        />
                      </div>
                      <div className="form-group">
                        <label>Cross-Branch Append</label>
                        {isSuperAdmin ? (
                          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', fontWeight: 600, color: '#173c6d' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(brandingForm.cross_branch_append_enabled)}
                              onChange={(event) => setBrandingForm({ ...brandingForm, cross_branch_append_enabled: event.target.checked })}
                            />
                            Enable branch-to-branch append visibility
                          </label>
                        ) : (
                          <input
                            type="text"
                            readOnly
                            value={brandingForm.cross_branch_append_enabled ? 'Enabled by super admin' : 'Disabled by super admin'}
                          />
                        )}
                      </div>
                      <div className="form-group">
                        <label>Bank Logo</label>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(event) => setLogoFile(event.target.files?.[0] || null)}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {selectedTenant.brand_logo_url && (
                  <div style={{
                    margin: '12px 0 18px',
                    padding: '14px',
                    border: '1px solid #dbe4ef',
                    borderRadius: '12px',
                    background: '#f8fbff',
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}>
                    <img
                      src={selectedTenant.brand_logo_url}
                      alt={`${selectedTenant.brand_display_name || selectedTenant.tenant_name} logo`}
                      style={{ width: '56px', height: '56px', objectFit: 'contain' }}
                    />
                    <div>
                      <strong style={{ display: 'block', color: '#173c6d' }}>Current Bank Logo</strong>
                      <small style={{ color: '#60748c' }}>New upload will replace the current logo.</small>
                    </div>
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default AdminBanks;
