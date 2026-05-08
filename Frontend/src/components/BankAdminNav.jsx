import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const BankAdminNav = () => {
  const { user } = useAuth();
  const location = useLocation();

  const items = [
    { label: 'Dashboard', path: '/admin/dashboard' },
    ...(user?.role === 'SUPER_ADMIN' ? [{ label: 'Banks', path: '/admin/banks' }] : []),
    { label: 'Cities', path: '/admin/cities' },
    { label: 'Branches', path: '/admin/branches' },
    { label: 'Users', path: '/admin/users' },
    { label: 'FMS Library Audit', path: '/admin/fms-audit' },
    { label: 'DMS Archive Audit', path: '/admin/dms-archive-audit' }
  ];

  return (
    <div style={{
      display: 'flex',
      gap: '10px',
      flexWrap: 'wrap',
      padding: '16px',
      border: '1px solid #dde6ef',
      background: '#ffffff',
      borderRadius: '16px',
      marginBottom: '18px'
    }}>
      {items.map((item) => {
        const active = location.pathname === item.path;
        return (
          <Link
            key={item.path}
            to={item.path}
            style={{
              textDecoration: 'none',
              padding: '10px 18px',
              borderRadius: '999px',
              border: active ? '1px solid #b7c9e2' : '1px solid #dce5ee',
              background: active ? '#f4f8fd' : '#fbfdff',
              color: active ? '#1f436d' : '#55708c',
              fontWeight: active ? 700 : 600,
              fontSize: '14px',
              boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.8)' : 'none'
            }}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
};

export default BankAdminNav;
