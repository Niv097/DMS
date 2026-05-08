import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import DatePicker from '../components/DatePicker';
import {
  accessMatrixBadgeTone,
  accessMatrixLabel,
  availableFmsPermissions,
  expandFmsRoleProfile,
  fmsRoleExamples,
  fmsRoleProfiles,
  getFmsRoleProfile,
  inferFmsProfile,
  permissionDisplayLabel
} from '../utils/fmsRoles';

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;

const emptyForm = {
  name: '',
  email: '',
  username: '',
  employee_id: '',
  mobile_number: '',
  credential_delivery_mode: 'MOBILE',
  date_of_birth: '',
  role: 'INITIATOR',
  tenant_id: '',
  branch_id: '',
  department_id: '',
  vertical_id: ''
};

const formatManagedBranchLabel = (managedUser) => (
  managedUser.branch_name
    ? `${managedUser.branch_name}${managedUser.branch_city_name ? ` · ${managedUser.branch_city_name}` : ''}`
    : 'Not assigned'
);
const summarizeFmsScope = (managedUser) => {
  if (['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) {
    return 'Governance auto';
  }
  const profile = inferFmsProfile(managedUser);
  const permissions = Array.isArray(managedUser.fms_permissions) ? managedUser.fms_permissions : [];
  if (!managedUser.has_fms_access) {
    return 'No active scope';
  }
  if (managedUser.has_granted_fms_access && permissions.length === 0) {
    return 'Granted View';
  }
  const labels = [];
  if (permissions.includes('FMS_VIEW')) labels.push('View');
  if (permissions.includes('FMS_UPLOAD')) labels.push('Upload');
  if (permissions.includes('FMS_SHARE')) labels.push('Share');
  if (permissions.includes('FMS_REVOKE')) labels.push('Revoke');
  if (permissions.includes('FMS_PUBLISH')) labels.push('Publish');
  return `${profile.label}${labels.length ? ` · ${labels.join(', ')}` : ''}`;
};

const formatDeliverySummary = (delivery) => {
  if (!delivery) return 'No secure delivery channel response received.';
  if (delivery.summary) return delivery.summary;
  const channels = Array.isArray(delivery.channels) ? delivery.channels : [];
  if (!channels.length) return 'No secure delivery channel response received.';
  return channels
    .map((item) => `${item.channel === 'MOBILE' ? 'mobile' : 'email'} ${item.destination || ''}`.trim())
    .join(' and ');
};

const buildCredentialReleaseMessage = (actionLabel, responseData = {}) => {
  const deliverySummary = formatDeliverySummary(responseData?.delivery);
  if (responseData?.delivery?.status === 'DISABLED') {
    return `${actionLabel}. Credential automation is off for this bank. Temporary password generated for controlled manual release: ${responseData?.temp_password || 'unavailable'}. ${deliverySummary}`;
  }
  return `${actionLabel}. Temporary password: ${responseData?.temp_password || 'unavailable'}. ${deliverySummary}`;
};

const sanitizeIndianMobileInput = (value) => String(value || '')
  .replace(/\D/g, '')
  .replace(/^91(?=\d{10}$)/, '')
  .slice(0, 10);

const AdminUserManagement = () => {
  const todayISO = new Date().toISOString().slice(0, 10);
  const { user } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [csvFile, setCsvFile] = useState(null);
  const [bulkImportPreview, setBulkImportPreview] = useState(null);
  const [bulkImportBranchOverride, setBulkImportBranchOverride] = useState(false);
  const [bulkImportBranchId, setBulkImportBranchId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resettingUserId, setResettingUserId] = useState(null);
  const [fmsEditor, setFmsEditor] = useState(null);
  const [transferEditor, setTransferEditor] = useState(null);
  const [recentFmsUserId, setRecentFmsUserId] = useState(null);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canAssignAdminRole = isSuperAdmin;
  const isAdminLevelAccount = (role) => ['ADMIN', 'SUPER_ADMIN'].includes(role);

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const [usersRes, tenantsRes, branchesRes, deptRes, vertRes] = await Promise.allSettled([
        api.get('/admin/users'),
        api.get('/admin/tenants'),
        api.get('/admin/branches'),
        api.get('/departments'),
        api.get('/verticals')
      ]);

      const usersData = usersRes.status === 'fulfilled' ? (usersRes.value.data || []) : [];
      const tenantsData = tenantsRes.status === 'fulfilled' ? (tenantsRes.value.data || []) : [];
      const branchesData = branchesRes.status === 'fulfilled' ? (branchesRes.value.data || []) : [];
      const departmentsData = deptRes.status === 'fulfilled' ? (deptRes.value.data || []) : [];
      const verticalsData = vertRes.status === 'fulfilled' ? (vertRes.value.data || []) : [];

      setUsers(usersData);
      setTenants(tenantsData);
      setBranches(branchesData);
      setDepartments(departmentsData);
      setVerticals(verticalsData);
      setForm((current) => ({
        ...current,
        tenant_id: current.tenant_id || user?.tenant_id || tenantsData?.[0]?.id || '',
        branch_id: current.branch_id || ''
      }));

      if (!preserveMessage) {
        const firstFailure = [usersRes, tenantsRes, branchesRes, deptRes, vertRes]
          .find((result) => result.status === 'rejected');
        setMessage(firstFailure?.reason?.response?.data?.error || firstFailure?.reason?.message || '');
      }
    } catch (error) {
      if (!preserveMessage) {
        setMessage(error.response?.data?.error || 'Unable to load user administration data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!recentFmsUserId) return undefined;
    const timer = setTimeout(() => setRecentFmsUserId(null), 5000);
    return () => clearTimeout(timer);
  }, [recentFmsUserId]);

  useEffect(() => {
    if (!fmsEditor) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [fmsEditor]);

  const availableRoles = [
    { value: 'INITIATOR', label: 'Uploader' },
    { value: 'RECOMMENDER', label: 'Recommender' },
    { value: 'APPROVER', label: 'Approver' },
    ...(canAssignAdminRole ? [{ value: 'ADMIN', label: 'Bank Admin' }] : []),
    ...(canAssignAdminRole ? [{ value: 'SUPER_ADMIN', label: 'Super Admin' }] : []),
    { value: 'AUDITOR', label: 'Auditor' }
  ];

  const visibleBranches = useMemo(() => (
    branches.filter((branch) => !form.tenant_id || String(branch.tenant_id) === String(form.tenant_id))
  ), [branches, form.tenant_id]);

  const transferBranches = useMemo(() => (
    branches.filter((branch) => !transferEditor?.tenant_id || String(branch.tenant_id) === String(transferEditor.tenant_id))
  ), [branches, transferEditor?.tenant_id]);
  const selectedTenant = useMemo(() => (
    tenants.find((tenant) => String(tenant.id) === String(form.tenant_id)) || null
  ), [tenants, form.tenant_id]);
  const selectedBranch = useMemo(() => (
    visibleBranches.find((branch) => String(branch.id) === String(form.branch_id)) || null
  ), [visibleBranches, form.branch_id]);
  const effectiveBulkBranchId = bulkImportBranchOverride
    ? bulkImportBranchId
    : (form.branch_id || (visibleBranches.length === 1 ? String(visibleBranches[0].id) : ''));
  const effectiveBulkBranch = useMemo(() => (
    visibleBranches.find((branch) => String(branch.id) === String(effectiveBulkBranchId)) || null
  ), [visibleBranches, effectiveBulkBranchId]);

  useEffect(() => {
    setBulkImportPreview(null);
  }, [csvFile, effectiveBulkBranchId, bulkImportBranchOverride]);

  const branchLabel = (branch) => {
    const cityLabel = branch.city?.city_name ? ` · ${branch.city.city_name}` : '';
    return `${branch.branch_name} (${branch.branch_code})${cityLabel}`;
  };

  const currentFmsRoleProfile = fmsEditor
    ? getFmsRoleProfile(fmsEditor.current_fms_profile || 'VIEW_ONLY')
    : null;
  const nextFmsRoleProfile = fmsEditor
    ? getFmsRoleProfile(fmsEditor.fms_profile || 'VIEW_ONLY')
    : null;
  const currentFmsPermissionSet = fmsEditor?.current_fms_enabled ? (fmsEditor.current_fms_permissions || []) : [];
  const nextFmsPermissionSet = fmsEditor?.fms_enabled ? expandFmsRoleProfile(fmsEditor.fms_profile || 'VIEW_ONLY') : [];

  const renderManagedUserActions = (managedUser, compact = false) => {
    if (managedUser.id === user?.id) {
      return <span className="text-muted text-sm">Protected account</span>;
    }
    if (!isSuperAdmin && isAdminLevelAccount(managedUser.role)) {
      return <span className="text-muted text-sm">Restricted account</span>;
    }

    return (
      <>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setTransferEditor({
            id: managedUser.id,
            tenant_id: managedUser.tenant_id,
            name: managedUser.name,
            branch_id: managedUser.branch_id ? String(managedUser.branch_id) : '',
            current_branch_label: formatManagedBranchLabel(managedUser)
          })}
        >
          Transfer Branch
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => handleResetPassword(managedUser)}
          disabled={resettingUserId === managedUser.id}
        >
          {resettingUserId === managedUser.id ? 'Resetting...' : 'Reset Password'}
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={() => handleToggleActive(managedUser)}>
          {managedUser.is_active ? 'Deactivate' : 'Activate'}
        </button>
        {!isAdminLevelAccount(managedUser.role) && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => navigate(`/fms/roles?user_id=${managedUser.id}`)}
          >
            {compact ? 'FMS Role Desk' : 'Open FMS Role Desk'}
          </button>
        )}
      </>
    );
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        ...form,
        employee_id: form.employee_id.trim().toUpperCase(),
        username: form.employee_id.trim().toLowerCase(),
        email: form.email.trim(),
        mobile_number: form.mobile_number.trim() ? `+91${sanitizeIndianMobileInput(form.mobile_number)}` : '',
        tenant_id: Number(form.tenant_id),
        branch_id: Number(form.branch_id),
        department_id: form.department_id ? Number(form.department_id) : undefined,
        vertical_id: form.vertical_id ? Number(form.vertical_id) : undefined
      };
      const response = await api.post('/admin/users', payload);
      setForm((current) => ({
        ...emptyForm,
        tenant_id: current.tenant_id
      }));
      await loadData({ preserveMessage: true });
      setMessage(`${buildCredentialReleaseMessage('User created', response.data)} FMS can be assigned later if needed.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to create user.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetPassword = async (targetUser) => {
    setResettingUserId(targetUser.id);
    setMessage('');
    try {
      const response = await api.post(`/admin/users/${targetUser.id}/reset-password`);
      await loadData({ preserveMessage: true });
      setMessage(buildCredentialReleaseMessage(`Password reset for ${targetUser.name}`, response.data));
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to reset password.');
    } finally {
      setResettingUserId(null);
    }
  };

  const handleToggleActive = async (targetUser) => {
    try {
      await api.put(`/admin/users/${targetUser.id}`, { is_active: !targetUser.is_active });
      await loadData({ preserveMessage: true });
      setMessage(`User ${targetUser.is_active ? 'deactivated' : 'activated'} successfully.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update user status.');
    }
  };

  const handleBulkImport = async () => {
    if (!csvFile) {
      setMessage('Select a CSV exported from Excel first.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('intent', 'preview');
      if (form.tenant_id) {
        formData.append('tenant_id', form.tenant_id);
      }
      if (effectiveBulkBranchId) {
        formData.append('default_branch_id', effectiveBulkBranchId);
      }
      if (bulkImportBranchOverride && bulkImportBranchId) {
        formData.append('use_selected_branch_only', 'true');
        formData.append('forced_branch_id', bulkImportBranchId);
      }
      const response = await api.post('/admin/users/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setBulkImportPreview(response.data || null);
      const branchHint = response.data?.branch_summary?.length === 1
        ? ` ${response.data.branch_summary[0].ready_count || response.data.branch_summary[0].count || response.data.ready || 0} users will go to ${response.data.branch_summary[0].branch_label}.`
        : '';
      setMessage(`Preview ready. Detected ${Object.keys(response.data?.detected_columns || {}).length} columns.${branchHint}`);
    } catch (error) {
      setBulkImportPreview(null);
      setMessage(error.response?.data?.error || 'Bulk import failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmBulkImport = async () => {
    if (!csvFile) {
      setMessage('Re-select the CSV file before confirming import.');
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('intent', 'confirm');
      if (form.tenant_id) {
        formData.append('tenant_id', form.tenant_id);
      }
      if (effectiveBulkBranchId) {
        formData.append('default_branch_id', effectiveBulkBranchId);
      }
      if (bulkImportBranchOverride && bulkImportBranchId) {
        formData.append('use_selected_branch_only', 'true');
        formData.append('forced_branch_id', bulkImportBranchId);
      }

      const response = await api.post('/admin/users/bulk-import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setCsvFile(null);
      setBulkImportPreview(null);
      await loadData({ preserveMessage: true });
      setMessage(`Imported ${response.data?.imported || 0} users. Failed: ${response.data?.failed || 0}.`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Bulk import failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTransfer = async () => {
    if (!transferEditor?.id) return;
    setSaving(true);
    setMessage('');
    try {
      await api.put(`/admin/users/${transferEditor.id}`, {
        branch_id: Number(transferEditor.branch_id)
      });
      setTransferEditor(null);
      await loadData({ preserveMessage: true });
      setMessage('User branch assignment updated successfully.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to update branch assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <style>{`
        .admin-users-mobile-list {
          display: none;
        }
        .admin-users-mobile-card {
          width: 100%;
          border: 1px solid #d9e2ee;
          border-radius: 14px;
          background: #ffffff;
          padding: 14px;
          display: grid;
          gap: 12px;
          text-align: left;
        }
        .admin-users-mobile-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .admin-users-mobile-name {
          color: #173c6d;
          font-weight: 700;
          line-height: 1.4;
        }
        .admin-users-mobile-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 12px;
        }
        .admin-users-mobile-field {
          display: grid;
          gap: 3px;
          min-width: 0;
        }
        .admin-users-mobile-field span {
          color: #6c7f96;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .admin-users-mobile-field strong {
          color: #22324a;
          font-size: 13px;
          line-height: 1.45;
          word-break: break-word;
        }
        .admin-users-mobile-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .admin-users-mobile-actions .btn {
          flex: 1 1 100%;
          justify-content: center;
        }
        @media (max-width: 760px) {
          .admin-users-table-desktop {
            display: none;
          }
          .admin-users-mobile-list {
            display: grid;
            gap: 12px;
            padding: 14px;
          }
          .admin-users-mobile-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h1>User Management</h1>
          <p>Create branch logins, reset passwords, and shift users between branches without leaving the bank admin console.</p>
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

      <div className="two-col">
        <div className="card form-card">
          <div className="card-header blue">Create User Login</div>
          <div className="card-body">
            <form onSubmit={handleCreateUser}>
              <div className="form-grid cols-2">
                <div className="form-group">
                  <label>Name<RequiredMark /></label>
                  <input type="text" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
                  <small className="text-muted text-sm">Optional. Leave blank if this user will work with employee ID and mobile delivery only.</small>
                </div>
                <div className="form-group">
                  <label>Employee ID<RequiredMark /></label>
                  <input
                    type="text"
                    value={form.employee_id}
                    onChange={(event) => setForm({ ...form, employee_id: event.target.value.toUpperCase() })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Login Username</label>
                  <input type="text" value={form.employee_id.trim() || ''} readOnly />
                  <small className="text-muted text-sm">Employee ID itself becomes the login username automatically.</small>
                </div>
                <div className="form-group">
                  <label>Mobile Number (+91)<RequiredMark /></label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="9876543210"
                    value={form.mobile_number}
                    onChange={(event) => setForm({ ...form, mobile_number: sanitizeIndianMobileInput(event.target.value) })}
                    required
                  />
                  <small className="text-muted text-sm">India country code `+91` will be attached automatically.</small>
                </div>
                <div className="form-group">
                  <label>Credential Delivery<RequiredMark /></label>
                  <select value={form.credential_delivery_mode} onChange={(event) => setForm({ ...form, credential_delivery_mode: event.target.value })}>
                    <option value="MOBILE">Mobile Only</option>
                    <option value="EMAIL">Email Only</option>
                    <option value="BOTH">Mobile and Email</option>
                  </select>
                </div>
                <DatePicker
                  id="admin-user-date-of-birth"
                  label="Date of Birth"
                  value={form.date_of_birth}
                  onChange={(dateOfBirth) => setForm({ ...form, date_of_birth: dateOfBirth })}
                  max={todayISO}
                  min="1900-01-01"
                  required
                  helpText="Use the calendar to pick the user's date of birth."
                />
                <div className="form-group">
                  <label>Role<RequiredMark /></label>
                  <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                    {availableRoles.map((role) => (
                      <option key={role.value} value={role.value}>{role.label}</option>
                    ))}
                  </select>
                </div>
                {isSuperAdmin && (
                  <div className="form-group">
                    <label>Bank<RequiredMark /></label>
                    <select value={form.tenant_id} onChange={(event) => setForm({ ...form, tenant_id: event.target.value, branch_id: '' })} required>
                      <option value="">Select bank</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.tenant_name} ({tenant.tenant_code})</option>
                      ))}
                    </select>
                  </div>
                )}
                {!isSuperAdmin && (
                  <div className="form-group">
                    <label>Bank<RequiredMark /></label>
                    <input type="text" value={`${user?.tenant_name || 'Selected Bank'}${user?.tenant_code ? ` (${user.tenant_code})` : ''}`} readOnly />
                  </div>
                )}
                <div className="form-group">
                  <label>Branch<RequiredMark /></label>
                  <select value={form.branch_id} onChange={(event) => setForm({ ...form, branch_id: event.target.value })} required>
                    <option value="">Select branch</option>
                    {visibleBranches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>
                    ))}
                  </select>
                  <small className="text-muted text-sm">
                    {selectedTenant?.tenant_code && selectedBranch?.branch_code
                      ? `User ID will be generated automatically in bank format like ${selectedTenant.tenant_code}-${selectedBranch.branch_code}-USR-XXXX.`
                      : 'Choose a branch to let the system attach the bank and branch code automatically in the generated user ID.'}
                  </small>
                </div>
                <div className="form-group">
                  <label>Department</label>
                  <select value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value })}>
                    <option value="">Optional</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Vertical</label>
                  <select value={form.vertical_id} onChange={(event) => setForm({ ...form, vertical_id: event.target.value })}>
                    <option value="">Optional</option>
                    {verticals.map((vertical) => (
                      <option key={vertical.id} value={vertical.id}>{vertical.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: '14px', padding: '12px 14px', borderRadius: '10px', background: '#f8fbff', border: '1px solid #dbeafe', color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
                FMS is controlled after user creation. Bank admin and HO admin receive FMS governance automatically, while branch users get FMS only when an administrator assigns it later.
              </div>

              <div className="action-row">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header blue">Bulk Import Users</div>
          <div className="card-body">
            <p className="text-muted" style={{ marginBottom: '12px' }}>
              Upload a CSV exported from Excel. The system auto-detects columns like name, role, DOB, employee ID, and email before creating users.
            </p>
            <div style={{ marginBottom: '12px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #dbeafe', background: '#f8fbff', color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
              <strong>Current import branch:</strong>{' '}
              {effectiveBulkBranch ? branchLabel(effectiveBulkBranch) : 'Choose a branch once for this import.'}
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', color: '#31527a', fontSize: '13px', fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={bulkImportBranchOverride}
                  onChange={(event) => {
                    setBulkImportBranchOverride(event.target.checked);
                    if (!event.target.checked) {
                      setBulkImportBranchId('');
                    }
                  }}
                />
                Import into another branch
              </label>
            </div>
            {bulkImportBranchOverride && (
              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label>Target Branch<RequiredMark /></label>
                <select value={bulkImportBranchId} onChange={(event) => setBulkImportBranchId(event.target.value)} required>
                  <option value="">Select branch</option>
                  {visibleBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>
                  ))}
                </select>
              </div>
            )}
            <input type="file" accept=".csv" onChange={(event) => setCsvFile(event.target.files?.[0] || null)} />
            <div className="action-row">
              <button type="button" className="btn btn-primary" onClick={handleBulkImport} disabled={saving}>
                {saving ? 'Reading...' : 'Preview Import'}
              </button>
              {bulkImportPreview && (
                <button type="button" className="btn btn-outline" onClick={handleConfirmBulkImport} disabled={saving}>
                  {saving ? 'Importing...' : 'Confirm Import'}
                </button>
              )}
            </div>
            {bulkImportPreview && (
              <div style={{ marginTop: '14px', display: 'grid', gap: '12px' }}>
                <div style={{ padding: '12px 14px', borderRadius: '10px', border: '1px solid #dbeafe', background: '#f8fbff' }}>
                  <div style={{ color: '#173c6d', fontWeight: 700, marginBottom: '6px' }}>Preview Summary</div>
                  <div style={{ color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
                    Ready: {bulkImportPreview.ready || 0} · Failed: {bulkImportPreview.failed || 0}
                  </div>
                  {(bulkImportPreview.branch_summary || []).map((item) => (
                    <div key={item.branch_id} style={{ color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
                      {item.count} users are going to be created inside {item.branch_label}.
                    </div>
                  ))}
                </div>

                <div>
                  <div style={{ color: '#173c6d', fontWeight: 700, marginBottom: '8px' }}>Detected Columns</div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Object.entries(bulkImportPreview.detected_columns || {}).map(([field, column]) => (
                      <span key={field} style={{ border: '1px solid #dbeafe', background: '#f8fbff', color: '#173c6d', borderRadius: '999px', padding: '6px 10px', fontSize: '12px', fontWeight: 600 }}>
                        {field.replace(/_/g, ' ')}: {column}
                      </span>
                    ))}
                  </div>
                </div>

                {(bulkImportPreview.sample_failures || []).length > 0 && (
                  <div>
                    <div style={{ color: '#8a2f2f', fontWeight: 700, marginBottom: '8px' }}>Rows Needing Attention</div>
                    <div style={{ display: 'grid', gap: '8px' }}>
                      {bulkImportPreview.sample_failures.map((item, index) => (
                        <div key={`${item.row_number}-${index}`} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #f3d0d0', background: '#fff8f8', color: '#8a2f2f', fontSize: '12px', lineHeight: 1.5 }}>
                          Row {item.row_number}: {item.reason}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {transferEditor && (
        <div className="card" style={{ marginBottom: '18px' }}>
          <div className="card-header blue">Transfer / Update User: {transferEditor.name}</div>
          <div className="card-body">
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>Current Branch</label>
                <input type="text" value={transferEditor.current_branch_label} readOnly />
              </div>
              <div className="form-group">
                <label>New Branch</label>
                <select value={transferEditor.branch_id} onChange={(event) => setTransferEditor({ ...transferEditor, branch_id: event.target.value })}>
                  <option value="">Select branch</option>
                  {transferBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branchLabel(branch)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="action-row">
              <button type="button" className="btn btn-outline" onClick={() => setTransferEditor(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleSaveTransfer} disabled={saving}>
                {saving ? 'Saving...' : 'Save Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">Managed Users</div>
        <div className="table-wrap admin-users-table-desktop">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Bank</th>
                <th>Branch</th>
                <th>City</th>
                <th>Status</th>
                <th>Password</th>
                <th>FMS</th>
                <th>FMS Scope</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px' }}>Loading users...</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan="10" style={{ textAlign: 'center', padding: '24px' }}>No users found.</td></tr>
              ) : (
                users.map((managedUser) => (
                  <tr
                    key={managedUser.id}
                    style={recentFmsUserId === managedUser.id
                      ? { background: '#f5f9ff', boxShadow: 'inset 3px 0 0 #2a5da8' }
                      : undefined}
                  >
                    <td>
                      <div>{managedUser.name}</div>
                      <div className="text-muted text-sm">{managedUser.email || 'No dedicated email'}</div>
                      <div className="text-muted text-sm">Emp ID: {managedUser.employee_id || '-'}</div>
                      <div className="text-muted text-sm">Login: {managedUser.username || managedUser.employee_id || '-'}</div>
                      <div className="text-muted text-sm">Mobile: {managedUser.mobile_number || '-'}</div>
                    </td>
                    <td>{managedUser.role}</td>
                    <td>{managedUser.tenant_name || '-'}</td>
                    <td>{managedUser.branch_name || '-'}</td>
                    <td>{managedUser.branch_city_name || '-'}</td>
                    <td>
                      <span className={`badge ${managedUser.is_active ? 'badge-green' : 'badge-red'}`}>
                        {managedUser.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${managedUser.must_change_password || managedUser.is_first_login ? 'badge-amber' : 'badge-green'}`}>
                        {managedUser.must_change_password || managedUser.is_first_login ? 'PENDING' : 'SET'}
                      </span>
                    </td>
                    <td>
                        <span className={`badge ${(managedUser.has_fms_access || ['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) ? 'badge-green' : 'badge-blue'}`}>
                          {(managedUser.has_fms_access || ['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) ? 'ACTIVE' : 'OFF'}
                        </span>
                    </td>
                    <td>
                      <div className="text-sm" style={{ color: '#5f748e', maxWidth: '180px', lineHeight: 1.5 }}>
                        {summarizeFmsScope(managedUser)}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {managedUser.id === user?.id ? (
                          <span className="text-muted text-sm">Protected account</span>
                        ) : (!isSuperAdmin && isAdminLevelAccount(managedUser.role)) ? (
                          <span className="text-muted text-sm">Restricted account</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => setTransferEditor({
                                id: managedUser.id,
                                tenant_id: managedUser.tenant_id,
                                name: managedUser.name,
                                branch_id: managedUser.branch_id ? String(managedUser.branch_id) : '',
                                current_branch_label: managedUser.branch_name
                                  ? `${managedUser.branch_name}${managedUser.branch_city_name ? ` · ${managedUser.branch_city_name}` : ''}`
                                  : 'Not assigned'
                              })}
                            >
                              Transfer Branch
                            </button>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => handleResetPassword(managedUser)}
                              disabled={resettingUserId === managedUser.id}
                            >
                              {resettingUserId === managedUser.id ? 'Resetting...' : 'Reset Password'}
                            </button>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => handleToggleActive(managedUser)}>
                              {managedUser.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            {!isAdminLevelAccount(managedUser.role) && (
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => navigate(`/fms/roles?user_id=${managedUser.id}`)}
                              >
                                Open FMS Role Desk
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="admin-users-mobile-list">
          {loading ? (
            <div className="fms-empty-box">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="fms-empty-box">No users found.</div>
          ) : (
            users.map((managedUser) => (
              <div
                key={`mobile-user-${managedUser.id}`}
                className="admin-users-mobile-card"
                style={recentFmsUserId === managedUser.id
                  ? { background: '#f5f9ff', boxShadow: 'inset 3px 0 0 #2a5da8' }
                  : undefined}
              >
                <div className="admin-users-mobile-head">
                  <div>
                    <div className="admin-users-mobile-name">{managedUser.name}</div>
                    <div className="text-muted text-sm">{managedUser.email || 'No dedicated email'}</div>
                  </div>
                  <span className={`badge ${managedUser.is_active ? 'badge-green' : 'badge-red'}`}>
                    {managedUser.is_active ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                <div className="admin-users-mobile-grid">
                  <div className="admin-users-mobile-field">
                    <span>Role</span>
                    <strong>{managedUser.role}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Password</span>
                    <strong>{managedUser.must_change_password || managedUser.is_first_login ? 'Pending setup' : 'Set'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Bank</span>
                    <strong>{managedUser.tenant_name || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Branch</span>
                    <strong>{managedUser.branch_name || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>City</span>
                    <strong>{managedUser.branch_city_name || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Employee ID</span>
                    <strong>{managedUser.employee_id || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Login</span>
                    <strong>{managedUser.username || managedUser.employee_id || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Mobile</span>
                    <strong>{managedUser.mobile_number || '-'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>Delivery</span>
                    <strong>{managedUser.credential_delivery_mode || 'EMAIL'}</strong>
                  </div>
                  <div className="admin-users-mobile-field">
                    <span>FMS</span>
                    <strong>{(managedUser.has_fms_access || ['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) ? 'Active' : 'Off'}</strong>
                  </div>
                  <div className="admin-users-mobile-field" style={{ gridColumn: '1 / -1' }}>
                    <span>FMS Scope</span>
                    <strong>{summarizeFmsScope(managedUser)}</strong>
                  </div>
                </div>

                <div className="admin-users-mobile-actions">
                  {renderManagedUserActions(managedUser, true)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {fmsEditor && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.34)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 1200,
            overflowY: 'auto'
          }}
          onClick={() => setFmsEditor(null)}
        >
          <div
            className="card"
            role="dialog"
            aria-modal="true"
            style={{
              width: 'min(980px, 100%)',
              maxHeight: 'calc(100vh - 48px)',
              overflowY: 'auto',
              margin: 'auto',
              borderColor: '#9fc0eb',
              boxShadow: '0 20px 48px rgba(15, 35, 64, 0.24)'
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="card-header blue" style={{ justifyContent: 'space-between' }}>
              <span>Assign FMS Role: {fmsEditor.name}</span>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setFmsEditor(null)}>Close</button>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #dbeafe', background: '#f8fbff', color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
                DMS contains both workflow approval and the file-management side. Use this desk to place the user inside the bank hierarchy, choose the correct banking FMS role, and then manage record visibility later from the library itself.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                {fmsRoleExamples.map((item) => (
                  <div key={item.title} style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '12px 13px' }}>
                    <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '13px', marginBottom: '4px' }}>{item.title}</div>
                    <div style={{ color: '#31527a', fontWeight: 700, fontSize: '12px', lineHeight: 1.45, marginBottom: '5px' }}>{item.mapping}</div>
                    <div style={{ color: '#5f748e', fontSize: '11px', lineHeight: 1.5 }}>{item.note}</div>
                  </div>
                ))}
              </div>
              <div className="form-grid cols-2">
                <div className="form-group">
                  <label>FMS Access</label>
                  <select value={fmsEditor.fms_enabled ? 'yes' : 'no'} onChange={(event) => setFmsEditor({ ...fmsEditor, fms_enabled: event.target.value === 'yes' })}>
                    <option value="no">Disabled</option>
                    <option value="yes">Enabled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Selected Role</label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid #dbe4ef', borderRadius: '10px', background: '#f8fbff', color: '#173c6d', fontWeight: 700 }}>
                    {nextFmsRoleProfile?.label || 'Shared Records Viewer'}
                  </div>
                  <small className="text-muted text-sm">
                    {nextFmsRoleProfile?.description || fmsRoleProfiles[0].description}
                  </small>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Choose One Banking FMS Role</label>
                  <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dbe4ef', background: '#ffffff', color: '#4c647f', fontSize: '12px', lineHeight: 1.6 }}>
                    Bank order: <strong>Bank → Department → Sub-department → Branch</strong>. These presets decide what the user can do inside that scope. Download stays controlled by record-level release even when the role can already view records.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {fmsRoleProfiles.map((profile) => {
                      const isActive = (fmsEditor.fms_profile || 'VIEW_ONLY') === profile.key;
                      return (
                        <button
                          key={profile.key}
                          type="button"
                          onClick={() => setFmsEditor((current) => ({
                            ...current,
                            fms_profile: profile.key,
                            fms_permissions: expandFmsRoleProfile(profile.key)
                          }))}
                          disabled={!fmsEditor.fms_enabled}
                          style={{
                            textAlign: 'left',
                            borderRadius: '14px',
                            border: `1px solid ${isActive ? '#5f92da' : '#dbe4ef'}`,
                            background: isActive ? '#edf5ff' : '#ffffff',
                            padding: '14px 15px',
                            cursor: fmsEditor.fms_enabled ? 'pointer' : 'not-allowed',
                            opacity: fmsEditor.fms_enabled ? 1 : 0.62,
                            boxShadow: isActive ? '0 0 0 3px rgba(42, 93, 168, 0.10), 0 10px 22px rgba(42, 93, 168, 0.12)' : 'none',
                            transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                            transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '14px' }}>{profile.label}</div>
                            {isActive && <span className="badge badge-blue">Selected</span>}
                          </div>
                          <div style={{ color: '#5f748e', fontSize: '12px', lineHeight: 1.55, marginBottom: '6px' }}>{profile.shortDescription}</div>
                          <div style={{ color: '#173c6d', fontSize: '11px', fontWeight: 700, marginBottom: '3px' }}>Best fit</div>
                          <div style={{ color: '#5f748e', fontSize: '11px', lineHeight: 1.5 }}>{profile.bankingUse}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <div style={{ color: '#173c6d', fontWeight: 700, marginBottom: '8px' }}>Role Meaning In Banking Terms</div>
                  <label>Role Change Review</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Current Role</div>
                      <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                        {fmsEditor.current_fms_enabled ? (currentFmsRoleProfile?.label || 'Shared Records Viewer') : 'FMS Disabled'}
                      </div>
                      <div style={{ color: '#5f748e', fontSize: '12px', lineHeight: 1.55 }}>
                        {fmsEditor.current_fms_enabled ? (currentFmsRoleProfile?.shortDescription || '') : 'This user cannot use FMS right now.'}
                      </div>
                    </div>
                    <div style={{ border: '1px solid #bfdbfe', borderRadius: '12px', background: '#f8fbff', padding: '14px 15px', boxShadow: '0 0 0 2px rgba(42, 93, 168, 0.06)' }}>
                      <div style={{ color: '#1f4f8f', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>New Role</div>
                      <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '15px', marginBottom: '4px' }}>
                        {fmsEditor.fms_enabled ? (nextFmsRoleProfile?.label || 'Shared Records Viewer') : 'FMS Disabled'}
                      </div>
                      <div style={{ color: '#5f748e', fontSize: '12px', lineHeight: 1.55 }}>
                        {fmsEditor.fms_enabled ? (nextFmsRoleProfile?.shortDescription || '') : 'This user will not see or use FMS after saving.'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Hierarchy Scope</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextFmsRoleProfile?.hierarchySummary || fmsRoleProfiles[0].hierarchySummary}</div>
                    </div>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Operational Use</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextFmsRoleProfile?.bankingUse || fmsRoleProfiles[0].bankingUse}</div>
                    </div>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Download Rule</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextFmsRoleProfile?.downloadPolicy || fmsRoleProfiles[0].downloadPolicy}</div>
                    </div>
                  </div>
                  <label>What This Role Allows</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {availableFmsPermissions.map((permission) => (
                      <span key={permission} className={`badge ${nextFmsPermissionSet.includes(permission) ? 'badge-green' : 'badge-blue'}`} style={{ opacity: nextFmsPermissionSet.includes(permission) ? 1 : 0.45 }}>
                        {permissionDisplayLabel(permission)}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {availableFmsPermissions.filter((permission) => !currentFmsPermissionSet.includes(permission) && nextFmsPermissionSet.includes(permission)).map((permission) => (
                      <span key={`added-${permission}`} className="badge badge-blue">Adds {permissionDisplayLabel(permission)}</span>
                    ))}
                    {availableFmsPermissions.filter((permission) => currentFmsPermissionSet.includes(permission) && !nextFmsPermissionSet.includes(permission)).map((permission) => (
                      <span key={`removed-${permission}`} className="badge badge-amber">Removes {permissionDisplayLabel(permission)}</span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '12px' }}>
                    {(nextFmsRoleProfile?.accessMatrix || fmsRoleProfiles[0].accessMatrix).map((item) => (
                      <div key={item.label} style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '12px 13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ color: '#173c6d', fontSize: '12px' }}>{item.label}</strong>
                          <span className={`badge ${accessMatrixBadgeTone(item.state)}`}>{accessMatrixLabel(item.state)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <small className="text-muted text-sm">
                    Use this with the searchable indexing already available in FMS: account number, CIF, customer identity, document reference, department, branch, and uploader. That keeps the bank library useful for future retrieval, not only for today’s upload.
                  </small>
                </div>
              </div>
              <div className="action-row">
                <button type="button" className="btn btn-outline" onClick={() => setFmsEditor(null)}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    setMessage('');
                    try {
                      await api.put(`/admin/users/${fmsEditor.id}`, {
                        fms_enabled: fmsEditor.fms_enabled,
                        fms_permissions: fmsEditor.fms_enabled ? expandFmsRoleProfile(fmsEditor.fms_profile || 'VIEW_ONLY') : []
                      });
                      setRecentFmsUserId(fmsEditor.id);
                      setFmsEditor(null);
                      await loadData({ preserveMessage: true });
                      setMessage('FMS role updated successfully.');
                    } catch (error) {
                      setMessage(error.response?.data?.error || 'Unable to update FMS access.');
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving ? 'Applying Role...' : 'Save FMS Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserManagement;
