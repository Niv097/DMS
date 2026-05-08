import React, { useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const formatSize = (bytes) => {
  const size = Number(bytes || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const padTime = (hour = 0, minute = 0) => `${String(hour ?? 0).padStart(2, '0')}:${String(minute ?? 0).padStart(2, '0')}`;

const emptySecurity = {
  summary: {
    total_events: 0,
    views: 0,
    downloads: 0,
    idle_exits: 0,
    logout_exits: 0,
    access_failures: 0,
    logins: 0
  },
  branch_activity: [],
  user_activity: [],
  recent_events: [],
  workflow_operations: []
};

const emptyRecovery = {
  backup_output_root: '',
  backup_transfer_root: '',
  log_retention_days: 0,
  latest_security_audit_at: null,
  automation_status: {
    enabled: true,
    scheduled_time: '01:30',
    timezone: 'UTC',
    mirror_export_enabled: true,
    retention_prune_enabled: true,
    run_on_startup: false,
    check_interval_minutes: 15,
    next_run_at: null,
    last_run_started_at: null,
    last_run_finished_at: null,
    last_mirror_completed_at: null,
    last_run_status: 'SCHEDULED',
    last_run_error: null,
    last_run_trigger: null,
    last_run_summary: {
      backup_completed: false,
      mirror_completed: false,
      retention_pruned: false,
      due_tenants_count: 0,
      due_tenants: []
    },
    is_running: false
  },
  mirror_policy: {
    frequency: 'DAILY',
    scope: 'ALL_BANKS_ALL_BRANCHES',
    vendor_mirror_required: true
  },
  tenant_backup_policies: [],
  db_backups: [],
  storage_backups: [],
  transfer_packages: []
};

const StatusPill = ({ tone = 'neutral', children }) => (
  <span className={`ops-pill ops-pill-${tone}`}>{children}</span>
);

const AdminOperations = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isBankAdmin = user?.role === 'ADMIN';
  const [activeDesk, setActiveDesk] = useState('recovery');
  const [securityOverview, setSecurityOverview] = useState(emptySecurity);
  const [recoveryOverview, setRecoveryOverview] = useState(emptyRecovery);
  const [visibleTenants, setVisibleTenants] = useState([]);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState('');
  const [message, setMessage] = useState('');

  const loadPage = async () => {
    setLoading(true);
    try {
      const [securityResponse, recoveryResponse, tenantResponse] = await Promise.allSettled([
        api.get('/ops/security-overview'),
        isSuperAdmin ? api.get('/ops/recovery-vault') : Promise.resolve({ data: emptyRecovery }),
        (isSuperAdmin || isBankAdmin) ? api.get('/admin/tenants') : Promise.resolve({ data: [] })
      ]);

      if (securityResponse.status === 'fulfilled') {
        setSecurityOverview(securityResponse.value.data || emptySecurity);
      }
      if (recoveryResponse.status === 'fulfilled') {
        setRecoveryOverview(recoveryResponse.value.data || emptyRecovery);
      }
      if (tenantResponse.status === 'fulfilled') {
        const tenantRows = Array.isArray(tenantResponse.value.data) ? tenantResponse.value.data : [];
        setVisibleTenants(tenantRows);
        setSelectedTenantId((current) => {
          if (current && tenantRows.some((item) => String(item.id) === String(current))) {
            return current;
          }
          return String(user?.tenant_id || tenantRows[0]?.id || '');
        });
      }

      const failure = [securityResponse, recoveryResponse, tenantResponse].find((item) => item.status === 'rejected');
      setMessage(failure?.reason?.response?.data?.error || '');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to load operations console.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSuperAdmin || isBankAdmin) {
      setActiveDesk('recovery');
    }
  }, [isSuperAdmin, isBankAdmin]);

  useEffect(() => {
    loadPage();
  }, [isSuperAdmin, isBankAdmin, user?.tenant_id]);

  const automationStatus = recoveryOverview.automation_status || emptyRecovery.automation_status;
  const isBusy = Boolean(runningAction) || automationStatus.is_running;
  const selectedTenant = useMemo(() => (
    visibleTenants.find((tenant) => String(tenant.id) === String(selectedTenantId)) || null
  ), [selectedTenantId, visibleTenants]);
  const bankBackupDueNow = useMemo(() => {
    if (!selectedTenant || selectedTenant.backup_policy_enabled === false) return false;
    if (!selectedTenant.backup_next_due_at) return true;
    const nextDue = new Date(selectedTenant.backup_next_due_at);
    return !Number.isNaN(nextDue.getTime()) && nextDue.getTime() <= Date.now();
  }, [selectedTenant]);
  const topBranches = useMemo(() => {
    const activityByBranch = new Map((securityOverview.branch_activity || []).map((item) => [String(item.branch_id || 'unscoped'), item]));
    return (securityOverview.workflow_operations || []).slice(0, 8).map((workflowItem) => {
      const branchKey = String(workflowItem.branch_id || 'unscoped');
      const activityItem = activityByBranch.get(branchKey);
      return {
        branch_id: workflowItem.branch_id || activityItem?.branch_id || null,
        branch_name: workflowItem.branch_name || activityItem?.branch_name || 'Unscoped',
        drafts: workflowItem.drafts || 0,
        incoming: workflowItem.incoming || 0,
        returned: workflowItem.returned || 0,
        closed: workflowItem.closed || 0,
        views: activityItem?.views || 0,
        downloads: activityItem?.downloads || 0,
        access_failures: activityItem?.access_failures || 0,
        last_activity_at: workflowItem.last_activity_at || activityItem?.last_event_at || null
      };
    });
  }, [securityOverview]);

  const recoveryArtifacts = useMemo(() => ([
    ...(recoveryOverview.transfer_packages || []).map((item) => ({
      key: `pkg-${item.full_path}`,
      kind: 'package',
      title: item.name,
      meta: `${item.manifest?.deployment_label || item.manifest?.customer_code || 'Recovery package'} | ${formatSize(item.size_bytes)}${item.manifest?.document_summary ? ` | DMS ${item.manifest.document_summary.dms_total_notes || 0} | FMS ${item.manifest.document_summary.fms_total_documents || 0}` : ''}`,
      time: item.modified_at,
      fullPath: item.full_path
    })),
    ...(recoveryOverview.db_backups || []).slice(0, 6).map((item) => ({
      key: `db-${item.full_path}`,
      kind: 'db',
      title: item.name,
      meta: `Database backup | ${formatSize(item.size_bytes)}`,
      time: item.modified_at,
      fullPath: item.full_path
    })),
    ...(recoveryOverview.storage_backups || []).slice(0, 6).map((item) => ({
      key: `storage-${item.full_path}`,
      kind: 'storage',
      title: item.name,
      meta: `Storage backup | ${formatSize(item.size_bytes)}`,
      time: item.modified_at,
      fullPath: item.full_path
    }))
  ]), [recoveryOverview]);

  const handleRunAutomationNow = async () => {
    setRunningAction('automation');
    setMessage('');
    try {
      const response = await api.post('/ops/recovery-vault/run-automation');
      setMessage(response.data?.message || 'Automated backup cycle completed successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to run the automated backup cycle.');
    } finally {
      setRunningAction('');
    }
  };

  const handleCreateRecoveryPackage = async () => {
    setRunningAction('package');
    setMessage('');
    try {
      const response = await api.post('/ops/recovery-vault/export');
      setMessage(response.data?.message || 'Recovery package exported successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to export recovery package.');
    } finally {
      setRunningAction('');
    }
  };

  const handlePruneRetention = async () => {
    setRunningAction('prune');
    setMessage('');
    try {
      const response = await api.post('/ops/recovery-vault/prune-retention');
      setMessage(response.data?.message || 'Retention prune completed successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to prune retention artifacts.');
    } finally {
      setRunningAction('');
    }
  };

  const handleRestorePackage = async (packagePath) => {
    const confirmed = window.confirm(
      'Restore this recovery package now? This will overwrite the current database and storage with the selected backup package.'
    );
    if (!confirmed) return;

    setRunningAction('restore');
    setMessage('');
    try {
      const response = await api.post('/ops/recovery-vault/import', {
        package_dir: packagePath,
        restore_storage: true
      });
      setMessage(response.data?.message || 'Recovery package restored successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to restore the selected recovery package.');
    } finally {
      setRunningAction('');
    }
  };

  const handleRunBankBackupNow = async () => {
    if (!selectedTenant) return;
    setRunningAction('bank-backup');
    setMessage('');
    try {
      const response = await api.post(`/admin/tenants/${selectedTenant.id}/run-backup`);
      setMessage(response.data?.message || 'Bank backup completed successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to run bank backup right now.');
    } finally {
      setRunningAction('');
    }
  };

  const handleExportBankRecoveryPackage = async () => {
    if (!selectedTenant) return;
    setRunningAction('bank-export');
    setMessage('');
    try {
      const response = await api.post(`/admin/tenants/${selectedTenant.id}/export-recovery-package`);
      setMessage(response.data?.message || 'Bank recovery package exported successfully.');
      await loadPage();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to export bank recovery package right now.');
    } finally {
      setRunningAction('');
    }
  };

  return (
    <div className="ops-shell">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1>Operations Desk</h1>
        <p>
          {isSuperAdmin
            ? 'Keep backup recovery and branch activity easy to track from one clean control desk.'
            : 'Run bank backup controls and watch branch activity from one lighter desk.'}
        </p>
      </div>

      {message ? (
        <div className="ops-banner">
          <span>{message}</span>
          <button type="button" className="ops-link-btn" onClick={() => setMessage('')}>Dismiss</button>
        </div>
      ) : null}

      <div className="ops-tabs">
        <button type="button" className={`ops-tab ${activeDesk === 'security' ? 'is-active' : ''}`} onClick={() => setActiveDesk('security')}>
          Activity
        </button>
        {(isSuperAdmin || isBankAdmin) ? (
          <button type="button" className={`ops-tab ${activeDesk === 'recovery' ? 'is-active' : ''}`} onClick={() => setActiveDesk('recovery')}>
            Backups
          </button>
        ) : null}
      </div>

      {activeDesk === 'security' ? (
        <div className="ops-stack">
          <div className="ops-inline-metrics">
            <div className="ops-inline-metric"><span>Views</span><strong>{securityOverview.summary.views}</strong></div>
            <div className="ops-inline-metric"><span>Downloads</span><strong>{securityOverview.summary.downloads}</strong></div>
            <div className="ops-inline-metric"><span>Failures</span><strong>{securityOverview.summary.access_failures}</strong></div>
            <div className="ops-inline-metric"><span>Idle Exits</span><strong>{securityOverview.summary.idle_exits}</strong></div>
          </div>

          <div className="card">
            <div className="card-header blue">Branch Snapshot</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading branch snapshot...</div>
              ) : topBranches.length === 0 ? (
                <div className="fms-empty-box">No branch snapshot is available right now.</div>
              ) : (
                <div className="ops-compact-list">
                  {topBranches.map((item) => (
                    <div key={`snapshot-${item.branch_id || 'unscoped'}`} className="ops-compact-row">
                      <div>
                        <strong>{item.branch_name}</strong>
                        <div className="text-muted text-sm">
                          Incoming {item.incoming} | Returned {item.returned} | Drafts {item.drafts} | Views {item.views} | Downloads {item.downloads}
                        </div>
                      </div>
                      <span className="text-muted text-sm">{formatDateTime(item.last_activity_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header blue">Recent Trail</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading recent activity...</div>
              ) : securityOverview.recent_events.length === 0 ? (
                <div className="fms-empty-box">No recent activity found.</div>
              ) : (
                <div className="ops-compact-list">
                  {securityOverview.recent_events.slice(0, 12).map((item, index) => (
                    <div key={`${item.timestamp}-${item.event}-${index}`} className="ops-compact-row">
                      <div>
                        <strong>{item.event}</strong>
                        <div className="text-muted text-sm">
                          {item.user_id || 'system'} | {item.document_reference || item.file_name || item.reason || 'No extra details'}
                        </div>
                      </div>
                      <span className="text-muted text-sm">{formatDateTime(item.timestamp)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : isSuperAdmin ? (
        <div className="ops-stack">
          <div className="card">
            <div className="card-header blue">Auto Backup Engine</div>
            <div className="card-body">
              <div className="ops-pill-row" style={{ marginBottom: '14px' }}>
                <StatusPill tone={automationStatus.enabled ? 'success' : 'muted'}>
                  Engine {automationStatus.enabled ? 'On' : 'Off'}
                </StatusPill>
                <StatusPill tone={automationStatus.mirror_export_enabled ? 'info' : 'muted'}>
                  Mirror {automationStatus.mirror_export_enabled ? 'Daily' : 'Off'}
                </StatusPill>
                <StatusPill tone={automationStatus.retention_prune_enabled ? 'info' : 'muted'}>
                  Retention {automationStatus.retention_prune_enabled ? 'On' : 'Off'}
                </StatusPill>
                <StatusPill tone={automationStatus.last_run_status === 'FAILED' ? 'danger' : (automationStatus.last_run_status === 'SUCCESS' ? 'success' : 'neutral')}>
                  Last Result {automationStatus.last_run_status || 'Scheduled'}
                </StatusPill>
              </div>

              <div className="ops-summary-strip">
                <div><span>Mirror run</span><strong>{automationStatus.scheduled_time} {automationStatus.timezone}</strong></div>
                <div><span>Check every</span><strong>{automationStatus.check_interval_minutes || 15} min</strong></div>
                <div><span>Next check</span><strong>{formatDateTime(automationStatus.next_run_at)}</strong></div>
                <div><span>Last finish</span><strong>{formatDateTime(automationStatus.last_run_finished_at)}</strong></div>
              </div>

              <div className="ops-actions">
                <button type="button" className="btn btn-primary" onClick={handleRunAutomationNow} disabled={isBusy}>
                  {runningAction === 'automation' || automationStatus.is_running ? 'Running...' : 'Create Backup Now'}
                </button>
                <button type="button" className="btn btn-outline" onClick={handleCreateRecoveryPackage} disabled={isBusy}>
                  {runningAction === 'package' ? 'Exporting Package...' : 'Export Recovery Package'}
                </button>
                <button type="button" className="btn btn-outline" onClick={handlePruneRetention} disabled={isBusy}>
                  {runningAction === 'prune' ? 'Pruning...' : 'Run Retention Prune'}
                </button>
              </div>

              <div className="text-muted text-sm" style={{ marginTop: '12px' }}>
                Every backup includes the full database, DMS workflow files, FMS library files, and readable document ledgers. Bank auto backup is controlled in Bank Setup / Backup Policy & Vendor Mirror, while super admin can both create and restore recovery packages here.
              </div>

              {automationStatus.last_run_error ? (
                <div className="ops-error-box">
                  <strong style={{ display: 'block', marginBottom: '6px' }}>Last backup issue</strong>
                  <div>{automationStatus.last_run_error}</div>
                </div>
              ) : null}
            </div>
          </div>

          <div className="card">
            <div className="card-header blue">Bank Backup Policies</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading bank backup policies...</div>
              ) : recoveryOverview.tenant_backup_policies.length === 0 ? (
                <div className="fms-empty-box">No bank backup policies are available yet.</div>
              ) : (
                <div className="ops-compact-list">
                  {recoveryOverview.tenant_backup_policies.map((item) => (
                    <div key={item.id} className="ops-compact-row">
                      <div>
                        <strong>{item.tenant_name} ({item.tenant_code})</strong>
                        <div className="text-muted text-sm">
                          {item.backup_policy_enabled ? `${item.backup_frequency} | ${padTime(item.backup_window_hour, item.backup_window_minute)} | ${item.backup_retention_days} days` : 'Backup disabled by bank'}
                        </div>
                        <div className="text-muted text-sm">
                          Last {formatDateTime(item.backup_last_completed_at)} | Next {formatDateTime(item.backup_next_due_at)} | Mirror {item.vendor_mirror_enabled ? 'On' : 'Off'}
                        </div>
                      </div>
                      <StatusPill tone={item.backup_due_now ? 'warning' : 'muted'}>
                        {item.backup_due_now ? 'Due now' : 'Scheduled'}
                      </StatusPill>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header blue">Recovery Artifacts</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading backup artifacts...</div>
              ) : recoveryArtifacts.length === 0 ? (
                <div className="fms-empty-box">No recovery artifacts are available yet.</div>
              ) : (
                <div className="ops-compact-list">
                  {recoveryArtifacts.slice(0, 14).map((item) => (
                    <div key={item.key} className="ops-compact-row">
                      <div>
                        <strong>{item.title}</strong>
                        <div className="text-muted text-sm">{item.meta}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {item.kind === 'package' ? (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ whiteSpace: 'nowrap' }}
                            onClick={() => handleRestorePackage(item.fullPath)}
                            disabled={isBusy}
                          >
                            {runningAction === 'restore' ? 'Restoring...' : 'Restore Package'}
                          </button>
                        ) : null}
                        <span className="text-muted text-sm">{formatDateTime(item.time)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="ops-stack">
          <div className="card">
            <div className="card-header blue">Bank Backup Desk</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading bank backup desk...</div>
              ) : !selectedTenant ? (
                <div className="fms-empty-box">No bank backup desk is available for your login.</div>
              ) : (
                <>
                  <div className="ops-pill-row" style={{ marginBottom: '14px' }}>
                    <StatusPill tone={selectedTenant.backup_policy_enabled ? 'success' : 'muted'}>
                      Auto Backup {selectedTenant.backup_policy_enabled ? 'On' : 'Off'}
                    </StatusPill>
                    <StatusPill tone="info">
                      {selectedTenant.backup_frequency || 'DAILY'} at {padTime(selectedTenant.backup_window_hour, selectedTenant.backup_window_minute)}
                    </StatusPill>
                    <StatusPill tone={selectedTenant.vendor_mirror_enabled ? 'info' : 'muted'}>
                      Vendor Mirror {selectedTenant.vendor_mirror_enabled ? 'On' : 'Off'}
                    </StatusPill>
                    <StatusPill tone={bankBackupDueNow ? 'warning' : 'muted'}>
                      {bankBackupDueNow ? 'Due now' : 'Scheduled'}
                    </StatusPill>
                  </div>

                  <div className="ops-summary-strip">
                    <div><span>Bank</span><strong>{selectedTenant.tenant_name} ({selectedTenant.tenant_code})</strong></div>
                    <div><span>Last backup</span><strong>{formatDateTime(selectedTenant.backup_last_completed_at)}</strong></div>
                    <div><span>Next due</span><strong>{formatDateTime(selectedTenant.backup_next_due_at)}</strong></div>
                    <div><span>Retention</span><strong>{selectedTenant.backup_retention_days || 30} days</strong></div>
                  </div>

                  <div className="ops-actions">
                    <button type="button" className="btn btn-primary" onClick={handleRunBankBackupNow} disabled={isBusy}>
                      {runningAction === 'bank-backup' ? 'Creating Backup...' : 'Create Backup Now'}
                    </button>
                    <button type="button" className="btn btn-outline" onClick={handleExportBankRecoveryPackage} disabled={isBusy}>
                      {runningAction === 'bank-export' ? 'Exporting Package...' : 'Export Recovery Package'}
                    </button>
                  </div>

                  <div className="text-muted text-sm" style={{ marginTop: '12px' }}>
                    Bank admin can create backup evidence and recovery packages here without calling super admin each time. Full restore still stays with super admin because it rewrites the live deployment.
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header blue">Current Policy Snapshot</div>
            <div className="card-body">
              {loading ? (
                <div className="fms-empty-box">Loading current backup policy...</div>
              ) : !selectedTenant ? (
                <div className="fms-empty-box">No backup policy is available for your bank.</div>
              ) : (
                <div className="ops-compact-list">
                  <div className="ops-compact-row">
                    <div>
                      <strong>Backup expectation</strong>
                      <div className="text-muted text-sm">
                        {selectedTenant.backup_policy_enabled ? `${selectedTenant.backup_frequency} | ${padTime(selectedTenant.backup_window_hour, selectedTenant.backup_window_minute)}` : 'Scheduled bank backup is disabled'}
                      </div>
                    </div>
                    <StatusPill tone={selectedTenant.vendor_mirror_enabled ? 'info' : 'muted'}>
                      Mirror {selectedTenant.vendor_mirror_enabled ? 'Enabled' : 'Disabled'}
                    </StatusPill>
                  </div>
                  <div className="ops-compact-row">
                    <div>
                      <strong>Retention and host</strong>
                      <div className="text-muted text-sm">
                        {selectedTenant.backup_retention_days || 30} days | {selectedTenant.deployment_host || 'Host not recorded'}
                      </div>
                    </div>
                    <span className="text-muted text-sm">Manage policy in Bank Profile</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .ops-shell {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ops-banner {
          border: 1px solid #d9e4f2;
          background: #f8fbff;
          color: #183b66;
          border-radius: 14px;
          padding: 12px 14px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }
        .ops-link-btn {
          border: 0;
          background: transparent;
          color: #2f5ea5;
          font-weight: 700;
        }
        .ops-tabs {
          display: inline-flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ops-tab {
          border: 1px solid #d7e1ed;
          background: #fff;
          color: #345170;
          border-radius: 999px;
          padding: 8px 14px;
          font-weight: 700;
        }
        .ops-tab.is-active {
          background: #eef5ff;
          border-color: #99b8e6;
          color: #173c6d;
        }
        .ops-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .ops-inline-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .ops-inline-metric {
          border: 1px solid #dbe4ef;
          border-radius: 14px;
          background: #fff;
          padding: 14px 16px;
        }
        .ops-inline-metric span {
          display: block;
          color: #71839c;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 6px;
          font-weight: 700;
        }
        .ops-inline-metric strong {
          color: #173c6d;
          font-size: 26px;
          line-height: 1;
        }
        .ops-pill-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ops-pill {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid #d7e1ed;
          background: #fff;
          color: #4a5d76;
        }
        .ops-pill-success {
          background: #edf8f0;
          border-color: #b7ddc0;
          color: #20633a;
        }
        .ops-pill-info {
          background: #eef5ff;
          border-color: #bfd3ef;
          color: #214d80;
        }
        .ops-pill-warning {
          background: #fff5df;
          border-color: #f0d79a;
          color: #8a5b00;
        }
        .ops-pill-danger {
          background: #fff0f0;
          border-color: #e6b5b5;
          color: #8f3131;
        }
        .ops-pill-muted {
          background: #f7f9fc;
          border-color: #dde5ef;
          color: #62748b;
        }
        .ops-summary-strip {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-top: 10px;
        }
        .ops-summary-strip div {
          border: 1px solid #dbe4ef;
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff;
        }
        .ops-summary-strip span {
          display: block;
          color: #71839c;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .ops-summary-strip strong {
          color: #173c6d;
          font-size: 15px;
          line-height: 1.3;
        }
        .ops-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 14px;
        }
        .ops-error-box {
          margin-top: 14px;
          border: 1px solid #ebc4c4;
          background: #fff6f6;
          color: #8f3131;
          border-radius: 14px;
          padding: 12px 14px;
          word-break: break-word;
        }
        .ops-compact-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .ops-compact-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          border: 1px solid #e2eaf3;
          border-radius: 14px;
          background: #fff;
          padding: 12px 14px;
        }
        @media (max-width: 1024px) {
          .ops-inline-metrics,
          .ops-summary-strip {
            grid-template-columns: 1fr 1fr;
          }
        }
        @media (max-width: 700px) {
          .ops-inline-metrics,
          .ops-summary-strip {
            grid-template-columns: 1fr;
          }
          .ops-actions .btn {
            width: 100%;
            justify-content: center;
          }
          .ops-compact-row,
          .ops-banner {
            flex-direction: column;
            align-items: flex-start;
          }
        }
      `}</style>
    </div>
  );
};

export default AdminOperations;
