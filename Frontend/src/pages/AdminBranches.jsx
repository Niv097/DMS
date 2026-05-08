import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;
const normalizeCode = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const buildLocationCode = (value = '') => {
  const words = String(value || '')
    .trim()
    .split(/\s+/)
    .map((word) => normalizeCode(word).replace(/\d/g, ''))
    .filter(Boolean)
    .filter((word) => !['CITY', 'DISTRICT', 'BRANCH', 'OFFICE', 'BANK'].includes(word));

  if (words.length >= 2) {
    return words.slice(0, 3).map((word) => word[0]).join('').slice(0, 3) || 'BRN';
  }

  const token = words[0] || normalizeCode(value).replace(/\d/g, '');
  if (!token) return 'BRN';
  const first = token[0];
  const consonants = token.slice(1).replace(/[AEIOU]/g, '');
  return `${first}${consonants}${token.slice(1)}`.slice(0, 3) || 'BRN';
};
const buildBranchCode = (tenantCode = '', cityName = '', cityCode = '') => {
  const bankPart = normalizeCode(tenantCode).slice(0, 6) || 'BANK';
  const locationPart = buildLocationCode(cityCode || cityName);
  return `${bankPart}${locationPart}001`.slice(0, 12);
};

const emptyBranchForm = {
  tenant_id: '',
  city_id: '',
  branch_name: '',
  branch_code: '',
  branch_address: ''
};

const AdminBranches = () => {
  const { user } = useAuth();
  const [branches, setBranches] = useState([]);
  const [cities, setCities] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [branchCodeTouched, setBranchCodeTouched] = useState(false);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const [branchesRes, citiesRes, tenantsRes] = await Promise.allSettled([
        api.get('/admin/branches'),
        api.get('/admin/cities'),
        api.get('/admin/tenants')
      ]);

      const branchesData = branchesRes.status === 'fulfilled' ? (branchesRes.value.data || []) : [];
      const citiesData = citiesRes.status === 'fulfilled' ? (citiesRes.value.data || []) : [];
      const tenantsData = tenantsRes.status === 'fulfilled' ? (tenantsRes.value.data || []) : [];

      setBranches(branchesData);
      setCities(citiesData);
      setTenants(tenantsData);
      setBranchForm((current) => ({
        ...current,
        tenant_id: current.tenant_id || user?.tenant_id || tenantsData?.[0]?.id || ''
      }));

      if (!preserveMessage) {
        setMessage(branchesRes.status === 'rejected'
          ? (branchesRes.reason?.response?.data?.error || 'Unable to load branch records.')
          : '');
      }
    } catch (error) {
      if (!preserveMessage) {
        setMessage(error.response?.data?.error || 'Unable to load branch records.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const visibleCities = useMemo(() => (
    cities.filter((city) => !branchForm.tenant_id || String(city.tenant_id) === String(branchForm.tenant_id))
  ), [branchForm.tenant_id, cities]);
  const selectedCity = useMemo(() => (
    visibleCities.find((city) => String(city.id) === String(branchForm.city_id)) || null
  ), [visibleCities, branchForm.city_id]);
  const selectedTenant = useMemo(() => (
    tenants.find((tenant) => String(tenant.id) === String(branchForm.tenant_id)) || null
  ), [branchForm.tenant_id, tenants]);

  const currentTenantLabel = useMemo(() => (
    tenants.find((tenant) => String(tenant.id) === String(branchForm.tenant_id))?.tenant_name || user?.tenant_name || 'Selected Bank'
  ), [branchForm.tenant_id, tenants, user?.tenant_name]);

  useEffect(() => {
    if (!branchCodeTouched) {
      setBranchForm((current) => ({
        ...current,
        branch_code: buildBranchCode(selectedTenant?.brand_short_code || selectedTenant?.tenant_code || user?.tenant_code, selectedCity?.city_name, selectedCity?.city_code)
      }));
    }
  }, [selectedCity?.city_code, selectedCity?.city_name, selectedTenant?.brand_short_code, selectedTenant?.tenant_code, user?.tenant_code, branchCodeTouched]);

  const handleCreateBranch = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/admin/branches', {
        ...branchForm,
        tenant_id: Number(branchForm.tenant_id),
        city_id: Number(branchForm.city_id)
      });
      setBranchCodeTouched(false);
      setBranchForm((current) => ({
        ...emptyBranchForm,
        tenant_id: current.tenant_id
      }));
      await loadData({ preserveMessage: true });
      setMessage('Branch created successfully. You can now assign users to it from the Users menu.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to create branch.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Branch Management</h1>
        <p>Create bank branches against city master records, so branch logins and transfers stay structured.</p>
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
          <div className="card-header blue">Create Branch</div>
          <div className="card-body">
            <form onSubmit={handleCreateBranch}>
              <div className="form-grid cols-2">
                {isSuperAdmin ? (
                  <div className="form-group">
                    <label>Bank<RequiredMark /></label>
                    <select
                      value={branchForm.tenant_id}
                      onChange={(event) => setBranchForm({ ...branchForm, tenant_id: event.target.value, city_id: '' })}
                      required
                    >
                      <option value="">Select bank</option>
                      {tenants.map((tenant) => (
                        <option key={tenant.id} value={tenant.id}>{tenant.tenant_name} ({tenant.tenant_code})</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="form-group">
                    <label>Bank<RequiredMark /></label>
                    <input type="text" value={`${currentTenantLabel}${user?.tenant_code ? ` (${user.tenant_code})` : ''}`} readOnly />
                  </div>
                )}
                <div className="form-group">
                  <label>City<RequiredMark /></label>
                  <select value={branchForm.city_id} onChange={(event) => setBranchForm({ ...branchForm, city_id: event.target.value })} required>
                    <option value="">Select city</option>
                    {visibleCities.map((city) => (
                      <option key={city.id} value={city.id}>
                        {city.city_name}{city.state_name ? `, ${city.state_name}` : ''} ({city.city_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Branch Name<RequiredMark /></label>
                  <input
                    type="text"
                    value={branchForm.branch_name}
                    onChange={(event) => setBranchForm({ ...branchForm, branch_name: event.target.value })}
                    placeholder="Example: Ahmedabad Main Branch"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Branch Code</label>
                  <input
                    type="text"
                    value={branchForm.branch_code}
                    onChange={(event) => {
                      setBranchCodeTouched(true);
                      setBranchForm({ ...branchForm, branch_code: normalizeCode(event.target.value).slice(0, 10) });
                    }}
                    placeholder="Auto-generated from bank + city"
                  />
                  <small className="text-muted text-sm">
                    {selectedCity && (selectedTenant?.brand_short_code || selectedTenant?.tenant_code || user?.tenant_code)
                      ? `Code follows bank prefix ${selectedTenant?.brand_short_code || selectedTenant?.tenant_code || user?.tenant_code} and city location mapping for structured branch records.`
                      : 'Select the bank and city first to auto-fetch the branch code.'}
                  </small>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Branch Address</label>
                  <textarea
                    value={branchForm.branch_address}
                    onChange={(event) => setBranchForm({ ...branchForm, branch_address: event.target.value })}
                    placeholder="Example: Ring Road, Varrcha Main Road, Surat"
                    style={{ minHeight: '82px' }}
                  />
                  <small className="text-muted text-sm">
                    This address feeds the branch location line shown to users and in approved banking records.
                  </small>
                </div>
              </div>
              <div className="action-row">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Create Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Registered Branches</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Code</th>
                  <th>City</th>
                  <th>Bank</th>
                  <th>Address</th>
                  <th>Users</th>
                  <th>Files</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>Loading branches...</td></tr>
                ) : branches.length === 0 ? (
                  <tr><td colSpan="7" style={{ textAlign: 'center', padding: '24px' }}>No branches created yet.</td></tr>
                ) : branches.map((branch) => (
                  <tr key={branch.id}>
                    <td>{branch.branch_name}</td>
                    <td>{branch.branch_code}</td>
                    <td>{branch.city?.city_name || '-'}</td>
                    <td>{branch.tenant?.tenant_name || user?.tenant_name || '-'}</td>
                    <td>{branch.branch_address || '-'}</td>
                    <td>{branch._count?.users ?? 0}</td>
                    <td>{branch._count?.notes ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBranches;
