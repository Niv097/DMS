import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBranding } from '../context/BrandingContext';
import api, { resolvedNotificationStreamUrl } from '../utils/api';
import { buildFmsSearchQuery, fmsSearchScopeOptions, parseFmsSearchParams } from '../utils/fmsSearch';
import { getVisibleFmsMenuItems, isFmsSectionPath } from '../utils/fmsNavigation';
import { getDefaultHomePath } from '../utils/homeNavigation';
import lumienFooterMark from '../assets/lumien-footer-mark.svg';

const isBankAdministrationPath = (pathname = '') => (
  ['/admin/banks', '/admin/cities', '/admin/branches', '/admin/users', '/admin/fms-audit', '/admin/dms-archive-audit']
    .some((path) => pathname.startsWith(path))
);

const BackNavigationContext = createContext({
  setBackNavigation: () => {}
});

export const useBackNavigation = () => useContext(BackNavigationContext);

const Layout = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { branding } = useBranding();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState({
    'bank-admin': isBankAdministrationPath(location.pathname),
    fms: isFmsSectionPath(location.pathname)
  });
  const [routeLoading, setRouteLoading] = useState(false);
  const [fmsHeaderSearch, setFmsHeaderSearch] = useState({ search_by: 'ALL', q: '' });
  const [backNavigation, setBackNavigation] = useState(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const notificationRef = useRef(null);
  const searchFilterRef = useRef(null);
  const firstRoutePaintRef = useRef(true);

  const isActive = (path) => location.pathname === path;
  const homePath = getDefaultHomePath(user);
  const isFmsRoute = location.pathname.startsWith('/fms/register') || location.pathname.startsWith('/fms/inbox');

  useEffect(() => {
    setMenuOpen((current) => ({
      ...current,
      'bank-admin': isBankAdministrationPath(location.pathname),
      fms: isFmsSectionPath(location.pathname)
    }));
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (firstRoutePaintRef.current) {
      firstRoutePaintRef.current = false;
      return undefined;
    }
    setRouteLoading(true);
    const timer = setTimeout(() => setRouteLoading(false), 700);
    return () => clearTimeout(timer);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!isFmsRoute) return;
    setFmsHeaderSearch(parseFmsSearchParams(location.search));
  }, [isFmsRoute, location.search]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getMenuItems = () => {
    if (!user) return [];

    const dmsItemsByRole = (() => {
      switch (user.role) {
        case 'INITIATOR':
          return [
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Upload File', path: '/submit' },
            { label: 'Workflow Queues', path: '/queues' }
          ];
        case 'RECOMMENDER':
          return [
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Workflow Queues', path: '/queues' }
          ];
        case 'APPROVER':
          return [
            { label: 'Dashboard', path: '/dashboard' },
            { label: 'Workflow Queues', path: '/queues' }
          ];
        case 'ADMIN':
          return [
            { label: 'Dashboard', path: '/admin/dashboard' },
            {
              label: 'Bank Administration',
              key: 'bank-admin',
              children: [
                { label: 'Bank Profile', path: '/admin/banks' },
                { label: 'Cities', path: '/admin/cities' },
                { label: 'Branches', path: '/admin/branches' },
                { label: 'Users', path: '/admin/users' },
                { label: 'FMS Library Audit', path: '/admin/fms-audit' },
                { label: 'DMS Archive Audit', path: '/admin/dms-archive-audit' }
              ]
            },
            { label: 'Operations', path: '/admin/operations' },
            { label: 'Audit Logs', path: '/admin/audit' }
          ];
        case 'SUPER_ADMIN':
          return [
            { label: 'Dashboard', path: '/admin/dashboard' },
            {
              label: 'Bank Administration',
              key: 'bank-admin',
              children: [
                { label: 'Banks', path: '/admin/banks' },
                { label: 'Cities', path: '/admin/cities' },
                { label: 'Branches', path: '/admin/branches' },
                { label: 'Users', path: '/admin/users' },
                { label: 'FMS Library Audit', path: '/admin/fms-audit' },
                { label: 'DMS Archive Audit', path: '/admin/dms-archive-audit' }
              ]
            },
            { label: 'Operations', path: '/admin/operations' },
            { label: 'Audit Logs', path: '/admin/audit' }
          ];
        case 'AUDITOR':
          return [
            { label: 'Audit Logs', path: '/admin/audit' }
          ];
        default:
          return [{ label: 'Dashboard', path: '/dashboard' }];
      }
    })();

    if (user.has_fms_access || user.has_granted_fms_access) {
      return [
        ...dmsItemsByRole,
        {
          label: 'File Management',
          key: 'fms',
          children: getVisibleFmsMenuItems(user)
        }
      ];
    }

    return dmsItemsByRole;
  };

  const menuItems = getMenuItems();
  const roleLabel = user?.role === 'INITIATOR' ? 'UPLOADER' : user?.role;
  const userScopeLabel = user?.role === 'SUPER_ADMIN'
    ? 'Central Control / Multi Bank'
    : [user?.tenant_code, user?.branch_code].filter(Boolean).join(' / ');
  const showBackButton = location.pathname !== homePath;
  const { brandName, subtitle, watermarkText, logoUrl } = branding;
  const branchLocationLabel = [
    user?.branch_city_name,
    user?.branch_name ? `(${user.branch_name})` : ''
  ].filter(Boolean).join(' ') || user?.branch_name || '';
  const branchAddressLabel = user?.branch_address || '';
  const activeFmsScope = fmsSearchScopeOptions.find((option) => option.value === fmsHeaderSearch.search_by) || fmsSearchScopeOptions[0];
  const hasCustomFmsScope = activeFmsScope.value !== 'ALL';

  useEffect(() => {
    if (!user) return undefined;

    let isMounted = true;
    let eventSource;

    const loadNotifications = async () => {
      try {
        const response = await api.get('/notifications');
        if (!isMounted) return;
        setNotifications(response.data?.items || []);
        setUnreadCount(response.data?.unread_count || 0);
      } catch (error) {
        console.error('Failed to load notifications', error);
      }
    };

    loadNotifications();
    eventSource = new EventSource(resolvedNotificationStreamUrl, { withCredentials: true });

    eventSource.addEventListener('notification', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'created' && payload.notification) {
          setNotifications((current) => [payload.notification, ...current].slice(0, 15));
          setUnreadCount((current) => current + 1);
        }
        if (payload.type === 'read') {
          setNotifications((current) => current.map((item) => (
            item.id === payload.notification_id ? { ...item, is_read: true } : item
          )));
          setUnreadCount(payload.unread_count ?? 0);
        }
        if (payload.type === 'read_all') {
          setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
          setUnreadCount(0);
        }
      } catch (error) {
        console.error('Notification parse error', error);
      }
    });

    eventSource.addEventListener('connected', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setUnreadCount(payload.unread_count || 0);
      } catch {
        // no-op
      }
    });

    eventSource.onerror = () => {
      eventSource?.close();
    };

    return () => {
      isMounted = false;
      eventSource?.close();
    };
  }, [user]);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!notificationRef.current?.contains(event.target)) {
        setNotificationOpen(false);
      }
      if (!searchFilterRef.current?.contains(event.target)) {
        setFmsHeaderSearch((current) => ({ ...current, scope_open: false }));
      }
    };

    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const handleNotificationClick = async (notification) => {
    try {
      if (!notification.is_read) {
        const response = await api.post(`/notifications/${notification.id}/read`);
        setUnreadCount(response.data?.unread_count ?? unreadCount);
        setNotifications((current) => current.map((item) => (
          item.id === notification.id ? { ...item, is_read: true } : item
        )));
      }
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }

    setNotificationOpen(false);
    if (notification.entity_type === 'NOTE' && notification.entity_id) {
      navigate(`/note/${notification.entity_id}`);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setUnreadCount(0);
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    } catch (error) {
      console.error('Failed to mark notifications as read', error);
    }
  };

  const handleFmsHeaderSearch = (event) => {
    event.preventDefault();
    const query = buildFmsSearchQuery(fmsHeaderSearch);
    navigate(query ? `/fms/register?${query}` : '/fms/register');
  };

  const handleBack = async () => {
    if (typeof backNavigation?.handler === 'function') {
      const shouldContinue = await backNavigation.handler();
      if (shouldContinue === false) return;
      return;
    }
    navigate(-1);
  };

  const renderMenuEntries = () => menuItems.map((item) => {
    if (item.children?.length) {
      const childActive = item.children.some((child) => location.pathname.startsWith(child.path));
      return (
        <div key={item.key || item.label} className="sidebar-group">
          <button
            type="button"
            className={`sidebar-group-trigger ${menuOpen[item.key] ? 'is-open' : ''} ${childActive ? 'is-active' : ''}`}
            onClick={() => setMenuOpen((current) => ({ ...current, [item.key]: !current[item.key] }))}
          >
            <span>{item.label}</span>
            <span className={`sidebar-caret ${menuOpen[item.key] ? 'open' : ''}`}>▼</span>
          </button>
          {menuOpen[item.key] && (
            <div className="sidebar-submenu">
              {item.children.map((child) => (
                <Link key={child.path} to={child.path} className={isActive(child.path) ? 'active' : ''}>
                  {child.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''}>
        {item.label}
      </Link>
    );
  });

  return (
    <BackNavigationContext.Provider value={{ setBackNavigation }}>
      <div className="app-wrapper">
      <style>{`
        .topbar-brand span { color: #f3f7fb !important; }
        .topbar-brand small { color: #c7d2e2 !important; font-size: 10px !important; letter-spacing: 0.08em; text-transform: uppercase; }
        .topbar-brand-link {
          display: flex;
          align-items: center;
          gap: 10px;
          color: inherit;
          text-decoration: none;
          min-width: 0;
          max-width: 100%;
          overflow: hidden;
        }
        .topbar-brand-logo {
          width: 30px;
          height: 30px;
          object-fit: contain;
          flex-shrink: 0;
        }
        .topbar-brand-copy {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          min-width: 0;
          flex: 1;
          overflow: hidden;
        }
        .topbar-brand-title-row {
          display: inline-flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .topbar-brand-location {
          color: #bfd0e4;
          font-size: 10px;
          line-height: 1.2;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .topbar-nav {
          display: flex;
          align-items: center;
          flex: 1;
          min-width: 0;
        }
        .mobile-menu-btn {
          display: none;
          width: 38px;
          height: 38px;
          border: 1px solid rgba(203, 213, 225, 0.28);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          color: #eef4fb;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .mobile-menu-btn:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .mobile-menu-drawer {
          display: none;
        }
        .mobile-menu-drawer .sidebar-section {
          display: grid;
          gap: 8px;
          padding: 0 12px;
        }
        .mobile-menu-drawer .sidebar-section > a,
        .mobile-menu-drawer .sidebar-submenu a {
          display: flex;
          align-items: center;
          width: 100%;
          min-height: 42px;
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #24384f;
          text-decoration: none;
          border: 1px solid transparent;
          background: transparent;
        }
        .mobile-menu-drawer .sidebar-section > a:hover,
        .mobile-menu-drawer .sidebar-submenu a:hover {
          background: #eef2f5;
          color: #18385e;
          border-color: #d5dce5;
        }
        .mobile-menu-drawer .sidebar-section > a.active,
        .mobile-menu-drawer .sidebar-submenu a.active {
          background: #f3f7fb;
          color: #1a365d;
          font-weight: 600;
          border-color: #d8e0ea;
        }
        .mobile-drawer-overlay {
          display: none;
        }
        .topbar-fms-search {
          flex: 1;
          max-width: 540px;
          min-width: 0;
          margin-left: auto;
          margin-right: 8px;
        }
        .topbar-fms-search-row {
          display: flex;
          align-items: center;
          min-width: 0;
          gap: 8px;
        }
        .topbar-fms-input-shell {
          flex: 1;
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          height: 34px;
          padding: 0 12px;
          border: 1px solid rgba(205, 220, 239, 0.12);
          background: rgba(255, 255, 255, 0.025);
          border-radius: 10px;
        }
        .topbar-fms-search-icon {
          width: 14px;
          height: 14px;
          stroke: #cddbeb;
          flex-shrink: 0;
        }
        .topbar-fms-active-scope {
          display: inline-flex;
          align-items: center;
          flex-shrink: 0;
          max-width: 132px;
          padding: 4px 8px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.08);
          color: #dfeaf7;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .topbar-fms-search-row input {
          flex: 1;
          min-width: 0;
          height: 32px;
          border: none;
          outline: none;
          font-family: inherit;
          background: transparent;
          color: #eef4fb;
          padding: 0;
          font-size: 12.5px;
        }
        .topbar-fms-search-row input::placeholder {
          color: #9fb3ca;
        }
        .topbar-fms-filter-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .topbar-fms-filter-btn {
          width: 34px;
          height: 34px;
          border: none;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.025);
          color: #dfeaf7;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 1px solid rgba(205, 220, 239, 0.12);
        }
        .topbar-fms-filter-btn:hover {
          background: rgba(255, 255, 255, 0.08);
        }
        .topbar-fms-filter-btn.is-active {
          background: rgba(255, 255, 255, 0.09);
          border-color: rgba(205, 220, 239, 0.22);
        }
        .topbar-fms-filter-btn svg {
          width: 14px;
          height: 14px;
          stroke: currentColor;
        }
        .topbar-fms-filter-indicator {
          position: absolute;
          top: -2px;
          right: -2px;
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #8fb4e6;
          border: 2px solid #123764;
        }
        .topbar-fms-filter-menu {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          min-width: 220px;
          background: #ffffff;
          border: 1px solid #d4dfec;
          border-radius: 12px;
          box-shadow: 0 14px 32px rgba(15, 35, 64, 0.16);
          padding: 10px;
          display: grid;
          gap: 8px;
          z-index: 140;
        }
        .topbar-fms-filter-title {
          color: #6f8197;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0 2px;
        }
        .topbar-fms-filter-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
        }
        .topbar-fms-filter-option {
          border: 1px solid #d8e3ef;
          background: #ffffff;
          color: #173c6d;
          text-align: left;
          padding: 8px 10px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
        }
        .topbar-fms-filter-option:hover,
        .topbar-fms-filter-option.is-active {
          background: #eef4fb;
          border-color: #bfd3ea;
        }
        .logout-btn {
          background: transparent;
          color: #e6edf7;
          border: 1px solid rgba(203, 213, 225, 0.28);
          padding: 6px 14px;
          border-radius: 2px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          cursor: pointer;
          margin-left: 15px;
          transition: all 0.3s;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .logout-btn:hover {
          background: rgba(255,255,255,0.08);
          color: white;
        }
        .user-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: rgba(255, 255, 255, 0.04);
          padding: 6px 12px;
          border-radius: 2px;
          border: 1px solid rgba(255, 255, 255, 0.12);
        }
        .user-indicator {
          width: 6px;
          height: 6px;
          border-radius: 0;
          background: #9fb7d7;
        }
        .sidebar-section a {
          transition: background-color 180ms ease, color 180ms ease, border-color 180ms ease;
        }
        .sidebar-section a:hover {
          box-shadow: none;
        }
        .sidebar-group {
          display: grid;
          gap: 4px;
          background: transparent;
        }
        .sidebar-group + .sidebar-group,
        .sidebar-group + a,
        .sidebar-section a + .sidebar-group,
        .sidebar-section a + a {
          margin-top: 8px;
        }
        .sidebar-group-trigger {
          width: 100%;
          border: 1px solid transparent;
          background: transparent;
          color: #173c6d;
          padding: 8px 12px;
          text-align: left;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          border-radius: 8px;
        }
        .sidebar-group-trigger:hover {
          background: #f8fafc;
          border-color: #e7edf4;
        }
        .sidebar-group-trigger.is-open,
        .sidebar-group-trigger.is-active {
          background: transparent;
          border-color: transparent;
          color: #123764;
        }
        .sidebar-submenu {
          margin-left: 10px;
          padding: 2px 0 2px 10px;
          border-left: 1px solid #dde6f0;
          background: transparent;
        }
        .sidebar-submenu a {
          display: block;
          border-radius: 8px;
          padding-left: 12px;
          font-size: 13px;
        }
        .sidebar-caret {
          font-size: 11px;
          color: #6a7f98;
          transition: transform 180ms ease;
        }
        .sidebar-caret.open {
          transform: rotate(180deg);
        }
        .user-chip, .btn-submit-top {
          transition: border-color 180ms ease, background-color 180ms ease;
        }
        .user-chip:hover, .btn-submit-top:hover {
          transform: none;
          box-shadow: none;
        }
        .notification-wrap {
          position: relative;
          flex-shrink: 0;
        }
        .notification-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-width: 96px;
          min-height: 40px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.025) 100%);
          color: #eef4fb;
          border: 1px solid rgba(203, 213, 225, 0.22);
          padding: 0 14px 0 12px;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
          transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
        }
        .notification-btn:hover {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.09) 0%, rgba(255, 255, 255, 0.045) 100%);
          border-color: rgba(203, 213, 225, 0.34);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 28px rgba(8, 24, 48, 0.16);
        }
        .notification-btn:focus-visible {
          outline: none;
          border-color: rgba(152, 190, 233, 0.85);
          box-shadow: 0 0 0 3px rgba(109, 153, 206, 0.22);
        }
        .notification-btn.is-open {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%);
          border-color: rgba(184, 206, 232, 0.36);
        }
        .notification-btn-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          color: #edf3fb;
        }
        .notification-btn-label {
          line-height: 1;
          white-space: nowrap;
        }
        .notification-count {
          position: absolute;
          top: -7px;
          right: -7px;
          min-width: 21px;
          height: 21px;
          border-radius: 999px;
          background: linear-gradient(180deg, #f59e0b 0%, #ea580c 100%);
          color: white;
          font-size: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 6px;
          border: 2px solid #123764;
          box-shadow: 0 10px 20px rgba(234, 88, 12, 0.3);
        }
        .notification-panel {
          position: absolute;
          top: calc(100% + 10px);
          right: 0;
          width: min(380px, calc(100vw - 24px));
          background: #fff;
          border: 1px solid #d4deea;
          box-shadow: 0 18px 45px rgba(15, 35, 64, 0.16);
          border-radius: 10px;
          overflow: hidden;
          z-index: 120;
        }
        .notification-panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 14px;
          background: #f7fafe;
          border-bottom: 1px solid #e4ebf2;
        }
        .notification-panel-header strong {
          color: #173c6d;
          font-size: 13px;
        }
        .notification-panel-header button {
          border: none;
          background: transparent;
          color: #1a4fa0;
          font-size: 12px;
          cursor: pointer;
          font-weight: 600;
        }
        .notification-list {
          max-height: 420px;
          overflow-y: auto;
        }
        .notification-item {
          width: 100%;
          text-align: left;
          border: none;
          background: #fff;
          padding: 12px 14px;
          border-bottom: 1px solid #eef2f6;
          cursor: pointer;
        }
        .notification-item.unread {
          background: #f4f8fe;
        }
        .notification-item:hover {
          background: #eef4fb;
        }
        .notification-item-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 4px;
          color: #173c6d;
          font-size: 12px;
          font-weight: 700;
        }
        .notification-item-message {
          color: #465b73;
          font-size: 12px;
          line-height: 1.45;
        }
        .notification-item-time {
          color: #8091a7;
          font-size: 10px;
          margin-top: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .notification-empty {
          padding: 26px 18px;
          text-align: center;
          color: #60758d;
          font-size: 12px;
        }
        .global-back-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 14px;
        }
        .global-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #cfd8e3;
          background: #ffffff;
          color: #1f3b66;
          border-radius: 2px;
          padding: 8px 14px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          box-shadow: none;
          transition: border-color 180ms ease, background-color 180ms ease;
        }
        .global-back-btn:hover {
          transform: none;
          border-color: #9bb0c8;
          background: #f7f9fb;
        }
        .global-back-btn span {
          font-size: 16px;
          line-height: 1;
        }
        .page-transition-overlay {
          position: fixed;
          top: 56px;
          left: 0;
          right: 0;
          height: 4px;
          z-index: 2000;
          background: rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: flex-start;
          pointer-events: none;
        }
        .page-transition-chip {
          width: 100%;
          height: 100%;
          overflow: hidden;
        }
        .page-transition-spinner {
          display: block;
          height: 100%;
          width: 34%;
          border-radius: 999px;
          background: linear-gradient(90deg, #5d90d8 0%, #1f5db9 45%, #103f7f 100%);
          box-shadow: 0 6px 18px rgba(29, 77, 143, 0.22);
          animation: pageTransitionSlide 0.95s ease-in-out infinite;
        }
        @keyframes pageTransitionSlide {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(320%); }
        }
        .sidebar-watermark {
          margin-top: 10px;
          padding: 8px 12px 0;
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }
        .sidebar-watermark-logo {
          width: 26px;
          height: 26px;
          object-fit: contain;
          flex-shrink: 0;
          opacity: 0.92;
        }
        .sidebar-watermark-company {
          color: #7c8eab;
          font-size: 10.5px;
          line-height: 1.35;
          font-weight: 600;
          letter-spacing: 0.01em;
        }
        @media (max-width: 1280px) {
          .topbar-fms-search {
            max-width: 500px;
          }
        }
        @media (max-width: 1080px) {
          .mobile-menu-btn {
            display: inline-flex;
          }
          .mobile-menu-drawer {
            display: flex;
            position: fixed;
            top: 56px;
            left: 0;
            bottom: 0;
            width: min(320px, 86vw);
            background: #f4f6f8;
            border-right: 1px solid #cfd8e3;
            z-index: 180;
            transform: translateX(-100%);
            transition: transform 180ms ease;
            flex-direction: column;
            overflow-y: auto;
            box-shadow: 8px 0 24px rgba(15, 35, 64, 0.18);
          }
          .mobile-menu-drawer.is-open {
            transform: translateX(0);
          }
          .mobile-drawer-overlay {
            display: block;
            position: fixed;
            inset: 56px 0 0 0;
            background: rgba(15, 23, 42, 0.38);
            z-index: 170;
            border: 0;
            padding: 0;
          }
          .topbar {
            padding: 0 14px;
            gap: 10px;
            overflow: hidden;
          }
          .topbar-brand {
            margin-right: 0;
            min-width: 0;
            flex: 1;
            overflow: hidden;
          }
          .topbar-brand-title-row > span:first-child {
            max-width: 150px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .topbar-brand-location {
            max-width: 180px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .topbar-fms-search {
            max-width: none;
            margin-right: 8px;
          }
          .topbar-right {
            gap: 8px;
            min-width: 0;
            margin-left: auto;
          }
          .user-chip {
            display: none;
          }
          .logout-btn {
            margin-left: 0;
            padding: 6px 10px;
          }
          .topbar-fms-search-row {
            gap: 8px;
          }
          .topbar-fms-input-shell {
            min-width: 0;
          }
          .topbar-fms-filter-grid {
            grid-template-columns: 1fr;
          }
          .notification-panel {
            right: -8px;
            width: min(360px, calc(100vw - 20px));
          }
        }
        @media (max-width: 760px) {
          .topbar {
            padding: 0 10px;
            gap: 8px;
            overflow: hidden;
          }
          .topbar-brand {
            flex: 1;
            min-width: 0;
            overflow: hidden;
          }
          .topbar-brand-link {
            min-width: 0;
            max-width: 100%;
            width: 100%;
          }
          .topbar-brand-copy {
            min-width: 0;
            overflow: hidden;
          }
          .topbar-brand-title-row {
            display: flex;
            align-items: center;
            gap: 0;
            min-width: 0;
            width: 100%;
          }
          .topbar-brand-title-row > span:first-child {
            display: block;
            min-width: 0;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 14px;
            line-height: 1.2;
          }
          .topbar-brand small,
          .topbar-brand-location {
            display: none !important;
          }
          .topbar-right {
            gap: 6px;
            margin-left: 0;
            min-width: 0;
            flex-shrink: 1;
          }
          .notification-btn,
          .logout-btn {
            padding: 6px 8px;
            font-size: 10px;
            min-width: 0;
          }
          .notification-btn {
            min-width: 40px;
            padding: 0 10px;
          }
          .logout-btn {
            margin-left: 0;
            padding: 0 8px;
            min-height: 36px;
          }
          .notification-btn-label {
            display: none;
          }
          .topbar-fms-search {
            margin-right: 0;
          }
          .topbar-fms-input-shell {
            padding: 0 10px;
          }
          .topbar-fms-active-scope {
            display: none;
          }
          .mobile-menu-btn {
            width: 36px;
            height: 36px;
            font-size: 12px;
          }
          .mobile-menu-drawer {
            width: min(300px, 88vw);
          }
          .notification-panel {
            position: fixed;
            top: 64px;
            left: 10px;
            right: 10px;
            width: auto;
            max-height: calc(100vh - 84px);
          }
          .notification-list {
            max-height: calc(100vh - 150px);
          }
          .topbar-fms-filter-menu {
            right: 0;
            left: auto;
            min-width: min(220px, calc(100vw - 24px));
          }
        }
      `}</style>

      <header className="topbar">
        <button
          type="button"
          className="mobile-menu-btn"
          onClick={() => setMobileNavOpen((current) => !current)}
          aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileNavOpen ? 'true' : 'false'}
        >
          <span aria-hidden="true">{mobileNavOpen ? 'X' : '≡'}</span>
        </button>
        <div className="topbar-brand">
          <Link to={homePath} className="topbar-brand-link">
            {logoUrl && <img src={logoUrl} alt={`${brandName} logo`} className="topbar-brand-logo" />}
            <span className="topbar-brand-copy">
              <span className="topbar-brand-title-row">
                <span>{brandName}</span> <small>{subtitle}</small>
              </span>
              {(branchLocationLabel || branchAddressLabel) && (
                <span className="topbar-brand-location" title={branchAddressLabel || branchLocationLabel}>
                  {branchLocationLabel || branchAddressLabel}
                </span>
              )}
            </span>
          </Link>
        </div>
        <nav className="topbar-nav">
          {isFmsRoute ? (
            <form className="topbar-fms-search" onSubmit={handleFmsHeaderSearch}>
              <div className="topbar-fms-search-row">
                <div className="topbar-fms-input-shell">
                  <svg viewBox="0 0 16 16" fill="none" className="topbar-fms-search-icon" aria-hidden="true">
                    <circle cx="7" cy="7" r="4.5" strokeWidth="1.5" />
                    <path d="M10.5 10.5L14 14" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {hasCustomFmsScope && (
                    <span className="topbar-fms-active-scope">{activeFmsScope.label}</span>
                  )}
                  <input
                    type="text"
                    value={fmsHeaderSearch.q}
                    onChange={(event) => setFmsHeaderSearch((current) => ({ ...current, q: event.target.value }))}
                    placeholder="Search records..."
                    aria-label="Search FMS register"
                  />
                </div>
                <div className="topbar-fms-filter-wrap" ref={searchFilterRef}>
                  <button
                    type="button"
                    className={`topbar-fms-filter-btn ${hasCustomFmsScope ? 'is-active' : ''}`}
                    onClick={() => setFmsHeaderSearch((current) => ({ ...current, scope_open: !current.scope_open }))}
                    aria-haspopup="menu"
                    aria-expanded={fmsHeaderSearch.scope_open ? 'true' : 'false'}
                    title={`Search by ${activeFmsScope.label}`}
                  >
                    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                      <path d="M3 5.5H17" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M6 10H14" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M8.5 14.5H11.5" strokeWidth="1.7" strokeLinecap="round" />
                      <circle cx="6" cy="5.5" r="1.5" fill="currentColor" stroke="none" />
                      <circle cx="12.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
                      <circle cx="9" cy="14.5" r="1.5" fill="currentColor" stroke="none" />
                    </svg>
                    {hasCustomFmsScope && <span className="topbar-fms-filter-indicator" aria-hidden="true"></span>}
                  </button>
                  {fmsHeaderSearch.scope_open && (
                    <div className="topbar-fms-filter-menu" role="menu">
                      <div className="topbar-fms-filter-title">Search By</div>
                      <div className="topbar-fms-filter-grid">
                        {fmsSearchScopeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            role="menuitemradio"
                            aria-checked={option.value === fmsHeaderSearch.search_by}
                            className={`topbar-fms-filter-option ${option.value === fmsHeaderSearch.search_by ? 'is-active' : ''}`}
                            onClick={() => setFmsHeaderSearch((current) => ({ ...current, search_by: option.value, scope_open: false }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </form>
          ) : null}
        </nav>
        <div className="topbar-right">
          <div className="notification-wrap" ref={notificationRef}>
            <button
              type="button"
              className={`notification-btn ${notificationOpen ? 'is-open' : ''}`}
              onClick={() => setNotificationOpen((current) => !current)}
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              title="Notifications"
            >
              <svg viewBox="0 0 20 20" fill="none" className="notification-btn-icon" aria-hidden="true">
                <path d="M10 3.25a3.25 3.25 0 0 0-3.25 3.25v1.08c0 .62-.18 1.23-.52 1.75L5 11.5v1.25h10V11.5l-1.23-2.17a3.57 3.57 0 0 1-.52-1.75V6.5A3.25 3.25 0 0 0 10 3.25Z" stroke="currentColor" strokeWidth="1.45" strokeLinejoin="round" />
                <path d="M8.25 14.25a1.75 1.75 0 0 0 3.5 0" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
              </svg>
              <span className="notification-btn-label">Alerts</span>
              {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            {notificationOpen && (
              <div className="notification-panel">
                <div className="notification-panel-header">
                  <strong>Real-Time Notifications</strong>
                  <button type="button" onClick={handleMarkAllRead}>Mark all read</button>
                </div>
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="notification-empty">No notifications available right now.</div>
                  ) : notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      className={`notification-item ${notification.is_read ? '' : 'unread'}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="notification-item-title">
                        <span>{notification.title}</span>
                        {!notification.is_read && <span className="badge badge-blue">NEW</span>}
                      </div>
                      <div className="notification-item-message">{notification.message}</div>
                      <div className="notification-item-time">{new Date(notification.created_at).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="user-chip">
            <span className="user-indicator"></span>
            <span className="topbar-user">
              {user?.name} <strong>({roleLabel})</strong>
              {userScopeLabel && (
                <span style={{ display: 'block', fontSize: '10px', color: '#bfd0e4' }}>
                  {userScopeLabel}
                </span>
              )}
            </span>
          </div>
          <button onClick={handleLogout} className="logout-btn">Sign Out</button>
        </div>
      </header>

      {mobileNavOpen ? (
        <button
          type="button"
          className="mobile-drawer-overlay"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation"
        ></button>
      ) : null}

      <div className="layout-body">
        <aside className={`mobile-menu-drawer ${mobileNavOpen ? 'is-open' : ''}`}>
          <div className="sidebar-main">
            <div className="sidebar-label">Main Menu</div>
            <div className="sidebar-section">
              {renderMenuEntries()}
            </div>
          </div>
          <div className="sidebar-footer-block">
            <div className="sidebar-label">System</div>
            <div className="sidebar-section">
              <Link to="/profile" className={isActive('/profile') ? 'active' : ''}>
                My Profile
              </Link>
            </div>
            <div className="sidebar-watermark">
              <img src={lumienFooterMark} alt="Lumien" className="sidebar-watermark-logo" />
              <div className="sidebar-watermark-company">{watermarkText}</div>
            </div>
          </div>
        </aside>
        <aside className="sidebar">
          <div className="sidebar-main">
            <div className="sidebar-label">Main Menu</div>
            <div className="sidebar-section">
            {menuItems.map((item) => {
              if (item.children?.length) {
                const childActive = item.children.some((child) => location.pathname.startsWith(child.path));
                return (
                  <div key={item.key || item.label} className="sidebar-group">
                    <button
                      type="button"
                      className={`sidebar-group-trigger ${menuOpen[item.key] ? 'is-open' : ''} ${childActive ? 'is-active' : ''}`}
                      onClick={() => setMenuOpen((current) => ({ ...current, [item.key]: !current[item.key] }))}
                    >
                      <span>{item.label}</span>
                      <span className={`sidebar-caret ${menuOpen[item.key] ? 'open' : ''}`}>▼</span>
                    </button>
                    {menuOpen[item.key] && (
                      <div className="sidebar-submenu">
                        {item.children.map((child) => (
                          <Link key={child.path} to={child.path} className={isActive(child.path) ? 'active' : ''}>
                            {child.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link key={item.path} to={item.path} className={isActive(item.path) ? 'active' : ''}>
                  {item.label}
                </Link>
              );
            })}
          </div>
          </div>
          <div className="sidebar-footer-block">
            <div className="sidebar-label">System</div>
            <div className="sidebar-section">
              <Link to="/profile" className={isActive('/profile') ? 'active' : ''}>
                My Profile
              </Link>
            </div>
            <div className="sidebar-watermark">
              <img src={lumienFooterMark} alt="Lumien" className="sidebar-watermark-logo" />
              <div className="sidebar-watermark-company">{watermarkText}</div>
            </div>
          </div>
        </aside>

        <main className="main-content content-shell">
          {routeLoading && (
            <div className="page-transition-overlay" aria-hidden="true">
              <div className="page-transition-chip">
                <span className="page-transition-spinner"></span>
              </div>
            </div>
          )}
          {showBackButton && (
            <div className="global-back-row">
              <button type="button" className="global-back-btn" onClick={handleBack}>
                <span>&lt;</span> Back
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
      </div>
    </BackNavigationContext.Provider>
  );
};

export default Layout;
