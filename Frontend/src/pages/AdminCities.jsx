import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;
const normalizeCode = (value = '') => String(value).toUpperCase().replace(/[^A-Z0-9]/g, '');
const buildCityCode = (cityName = '') => normalizeCode(cityName).slice(0, 12);
const buildStateCode = (stateName = '') => (
  String(stateName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => normalizeCode(token)[0] || '')
    .join('')
    .slice(0, 4)
);

const emptyCityForm = {
  tenant_id: '',
  city_name: '',
  city_code: '',
  state_name: '',
  state_code: ''
};

const AdminCities = () => {
  const { user } = useAuth();
  const [cities, setCities] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [cityForm, setCityForm] = useState(emptyCityForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [stateCodeTouched, setStateCodeTouched] = useState(false);
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const [citiesRes, tenantsRes] = await Promise.allSettled([
        api.get('/admin/cities'),
        api.get('/admin/tenants')
      ]);

      const citiesData = citiesRes.status === 'fulfilled' ? (citiesRes.value.data || []) : [];
      const tenantsData = tenantsRes.status === 'fulfilled' ? (tenantsRes.value.data || []) : [];
      setCities(citiesData);
      setTenants(tenantsData);
      setCityForm((current) => ({
        ...current,
        tenant_id: current.tenant_id || user?.tenant_id || tenantsData?.[0]?.id || ''
      }));

      if (!preserveMessage) {
        setMessage(citiesRes.status === 'rejected'
          ? (citiesRes.reason?.response?.data?.error || 'Unable to load city records.')
          : '');
      }
    } catch (error) {
      if (!preserveMessage) {
        setMessage(error.response?.data?.error || 'Unable to load city records.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!stateCodeTouched) {
      setCityForm((current) => ({ ...current, state_code: buildStateCode(current.state_name) }));
    }
  }, [cityForm.state_name, stateCodeTouched]);

  const visibleTenantName = useMemo(() => (
    tenants.find((tenant) => String(tenant.id) === String(cityForm.tenant_id))?.tenant_name || user?.tenant_name || 'Selected Bank'
  ), [cityForm.tenant_id, tenants, user?.tenant_name]);

  const handleCreateCity = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/admin/cities', {
        ...cityForm,
        tenant_id: Number(cityForm.tenant_id)
      });
      setStateCodeTouched(false);
      setCityForm((current) => ({
        ...emptyCityForm,
        tenant_id: current.tenant_id
      }));
      await loadData({ preserveMessage: true });
      setMessage('City created successfully. It is now available in branch creation.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to create city.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>City Master</h1>
        <p>Create branch locations bank-wise first, so branch onboarding and future user transfers stay clean.</p>
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
          <div className="card-header blue">Add City</div>
          <div className="card-body">
            <form onSubmit={handleCreateCity}>
              <div className="form-grid cols-2">
                {isSuperAdmin && (
                  <div className="form-group">
                    <label>Bank<RequiredMark /></label>
                    <select value={cityForm.tenant_id} onChange={(event) => setCityForm({ ...cityForm, tenant_id: event.target.value })} required>
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
                    <input type="text" value={`${visibleTenantName}${user?.tenant_code ? ` (${user.tenant_code})` : ''}`} readOnly />
                  </div>
                )}
                <div className="form-group">
                  <label>City Name<RequiredMark /></label>
                  <input
                    type="text"
                    value={cityForm.city_name}
                    onChange={(event) => setCityForm({ ...cityForm, city_name: event.target.value })}
                    placeholder="Example: Ahmedabad"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>State</label>
                  <input
                    type="text"
                    value={cityForm.state_name}
                    onChange={(event) => setCityForm({ ...cityForm, state_name: event.target.value })}
                    placeholder="Example: Gujarat"
                  />
                </div>
                <div className="form-group">
                  <label>State Code</label>
                  <input
                    type="text"
                    value={cityForm.state_code}
                    onChange={(event) => {
                      setStateCodeTouched(true);
                      setCityForm({ ...cityForm, state_code: normalizeCode(event.target.value).slice(0, 4) });
                    }}
                    placeholder="Example: GJ"
                  />
                </div>
              </div>
              <div className="action-row">
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Add City'}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Registered Cities</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>City</th>
                  <th>Code</th>
                  <th>State</th>
                  <th>Bank</th>
                  <th>Branches</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>Loading cities...</td></tr>
                ) : cities.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', padding: '24px' }}>No cities created yet.</td></tr>
                ) : cities.map((city) => (
                  <tr key={city.id}>
                    <td>{city.city_name}</td>
                    <td>{city.city_code}</td>
                    <td>{city.state_name || city.state_code || '-'}</td>
                    <td>{city.tenant?.tenant_name || user?.tenant_name || '-'}</td>
                    <td>{city._count?.branches ?? 0}</td>
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

export default AdminCities;
