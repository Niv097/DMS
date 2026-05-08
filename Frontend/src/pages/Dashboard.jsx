import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { toPublicDocumentReference } from '../utils/documentReference';
import { formatWorkflowDateTime } from '../utils/dateTime';

const STATE_BADGE = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'amber',
  RETURNED_WITH_REMARK: 'red',
  RESUBMITTED: 'blue',
  APPROVED: 'green',
  REJECTED: 'red'
};

const QUEUE_META = {
  DRAFTS: { title: 'Pending Submission', countKey: 'drafts' },
  INCOMING: { title: 'Incoming Queue', countKey: 'incoming' },
  SENT: { title: 'Sent Items', countKey: 'sent' },
  RETURNED: { title: 'Returned', countKey: 'returned' },
  HISTORY: { title: 'Approved / Closed History', countKey: 'closed' }
};

const ROLE_QUEUE_VIEWS = {
  INITIATOR: ['DRAFTS', 'SENT', 'RETURNED', 'HISTORY'],
  RECOMMENDER: ['INCOMING', 'SENT', 'HISTORY'],
  APPROVER: ['INCOMING', 'HISTORY'],
  ADMIN: ['INCOMING', 'RETURNED', 'HISTORY'],
  SUPER_ADMIN: ['INCOMING', 'RETURNED', 'HISTORY'],
  AUDITOR: ['HISTORY']
};

const STATE_OPTIONS = [
  ['DRAFT', 'Draft'],
  ['SUBMITTED', 'Submitted'],
  ['UNDER_REVIEW', 'Under Review'],
  ['RETURNED_WITH_REMARK', 'Returned'],
  ['RESUBMITTED', 'Resubmitted'],
  ['APPROVED', 'Approved'],
  ['REJECTED', 'Rejected']
];

const QUEUE_ROUTE_MAP = {
  DRAFTS: '/queue/drafts',
  INCOMING: '/queue/incoming',
  SENT: '/queue/sent',
  RETURNED: '/queue/returned',
  HISTORY: '/queue/history'
};

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const formatDocumentReference = (value, branchContext = null) => {
  return toPublicDocumentReference(value, '-', branchContext);
};
const formatDateTime = (value) => formatWorkflowDateTime(value);

const Dashboard = ({ view, showQueueSelector = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    drafts: 0,
    incoming: 0,
    sent: 0,
    returned: 0,
    closed: 0
  });
  const [departments, setDepartments] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [activeApprovedFile, setActiveApprovedFile] = useState(null);
  const [copiedApprovedRef, setCopiedApprovedRef] = useState(false);
  const [filters, setFilters] = useState({
    q: '',
    vertical: '',
    department: '',
    status: ''
  });

  const availableViews = ROLE_QUEUE_VIEWS[user?.role] || ['HISTORY'];
  const defaultView = view || availableViews[0];
  const isWorkflowQueueScreen = Boolean(view);
  const [selectedView, setSelectedView] = useState(defaultView);
  const effectiveView = showQueueSelector ? selectedView : defaultView;

  useEffect(() => {
    setSelectedView(defaultView);
  }, [defaultView]);

  useEffect(() => {
    const fetchFilters = async () => {
      try {
        const [deptsRes, vertsRes] = await Promise.all([
          api.get('/departments'),
          api.get('/verticals')
        ]);
        setDepartments(deptsRes.data || []);
        setVerticals(vertsRes.data || []);
      } catch (error) {
        console.error('Error fetching dashboard filters', error);
      }
    };

    fetchFilters();
  }, []);

  useEffect(() => {
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.q.trim()) params.append('q', filters.q.trim());
        if (filters.vertical) params.append('vertical', filters.vertical);
        if (filters.department) params.append('department', filters.department);
        if (filters.status) params.append('status', filters.status);
        if (effectiveView) params.append('view', effectiveView);

        const response = await api.get(`/notes${params.toString() ? `?${params.toString()}` : ''}`);
        setNotes(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Failed to fetch files', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotes();
  }, [filters, effectiveView]);

  useEffect(() => {
    if (!user) return;

    const fetchSupplemental = async () => {
      try {
          const shouldLoadMandatoryFms = Boolean(
            user?.has_fms_access
            || user?.has_granted_fms_access
            || user?.fms_enabled
            || (Array.isArray(user?.fms_permissions) && user.fms_permissions.length > 0)
          );
        const requests = [
          api.get('/dashboard/stats'),
          api.get('/notes/active-approved')
        ];
        if (shouldLoadMandatoryFms) {
          requests.push(api.get('/fms/distribution-inbox'));
        }
        const [statsRes, activeRes, mandatoryRes] = await Promise.all(requests);
        const data = statsRes.data || {};
        setStats({
          total: data.totalNotes ?? 0,
          drafts: data.drafts ?? 0,
          incoming: data.incoming ?? 0,
          sent: data.sent ?? 0,
          returned: data.returned ?? 0,
          closed: data.closed ?? 0
        });
        setActiveApprovedFile(activeRes.data || null);
          void mandatoryRes;
      } catch (error) {
        console.error('Failed to fetch dashboard summary', error);
      }
    };

    fetchSupplemental();
  }, [user]);

  const queueTabs = useMemo(() => (
    availableViews.map((queueView) => ({
      view: queueView,
      title: QUEUE_META[queueView]?.title || queueView,
      count: stats[QUEUE_META[queueView]?.countKey] || 0
    }))
  ), [availableViews, stats]);

  const pageTitle = QUEUE_META[effectiveView]?.title || 'Workflow Dashboard';
  const pageSubtitle = (() => {
    if (effectiveView === 'DRAFTS') return 'Files waiting for final maker completion before formal submission into workflow.';
    if (effectiveView === 'INCOMING') return 'Cases pending at your desk.';
    if (effectiveView === 'SENT') return 'Cases already moved forward from your desk.';
    if (effectiveView === 'RETURNED') return 'Cases sent back for correction.';
    if (effectiveView === 'HISTORY') return 'Completed cases available for reference.';
    return 'Workflow cases.';
  })();

  const trimmedSearchQuery = filters.q.trim();

  const searchFeedback = useMemo(() => {
    if (!trimmedSearchQuery) return 'Start typing to search across all cases';
    if (loading) return 'Searching...';
    return `Showing results for "${trimmedSearchQuery}"`;
  }, [trimmedSearchQuery, loading]);

  const renderHighlightedText = (value) => {
    const text = String(value || '');
    if (!trimmedSearchQuery) return text;

    const expression = new RegExp(`(${escapeRegExp(trimmedSearchQuery)})`, 'ig');
    let matchFound = false;
    const parts = text.split(expression);

    const content = parts.map((part, index) => {
      if (part.localeCompare(trimmedSearchQuery, undefined, { sensitivity: 'accent' }) === 0 || part.toLowerCase() === trimmedSearchQuery.toLowerCase()) {
        matchFound = true;
        return <mark key={`${part}-${index}`} className="dms-search-hit">{part}</mark>;
      }
      return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
    });

    return matchFound ? content : text;
  };

  const formatApprovedRecordDate = (value) => {
    if (!value) return 'Not available';
    return formatWorkflowDateTime(value, 'Not available');
  };

  const handleFilterChange = (event) => {
    setFilters((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleOpenApprovedRecord = () => {
    if (!activeApprovedFile?.id) return;
    navigate(`/note/${activeApprovedFile.id}`);
  };

  const handleCopyApprovedRef = async (event) => {
    event.stopPropagation();
    const reference = formatDocumentReference(
      activeApprovedFile?.public_document_reference ||
      activeApprovedFile?.document_group_key ||
      activeApprovedFile?.document_code ||
      activeApprovedFile?.note_id,
      activeApprovedFile?.branch || null
    );
    if (!reference || reference === '-') return;

    try {
      await navigator.clipboard.writeText(reference);
      setCopiedApprovedRef(true);
      setTimeout(() => setCopiedApprovedRef(false), 1400);
    } catch (error) {
      console.error('Failed to copy case ID', error);
    }
  };

  const approvedRecordUpdatedAt = activeApprovedFile?.approved_at || activeApprovedFile?.updated_at || activeApprovedFile?.created_at;
  const approvedRecordActor =
    activeApprovedFile?.approved_by_name ||
    activeApprovedFile?.current_owner?.name ||
    activeApprovedFile?.initiator?.name ||
    'Assigned officer';
  const approvedRecordReference = formatDocumentReference(
    activeApprovedFile?.public_document_reference ||
    activeApprovedFile?.document_group_key ||
    activeApprovedFile?.document_code ||
    activeApprovedFile?.note_id,
    activeApprovedFile?.branch || null
  );
  const activeQueueCount = stats[QUEUE_META[effectiveView]?.countKey] ?? notes.length;
  const workflowFocusQueue = queueTabs.find((queue) => queue.count > 0) || queueTabs[0] || {
    view: effectiveView,
    title: QUEUE_META[effectiveView]?.title || 'Workflow Queue',
    count: activeQueueCount
  };
  const workflowFocusRoute = QUEUE_ROUTE_MAP[workflowFocusQueue?.view] || '/queues';
  const roleDeskLabel = (() => {
    switch (user?.role) {
      case 'INITIATOR':
        return 'Maker Workbench';
      case 'RECOMMENDER':
        return 'Recommendation Desk';
      case 'APPROVER':
        return 'Approval Desk';
      case 'ADMIN':
        return 'Bank Control Desk';
      case 'SUPER_ADMIN':
        return 'Enterprise Control Desk';
      case 'AUDITOR':
        return 'Audit Review Desk';
      default:
        return 'Workflow Desk';
    }
  })();
  const hierarchyLabel = [
    user?.tenant_name || user?.branch_name || 'Default Demo Bank',
    user?.department_name || user?.department?.name || 'Workflow Operations',
    user?.branch_name || 'Head Office'
  ].filter(Boolean).join(' / ');

  return (
    <div className="dashboard-container dashboard-shell">
      <style>{`
        .dashboard-shell {
          display: grid;
          gap: 20px;
        }
        .dashboard-hero {
          position: relative;
          overflow: hidden;
          border-radius: 24px;
          padding: 24px 26px;
          background:
            radial-gradient(circle at top right, rgba(214, 230, 252, 0.22) 0%, transparent 38%),
            linear-gradient(135deg, #315985 0%, #3b6896 48%, #4575a3 100%);
          color: #f6f9fc;
          border: 1px solid rgba(190, 211, 239, 0.26);
          box-shadow: 0 16px 34px rgba(19, 45, 79, 0.12);
        }
        .dashboard-hero.dashboard-hero-queue {
          background:
            radial-gradient(circle at top right, rgba(227, 238, 252, 0.26) 0%, transparent 42%),
            linear-gradient(180deg, #f4f8fd 0%, #edf4fb 100%);
          color: #173252;
          border: 1px solid #d8e2f0;
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.05);
        }
        .dashboard-hero.dashboard-hero-queue::after {
          background: linear-gradient(180deg, rgba(255,255,255,0.42) 0%, transparent 72%);
        }
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-kicker,
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-chip {
          background: #eef5ff;
          border-color: #d6e4f5;
          color: #1f4a7f;
        }
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-chip span,
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-kicker {
          color: #5f7c9f;
        }
        .dashboard-hero.dashboard-hero-queue h1,
        .dashboard-hero.dashboard-hero-queue .dashboard-focus-card-title,
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-side-value {
          color: #173252;
        }
        .dashboard-hero.dashboard-hero-queue p,
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-side-copy,
        .dashboard-hero.dashboard-hero-queue .dashboard-focus-card-link {
          color: #5f7590;
        }
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-side-label {
          color: #6f88a7;
        }
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-side-card {
          background: #ffffff;
          border-color: #dbe4ef;
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.04);
        }
        .dashboard-hero.dashboard-hero-queue .dashboard-hero-grid {
          grid-template-columns: 1fr;
        }
        .dashboard-hero::after {
          content: "";
          position: absolute;
          inset: 0;
          background:
            linear-gradient(120deg, rgba(255,255,255,0.045) 0%, transparent 28%),
            repeating-linear-gradient(135deg, rgba(255,255,255,0.022) 0 1px, transparent 1px 16px);
          pointer-events: none;
        }
        .dashboard-hero-grid {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: minmax(0, 1.8fr) minmax(300px, 1fr);
          gap: 18px;
          align-items: stretch;
        }
        .dashboard-hero-copy {
          display: grid;
          gap: 14px;
        }
        .dashboard-hero-kicker {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          width: fit-content;
          padding: 7px 12px;
          border-radius: 999px;
          background: rgba(244, 248, 255, 0.09);
          border: 1px solid rgba(214, 227, 244, 0.2);
          color: #dce8f8;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .dashboard-hero h1 {
          font-size: clamp(28px, 3vw, 36px);
          line-height: 1.08;
          margin: 0;
          color: #ffffff;
          letter-spacing: -0.03em;
        }
        .dashboard-hero p {
          max-width: 720px;
          margin: 0;
          font-size: 15px;
          line-height: 1.65;
          color: rgba(236, 242, 249, 0.88);
        }
        .dashboard-hero-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }
        .dashboard-hero-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(221, 232, 246, 0.18);
          color: #ecf2f9;
          font-size: 12px;
          font-weight: 600;
          line-height: 1.35;
        }
        .dashboard-hero-chip span {
          color: #9fb6d2;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 10px;
        }
        .dashboard-hero-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
        }
        .dashboard-hero .btn.btn-primary {
          min-height: 46px;
          padding: 0 18px;
          border: 1px solid rgba(219, 231, 246, 0.18);
          background: linear-gradient(180deg, #eff5ff 0%, #d9e8ff 100%);
          color: #13345d;
          font-weight: 700;
          box-shadow: 0 10px 24px rgba(9, 29, 53, 0.18);
        }
        .dashboard-hero .btn.btn-primary:hover {
          background: linear-gradient(180deg, #ffffff 0%, #e6f0ff 100%);
        }
        .dashboard-hero-side {
          display: grid;
          gap: 14px;
        }
        .dashboard-hero-side-card {
          padding: 16px 18px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(221, 232, 246, 0.14);
          backdrop-filter: blur(6px);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
        }
        .dashboard-focus-card {
          width: 100%;
          text-align: left;
          cursor: pointer;
          appearance: none;
          font: inherit;
          color: inherit;
          transition: transform 150ms ease, border-color 150ms ease, box-shadow 150ms ease, background-color 150ms ease;
        }
        .dashboard-focus-card:hover {
          transform: translateY(-1px);
          border-color: rgba(226, 236, 248, 0.26);
          box-shadow: 0 10px 22px rgba(17, 39, 68, 0.12), inset 0 1px 0 rgba(255,255,255,0.05);
          background: rgba(255, 255, 255, 0.12);
        }
        .dashboard-hero-side-label {
          color: #adc1da;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .dashboard-hero-side-value {
          color: #ffffff;
          font-size: 28px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 10px;
        }
        .dashboard-hero-side-copy {
          color: rgba(225, 234, 244, 0.82);
          font-size: 13px;
          line-height: 1.6;
        }
        .dashboard-focus-card-title {
          color: #ffffff;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.2;
          margin-bottom: 8px;
        }
        .dashboard-focus-card-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          color: #dce8f8;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .dashboard-section-card {
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
          border: 1px solid #d8e2f0;
          border-radius: 22px;
          padding: 18px;
          box-shadow: 0 14px 32px rgba(15, 23, 42, 0.06);
        }
        .dashboard-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          margin-bottom: 14px;
        }
        .dashboard-panel-header h2 {
          margin: 0;
          color: #173252;
          font-size: 16px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .dashboard-panel-header p {
          margin: 4px 0 0;
          color: #687c95;
          font-size: 13px;
        }
        .dashboard-panel-caption {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          background: #edf4ff;
          color: #1c4d8e;
          font-size: 12px;
          font-weight: 700;
          border: 1px solid #d4e1f5;
          white-space: nowrap;
        }
        .queue-tab-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }
        .queue-tab {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-height: 42px;
          padding: 0 14px;
          border: 1px solid #d6dee9;
          border-radius: 12px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%);
          color: #4a5c73;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
          transition: border-color 150ms ease, background-color 150ms ease, color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
        }
        .queue-tab:hover {
          border-color: #b7c7da;
          background: linear-gradient(180deg, #ffffff 0%, #f5f8fc 100%);
          box-shadow: 0 6px 14px rgba(31, 79, 149, 0.08);
          transform: translateY(-1px);
        }
        .queue-tab.active {
          background: linear-gradient(180deg, #f4f8ff 0%, #e7f0ff 100%);
          border-color: #a9c0e8;
          color: #1f4f95;
          box-shadow: 0 8px 18px rgba(31, 79, 149, 0.10);
        }
        .queue-tab-count {
          min-width: 24px;
          height: 24px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0 8px;
          font-size: 12px;
          font-weight: 700;
          background: #f1f4f8;
          color: #4e6179;
          border: 1px solid #d9e1ec;
        }
        .queue-tab.active .queue-tab-count {
          background: #ffffff;
          color: #1f4f95;
          border-color: #c4d5f0;
        }
        .approved-record-card {
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          border-color: #d8e2ef;
          transition: background-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        }
        .approved-record-card:hover {
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
          transform: translateY(-1px);
        }
        .approved-record-card .card-body > div:first-child > .text-mono {
          display: none;
        }
        .approved-record-meta-line {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          color: #74859b;
          font-size: 12px;
          line-height: 1.4;
          margin-top: 6px;
        }
        .approved-record-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #1f4f95;
          font-weight: 700;
          cursor: pointer;
          background: transparent;
          border: none;
          padding: 0;
          font-size: inherit;
        }
        .approved-record-link:hover,
        .approved-record-link:focus {
          color: #173d79;
          outline: none;
        }
        .approved-record-copy {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: 1px solid #d4deeb;
          border-radius: 999px;
          background: #fff;
          color: #58708d;
          cursor: pointer;
          transition: border-color 0.2s ease, color 0.2s ease, background-color 0.2s ease;
        }
        .approved-record-copy:hover,
        .approved-record-copy:focus {
          border-color: #b6c8df;
          color: #1f4f95;
          background: #f7faff;
          outline: none;
        }
        .approved-record-copy-status {
          color: #5c7692;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .approved-record-view-link {
          color: #1f4f95;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          background: transparent;
          border: none;
          padding: 0;
          transition: color 0.2s ease;
        }
        .approved-record-view-link:hover,
        .approved-record-view-link:focus {
          color: #173d79;
          outline: none;
        }
        .dashboard-header-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
        }
        .dashboard-worklist {
          display: grid;
          gap: 18px;
        }
        .dashboard-filter-card {
          display: grid;
          gap: 14px;
          padding: 16px;
          border-radius: 18px;
          border: 1px solid #d9e3ef;
          background: linear-gradient(180deg, #fbfdff 0%, #f6f9fd 100%);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.7);
        }
        .dashboard-filter-form {
          display: grid;
          grid-template-columns: minmax(420px, 2.15fr) repeat(3, minmax(190px, 1fr));
          gap: 16px;
          align-items: end;
        }
        .dashboard-approved-layout {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          align-items: center;
        }
        .dashboard-approved-actions {
          text-align: right;
        }
        .dashboard-mobile-list {
          display: none;
        }
        .dashboard-mobile-card {
          width: 100%;
          border: 1px solid #d9e2ee;
          border-radius: 14px;
          background: #ffffff;
          padding: 14px;
          display: grid;
          gap: 10px;
          text-align: left;
          cursor: pointer;
        }
        .dashboard-mobile-card-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 10px;
        }
        .dashboard-mobile-card-title {
          color: #173c6d;
          font-weight: 700;
          line-height: 1.5;
        }
        .dashboard-mobile-meta {
          display: grid;
          gap: 4px;
          color: #61758d;
          font-size: 12px;
          line-height: 1.5;
        }
        .dms-track-search {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .dashboard-filter-search-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 8px;
        }
        .dms-track-search label,
        .dashboard-inline-filter label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #5a6c84;
          padding-left: 2px;
          line-height: 1.2;
        }
        .dms-track-search input {
          width: 100%;
          min-height: 48px;
          padding: 11px 42px 11px 42px;
          border: 1px solid #cad5e3;
          border-radius: 12px;
          background: #fff;
          color: #27384f;
          font-size: 14px;
          font-weight: 500;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .dms-track-search input:hover {
          border-color: #b9c8db;
          background: #fcfdff;
        }
        .dms-track-search input:focus {
          outline: none;
          border-color: #7fa4db;
          box-shadow: 0 0 0 3px rgba(42, 90, 167, 0.10);
        }
        .dms-track-search-shell {
          position: relative;
        }
        .dms-track-search-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #8092a9;
          pointer-events: none;
          width: 16px;
          height: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .dashboard-inline-filter-select {
          width: 100%;
          min-height: 48px;
          padding: 10px 12px;
          border: 1px solid #cad5e3;
          border-radius: 12px;
          background: #ffffff;
          color: #27384f;
          font-size: 13px;
          font-weight: 600;
          box-sizing: border-box;
          transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .dashboard-inline-filter-select:hover {
          border-color: #b9c8db;
          background: #fcfdff;
        }
        .dashboard-inline-filter-select:focus {
          outline: none;
          border-color: #7fa4db;
          box-shadow: 0 0 0 3px rgba(42, 90, 167, 0.10);
        }
        .dms-track-clear {
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 24px;
          border: none;
          border-radius: 999px;
          background: transparent;
          color: #67798f;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          transition: background-color 0.2s ease, color 0.2s ease;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .dms-track-clear:hover {
          background: #edf3fb;
          color: #1f4f95;
        }
        .dms-track-clear:focus {
          outline: none;
          background: #edf3fb;
          color: #1f4f95;
        }
        .dms-track-feedback {
          color: #5f738d;
          font-size: 12px;
          font-weight: 600;
          grid-column: 1 / -1;
          margin-top: -2px;
        }
        .dashboard-data-card {
          overflow: hidden;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        }
        .dashboard-table-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 0 0 14px;
        }
        .dashboard-table-toolbar h3 {
          margin: 0;
          font-size: 16px;
          color: #173252;
        }
        .dashboard-table-toolbar p {
          margin: 3px 0 0;
          color: #6d8199;
          font-size: 13px;
        }
        .dashboard-table-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          background: #f1f6fd;
          border: 1px solid #dbe5f2;
          color: #294a72;
          font-size: 12px;
          font-weight: 700;
        }
        .dashboard-table-desktop table thead th {
          background: linear-gradient(180deg, #23344b 0%, #1b2839 100%);
          color: #dde7f5;
          border-bottom: 1px solid #22364f;
        }
        .dashboard-table-desktop table tbody tr:nth-child(even) {
          background: #fbfdff;
        }
        .dashboard-table-desktop table tbody tr:hover {
          background: #f2f7ff;
        }
        .dashboard-table-desktop table tbody td {
          border-bottom: 1px solid #e8eef6;
        }
        .dms-search-hit {
          background: rgba(247, 216, 128, 0.55);
          color: inherit;
          padding: 0 2px;
          border-radius: 4px;
          font-weight: 700;
        }
        @media (max-width: 960px) {
          .dashboard-hero-grid {
            grid-template-columns: 1fr;
          }
          .dashboard-filter-form {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .dashboard-filter-search-row {
            grid-column: 1 / -1;
          }
          .dashboard-header-bar,
          .dashboard-approved-layout {
            flex-direction: column;
            align-items: flex-start;
          }
          .dashboard-approved-actions {
            width: 100%;
            text-align: left;
          }
          .dashboard-approved-actions .approved-record-view-link {
            margin-top: 12px !important;
          }
        }
        @media (max-width: 700px) {
          .dashboard-hero {
            padding: 20px 18px;
          }
          .queue-tab {
            width: 100%;
            justify-content: space-between;
          }
          .summary-card-lite .value {
            font-size: 26px;
          }
          .dashboard-table-desktop {
            display: none;
          }
          .dashboard-mobile-list {
            display: grid;
            gap: 12px;
            padding: 14px;
          }
          .dashboard-filter-form,
          .dashboard-filter-form {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <section className={`dashboard-hero ${isWorkflowQueueScreen ? 'dashboard-hero-queue' : ''}`}>
        <div className="dashboard-hero-grid">
          <div className="dashboard-hero-copy">
            <div className="dashboard-hero-kicker">Workflow Dashboard</div>
            <div>
              <h1>{pageTitle}</h1>
              <p>{pageSubtitle}</p>
            </div>
            <div className="dashboard-hero-meta">
              <div className="dashboard-hero-chip"><span>Desk</span>{roleDeskLabel}</div>
              <div className="dashboard-hero-chip"><span>Scope</span>{hierarchyLabel}</div>
              <div className="dashboard-hero-chip"><span>Live Queue</span>{activeQueueCount} active items</div>
            </div>
            {user?.role === 'INITIATOR' && (
              <div className="dashboard-hero-actions">
                <button className="btn btn-primary" onClick={() => navigate('/submit')}>+ Upload File</button>
              </div>
            )}
          </div>
          {!isWorkflowQueueScreen && (
            <div className="dashboard-hero-side">
              <button
                type="button"
                className="dashboard-hero-side-card dashboard-focus-card"
                onClick={() => navigate(workflowFocusRoute)}
              >
                <div className="dashboard-hero-side-label">Current Workflow Focus</div>
                <div className="dashboard-hero-side-value">{workflowFocusQueue?.count ?? 0}</div>
                <div className="dashboard-focus-card-title">{workflowFocusQueue?.title || 'Workflow Queue'}</div>
                <div className="dashboard-hero-side-copy">
                  Open the live queue that currently needs desk attention. Counts refresh from workflow state, ownership, and next responsibility.
                </div>
                <div className="dashboard-focus-card-link">Open Queue</div>
              </button>
              <div className="dashboard-hero-side-card">
                <div className="dashboard-hero-side-label">Operator Guidance</div>
                <div className="dashboard-hero-side-copy">
                  Use the case tracking search to retrieve submissions by case ID, subject, customer, or owner. Filters below keep the workbench scoped to the right banking desk.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {showQueueSelector && (
        <section className="dashboard-section-card">
          <div className="dashboard-panel-header">
            <div>
              <h2>Desk Queues</h2>
              <p>Switch between the queues that belong to your current banking role.</p>
            </div>
            <div className="dashboard-panel-caption">{queueTabs.length} queue views</div>
          </div>
          <div>
            <div className="queue-tab-row">
              {queueTabs.map((queue) => (
                <button
                  key={queue.view}
                  type="button"
                  className={`queue-tab ${effectiveView === queue.view ? 'active' : ''}`}
                  onClick={() => setSelectedView(queue.view)}
                >
                  <span>{queue.title}</span>
                  <span className="queue-tab-count">{queue.count}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {user?.role === 'INITIATOR' && activeApprovedFile && (
        <div className="card approved-record-card">
          <div className="card-body dashboard-approved-layout">
            <div style={{ minWidth: 0 }}>
              <div className="text-sm text-muted">Latest Approved Record</div>
              <div style={{ fontSize: '18px', fontWeight: 600 }}>{activeApprovedFile.subject}</div>
              <div className="approved-record-meta-line">
                <button
                  type="button"
                  className="approved-record-link text-mono"
                  onClick={handleOpenApprovedRecord}
                  title="Open approved record"
                >
                  {approvedRecordReference}
                </button>
                <button
                  type="button"
                  className="approved-record-copy"
                  onClick={handleCopyApprovedRef}
                  title="Copy case ID"
                  aria-label="Copy case ID"
                >
                  <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="7" y="3" width="9" height="11" rx="1.8" />
                    <path d="M5 7H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1" />
                  </svg>
                </button>
                {copiedApprovedRef && <span className="approved-record-copy-status">Copied</span>}
                <span className="text-mono">| Version {activeApprovedFile.version_number}</span>
              </div>
              <div className="approved-record-meta-line">
                <span>Last updated: {formatApprovedRecordDate(approvedRecordUpdatedAt)}</span>
                <span>|</span>
                <span>Approved by {approvedRecordActor}</span>
              </div>
              <div className="text-mono">{approvedRecordReference} | Version {activeApprovedFile.version_number}</div>
            </div>
            <div className="dashboard-approved-actions">
              <div className="badge badge-green">Approved</div>
              <button
                type="button"
                className="approved-record-view-link"
                onClick={handleOpenApprovedRecord}
                title="View approved record details"
                style={{ marginTop: '10px' }}
              >
                View Details
              </button>
              <div className="text-sm text-muted mt-8">{activeApprovedFile.initiator?.name} | {activeApprovedFile.department?.name}</div>
            </div>
          </div>
        </div>
      )}

      <section className="dashboard-section-card dashboard-worklist">
        <div className="dashboard-panel-header">
          <div>
            <h2>Case Tracking Search</h2>
            <p>Filter the worklist by ownership, vertical, department, or workflow state.</p>
          </div>
          <div className="dashboard-panel-caption">Search + filter workbench</div>
        </div>

        <div className="dashboard-inline-filters dashboard-filter-card">
          <div className="dashboard-filter-form">
            <div className="dashboard-filter-search-row">
              <div className="dms-track-search">
                <label>Case Tracking Search</label>
                <div className="dms-track-search-shell">
                  <span className="dms-track-search-icon" aria-hidden="true">
                    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="8.5" cy="8.5" r="5.5" />
                      <path d="M12.5 12.5L17 17" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    name="q"
                    value={filters.q}
                    onChange={handleFilterChange}
                    placeholder="Search by Case ID, Subject, Customer, or Owner..."
                  />
                  {trimmedSearchQuery && (
                    <button
                      type="button"
                      className="dms-track-clear"
                      onClick={() => setFilters((current) => ({ ...current, q: '' }))}
                      aria-label="Clear search"
                    >
                      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <path d="M5 5L15 15" />
                        <path d="M15 5L5 15" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="dashboard-inline-filter" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
              <label>Vertical</label>
              <select
                name="vertical"
                value={filters.vertical}
                onChange={handleFilterChange}
                className="dashboard-inline-filter-select"
              >
                <option value="">All Verticals</option>
                {verticals.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}
              </select>
            </div>
            <div className="dashboard-inline-filter" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
              <label>Department</label>
              <select
                name="department"
                value={filters.department}
                onChange={handleFilterChange}
                className="dashboard-inline-filter-select"
              >
                <option value="">All Departments</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </select>
            </div>
            <div className="dashboard-inline-filter" style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
              <label>Workflow State</label>
              <select
                name="status"
                value={filters.status}
                onChange={handleFilterChange}
                className="dashboard-inline-filter-select"
              >
                <option value="">All States</option>
                {STATE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
          </div>
          <div className="dms-track-feedback">{searchFeedback}</div>
        </div>

        <div className="card dashboard-data-card" style={{ padding: 0 }}>
          <div className="card-body" style={{ paddingBottom: 0 }}>
            <div className="dashboard-table-toolbar">
              <div>
                <h3>Live Case Register</h3>
                <p>Every visible case is already scoped to your workflow desk and current banking permissions.</p>
              </div>
              <div className="dashboard-table-badge">{notes.length} visible record{notes.length === 1 ? '' : 's'}</div>
            </div>
          </div>
          <div className="table-wrap dashboard-table-desktop">
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Subject</th>
                <th>State</th>
                <th>Queue</th>
                <th>Current Owner</th>
                <th>Next Responsible</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>Loading cases...</td></tr>
              ) : notes.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '40px' }}>
                    <div style={{ fontWeight: 600, color: '#32455f', marginBottom: '6px' }}>No matching cases found</div>
                    <div className="text-sm text-muted">Try searching with Case ID, subject, or user name</div>
                  </td>
                </tr>
              ) : (
                notes.map((note) => (
                  <tr key={note.id} onClick={() => navigate(`/note/${note.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="note-id">{renderHighlightedText(formatDocumentReference(note.public_document_reference || note.document_group_key || note.document_code || note.note_id, note.branch || null))}</td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{renderHighlightedText(note.subject)}</div>
                      <div className="text-sm text-muted">v{note.version_number || 1} | {note.initiator?.name || 'Unknown initiator'}</div>
                    </td>
                    <td><span className={`badge badge-${STATE_BADGE[note.workflow_state] || 'gray'}`}>{note.workflow_state_label || note.workflow_state}</span></td>
                    <td>{note.queue_label || QUEUE_META[effectiveView]?.title || note.queue_code}</td>
                    <td>{note.current_owner?.name || '-'}</td>
                    <td>{note.next_responsible?.name || '-'}</td>
                    <td>{formatDateTime(note.updated_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="dashboard-mobile-list">
          {loading ? (
            <div className="fms-empty-box">Loading cases...</div>
          ) : notes.length === 0 ? (
            <div className="fms-empty-box">No matching cases found right now.</div>
          ) : (
            notes.map((note) => (
              <button
                key={`mobile-${note.id}`}
                type="button"
                className="dashboard-mobile-card"
                onClick={() => navigate(`/note/${note.id}`)}
              >
                <div className="dashboard-mobile-card-top">
                  <div className="dashboard-mobile-card-title">
                    {renderHighlightedText(formatDocumentReference(note.public_document_reference || note.document_group_key || note.document_code || note.note_id, note.branch || null))}
                  </div>
                  <span className={`badge badge-${STATE_BADGE[note.workflow_state] || 'gray'}`}>{note.workflow_state_label || note.workflow_state}</span>
                </div>
                <div style={{ fontWeight: 600, color: '#22324a' }}>{renderHighlightedText(note.subject)}</div>
                <div className="dashboard-mobile-meta">
                  <span>Queue: {note.queue_label || QUEUE_META[effectiveView]?.title || note.queue_code}</span>
                  <span>Current owner: {note.current_owner?.name || '-'}</span>
                  <span>Next responsible: {note.next_responsible?.name || '-'}</span>
                  <span>Updated: {formatDateTime(note.updated_at)}</span>
                </div>
              </button>
            ))
          )}
        </div>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;


