import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../utils/api';
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

const getUserFmsStatus = (managedUser) => {
  const fmsEnabled = Boolean(managedUser.fms_enabled);
  if (fmsEnabled) {
    return {
      key: 'ACTIVE',
      label: 'FMS ACTIVE',
      badgeClass: 'badge-green'
    };
  }
  if (managedUser.has_granted_fms_access) {
    return {
      key: 'CIRCULAR_ONLY',
      label: 'CIRCULAR ONLY',
      badgeClass: 'badge-amber'
    };
  }
  if (!managedUser.fms_enabled && !managedUser.has_fms_access) {
    return {
      key: 'OFF',
      label: 'FMS OFF',
      badgeClass: 'badge-red'
    };
  }
  return {
    key: 'INACTIVE',
    label: 'FMS OFF',
    badgeClass: 'badge-red'
  };
};

const applyEditorStateToUser = (managedUser, editorDraft) => {
  if (!managedUser || !editorDraft || String(managedUser.id) !== String(editorDraft.id)) {
    return managedUser;
  }

  const effectiveEnabled = Boolean(editorDraft.fms_enabled);
  const effectivePermissions = effectiveEnabled ? expandFmsRoleProfile(editorDraft.fms_profile || 'VIEW_ONLY') : [];

  return {
    ...managedUser,
    fms_enabled: effectiveEnabled,
    has_fms_access: effectiveEnabled || Boolean(managedUser.has_granted_fms_access),
    has_granted_fms_access: Boolean(managedUser.has_granted_fms_access),
    fms_permissions: effectivePermissions,
    fms_owned_department_id: editorDraft.fms_owned_department_id || null
  };
};

const createEditorStateFromUser = (selectedUser, draft = null) => {
  if (!selectedUser) return null;
  const inferredProfile = inferFmsProfile(selectedUser);
  const normalizedProfile = inferredProfile.key === 'CUSTOM'
    ? 'RECORD_INTAKE'
    : (inferredProfile.key === 'GRANTED_VIEW' ? 'VIEW_ONLY' : inferredProfile.key);

  const baseEditor = {
    id: selectedUser.id,
    name: selectedUser.name,
    fms_enabled: Boolean(selectedUser.fms_enabled),
    current_fms_enabled: Boolean(selectedUser.fms_enabled),
    current_fms_permissions: selectedUser.fms_permissions || [],
    fms_owned_department_id: selectedUser.fms_owned_department_id ? String(selectedUser.fms_owned_department_id) : '',
    current_fms_profile: normalizedProfile,
    fms_profile: normalizedProfile
  };

  return draft ? { ...baseEditor, ...draft, id: selectedUser.id, name: selectedUser.name } : baseEditor;
};

const panelStyle = {
  borderRadius: '16px',
  border: '1px solid #dbe4ef',
  background: '#ffffff',
  boxShadow: '0 10px 26px rgba(15, 35, 64, 0.05)'
};

const AdminFmsRoles = () => {
  const location = useLocation();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [fmsDepartments, setFmsDepartments] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [filters, setFilters] = useState({
    q: '',
    branch_id: '',
    status: 'ALL'
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editor, setEditor] = useState(null);
  const [editorDrafts, setEditorDrafts] = useState({});
  const [hoveredUserId, setHoveredUserId] = useState('');

  const loadData = async ({ preserveMessage = false } = {}) => {
    setLoading(true);
    try {
      const [usersRes, branchesRes, departmentsRes] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/branches'),
        api.get('/fms/department-masters')
      ]);
      const loadedUsers = usersRes.data || [];
      setUsers(loadedUsers);
      setBranches(branchesRes.data || []);
      setFmsDepartments((departmentsRes.data?.items || []).filter((item) => item.legacy_department?.id));
      setSelectedUserId((current) => {
        if (current && loadedUsers.some((item) => String(item.id) === String(current))) return current;
        const firstEligible = loadedUsers.find((item) => !['ADMIN', 'SUPER_ADMIN'].includes(item.role));
        return firstEligible ? String(firstEligible.id) : '';
      });
      if (!preserveMessage) setMessage('');
    } catch (error) {
      if (!preserveMessage) setMessage(error.response?.data?.error || 'Unable to load FMS role desk.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedUserId = params.get('user_id');
    if (requestedUserId) {
      setSelectedUserId(requestedUserId);
    }
  }, [location.search]);

  const visibleUsers = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return users.filter((managedUser) => {
      if (['ADMIN', 'SUPER_ADMIN'].includes(managedUser.role)) return false;
      if (filters.branch_id && String(managedUser.branch_id || '') !== String(filters.branch_id)) return false;
      if (filters.status === 'ACTIVE' && !managedUser.fms_enabled) return false;
      if (filters.status === 'CIRCULAR_ONLY' && (!managedUser.has_granted_fms_access || managedUser.fms_enabled)) return false;
      if (filters.status === 'OFF' && (managedUser.fms_enabled || managedUser.has_granted_fms_access)) return false;
      if (!q) return true;
      return [
        managedUser.name,
        managedUser.email,
        managedUser.branch_name,
        managedUser.role
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }, [filters, users]);

  const selectedUser = useMemo(
    () => visibleUsers.find((item) => String(item.id) === String(selectedUserId))
      || users.find((item) => String(item.id) === String(selectedUserId))
      || null,
    [selectedUserId, users, visibleUsers]
  );

  useEffect(() => {
    if (!selectedUser) {
      setEditor(null);
      return;
    }
    setEditor(createEditorStateFromUser(selectedUser, editorDrafts[String(selectedUser.id)]));
  }, [editorDrafts, selectedUser]);

  const nextProfile = editor
    ? getFmsRoleProfile(editor.fms_profile || 'VIEW_ONLY')
    : null;
  const roleUsesOwnedDepartment = ['RECORD_INTAKE', 'ACCESS_CONTROLLER', 'PUBLISHING_CONTROLLER'].includes(editor?.fms_profile || '');
  const currentPermissions = editor?.current_fms_enabled ? (editor.current_fms_permissions || []) : [];
  const nextPermissions = editor?.fms_enabled ? expandFmsRoleProfile(editor.fms_profile || 'VIEW_ONLY') : [];
  const permissionsToAdd = availableFmsPermissions.filter((permission) => !currentPermissions.includes(permission) && nextPermissions.includes(permission));
  const permissionsToRemove = availableFmsPermissions.filter((permission) => currentPermissions.includes(permission) && !nextPermissions.includes(permission));

  const handleSave = async () => {
    if (!editor?.id) return;
    setSaving(true);
    setMessage('');
    try {
      await api.put(`/admin/users/${editor.id}`, {
        fms_enabled: editor.fms_enabled,
        fms_owned_department_id: roleUsesOwnedDepartment && editor.fms_owned_department_id ? Number(editor.fms_owned_department_id) : null,
        fms_permissions: editor.fms_enabled ? expandFmsRoleProfile(editor.fms_profile || 'VIEW_ONLY') : []
      });
      setEditorDrafts((current) => {
        const next = { ...current };
        delete next[String(editor.id)];
        return next;
      });
      await loadData({ preserveMessage: true });
      setMessage(`FMS role updated for ${editor.name}.`);
    } catch (error) {
      if (error.response?.data?.code === 'FMS_DEPARTMENT_ALREADY_ASSIGNED') {
        const conflicts = Array.isArray(error.response?.data?.conflicts) ? error.response.data.conflicts : [];
        const conflictNames = conflicts.map((item) => item.name).filter(Boolean).join(', ');
        const shouldOverride = window.confirm(
          conflictNames
            ? `${conflictNames} already hold active FMS ownership for this department. Do you still want to assign ${editor.name} as well?`
            : 'This department already has an active FMS owner. Do you still want to assign this user as well?'
        );
        if (shouldOverride) {
          try {
            await api.put(`/admin/users/${editor.id}`, {
              fms_enabled: editor.fms_enabled,
              fms_owned_department_id: roleUsesOwnedDepartment && editor.fms_owned_department_id ? Number(editor.fms_owned_department_id) : null,
              fms_permissions: editor.fms_enabled ? expandFmsRoleProfile(editor.fms_profile || 'VIEW_ONLY') : [],
              override_department_assignment: true
            });
            setEditorDrafts((current) => {
              const next = { ...current };
              delete next[String(editor.id)];
              return next;
            });
            await loadData({ preserveMessage: true });
            setMessage(`FMS role updated for ${editor.name}.`);
          } catch (retryError) {
            setMessage(retryError.response?.data?.error || 'Unable to update FMS role.');
          }
        } else {
          setMessage(error.response?.data?.error || 'Department assignment review cancelled.');
        }
      } else {
        setMessage(error.response?.data?.error || 'Unable to update FMS role.');
      }
    } finally {
      setSaving(false);
    }
  };

  const updateSelectedEditor = (updater) => {
    setEditor((current) => {
      if (!current) return current;
      const nextEditor = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
      setEditorDrafts((drafts) => ({
        ...drafts,
        [String(nextEditor.id)]: nextEditor
      }));
      return nextEditor;
    });
  };

  const setUserEditorDraft = (managedUser, updater) => {
    if (!managedUser) return;

    setEditorDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[String(managedUser.id)] || createEditorStateFromUser(managedUser);
      const nextDraft = typeof updater === 'function'
        ? updater(currentDraft)
        : { ...currentDraft, ...updater };

      return {
        ...currentDrafts,
        [String(managedUser.id)]: nextDraft
      };
    });

    if (String(selectedUserId) === String(managedUser.id)) {
      setEditor((current) => {
        const currentEditor = current || createEditorStateFromUser(managedUser);
        return typeof updater === 'function'
          ? updater(currentEditor)
          : { ...currentEditor, ...updater };
      });
    }
  };

  const selectedOwnedFmsDepartment = useMemo(
    () => fmsDepartments.find((item) => String(item.legacy_department?.id || '') === String(editor?.fms_owned_department_id || '')) || null,
    [editor?.fms_owned_department_id, fmsDepartments]
  );
  const primaryRoleKeys = ['VIEW_ONLY', 'RECORD_INTAKE', 'LIBRARY_DOWNLOADER', 'ACCESS_CONTROLLER'];
  const displayedRoleProfiles = useMemo(() => {
    const baseProfiles = primaryRoleKeys
      .map((key) => fmsRoleProfiles.find((profile) => profile.key === key))
      .filter(Boolean);
    const currentProfile = fmsRoleProfiles.find((profile) => profile.key === (editor?.fms_profile || ''));
    if (currentProfile && !baseProfiles.some((profile) => profile.key === currentProfile.key)) {
      return [...baseProfiles, currentProfile];
    }
    return baseProfiles;
  }, [editor?.fms_profile]);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
        <div>
          <h1>FMS Role Desk</h1>
          <p>Search the user, choose the user, and assign the banking FMS role from one direct desk.</p>
        </div>
      </div>

      <div style={{ ...panelStyle, padding: '16px 18px', marginBottom: '16px' }}>
        <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '18px', marginBottom: '6px' }}>Common Banking Mappings</div>
        <div className="text-muted" style={{ fontSize: '13px', marginBottom: '12px' }}>
          Use these examples when business users ask in bank language like uploader, recommender, or approver.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
          {fmsRoleExamples.map((item) => (
            <div key={item.title} style={{ border: '1px solid #dbe4ef', borderRadius: '14px', background: '#ffffff', padding: '14px 15px' }}>
              <div style={{ color: '#173c6d', fontWeight: 800, marginBottom: '5px' }}>{item.title}</div>
              <div style={{ color: '#31527a', fontWeight: 700, fontSize: '13px', lineHeight: 1.5, marginBottom: '6px' }}>{item.mapping}</div>
              <div style={{ color: '#5f748e', fontSize: '12px', lineHeight: 1.55, marginBottom: '6px' }}>{item.summary}</div>
              <small className="text-muted text-sm">{item.note}</small>
            </div>
          ))}
        </div>
      </div>

      {message ? (
        <div className="ui-message" style={{ marginBottom: '16px' }}>
          <span>{message}</span>
          <button type="button" className="ui-message-close" onClick={() => setMessage('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="fms-role-desk-grid">
        <div className="fms-role-user-panel" style={{ ...panelStyle, padding: '12px' }}>
          <div
            style={{
              marginBottom: '14px',
              padding: '2px 2px 0'
            }}
          >
            <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '20px', lineHeight: 1.2 }}>Select User</div>
            <div className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>
              Assign or manage FMS access for users
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              alignItems: 'end',
              marginBottom: '12px'
            }}
          >
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Search user</label>
              <div style={{ position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '14px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#7a8ea8',
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
                    <path d="M16 16L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="text"
                  value={filters.q}
                  onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))}
                  placeholder="Name, email, branch..."
                  style={{ paddingLeft: '42px' }}
                />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Branch</label>
              <select value={filters.branch_id} onChange={(event) => setFilters((current) => ({ ...current, branch_id: event.target.value }))}>
                <option value="">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.branch_name}</option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>FMS status</label>
              <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}>
                <option value="ALL">All users</option>
                <option value="ACTIVE">FMS active</option>
                <option value="CIRCULAR_ONLY">Circular only</option>
                <option value="OFF">FMS off</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setFilters({ q: '', branch_id: '', status: 'ALL' })}
              style={{ alignSelf: 'end' }}
            >
              Clear Filters
            </button>
          </div>

          <div
            style={{
              marginTop: '6px',
              maxHeight: '620px',
              overflowY: 'auto',
              border: '1px solid #dbe4ef',
              borderRadius: '12px',
              overflowX: 'hidden',
              padding: '10px',
              background: '#f8fbff'
            }}
          >
            {loading ? (
              <div className="fms-empty-box">Loading users...</div>
            ) : visibleUsers.length === 0 ? (
              <div className="fms-empty-box">No users match the current filter.</div>
            ) : visibleUsers.map((managedUser) => {
              const managedUserDraft = String(editor?.id) === String(managedUser.id)
                ? editor
                : editorDrafts[String(managedUser.id)];
              const effectiveUser = applyEditorStateToUser(managedUser, managedUserDraft);
              const isActive = String(effectiveUser.id) === String(selectedUserId);
              const status = getUserFmsStatus(effectiveUser);
              const isHovered = String(managedUser.id) === String(hoveredUserId);
              return (
                <button
                  key={effectiveUser.id}
                  type="button"
                  onClick={() => setSelectedUserId(String(effectiveUser.id))}
                  onMouseEnter={() => setHoveredUserId(String(effectiveUser.id))}
                  onMouseLeave={() => setHoveredUserId('')}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px 16px',
                    border: `1px solid ${isActive ? '#8fb2df' : (isHovered ? '#cfdded' : '#dbe4ef')}`,
                    borderRadius: '10px',
                    background: isActive ? '#f6faff' : (isHovered ? '#fbfdff' : '#ffffff'),
                    textAlign: 'left',
                    marginBottom: '10px',
                    boxShadow: isHovered || isActive ? '0 8px 20px rgba(15, 35, 64, 0.05)' : '0 1px 2px rgba(15, 35, 64, 0.03)',
                    transition: 'background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease',
                    transform: isHovered ? 'translateY(-1px)' : 'translateY(0)'
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: '15px', color: '#173c6d', display: 'block' }}>{effectiveUser.name}</strong>
                    <div className="text-muted text-sm" style={{ marginTop: '4px', fontSize: '12px' }}>
                      {effectiveUser.branch_name || 'No branch'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <span
                      className={`badge ${status.badgeClass}`}
                      style={{
                        minWidth: '110px',
                        justifyContent: 'center',
                        borderRadius: '999px',
                        fontWeight: 800,
                        boxShadow: status.key === 'ACTIVE'
                          ? 'inset 0 0 0 1px rgba(33, 99, 54, 0.1)'
                          : status.key === 'CIRCULAR_ONLY'
                            ? 'inset 0 0 0 1px rgba(163, 92, 0, 0.12)'
                            : 'inset 0 0 0 1px rgba(148, 32, 32, 0.12)',
                        letterSpacing: '0.03em'
                      }}
                    >
                      {status.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {!selectedUser || !editor ? (
          <div className="fms-role-editor-panel" style={{ ...panelStyle, minHeight: '360px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6e829d' }}>
            Choose a user from the left side to assign FMS access.
          </div>
        ) : (
          <div
            className="fms-role-editor-panel"
            style={{
              ...panelStyle,
              borderColor: '#9fc0eb',
              boxShadow: '0 18px 42px rgba(15, 35, 64, 0.14)',
              overflow: 'hidden'
            }}
          >
            <div
              className="card-header blue"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 18px'
              }}
            >
              <span>Assign FMS Role: {selectedUser.name}</span>
              <span
                className={`badge ${editor.fms_enabled ? 'badge-green' : 'badge-red'}`}
                style={{
                  background: editor.fms_enabled ? '#dbf5e3' : '#fde2e2',
                  color: editor.fms_enabled ? '#15693c' : '#b42318',
                  border: `1px solid ${editor.fms_enabled ? '#b6e1c3' : '#efb0b0'}`
                }}
              >
                {editor.fms_enabled ? 'FMS Active' : 'FMS Off'}
              </span>
            </div>

            <div style={{ padding: '18px 20px' }}>
              <div style={{ marginBottom: '14px', padding: '12px 14px', borderRadius: '10px', border: '1px solid #dbeafe', background: '#f8fbff', color: '#31527a', fontSize: '13px', lineHeight: 1.6 }}>
                DMS contains both workflow approval and the file-management side. Use this desk to decide whether the user is a department uploader or a full-library viewer/downloader, while branch and department mapping continue to define the owned FMS scope.
              </div>

              <div className="form-grid cols-2">
                <div className="form-group">
                  <label>FMS Access</label>
                  <select value={editor.fms_enabled ? 'yes' : 'no'} onChange={(event) => updateSelectedEditor((current) => ({ ...current, fms_enabled: event.target.value === 'yes' }))}>
                    <option value="no">Disabled</option>
                    <option value="yes">Enabled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Selected Role</label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid #dbe4ef', borderRadius: '10px', background: '#f8fbff', color: '#173c6d', fontWeight: 700 }}>
                    {nextProfile?.label || 'Shared Records Viewer'}
                  </div>
                  <small className="text-muted text-sm">
                    {nextProfile?.description || fmsRoleProfiles[0].description}
                  </small>
                </div>
                <div className="form-group">
                  <label>Current Branch Scope</label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid #dbe4ef', borderRadius: '10px', background: '#f8fbff', color: '#173c6d', fontWeight: 700 }}>
                    {selectedUser.branch_name || 'No branch mapped'}
                  </div>
                </div>
                <div className="form-group">
                  <label>User Master Department</label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid #dbe4ef', borderRadius: '10px', background: '#f8fbff', color: '#173c6d', fontWeight: 700 }}>
                    {selectedUser.department || 'No department mapped'}
                  </div>
                  <small className="text-muted text-sm">
                    This is the user's organizational department mapping. Viewer reach and FMS library reach can still be broader than this.
                  </small>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Effective FMS Reach</label>
                  <div style={{ minHeight: '42px', display: 'flex', alignItems: 'center', padding: '8px 12px', border: '1px solid #dbe4ef', borderRadius: '10px', background: '#f8fbff', color: '#173c6d', fontWeight: 700 }}>
                    {roleUsesOwnedDepartment
                      ? `${selectedOwnedFmsDepartment?.name || selectedUser.department || 'Department-owned desk'} intake + full released-library view`
                      : (editor?.fms_profile === 'LIBRARY_DOWNLOADER'
                        ? 'Full released FMS library view + controlled download'
                        : 'Full released FMS library view across all departments')}
                  </div>
                  <small className="text-muted text-sm">
                    Viewer roles are bank-wide for released library records. Owned department is used only for upload/control roles.
                  </small>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Assign Owned FMS Department</label>
                  <select
                    value={roleUsesOwnedDepartment ? (editor.fms_owned_department_id || '') : ''}
                    onChange={(event) => updateSelectedEditor((current) => ({ ...current, fms_owned_department_id: event.target.value }))}
                    disabled={!editor.fms_enabled || !roleUsesOwnedDepartment}
                  >
                    <option value="">{roleUsesOwnedDepartment ? 'No owned department' : 'Not used for this role'}</option>
                    {fmsDepartments.map((department) => (
                      <option key={department.id} value={department.legacy_department?.id}>
                        {department.path_key || department.name}
                      </option>
                    ))}
                  </select>
                  <small className="text-muted text-sm">
                    {roleUsesOwnedDepartment
                      ? 'Choose the owned desk only for upload/control roles like KYC, Loans, Circulars, Audit, or Manual.'
                      : 'Viewer and viewer + downloader roles already work across all released departments, so owned desk is not used here.'}
                  </small>
                </div>
                <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                  <label>Choose One Banking FMS Role</label>
                  <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '10px', border: '1px solid #dbe4ef', background: '#ffffff', color: '#4c647f', fontSize: '12px', lineHeight: 1.6 }}>
                    Bank order: <strong>Bank → Department → Sub-department → Branch</strong>. These presets decide what a user can do inside that scope. Download remains a controlled grant even for users who can already view records.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
                    {displayedRoleProfiles.map((profile) => {
                      const isActive = (editor.fms_profile || 'VIEW_ONLY') === profile.key;
                      return (
                        <button
                          key={profile.key}
                          type="button"
                          onClick={() => updateSelectedEditor((current) => ({
                            ...current,
                            fms_profile: profile.key,
                            fms_owned_department_id: ['RECORD_INTAKE', 'ACCESS_CONTROLLER', 'PUBLISHING_CONTROLLER'].includes(profile.key)
                              ? current.fms_owned_department_id
                              : ''
                          }))}
                          disabled={!editor.fms_enabled}
                          style={{
                            textAlign: 'left',
                            borderRadius: '14px',
                            border: `1px solid ${isActive ? '#5f92da' : '#dbe4ef'}`,
                            background: isActive ? '#edf5ff' : '#ffffff',
                            padding: '14px 15px',
                            cursor: editor.fms_enabled ? 'pointer' : 'not-allowed',
                            opacity: editor.fms_enabled ? 1 : 0.62,
                            boxShadow: isActive ? '0 0 0 3px rgba(42, 93, 168, 0.10), 0 10px 22px rgba(42, 93, 168, 0.12)' : 'none',
                            transform: isActive ? 'translateY(-2px)' : 'translateY(0)',
                            transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background-color 160ms ease'
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ color: '#173c6d', fontWeight: 800, fontSize: '14px' }}>{profile.label}</div>
                            {isActive ? <span className="badge badge-blue">Selected</span> : null}
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
                  <label>Role Meaning In Banking Terms</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Hierarchy Scope</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextProfile?.hierarchySummary || fmsRoleProfiles[0].hierarchySummary}</div>
                    </div>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Operational Use</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextProfile?.bankingUse || fmsRoleProfiles[0].bankingUse}</div>
                    </div>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Download Rule</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>{nextProfile?.downloadPolicy || fmsRoleProfiles[0].downloadPolicy}</div>
                    </div>
                    <div style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '14px 15px' }}>
                      <div style={{ color: '#70839a', fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' }}>Owned FMS Desk</div>
                      <div style={{ color: '#173c6d', fontWeight: 700, fontSize: '13px', lineHeight: 1.5 }}>
                        {selectedOwnedFmsDepartment?.name || selectedOwnedFmsDepartment?.path_key || 'Not fixed to one department'}
                      </div>
                    </div>
                  </div>
                  <label>What This Role Allows</label>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {availableFmsPermissions.map((permission) => (
                      <span key={permission} className={`badge ${nextPermissions.includes(permission) ? 'badge-green' : 'badge-blue'}`} style={{ opacity: nextPermissions.includes(permission) ? 1 : 0.45 }}>
                        {permissionDisplayLabel(permission)}
                      </span>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' }}>
                    {permissionsToAdd.map((permission) => (
                      <span key={`added-${permission}`} className="badge badge-blue">Adds {permissionDisplayLabel(permission)}</span>
                    ))}
                    {permissionsToRemove.map((permission) => (
                      <span key={`removed-${permission}`} className="badge badge-amber">Removes {permissionDisplayLabel(permission)}</span>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginTop: '12px' }}>
                    {(nextProfile?.accessMatrix || fmsRoleProfiles[0].accessMatrix).map((item) => (
                      <div key={item.label} style={{ border: '1px solid #dbe4ef', borderRadius: '12px', background: '#ffffff', padding: '12px 13px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                          <strong style={{ color: '#173c6d', fontSize: '12px' }}>{item.label}</strong>
                          <span className={`badge ${accessMatrixBadgeTone(item.state)}`}>{accessMatrixLabel(item.state)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <small className="text-muted text-sm">
                    Use this with the indexing model already present in FMS: account number, CIF, customer identity, document reference, department, branch, and uploader. This keeps the library useful for future search, not only for today’s upload.
                  </small>
                </div>
              </div>

              <div className="action-row">
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Applying Role...' : 'Save FMS Role'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminFmsRoles;
