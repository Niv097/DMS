import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { toPublicDocumentReference } from '../utils/documentReference';

const formatDateTime = (value) => {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

const normalizeText = (value, fallback = '-') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const formatPublicDocumentReference = (value, branchContext = null) => normalizeText(toPublicDocumentReference(value, '-', branchContext), '-');
const formatSecurityReason = (log) => normalizeText(log.reason_display || log.reason, '-');
const formatSecurityIp = (log) => normalizeText(log.ip_display || log.ip, '-');

const getActionTone = (action = '') => {
  const normalized = String(action || '').toUpperCase();
  if (normalized.includes('APPROV')) return 'green';
  if (normalized.includes('REJECT') || normalized.includes('DELETE')) return 'red';
  if (normalized.includes('RECOMMEND')) return 'amber';
  return 'blue';
};

const groupLogsByWorkflow = (logs = []) => {
  const workflowMap = new Map();

  for (const log of logs) {
    const workflowKey = log.note?.document_group_key || log.note?.note_id || `note-${log.note_id}`;
    const versionKey = `${workflowKey}::v${log.note?.version_number || 1}`;

    if (!workflowMap.has(workflowKey)) {
      workflowMap.set(workflowKey, {
        workflowKey,
        noteRecordId: log.note?.id || null,
        noteId: log.note?.note_id || `#${log.note_id}`,
        subject: log.note?.subject || 'Untitled file',
        tenantId: log.note?.tenant_id || log.tenant_id || '',
        branchId: log.note?.branch_id || log.branch_id || '',
        branch: log.note?.branch || null,
        versions: new Map(),
        lastActivityAt: log.timestamp
      });
    }

    const workflow = workflowMap.get(workflowKey);
    if (new Date(log.timestamp).getTime() > new Date(workflow.lastActivityAt).getTime()) {
      workflow.lastActivityAt = log.timestamp;
    }

    if (!workflow.versions.has(versionKey)) {
      workflow.versions.set(versionKey, {
        key: versionKey,
        noteRecordId: log.note?.id || null,
        versionNumber: log.note?.version_number || 1,
        noteId: log.note?.note_id || `#${log.note_id}`,
        branch: log.note?.branch || null,
        subject: log.note?.subject || 'Untitled file',
        entries: [],
        lastActivityAt: log.timestamp
      });
    }

    const version = workflow.versions.get(versionKey);
    version.entries.push(log);
    if (new Date(log.timestamp).getTime() > new Date(version.lastActivityAt).getTime()) {
      version.lastActivityAt = log.timestamp;
    }
  }

  return [...workflowMap.values()]
    .map((workflow) => ({
      ...workflow,
      versions: [...workflow.versions.values()]
        .map((version) => ({
          ...version,
          entries: [...version.entries].sort((left, right) => new Date(right.timestamp) - new Date(left.timestamp))
        }))
        .sort((left, right) => right.versionNumber - left.versionNumber)
    }))
    .sort((left, right) => new Date(right.lastActivityAt) - new Date(left.lastActivityAt));
};

const AdminAuditLogs = ({
  initialSurface = 'workflow',
  lockedSurface = false,
  pageTitle = 'Audit Logs',
  pageDescription = null,
  fmsSourceOrigin = null
}) => {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [fmsLogs, setFmsLogs] = useState([]);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageMessage, setPageMessage] = useState(null);
  const [filters, setFilters] = useState({ tenant_id: '', branch_id: '' });
  const [viewMode, setViewMode] = useState('grouped');
  const [auditSurface, setAuditSurface] = useState(initialSurface);
  const [expandedWorkflowKeys, setExpandedWorkflowKeys] = useState([]);
  const [expandedVersionKeys, setExpandedVersionKeys] = useState([]);

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [tenantRes, branchRes] = await Promise.allSettled([
          api.get('/admin/tenants'),
          api.get('/admin/branches')
        ]);

        setTenants(tenantRes.status === 'fulfilled' ? (tenantRes.value.data || []) : []);
        setBranches(branchRes.status === 'fulfilled' ? (branchRes.value.data || []) : []);
      } catch (error) {
        console.error('Failed to load audit filter data', error);
      }
    };

    loadFilters();
  }, []);

  useEffect(() => {
    setAuditSurface(initialSurface);
  }, [initialSurface]);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
        if (filters.branch_id) params.append('branch_id', filters.branch_id);
        const fmsParams = new URLSearchParams(params.toString());
        if (fmsSourceOrigin) fmsParams.append('source_origin', fmsSourceOrigin);
        const [workflowResponse, securityResponse, fmsResponse] = await Promise.all([
          api.get(`/audit${params.toString() ? `?${params.toString()}` : ''}`),
          api.get(`/audit/security${params.toString() ? `?${params.toString()}` : ''}`),
          api.get(`/audit/fms${fmsParams.toString() ? `?${fmsParams.toString()}` : ''}`)
        ]);
        setLogs(workflowResponse.data || []);
        setSecurityLogs(securityResponse.data || []);
        setFmsLogs(fmsResponse.data || []);
      } catch (error) {
        console.error('Failed to load audit logs', error);
        setPageMessage({ type: 'error', text: error.response?.data?.message || 'Failed to load audit logs.' });
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
    const intervalId = window.setInterval(() => {
      fetchLogs().catch(() => {});
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [filters, fmsSourceOrigin]);

  const visibleBranches = branches.filter((branch) => !filters.tenant_id || String(branch.tenant_id) === String(filters.tenant_id));

  const tenantLabelById = useMemo(
    () => new Map(tenants.map((tenant) => [String(tenant.id), `${tenant.tenant_name} (${tenant.tenant_code})`])),
    [tenants]
  );

  const branchLabelById = useMemo(
    () => new Map(branches.map((branch) => [String(branch.id), `${branch.branch_name} (${branch.branch_code})`])),
    [branches]
  );

  const groupedWorkflows = useMemo(() => groupLogsByWorkflow(logs), [logs]);

  useEffect(() => {
    setExpandedWorkflowKeys([]);
    setExpandedVersionKeys([]);
  }, [filters.tenant_id, filters.branch_id, auditSurface, viewMode]);

  const summary = useMemo(() => {
    const workflows = groupedWorkflows.length;
    const versions = groupedWorkflows.reduce((count, workflow) => count + workflow.versions.length, 0);
    const approvals = logs.filter((log) => String(log.action || '').toUpperCase().includes('APPROV')).length;

    return { workflows, versions, approvals, events: logs.length };
  }, [groupedWorkflows, logs]);

  const securitySummary = useMemo(() => ({
    events: securityLogs.length,
    downloads: securityLogs.filter((item) => String(item.event || '').includes('DOWNLOADED')).length,
    views: securityLogs.filter((item) => String(item.event || '').includes('VIEWED')).length,
    exits: securityLogs.filter((item) => String(item.event || '').includes('LOGOUT') || String(item.event || '').includes('TIMEOUT')).length
  }), [securityLogs]);

  const fmsSummary = useMemo(() => ({
    events: fmsLogs.length,
    downloads: fmsLogs.filter((item) => String(item.action_label || item.action || '').includes('DOWNLOADED')).length,
    opens: fmsLogs.filter((item) => String(item.action_label || item.action || '').includes('OPENED')).length,
    records: new Set(fmsLogs.map((item) => String(item.document?.id || item.document_id || '')).filter(Boolean)).size
  }), [fmsLogs]);

  const handleDownload = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.branch_id) params.append('branch_id', filters.branch_id);
      if (auditSurface === 'fms' && fmsSourceOrigin) params.append('source_origin', fmsSourceOrigin);
      const endpoint = auditSurface === 'security'
        ? '/audit/security/download/csv'
        : auditSurface === 'fms'
          ? '/audit/fms/download/csv'
          : '/audit/download/csv';
      const response = await api.get(`${endpoint}${params.toString() ? `?${params.toString()}` : ''}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = auditSurface === 'security'
        ? 'security-audit.csv'
        : auditSurface === 'fms'
          ? (fmsSourceOrigin === 'DMS' ? 'dms-archive-audit.csv' : fmsSourceOrigin === 'MANUAL' ? 'fms-library-audit.csv' : 'fms-audit.csv')
          : 'audit-logs.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.message || 'Failed to download audit logs.' });
    }
  };

  const handleWorkflowDownload = async (workflowKey) => {
    try {
      const params = new URLSearchParams();
      if (filters.tenant_id) params.append('tenant_id', filters.tenant_id);
      if (filters.branch_id) params.append('branch_id', filters.branch_id);
      params.append('document_group_key', workflowKey);

      const response = await api.get(`/audit/download/csv?${params.toString()}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${workflowKey.replace(/[\\/]+/g, '_')}-audit.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.message || 'Failed to download workflow audit export.' });
    }
  };

  const toggleWorkflow = (workflowKey) => {
    setExpandedWorkflowKeys((current) => (
      current.includes(workflowKey)
        ? current.filter((item) => item !== workflowKey)
        : [...current, workflowKey]
    ));
  };

  const toggleVersion = (versionKey) => {
    setExpandedVersionKeys((current) => (
      current.includes(versionKey)
        ? current.filter((item) => item !== versionKey)
        : [...current, versionKey]
    ));
  };

  const openAuditFile = (noteRecordId) => {
    if (!noteRecordId) {
      setPageMessage({ type: 'error', text: 'This audit folder is missing its note link, so the file cannot be opened directly.' });
      return;
    }
    navigate(`/note/${noteRecordId}`);
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
        <div>
          <h1>{pageTitle}</h1>
          <p>{pageDescription || (auditSurface === 'security'
            ? 'Hidden-style security trail for file views, downloads, logout activity, and inactivity exits.'
            : auditSurface === 'fms'
              ? 'Real-time FMS audit for controlled record opens and downloads, including employee-ID released copy events.'
              : 'Structured workflow tracking for administrators, with document folders, version history, and event-level traceability.')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          {!lockedSurface && (
            <>
              <button className={`btn ${auditSurface === 'workflow' ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setAuditSurface('workflow')}>
                Workflow Audit
              </button>
              <button className={`btn ${auditSurface === 'fms' ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setAuditSurface('fms')}>
                FMS Audit
              </button>
              <button className={`btn ${auditSurface === 'security' ? 'btn-primary' : 'btn-outline'}`} type="button" onClick={() => setAuditSurface('security')}>
                Security Trail
              </button>
            </>
          )}
          {auditSurface === 'workflow' && (
            <button className="btn btn-outline" type="button" onClick={() => setViewMode(viewMode === 'grouped' ? 'table' : 'grouped')}>
              {viewMode === 'grouped' ? 'Show Raw Table' : 'Show Folder View'}
            </button>
          )}
          <button className="btn btn-primary" onClick={handleDownload}>
            {auditSurface === 'workflow' ? 'Download Audit Logs' : auditSurface === 'fms' ? 'Download FMS Audit' : 'Download Security Trail'}
          </button>
        </div>
      </div>

      {pageMessage && (
        <div className={`ui-message ${pageMessage.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: '16px' }}>
          <span>{pageMessage.text}</span>
          <button type="button" className="ui-message-close" onClick={() => setPageMessage(null)}>Dismiss</button>
        </div>
      )}

      <div className="card" style={{ marginBottom: '16px', padding: '18px 20px' }}>
        <div className="audit-toolbar">
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <select
              value={filters.tenant_id}
              onChange={(event) => setFilters({ ...filters, tenant_id: event.target.value, branch_id: '' })}
            >
              <option value="">All Banks</option>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>{tenant.tenant_name} ({tenant.tenant_code})</option>
              ))}
            </select>
            <select
              value={filters.branch_id}
              onChange={(event) => setFilters({ ...filters, branch_id: event.target.value })}
            >
              <option value="">All Branches</option>
              {visibleBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.branch_name} ({branch.branch_code})</option>
              ))}
            </select>
          </div>

          <div className="audit-summary-grid">
            <div className="audit-summary-card">
              <strong>{auditSurface === 'workflow' ? summary.workflows : auditSurface === 'fms' ? fmsSummary.records : securitySummary.events}</strong>
              <span>{auditSurface === 'workflow' ? 'Workflow Folders' : auditSurface === 'fms' ? 'Tracked Records' : 'Security Events'}</span>
            </div>
            <div className="audit-summary-card">
              <strong>{auditSurface === 'workflow' ? summary.versions : auditSurface === 'fms' ? fmsSummary.opens : securitySummary.views}</strong>
              <span>{auditSurface === 'workflow' ? 'Tracked Versions' : auditSurface === 'fms' ? 'Open Events' : 'View Events'}</span>
            </div>
            <div className="audit-summary-card">
              <strong>{auditSurface === 'workflow' ? summary.events : auditSurface === 'fms' ? fmsSummary.downloads : securitySummary.downloads}</strong>
              <span>{auditSurface === 'workflow' ? 'Total Events' : 'Download Events'}</span>
            </div>
            <div className="audit-summary-card">
              <strong>{auditSurface === 'workflow' ? summary.approvals : auditSurface === 'fms' ? fmsSummary.events : securitySummary.exits}</strong>
              <span>{auditSurface === 'workflow' ? 'Approval Events' : auditSurface === 'fms' ? 'Total FMS Events' : 'Logout / Idle Exits'}</span>
            </div>
          </div>
        </div>
      </div>

      {auditSurface === 'security' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Event</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Tenant</th>
                  <th>Branch</th>
                  <th>Document</th>
                  <th>File</th>
                  <th>Reason</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '32px' }}>Loading security trail...</td></tr>
                ) : securityLogs.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '32px' }}>No security trail entries found.</td></tr>
                ) : (
                  securityLogs.map((log, index) => (
                    <tr key={`${log.timestamp}-${log.event}-${log.user_id || index}`}>
                      <td>{formatDateTime(log.timestamp)}</td>
                      <td><span className={`badge badge-${getActionTone(log.event)}`}>{log.event}</span></td>
                      <td>{normalizeText(log.user_name || log.user_id, '') || '-'}</td>
                      <td>{normalizeText(log.role)}</td>
                      <td>{tenantLabelById.get(String(log.tenant_id || '')) || '-'}</td>
                      <td>{branchLabelById.get(String(log.branch_id || '')) || '-'}</td>
                      <td>{normalizeText(log.document_reference)}</td>
                      <td>{normalizeText(log.file_name || log.approved_file_name)}</td>
                      <td>{formatSecurityReason(log)}</td>
                      <td>{formatSecurityIp(log)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : auditSurface === 'fms' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Action</th>
                  <th>Performed By</th>
                  <th>Record</th>
                  <th>Reference</th>
                  <th>Department</th>
                  <th>Folder</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>Loading FMS audit trail...</td></tr>
                ) : fmsLogs.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', padding: '32px' }}>No FMS audit entries found.</td></tr>
                ) : (
                  fmsLogs.map((log) => (
                    <tr key={`fms-audit-${log.id}`}>
                      <td>{formatDateTime(log.timestamp)}</td>
                      <td><span className={`badge badge-${getActionTone(log.action_label || log.action)}`}>{log.action_label || log.action}</span></td>
                      <td>{normalizeText(log.performed_by)}</td>
                      <td>
                        <div className="text-mono">{normalizeText(log.document?.title)}</div>
                        <div className="text-sm text-muted">{normalizeText(log.document?.file_name)}</div>
                      </td>
                      <td>{formatPublicDocumentReference(log.document?.document_reference || log.document?.customer_reference || '-', log.document?.branch || null)}</td>
                      <td>{normalizeText(log.document?.department_master?.name)}</td>
                      <td>{normalizeText(log.document?.owner_node?.name)}</td>
                      <td>{normalizeText(log.remarks)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Tenant</th>
                  <th>Branch</th>
                  <th>File</th>
                  <th>Attachment</th>
                  <th>Version</th>
                  <th>User</th>
                  <th>Role</th>
                  <th>Action</th>
                  <th>Comments</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '32px' }}>Loading audit logs...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center', padding: '32px' }}>No logs found.</td></tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id}>
                      <td>{formatDateTime(log.timestamp)}</td>
                      <td>{tenantLabelById.get(String(log.note?.tenant_id || log.tenant_id || '')) || '-'}</td>
                      <td>{branchLabelById.get(String(log.note?.branch_id || log.branch_id || '')) || '-'}</td>
                    <td>
                        <div className="text-mono">{formatPublicDocumentReference(log.note?.public_document_reference || log.note?.document_group_key || log.note?.document_code || log.note?.note_id || `#${log.note_id}`, log.note?.branch || null)}</div>
                        <div className="text-sm text-muted">{log.note?.subject || 'Unknown file'}</div>
                      </td>
                      <td>
                        <div>{log.file_type || log.attachment?.file_type || '-'}</div>
                        <div className="text-sm text-muted">{log.file_name || log.attachment?.file_name || '-'}</div>
                      </td>
                      <td>v{log.note?.version_number || 1}</td>
                      <td>{log.performed_by}</td>
                      <td>{log.role}</td>
                      <td><span className={`badge badge-${getActionTone(log.action)}`}>{log.action}</span></td>
                      <td>{log.remarks || '-'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="audit-folder-list">
          {loading ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center' }}>Loading audit workspace...</div>
          ) : groupedWorkflows.length === 0 ? (
            <div className="card" style={{ padding: '32px', textAlign: 'center' }}>No audit logs found for the selected filters.</div>
          ) : (
            groupedWorkflows.map((workflow) => (
              <section key={workflow.workflowKey} className={`audit-folder-card ${expandedWorkflowKeys.includes(workflow.workflowKey) ? 'is-open' : ''}`}>
                <div className="audit-folder-header">
                  <button type="button" className="audit-folder-toggle" onClick={() => toggleWorkflow(workflow.workflowKey)}>
                    <div>
                      <div className="audit-folder-label">Workflow Folder</div>
                      <div className="audit-folder-id">{formatPublicDocumentReference(workflow.noteId, workflow.branch || null)}</div>
                      <div className="audit-folder-subject">{workflow.subject}</div>
                    </div>
                    <span className={`audit-folder-caret ${expandedWorkflowKeys.includes(workflow.workflowKey) ? 'open' : ''}`}>▼</span>
                  </button>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div className="audit-folder-actions">
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => openAuditFile(workflow.noteRecordId)}
                      >
                        Open File
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        onClick={() => handleWorkflowDownload(workflow.workflowKey)}
                      >
                        Download Audit
                      </button>
                    </div>
                    <div className="audit-folder-meta">
                      <div><span>Tenant</span><strong>{tenantLabelById.get(String(workflow.tenantId)) || '-'}</strong></div>
                      <div><span>Branch</span><strong>{branchLabelById.get(String(workflow.branchId)) || '-'}</strong></div>
                      <div><span>Last Activity</span><strong>{formatDateTime(workflow.lastActivityAt)}</strong></div>
                    </div>
                  </div>
                </div>

                {expandedWorkflowKeys.includes(workflow.workflowKey) && (
                  <div className="audit-version-list">
                    {workflow.versions.map((version) => (
                      <div key={version.key} className={`audit-version-card ${expandedVersionKeys.includes(version.key) ? 'is-open' : ''}`}>
                        <button type="button" className="audit-version-header" onClick={() => toggleVersion(version.key)}>
                          <div>
                            <div className="audit-version-badge">Version {version.versionNumber}</div>
                            <div className="audit-version-title">{formatPublicDocumentReference(version.noteId, version.branch || workflow.branch || null)}</div>
                          </div>
                          <div className="audit-version-head-right">
                            <div className="text-sm text-muted">{version.entries.length} event(s)</div>
                            <span className={`audit-folder-caret ${expandedVersionKeys.includes(version.key) ? 'open' : ''}`}>▼</span>
                          </div>
                        </button>

                        {expandedVersionKeys.includes(version.key) && (
                          <>
                            <div className="audit-version-actions">
                              <button
                                type="button"
                                className="btn btn-outline btn-sm"
                                onClick={() => openAuditFile(version.noteRecordId)}
                              >
                                Open Version
                              </button>
                            </div>
                            <div className="audit-timeline">
                              {version.entries.map((entry) => (
                                <article key={entry.id} className="audit-timeline-item">
                                  <div className="audit-timeline-dot" />
                                  <div className="audit-timeline-content">
                                    <div className="audit-timeline-top">
                                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span className={`badge badge-${getActionTone(entry.action)}`}>{entry.action}</span>
                                        <span className="audit-actor">{normalizeText(entry.performed_by)}</span>
                                        <span className="audit-role">{normalizeText(entry.role)}</span>
                                      </div>
                                      <span className="audit-time">{formatDateTime(entry.timestamp)}</span>
                                    </div>

                                    <div className="audit-timeline-body">
                                      <div className="audit-timeline-grid">
                                        <div>
                                          <span>Attachment</span>
                                          <strong>{normalizeText(entry.file_name || entry.attachment?.file_name)}</strong>
                                        </div>
                                        <div>
                                          <span>Type</span>
                                          <strong>{normalizeText(entry.file_type || entry.attachment?.file_type)}</strong>
                                        </div>
                                        <div>
                                          <span>Remarks</span>
                                          <strong>{normalizeText(entry.remarks)}</strong>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </article>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      )}

      <style>{`
        .audit-toolbar {
          display: grid;
          gap: 18px;
        }
        .audit-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .audit-summary-card {
          border: 1px solid #d6e0ec;
          border-radius: 12px;
          background: linear-gradient(180deg, #f8fbff 0%, #eef4fb 100%);
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .audit-summary-card strong {
          color: #143b70;
          font-size: 22px;
          line-height: 1;
        }
        .audit-summary-card span {
          color: #66768d;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 700;
        }
        .audit-folder-list {
          display: grid;
          gap: 18px;
        }
        .audit-folder-card {
          border: 1px solid #d9e3ef;
          border-radius: 16px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 6px 18px rgba(15, 35, 64, 0.05);
        }
        .audit-folder-card.is-open {
          border-color: #bfd3ea;
        }
        .audit-folder-header {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          padding: 18px 20px;
          background: #f8fbff;
          color: #173c6d;
          align-items: flex-start;
        }
        .audit-folder-toggle {
          border: none;
          background: transparent;
          padding: 0;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          text-align: left;
          color: inherit;
          flex: 1;
          cursor: pointer;
        }
        .audit-folder-label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #8090a4;
          margin-bottom: 6px;
        }
        .audit-folder-id {
          font-size: 18px;
          font-weight: 700;
          margin-bottom: 4px;
        }
        .audit-folder-subject {
          color: #5f748e;
          font-size: 14px;
        }
        .audit-folder-caret {
          color: #6f8197;
          font-size: 12px;
          transition: transform 180ms ease;
          margin-top: 4px;
        }
        .audit-folder-caret.open {
          transform: rotate(180deg);
        }
        .audit-folder-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .audit-folder-meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(120px, 1fr));
          gap: 12px;
          min-width: 380px;
        }
        .audit-folder-meta span {
          display: block;
          color: #8090a4;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 5px;
        }
        .audit-folder-meta strong {
          color: #173c6d;
          font-size: 13px;
          line-height: 1.4;
        }
        .audit-version-list {
          display: grid;
          gap: 14px;
          padding: 16px 18px 18px;
          background: #ffffff;
        }
        .audit-version-card {
          border: 1px solid #dbe5f0;
          border-radius: 14px;
          background: #fff;
          overflow: hidden;
        }
        .audit-version-card.is-open {
          border-color: #bfd3ea;
          box-shadow: 0 6px 16px rgba(15, 35, 64, 0.05);
        }
        .audit-version-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 14px 16px;
          border: none;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          width: 100%;
          text-align: left;
          cursor: pointer;
        }
        .audit-version-head-right {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .audit-version-badge {
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border-radius: 999px;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 8px;
        }
        .audit-version-title {
          color: #16283d;
          font-size: 16px;
          font-weight: 700;
        }
        .audit-version-actions {
          display: flex;
          justify-content: flex-end;
          padding: 0 16px 10px;
        }
        .audit-timeline {
          display: grid;
          gap: 0;
          padding: 8px 16px 14px;
        }
        .audit-timeline-item {
          display: grid;
          grid-template-columns: 18px 1fr;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid #edf2f7;
        }
        .audit-timeline-item:last-child {
          border-bottom: none;
          padding-bottom: 4px;
        }
        .audit-timeline-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #1d4ed8;
          margin-top: 8px;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.12);
        }
        .audit-timeline-top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .audit-actor {
          color: #10253d;
          font-weight: 700;
          font-size: 13px;
        }
        .audit-role {
          color: #5d728c;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .audit-time {
          color: #64748b;
          font-size: 12px;
          white-space: nowrap;
        }
        .audit-timeline-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .audit-timeline-grid span {
          display: block;
          color: #6b7b90;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }
        .audit-timeline-grid strong {
          color: #1e293b;
          font-size: 13px;
          line-height: 1.5;
          word-break: break-word;
        }
        @media (max-width: 1100px) {
          .audit-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .audit-folder-header {
            flex-direction: column;
          }
          .audit-folder-toggle {
            width: 100%;
          }
          .audit-folder-meta {
            min-width: 0;
            grid-template-columns: 1fr;
          }
          .audit-timeline-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 720px) {
          .audit-summary-grid {
            grid-template-columns: 1fr;
          }
          .audit-timeline-top {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminAuditLogs;
