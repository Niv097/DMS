import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const formatDate = (value) => {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleDateString();
};

const getLicensePriority = (status = '') => {
  if (status === 'Expired') return 0;
  if (status === 'Not Recorded') return 1;
  if (String(status).startsWith('Due in ')) return 2;
  return 9;
};

const getSupportPriority = (status = '') => {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'OFFLINE') return 0;
  if (normalized === 'KEY_REQUIRED') return 1;
  if (normalized === 'NOT_CONFIGURED') return 2;
  return 9;
};

const AdminConsoleDashboard = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState({
    tenants: 0,
    dedicatedDeployments: 0,
    licenseAttention: 0,
    supportAttention: 0,
    cities: 0,
    branches: 0,
    users: 0
  });
  const [recentBanks, setRecentBanks] = useState([]);
  const [attentionBanks, setAttentionBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      try {
        const [tenantsRes, citiesRes, branchesRes, usersRes] = await Promise.allSettled([
          api.get('/admin/tenants'),
          api.get('/admin/cities'),
          api.get('/admin/branches'),
          api.get('/admin/users')
        ]);

        const tenantRows = tenantsRes.status === 'fulfilled' ? (tenantsRes.value.data || []) : [];
        const sortedByNewest = [...tenantRows].sort((left, right) => {
          const leftTime = new Date(left.created_at || 0).getTime();
          const rightTime = new Date(right.created_at || 0).getTime();
          return rightTime - leftTime;
        });
        const attentionRows = [...tenantRows]
          .filter((tenant) => (
            ['Expired', 'Not Recorded'].includes(tenant.license_status)
            || String(tenant.license_status || '').startsWith('Due in ')
            || ['OFFLINE', 'KEY_REQUIRED', 'NOT_CONFIGURED'].includes(String(tenant.support_last_status || '').toUpperCase())
          ))
          .sort((left, right) => {
            const licenseDelta = getLicensePriority(left.license_status) - getLicensePriority(right.license_status);
            if (licenseDelta !== 0) return licenseDelta;

            const supportDelta = getSupportPriority(left.support_last_status) - getSupportPriority(right.support_last_status);
            if (supportDelta !== 0) return supportDelta;

            const leftTime = new Date(left.created_at || 0).getTime();
            const rightTime = new Date(right.created_at || 0).getTime();
            return rightTime - leftTime;
          });

        setSummary({
          tenants: tenantRows.length,
          dedicatedDeployments: tenantRows.filter((tenant) => tenant.deployment_mode === 'DEDICATED').length,
          licenseAttention: tenantRows.filter((tenant) => ['Expired', 'Not Recorded'].includes(tenant.license_status) || String(tenant.license_status || '').startsWith('Due in ')).length,
          supportAttention: tenantRows.filter((tenant) => ['OFFLINE', 'KEY_REQUIRED', 'NOT_CONFIGURED'].includes(String(tenant.support_last_status || '').toUpperCase())).length,
          cities: citiesRes.status === 'fulfilled' ? (citiesRes.value.data || []).length : 0,
          branches: branchesRes.status === 'fulfilled' ? (branchesRes.value.data || []).length : 0,
          users: usersRes.status === 'fulfilled' ? (usersRes.value.data || []).length : 0
        });
        setRecentBanks(sortedByNewest.slice(0, 4));
        setAttentionBanks(attentionRows.slice(0, 4));

        const firstFailure = [tenantsRes, citiesRes, branchesRes, usersRes].find((item) => item.status === 'rejected');
        setMessage(firstFailure?.reason?.response?.data?.error || '');
      } catch (error) {
        setMessage(error.response?.data?.error || 'Unable to load bank administration summary.');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, []);

  const statCards = useMemo(() => {
    if (!isSuperAdmin) {
      return [
        { key: 'branches', label: 'Branches', value: summary.branches },
        { key: 'users', label: 'Users', value: summary.users },
        { key: 'cities', label: 'Cities', value: summary.cities }
      ];
    }

    return [
      { key: 'tenants', label: 'Banks', value: summary.tenants },
      { key: 'branches', label: 'Branches', value: summary.branches },
      { key: 'users', label: 'Users', value: summary.users },
      { key: 'dedicatedDeployments', label: 'Dedicated', value: summary.dedicatedDeployments },
      { key: 'attention', label: 'Attention', value: summary.licenseAttention + summary.supportAttention }
    ];
  }, [isSuperAdmin, summary]);

  const quickLinks = useMemo(() => ([
    ...(isSuperAdmin ? [{ label: 'Bank Setup', path: '/admin/banks', count: summary.tenants }] : []),
    { label: 'Cities', path: '/admin/cities', count: summary.cities },
    { label: 'Branches', path: '/admin/branches', count: summary.branches },
    { label: 'Users', path: '/admin/users', count: summary.users }
  ]), [isSuperAdmin, summary]);

  return (
    <div>
      <div className="page-header">
        <h1>{isSuperAdmin ? 'Super Admin Control Dashboard' : 'Bank Administration Dashboard'}</h1>
        <p>
          {isSuperAdmin
            ? 'A simple live desk for bank setup, branch structure, users, and attention items.'
            : 'Manage branches, users, and bank setup from one clean control desk.'}
        </p>
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

      <div className="stats-grid" style={{ marginBottom: '18px', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        {statCards.map((card) => (
          <div key={card.key} className="stat-card">
            <div className="stat-label">{card.label}</div>
            <div className="stat-value">{loading ? '...' : card.value}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="card-header blue">Quick Actions</div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
            {quickLinks.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  textDecoration: 'none',
                  color: '#173252',
                  border: '1px solid #d7e0ea',
                  borderRadius: '14px',
                  padding: '14px 16px',
                  background: '#fff',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '12px'
                }}
              >
                <strong>{item.label}</strong>
                <span className="badge badge-blue">{loading ? '...' : item.count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {isSuperAdmin && (
        <div className="two-col">
          <div className="card">
            <div className="card-header">Latest Banks</div>
            <div className="card-body">
              {loading ? (
                <div className="text-muted">Loading latest banks...</div>
              ) : recentBanks.length === 0 ? (
                <div className="text-muted">No bank profiles created yet.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {recentBanks.map((tenant) => (
                    <div key={tenant.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', background: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, color: '#173252' }}>{tenant.brand_display_name || tenant.tenant_name}</div>
                          <div className="text-sm text-muted">{tenant.brand_short_code || tenant.tenant_code} | Created {formatDate(tenant.created_at)}</div>
                        </div>
                        <span className="badge badge-blue">{tenant.deployment_mode || 'SHARED'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">Attention Needed</div>
            <div className="card-body">
              {loading ? (
                <div className="text-muted">Loading attention records...</div>
              ) : attentionBanks.length === 0 ? (
                <div className="text-muted">No bank currently needs attention.</div>
              ) : (
                <div style={{ display: 'grid', gap: '10px' }}>
                  {attentionBanks.map((tenant) => (
                    <div key={tenant.id} style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px 14px', background: '#fff' }}>
                      <div style={{ fontWeight: 700, color: '#173252', marginBottom: '4px' }}>{tenant.brand_display_name || tenant.tenant_name}</div>
                      <div className="text-sm text-muted" style={{ marginBottom: '8px' }}>
                        {(tenant.brand_short_code || tenant.tenant_code)} | {tenant.deployment_host || 'No domain'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <span className="badge badge-amber">License: {tenant.license_status || 'Not Recorded'}</span>
                        <span className="badge badge-blue">Support: {tenant.support_last_status || 'Pending'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminConsoleDashboard;
