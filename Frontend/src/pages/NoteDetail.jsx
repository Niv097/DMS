import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { toPublicDocumentReference } from '../utils/documentReference';
import UserSearchSelect from '../components/UserSearchSelect';
import { formatWorkflowDateTime } from '../utils/dateTime';

const stateBadgeMap = {
  DRAFT: 'gray',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'amber',
  RETURNED_WITH_REMARK: 'red',
  RESUBMITTED: 'blue',
  APPROVED: 'green',
  REJECTED: 'red'
};

const queueBadgeMap = {
  DRAFTS: 'gray',
  INCOMING: 'blue',
  RETURNED_WITH_REMARKS: 'red',
  APPROVED_CLOSED_HISTORY: 'green'
};

const isImageFile = (filePath = '') => /\.(png|jpe?g|gif|webp|tiff?)$/i.test(filePath);
const isPdfFile = (filePath = '') => /\.pdf$/i.test(filePath);
const getDownloadName = (contentDisposition, fallbackName) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
  return match?.[1] || fallbackName;
};
const formatDocumentReference = (value, branchContext = null) => {
  return toPublicDocumentReference(value, '-', branchContext);
};
const formatAuditActionLabel = (value = '') => String(value || '')
  .toLowerCase()
  .split('_')
  .filter(Boolean)
  .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
  .join(' ');
const formatWorkflowStateLabel = (value = '') => (
  value === 'RETURNED_WITH_REMARK'
    ? 'Returned'
    : formatAuditActionLabel(value)
);
const RequiredMark = () => <span className="required-marker" aria-hidden="true"> *</span>;
const isDemoDownloadMode = (import.meta.env.VITE_ENABLE_DEMO ?? import.meta.env.VITE_ENABLE_DEMO_FEATURES ?? 'true') !== 'false' && !import.meta.env.PROD;
const DEMO_DOWNLOAD_EMPLOYEE_ID = '123456';
const hasSensitiveFileAdminAccess = (user) => ['ADMIN', 'SUPER_ADMIN'].includes(user?.role?.name || user?.role);
const getWorkflowActionBusyLabel = (actionType) => {
  switch (actionType) {
    case 'RECOMMEND':
      return 'Submitting Recommendation...';
    case 'APPROVE':
      return 'Approving File...';
    case 'RETURN':
      return 'Returning File...';
    case 'REJECT':
      return 'Rejecting File...';
    default:
      return 'Processing...';
  }
};

const NoteDetail = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [reuploadComment, setReuploadComment] = useState('');
  const [reuploadFile, setReuploadFile] = useState(null);
  const [reuploadAnnexures, setReuploadAnnexures] = useState([]);
  const [activeTab, setActiveTab] = useState('comments');
  const [submitting, setSubmitting] = useState(false);
  const [submittingActionType, setSubmittingActionType] = useState('');
  const [draftRoutingUsers, setDraftRoutingUsers] = useState([]);
  const [draftRouteSubmitting, setDraftRouteSubmitting] = useState(false);
  const [draftRouteData, setDraftRouteData] = useState({
    recommender_ids: [''],
    approver_id: '',
    comment_text: ''
  });
  const [showReassignComposer, setShowReassignComposer] = useState(false);
  const [reassignSubmitting, setReassignSubmitting] = useState(false);
  const [reassignUserId, setReassignUserId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [previewPages, setPreviewPages] = useState([]);
  const [approvedPreviewUrl, setApprovedPreviewUrl] = useState('');
  const [pageMessage, setPageMessage] = useState(null);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [downloadPrompt, setDownloadPrompt] = useState(null);
  const [downloadEmployeeId, setDownloadEmployeeId] = useState('');
  const [downloadSubmitting, setDownloadSubmitting] = useState(false);
  const [specificAccessUsers, setSpecificAccessUsers] = useState([]);
  const [specificAccessSubmitting, setSpecificAccessSubmitting] = useState(false);
  const [specificAccessForm, setSpecificAccessForm] = useState({
    granted_user_id: '',
    access_level: 'VIEW',
    remarks: ''
  });
  const approvedPreviewObjectUrlRef = useRef('');
  const commentInputRef = useRef(null);
  const downloadEmployeeInputRef = useRef(null);
  const activeStep = note?.workflow_steps?.find((step) => step.status === 'PENDING');
  const canUserAction = Boolean(activeStep && activeStep.assigned_user_id === user?.id);
  const canUseFms = Boolean(user?.has_fms_access);
  const canManageSpecificAccess = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const canViewSensitiveFileDetails = Boolean(note?.can_view_sensitive_file_details ?? hasSensitiveFileAdminAccess(user));
  const publicDocumentReference = formatDocumentReference(
    note?.public_document_reference || note?.document_group_key || note?.document_code || note?.note_id,
    note?.branch || null
  );

  useEffect(() => {
    fetchNote();
  }, [id]);

  useEffect(() => {
    const shouldLoadDraftRouting = user?.role === 'INITIATOR'
      && Number(user?.id) === Number(note?.initiator_id)
      && note?.workflow_state === 'DRAFT';

    if (!shouldLoadDraftRouting) {
      setDraftRoutingUsers([]);
      return;
    }

    const loadDraftRoutingUsers = async () => {
      try {
        const response = await api.get('/users');
        setDraftRoutingUsers(Array.isArray(response.data) ? response.data : []);
      } catch (error) {
        console.error('Failed to load workflow routing users', error);
      }
    };

    loadDraftRoutingUsers();
  }, [note?.workflow_state, note?.initiator_id, user?.id, user?.role]);

  useEffect(() => {
    if (!note) return;
    setDraftRouteData((current) => ({
      ...current,
      comment_text: current.comment_text || note.comments?.[0]?.comment_text || ''
    }));
  }, [note]);

  useEffect(() => {
    const shouldLoadSpecificAccessUsers = canManageSpecificAccess && note?.id;
    if (!shouldLoadSpecificAccessUsers) {
      setSpecificAccessUsers([]);
      return;
    }

    const loadSpecificAccessUsers = async () => {
      try {
        const response = await api.get('/admin/users');
        setSpecificAccessUsers(Array.isArray(response.data) ? response.data.filter((entry) => Number(entry.id) !== Number(user?.id)) : []);
      } catch (error) {
        console.error('Failed to load DMS access user list', error);
      }
    };

    loadSpecificAccessUsers();
  }, [canManageSpecificAccess, note?.id, user?.id]);

  useEffect(() => {
    const candidates = note?.workflow_reassign_candidates || [];
    if (!candidates.length) {
      setReassignUserId('');
      return;
    }

    const selectionStillValid = candidates.some((candidate) => String(candidate.id) === String(reassignUserId));
    if (selectionStillValid) {
      return;
    }

    const preferredCandidate = candidates.find((candidate) => !candidate.is_current_owner) || candidates[0];
    setReassignUserId(preferredCandidate ? String(preferredCandidate.id) : '');
  }, [note?.workflow_reassign_candidates, reassignUserId]);

  useEffect(() => {
    if (!note?.can_reassign_workflow) {
      setShowReassignComposer(false);
    }
  }, [note?.can_reassign_workflow, note?.id]);

  const replaceApprovedPreviewUrl = (nextUrl = '') => {
    if (approvedPreviewObjectUrlRef.current && approvedPreviewObjectUrlRef.current !== nextUrl) {
      window.URL.revokeObjectURL(approvedPreviewObjectUrlRef.current);
    }
    approvedPreviewObjectUrlRef.current = nextUrl;
    setApprovedPreviewUrl(nextUrl);
  };

  const getAttachmentUrl = (attachment, disposition = 'inline') => {
    if (!note?.id || !attachment?.id) return '';
    return `/api/notes/${note.id}/attachments/${attachment.id}?disposition=${disposition}`;
  };

  const getApprovedArtifactUrl = (disposition = 'inline') => {
    if (!note?.id) return '';
    return `/api/notes/${note.id}/approved-file?disposition=${disposition}`;
  };

  const fetchNote = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/notes/${id}`);
      setNote(response.data);
      const shouldOpenAuditByDefault = ['ADMIN', 'AUDITOR'].includes(user?.role)
        || ['APPROVED', 'REJECTED'].includes(response.data?.workflow_state)
        || response.data?.queue_code === 'APPROVED_CLOSED_HISTORY';
      setActiveTab(shouldOpenAuditByDefault ? 'audit' : 'comments');
    } catch (error) {
      console.error('Failed to fetch file detail', error);
    } finally {
      setLoading(false);
    }
  };

  const downloadFile = async (url, fallbackName, options = {}) => {
    const separator = url.includes('?') ? '&' : '?';
    const response = await api.get(`${url}${separator}v=${Date.now()}`, {
      responseType: 'blob',
      headers: options.headers || {}
    });
    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = getDownloadName(response.headers['content-disposition'], fallbackName);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(blobUrl);
  };

  const handleDirectDownload = async (url, fallbackName) => {
    try {
      await downloadFile(url, fallbackName);
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Download failed.' });
    }
  };

  const openDownloadPrompt = async ({ url, fallbackName }) => {
    await handleDirectDownload(url, fallbackName);
  };

  const handleProtectedDownload = async () => {
    if (!downloadPrompt) return;

    const employeeId = String(downloadEmployeeId || '').trim().toUpperCase();
    if (!employeeId) {
      setPageMessage({ type: 'error', text: 'Enter your employee ID before the bank copy can be released.' });
      return;
    }

    setDownloadSubmitting(true);
    try {
      await downloadFile(downloadPrompt.url, downloadPrompt.fallbackName, {
        headers: { 'x-dms-employee-id': employeeId }
      });
      setPageMessage({ type: 'success', text: `${downloadPrompt.title} downloaded with bank watermark control.` });
      setDownloadPrompt(null);
      setDownloadEmployeeId('');
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Download failed.' });
    } finally {
      setDownloadSubmitting(false);
    }
  };

  const handleAdminDelete = async () => {
    setPendingConfirm({
      kind: 'delete',
      title: 'Delete this file version?',
      text: 'This will remove the file version, linked stored documents, and its logs.'
    });
  };

  const handleGrantSpecificAccess = async (event) => {
    event.preventDefault();
    if (!note?.id) return;

    if (!specificAccessForm.granted_user_id) {
      setPageMessage({ type: 'error', text: 'Choose the bank user who should receive this specific DMS file access.' });
      return;
    }

    setSpecificAccessSubmitting(true);
    try {
      const response = await api.post(`/notes/${note.id}/access-grants`, specificAccessForm);
      setNote((current) => current ? {
        ...current,
        note_access_grants: response.data?.grants || current.note_access_grants || []
      } : current);
      setSpecificAccessForm({
        granted_user_id: '',
        access_level: 'VIEW',
        remarks: ''
      });
      setPageMessage({ type: 'success', text: response.data?.message || 'Specific DMS access granted.' });
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Unable to grant specific DMS access.' });
    } finally {
      setSpecificAccessSubmitting(false);
    }
  };

  const handleRevokeSpecificAccess = async (grantId) => {
    if (!note?.id || !grantId) return;

    setSpecificAccessSubmitting(true);
    try {
      const response = await api.post(`/notes/${note.id}/access-grants/${grantId}/revoke`, {});
      setNote((current) => current ? {
        ...current,
        note_access_grants: response.data?.grants || []
      } : current);
      setPageMessage({ type: 'success', text: response.data?.message || 'Specific DMS access revoked.' });
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Unable to revoke specific DMS access.' });
    } finally {
      setSpecificAccessSubmitting(false);
    }
  };

  const handleClearAudit = async () => {
    setPendingConfirm({
      kind: 'clear-audit',
      title: 'Clear audit logs for this file?',
      text: 'This removes audit entries only for the current file version.'
    });
  };

  const handleConfirmAction = async () => {
    if (!pendingConfirm) return;

    try {
      if (pendingConfirm.kind === 'delete') {
        await api.delete(`/notes/${id}`);
        window.location.href = '/dashboard';
        return;
      }

      if (pendingConfirm.kind === 'clear-audit') {
        await api.delete(`/notes/${id}/audit`);
        await fetchNote();
        setPageMessage({ type: 'success', text: 'Audit logs cleared for this file.' });
      }
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Action failed.' });
    } finally {
      setPendingConfirm(null);
    }
  };

  useEffect(() => {
    if (!note) return;

    const loadPreviewPages = async () => {
      if (note.status === 'FINAL_APPROVED' && note.approved_file_path && isPdfFile(note.approved_file_path)) {
        setPreviewPages([]);
        return;
      }

      try {
        const response = await api.get(`/notes/${id}/preview-pages`);
        setPreviewPages(response.data?.pages || []);
      } catch (error) {
        console.error('Failed to fetch preview pages', error);
        setPreviewPages([]);
      }
    };

    loadPreviewPages();
  }, [id, note?.updated_at, note?.approved_file_path]);

  useEffect(() => {
    let isActive = true;

    if (!note || note.status !== 'FINAL_APPROVED' || !isPdfFile(note.approved_file_path || '')) {
      replaceApprovedPreviewUrl('');
      return undefined;
    }

    const loadApprovedPreview = async () => {
      try {
        const response = await api.get(`/notes/${note.id}/generate-pdf?disposition=inline&v=${Date.now()}`, {
          responseType: 'blob'
        });
        if (!isActive) return;
        replaceApprovedPreviewUrl(window.URL.createObjectURL(response.data));
      } catch (error) {
        if (!isActive) return;
        replaceApprovedPreviewUrl('');
        setPageMessage({ type: 'error', text: error.response?.data?.error || 'Unable to load approved PDF preview.' });
      }
    };

    loadApprovedPreview();

    return () => {
      isActive = false;
    };
  }, [note?.id, note?.status, note?.approved_file_path, note?.updated_at]);

  useEffect(() => () => {
    if (approvedPreviewObjectUrlRef.current) {
      window.URL.revokeObjectURL(approvedPreviewObjectUrlRef.current);
    }
  }, []);

  useEffect(() => {
    if (!downloadPrompt) return;
    const timer = window.setTimeout(() => {
      downloadEmployeeInputRef.current?.focus();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [downloadPrompt]);

  useEffect(() => {
    if (!downloadPrompt) return undefined;
    window.document.body.classList.add('bank-modal-lock');
    window.document.documentElement.classList.add('bank-modal-lock');
    return () => {
      window.document.body.classList.remove('bank-modal-lock');
      window.document.documentElement.classList.remove('bank-modal-lock');
    };
  }, [downloadPrompt]);

  const handleAction = async (actionType) => {
    const effectiveComment = String(commentInputRef.current?.value ?? comment ?? '').trim();

    if (!effectiveComment) {
      setPageMessage({ type: 'error', text: 'Comment is required before you can continue.' });
      return;
    }

    setSubmitting(true);
    setSubmittingActionType(actionType);
    try {
      await api.post(`/notes/${id}/action`, {
        action_type: actionType,
        comment: effectiveComment
      });
      setComment('');
      await fetchNote();
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Workflow action failed.' });
    } finally {
      setSubmitting(false);
      setSubmittingActionType('');
    }
  };

  const handleReupload = async () => {
    if (!reuploadFile) {
      setPageMessage({ type: 'error', text: 'Select a new file for the next version.' });
      return;
    }

    if (!reuploadComment.trim()) {
      setPageMessage({ type: 'error', text: 'Comment is required before creating a new version.' });
      return;
    }

    const payload = new FormData();
    payload.append('main_note', reuploadFile);
    payload.append('comment_text', reuploadComment);
    reuploadAnnexures.forEach((file) => payload.append('annexures', file));

    setSubmitting(true);
    try {
      const response = await api.post(`/notes/${id}/reupload`, payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      window.location.href = `/note/${response.data.note.id}`;
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Re-upload failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleWorkflowReassign = async () => {
    if (!reassignUserId) {
      setPageMessage({ type: 'error', text: 'Select the next workflow officer before reassigning.' });
      return;
    }

    if (!reassignReason.trim()) {
      setPageMessage({ type: 'error', text: 'Reason is required before changing workflow ownership.' });
      return;
    }

    setReassignSubmitting(true);
    try {
      await api.post(`/notes/${id}/reassign`, {
        target_user_id: reassignUserId,
        reason: reassignReason
      });
      setReassignReason('');
      setPageMessage({ type: 'success', text: 'Workflow owner changed successfully.' });
      await fetchNote();
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Workflow reassignment failed.' });
    } finally {
      setReassignSubmitting(false);
    }
  };

  const handleDraftRouteChange = (field, value) => {
    setDraftRouteData((current) => ({
      ...current,
      [field]: value
    }));
  };

  const normalizeDraftRecommenderIds = () => {
    const uniqueIds = [];
    for (const value of draftRouteData.recommender_ids || []) {
      const trimmed = String(value || '').trim();
      if (trimmed && !uniqueIds.includes(trimmed)) uniqueIds.push(trimmed);
    }
    return uniqueIds;
  };

  const handleDraftRecommenderChange = (index, value) => {
    setDraftRouteData((current) => {
      const nextIds = [...(current.recommender_ids || [''])];
      nextIds[index] = value;
      return { ...current, recommender_ids: nextIds };
    });
  };

  const addDraftRecommenderField = () => {
    setDraftRouteData((current) => ({ ...current, recommender_ids: [...(current.recommender_ids || []), ''] }));
  };

  const removeDraftRecommenderField = (index) => {
    setDraftRouteData((current) => {
      const currentIds = current.recommender_ids || [''];
      const nextIds = currentIds.filter((_, candidateIndex) => candidateIndex !== index);
      return { ...current, recommender_ids: nextIds.length ? nextIds : [''] };
    });
  };

  const handleResumeDraft = async () => {
    const recommenderIds = normalizeDraftRecommenderIds();
    if (!recommenderIds.length || !draftRouteData.approver_id) {
      setPageMessage({ type: 'error', text: 'Select at least one recommender and one approver before moving the draft forward.' });
      return;
    }

    if (!draftRouteData.comment_text.trim()) {
      setPageMessage({ type: 'error', text: 'Submission note is required before moving the draft into workflow.' });
      return;
    }

    setDraftRouteSubmitting(true);
    try {
      await api.post(`/notes/${id}/submit`, {
        recommender_id: recommenderIds[0],
        recommenders: recommenderIds,
        approver_id: draftRouteData.approver_id,
        comment_text: draftRouteData.comment_text
      });
      setPageMessage({ type: 'success', text: 'Draft moved into workflow successfully.' });
      await fetchNote();
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Unable to move this draft into workflow.' });
    } finally {
      setDraftRouteSubmitting(false);
    }
  };

  if (loading) return <div className="loading">Loading file workspace...</div>;
  if (!note) return <div className="error">File not found.</div>;

  const mainAttachment = note.main_attachment || note.attachments?.find((attachment) => ['MAIN', 'main_note'].includes(attachment.file_type));
  const supportingAttachments = note.supporting_attachments || note.attachments?.filter((attachment) => ['SUPPORTING', 'annexure'].includes(attachment.file_type)) || [];
  const previewPath = note.status === 'FINAL_APPROVED' && note.approved_file_path ? note.approved_file_path : mainAttachment?.file_path;
  const canReupload = user?.role === 'INITIATOR' && user.id === note.initiator_id && note.workflow_state === 'RETURNED_WITH_REMARK' && note.is_latest_version;
  const canDeleteVersion = ['ADMIN', 'SUPER_ADMIN'].includes(user?.role);
  const canDownloadAudit = ['ADMIN', 'AUDITOR', 'INITIATOR', 'RECOMMENDER', 'APPROVER'].includes(user?.role);
  const showReadOnlyState = !canUserAction && ['APPROVED', 'REJECTED'].includes(note.workflow_state);
  const canReassignWorkflow = Boolean(note?.can_reassign_workflow && activeStep);
  const reassignCandidates = note?.workflow_reassign_candidates || [];
  const selectedReassignCandidate = reassignCandidates.find((candidate) => String(candidate.id) === String(reassignUserId));
  const canResumeDraft = user?.role === 'INITIATOR'
    && Number(user?.id) === Number(note?.initiator_id)
    && note?.workflow_state === 'DRAFT'
    && note?.is_latest_version;
  const showDraftVisibilityNote = note?.workflow_state === 'DRAFT' && !canResumeDraft;
  const draftRecommenders = draftRoutingUsers.filter((candidate) => candidate.role?.name === 'RECOMMENDER');
  const draftApprovers = draftRoutingUsers.filter((candidate) => candidate.role?.name === 'APPROVER');

  return (
    <div className="note-workspace">
      <div className="activity-pane">
        <div className="activity-scroll">
          {pageMessage && (
            <div className={`ui-message ${pageMessage.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: '14px' }}>
              <span>{pageMessage.text}</span>
              <button type="button" className="ui-message-close" onClick={() => setPageMessage(null)}>Dismiss</button>
            </div>
          )}

          {pendingConfirm && (
            <div className="confirm-strip" style={{ marginBottom: '14px' }}>
              <div>
                <div className="confirm-strip-title">{pendingConfirm.title}</div>
                <div className="confirm-strip-text">{pendingConfirm.text}</div>
              </div>
              <div className="confirm-strip-actions">
                <button type="button" className="btn btn-outline" onClick={() => setPendingConfirm(null)}>Cancel</button>
                <button type="button" className="btn btn-danger" onClick={handleConfirmAction}>Confirm</button>
              </div>
            </div>
          )}

          <div className="note-card" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
            <div className="bank-note-header">
              <div>
                <div className="note-id" style={{ fontSize: '18px', fontWeight: 'bold' }}>{publicDocumentReference}</div>
                <div className="text-sm text-muted">Document Group: {publicDocumentReference}</div>
              </div>
              <div className="bank-note-badges">
                <span className={`badge badge-${stateBadgeMap[note.workflow_state] || 'gray'}`}>{note.workflow_state_label || note.workflow_state}</span>
                <span className={`badge badge-${queueBadgeMap[note.queue_code] || 'gray'}`}>{note.queue_label || note.queue_code}</span>
                <span className="badge badge-gray">v{note.version_number}</span>
              </div>
            </div>

            <h2 style={{ fontSize: '20px', marginBottom: '20px', color: '#1e293b' }}>{note.subject}</h2>

            <div className="info-grid">
              <span className="lbl">Main Document</span>
              <span className="val">{mainAttachment?.file_name || 'Not available'}</span>
              <span className="lbl">Type</span>
              <span className="val">{note.note_type}</span>
              <span className="lbl">Classification</span>
              <span className="val">{note.classification}</span>
              <span className="lbl">Department</span>
              <span className="val">{note.department?.name}</span>
              <span className="lbl">Vertical</span>
              <span className="val">{note.vertical?.name}</span>
              <span className="lbl">Uploader</span>
              <span className="val">{note.initiator?.name}</span>
              <span className="lbl">Current Owner</span>
              <span className="val">{note.current_owner?.name || '-'}</span>
              <span className="lbl">Next Responsible</span>
              <span className="val">{note.next_responsible?.name || '-'}</span>
              <span className="lbl">Current Queue</span>
              <span className="val">{note.queue_label || note.queue_code}</span>
              <span className="lbl">Published To FMS</span>
              <span className="val">{note.fms_publications?.length ? `${note.fms_publications.length} publication(s)` : 'Not published'}</span>
              <span className="lbl">Supporting Files</span>
              <span className="val">{supportingAttachments.length}</span>
              <span className="lbl">Current Active Approved</span>
              <span className="val">{note.current_active_approved ? `${formatDocumentReference(note.current_active_approved.public_document_reference || note.current_active_approved.document_group_key || note.current_active_approved.document_code || note.current_active_approved.note_id, note.current_active_approved.branch || null)} | v${note.current_active_approved.version_number}` : 'None yet'}</span>
            </div>
          </div>

          <div className="section" style={{ marginTop: '30px' }}>
            <h3 className="form-section-title">Workflow Progress</h3>
            <div className="steps-bar">
              {(note.workflow_steps || []).map((step) => (
                <div key={step.id} className={`step-item ${step.status === 'COMPLETED' ? 'done' : step.status === 'PENDING' ? 'active' : ''}`}>
                  <span className="step-num">Step {step.sequence}</span>
                  {step.role_type}
                  <div style={{ fontSize: '10px', opacity: 0.85 }}>{step.assigned_user?.name}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="section" style={{ marginTop: '24px' }}>
            <h3 className="form-section-title">Version History</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              {(note.version_history || []).map((version) => (
                <div key={version.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', background: version.id === note.id ? '#eff6ff' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{formatDocumentReference(version.public_document_reference || version.document_group_key || version.document_code || version.note_id, version.branch || null)} | v{version.version_number}</div>
                      <div className="text-sm text-muted">{formatWorkflowDateTime(version.created_at)}</div>
                    </div>
                    <span className={`badge badge-${stateBadgeMap[version.workflow_state] || 'gray'}`}>{version.workflow_state_label || version.workflow_state}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {showDraftVisibilityNote && (
            <div className="action-footer draft-readonly-panel">
              <div className="form-section-title">Draft Status</div>
              <div className="draft-status-strip">
                <div>
                  <div className="draft-status-title">This file is still in maker draft.</div>
                  <div className="draft-status-text">
                    Only {note.initiator?.name || 'the uploader'} can start workflow from this version. Other users can review the draft details, but it will stay in the private workbench until the maker submits it.
                  </div>
                </div>
                <span className="draft-status-pill">{note.queue_label || 'Drafts'}</span>
              </div>
            </div>
          )}

          {canResumeDraft && (
            <div className="action-footer draft-resume-panel">
              <div className="form-section-title">Start Workflow</div>
              <div className="draft-status-strip" style={{ marginBottom: '14px' }}>
                <div>
                  <div className="draft-status-title">This file is still in your private workbench.</div>
                  <div className="draft-status-text">Choose the recommender and final approver here to move it into the live workflow queue.</div>
                </div>
                <span className="draft-status-pill">{note.queue_label || 'Drafts'}</span>
              </div>
              <div className="draft-resume-grid">
                <div className="workflow-reassign-field">
                  <label className="field-label workflow-reassign-label" htmlFor="draft-recommender-0">Recommender<RequiredMark /></label>
                  <div className="workflow-multi-assignee-stack">
                    {(draftRouteData.recommender_ids || ['']).map((recommenderId, index) => (
                      <div
                        key={`draft-recommender-${index}`}
                        className={`workflow-multi-assignee-row ${(draftRouteData.recommender_ids || []).length > 1 ? 'with-remove' : ''}`}
                      >
                        <UserSearchSelect
                          id={`draft-recommender-${index}`}
                          value={recommenderId}
                          onChange={(nextValue) => handleDraftRecommenderChange(index, nextValue)}
                          options={draftRecommenders}
                          placeholder={`Search recommender ${index + 1} by name or employee ID`}
                          disabled={draftRouteSubmitting}
                        />
                        {(draftRouteData.recommender_ids || []).length > 1 ? (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => removeDraftRecommenderField(index)} disabled={draftRouteSubmitting}>
                            Remove
                          </button>
                        ) : null}
                      </div>
                    ))}
                    <button type="button" className="btn btn-outline btn-sm workflow-add-assignee-btn" onClick={addDraftRecommenderField} disabled={draftRouteSubmitting}>
                      + Add Recommender
                    </button>
                  </div>
                </div>
                <div className="workflow-reassign-field">
                  <label className="field-label workflow-reassign-label" htmlFor="draft-approver">Final Approver<RequiredMark /></label>
                  <UserSearchSelect
                    id="draft-approver"
                    value={draftRouteData.approver_id}
                    onChange={(nextValue) => handleDraftRouteChange('approver_id', nextValue)}
                    options={draftApprovers}
                    placeholder="Search final approver by name or employee ID"
                    disabled={draftRouteSubmitting}
                  />
                </div>
              </div>
              <div className="workflow-reassign-field" style={{ marginTop: '14px' }}>
                <label className="field-label workflow-reassign-label" htmlFor="draft-submit-note">Submission Note<RequiredMark /></label>
                <textarea
                  id="draft-submit-note"
                  value={draftRouteData.comment_text}
                  onChange={(event) => handleDraftRouteChange('comment_text', event.target.value)}
                  placeholder="Add the note that should move with this file into workflow."
                  className="workflow-reassign-textarea"
                  disabled={draftRouteSubmitting}
                />
              </div>
              <div className="workflow-reassign-actions">
                <div className="workflow-reassign-note">
                  Once submitted, this draft leaves your private workbench and enters the live queue for the first recommender in the selected chain.
                </div>
                <button
                  type="button"
                  className={`btn btn-primary ${draftRouteSubmitting ? 'btn-loading' : ''}`}
                  onClick={handleResumeDraft}
                  disabled={draftRouteSubmitting}
                  aria-busy={draftRouteSubmitting}
                >
                  {draftRouteSubmitting ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Starting Workflow...
                    </>
                  ) : 'Start Workflow'}
                </button>
              </div>
            </div>
          )}

          {canReassignWorkflow && (
            <div className="action-footer workflow-reassign-panel">
              <div className="workflow-reassign-header">
                <div>
                  <div className="form-section-title" style={{ marginBottom: '4px' }}>Workflow Owner</div>
                  <div className="workflow-reassign-header-text">
                    {activeStep?.assigned_user?.name || note?.current_owner?.name || '-'}
                    {(activeStep?.assigned_user?.branch?.branch_name || note?.branch?.branch_name) ? ` - ${activeStep?.assigned_user?.branch?.branch_name || note?.branch?.branch_name}` : ''}
                  </div>
                </div>
                <div className="workflow-reassign-header-actions">
                  <span className="workflow-reassign-stage-pill">{activeStep?.role_type || '-'}</span>
                  {!showReassignComposer && (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => setShowReassignComposer(true)}
                    >
                      Reassign Owner
                    </button>
                  )}
                </div>
              </div>

              {showReassignComposer && (
                <div className="workflow-reassign-form">
                  <div className="workflow-reassign-field">
                    <label className="field-label workflow-reassign-label" htmlFor="workflow-reassign-user">Assign To<RequiredMark /></label>
                    <select
                      id="workflow-reassign-user"
                      value={reassignUserId}
                      onChange={(event) => setReassignUserId(event.target.value)}
                      className="workflow-reassign-select"
                      disabled={reassignSubmitting}
                    >
                      <option value="">Select workflow user</option>
                      {reassignCandidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id} disabled={candidate.is_current_owner}>
                          {candidate.name} - {candidate.branch_name}{candidate.branch_code ? ` (${candidate.branch_code})` : ''}{candidate.is_current_owner ? ' - current owner' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="workflow-reassign-field">
                    <label className="field-label workflow-reassign-label" htmlFor="workflow-reassign-reason">Reason<RequiredMark /></label>
                    <textarea
                      id="workflow-reassign-reason"
                      value={reassignReason}
                      onChange={(event) => setReassignReason(event.target.value)}
                      placeholder="Explain why this file must move to another workflow officer."
                      className="workflow-reassign-textarea"
                      disabled={reassignSubmitting}
                    />
                  </div>
                  <div className="workflow-reassign-actions">
                    <div className="workflow-reassign-note">
                      Queue and stage remain unchanged. Only the active owner moves, and the change is captured in audit and movement history.
                    </div>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => {
                          setShowReassignComposer(false);
                          setReassignReason('');
                        }}
                        disabled={reassignSubmitting}
                      >
                        Keep Current Owner
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={handleWorkflowReassign}
                        disabled={reassignSubmitting || !reassignUserId}
                      >
                        {reassignSubmitting ? 'Reassigning...' : 'Confirm Reassignment'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="tabs" style={{ marginTop: '30px' }}>
            <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #e2e8f0', marginBottom: '15px' }}>
              <button type="button" onClick={() => setActiveTab('comments')} className={`tab-btn ${activeTab === 'comments' ? 'active' : ''}`}>Comments</button>
              <button type="button" onClick={() => setActiveTab('audit')} className={`tab-btn ${activeTab === 'audit' ? 'active' : ''}`}>Audit</button>
              <button type="button" onClick={() => setActiveTab('attachments')} className={`tab-btn ${activeTab === 'attachments' ? 'active' : ''}`}>Attachments</button>
            </div>

            {activeTab === 'comments' && (
              <div className="comment-list">
                {(note.comments || []).length === 0 ? (
                  <div className="text-muted">No comments available.</div>
                ) : (
                  note.comments.map((entry) => (
                    <div key={entry.id} className="comment-entry">
                      <div className="comment-meta">{entry.user?.name} ({entry.user?.role?.name}) • {formatWorkflowDateTime(entry.created_at)}</div>
                      <div className="comment-text">{entry.comment_text}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="audit-list">
                <div className="audit-tools">
                  <div>
                    <div className="audit-title">File Audit Trail</div>
                    <div className="text-sm text-muted">Read-only history for this document version.</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {canDownloadAudit && (
                      <>
                        <button className="btn btn-outline btn-sm" onClick={() => handleDirectDownload(`/notes/${note.id}/audit/export/excel`, `${note.note_id}-audit-report.xls`)}>
                          Download Excel
                        </button>
                        <button className="btn btn-outline btn-sm" onClick={() => handleDirectDownload(`/notes/${note.id}/audit/export/pdf`, `${note.note_id}-audit-report.pdf`)}>
                          Download PDF
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <div className="form-section-title">Movement History</div>
                  {(note.note_movements || []).length === 0 ? (
                    <div className="text-muted">No movement history available.</div>
                  ) : (
                    note.note_movements.map((movement) => (
                      <div key={movement.id} className="audit-entry">
                        <div className="audit-time">{formatWorkflowDateTime(movement.created_at)}</div>
                        <div className="audit-action">
                          <strong>{formatAuditActionLabel(movement.action_type)}</strong> by {movement.acted_by?.name || 'Unknown User'}
                        </div>
                        <div className="text-sm text-muted">
                          {movement.from_state ? formatWorkflowStateLabel(movement.from_state) : 'Start'} → {formatWorkflowStateLabel(movement.to_state)}
                          {movement.to_user?.name ? ` • Next owner: ${movement.to_user.name}` : ''}
                        </div>
                        {movement.remark_text && <div className="audit-comment">{movement.remark_text}</div>}
                      </div>
                    ))
                  )}
                </div>
                {(note.audit_logs || []).length === 0 ? (
                  <div className="text-muted">No audit logs available.</div>
                ) : (
                  note.audit_logs.map((log) => (
                    <div key={log.id} className="audit-entry">
                      <div className="audit-time">{formatWorkflowDateTime(log.timestamp)}</div>
                      <div className="audit-action"><strong>{formatAuditActionLabel(log.action)}</strong> by {log.performed_by} ({log.role})</div>
                      {log.remarks && <div className="audit-comment">{log.remarks}</div>}
                    </div>
                  ))
                )}
                {canManageSpecificAccess && (
                  <div style={{ marginTop: '24px' }}>
                    <div className="audit-tools" style={{ marginBottom: '14px' }}>
                      <div>
                        <div className="audit-title">Specific DMS Access Control</div>
                        <div className="text-sm text-muted">Grant one controlled file release without opening workflow rights.</div>
                      </div>
                    </div>

                    <form onSubmit={handleGrantSpecificAccess} className="share-elevated" style={{ marginBottom: '16px' }}>
                      <div className="share-grid">
                        <div>
                          <label>Bank User<RequiredMark /></label>
                          <UserSearchSelect
                            id="specific-dms-access-user"
                            value={specificAccessForm.granted_user_id}
                            onChange={(value) => setSpecificAccessForm((current) => ({ ...current, granted_user_id: value }))}
                            options={specificAccessUsers}
                            placeholder="Search officer by name or employee ID"
                            disabled={specificAccessSubmitting}
                          />
                        </div>
                        <div>
                          <label>Access Level<RequiredMark /></label>
                          <select
                            value={specificAccessForm.access_level}
                            disabled={specificAccessSubmitting}
                            onChange={(event) => setSpecificAccessForm((current) => ({ ...current, access_level: event.target.value }))}
                          >
                            <option value="VIEW">View only</option>
                            <option value="DOWNLOAD">View + download</option>
                          </select>
                        </div>
                      </div>
                      <div style={{ marginTop: '12px' }}>
                        <label>Release Note</label>
                        <textarea
                          value={specificAccessForm.remarks}
                          disabled={specificAccessSubmitting}
                          placeholder="Optional: why this one DMS file is being released to this officer"
                          onChange={(event) => setSpecificAccessForm((current) => ({ ...current, remarks: event.target.value }))}
                        />
                      </div>
                      <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="btn btn-primary" disabled={specificAccessSubmitting}>
                          {specificAccessSubmitting ? 'Releasing Access...' : 'Grant Specific File Access'}
                        </button>
                      </div>
                    </form>

                    {(note.note_access_grants || []).length === 0 ? (
                      <div className="text-muted">No direct DMS file grant is active on this version.</div>
                    ) : (
                      (note.note_access_grants || []).map((grant) => (
                        <div key={grant.id} className="audit-entry">
                          <div className="audit-time">{formatWorkflowDateTime(grant.created_at)}</div>
                          <div className="audit-action">
                            <strong>{grant.access_level === 'DOWNLOAD' ? 'View + Download' : 'View Only'}</strong> released to {grant.granted_user?.name || 'Bank user'}
                          </div>
                          <div className="text-sm text-muted">
                            Employee ID: {grant.granted_user?.employee_id || '-'}
                            {grant.granted_user?.branch?.branch_name ? ` • ${grant.granted_user.branch.branch_name}` : ''}
                            {grant.granted_by?.name ? ` • Granted by ${grant.granted_by.name}` : ''}
                          </div>
                          {grant.remarks ? <div className="audit-comment">{grant.remarks}</div> : null}
                          <div style={{ marginTop: '10px' }}>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={specificAccessSubmitting}
                              onClick={() => handleRevokeSpecificAccess(grant.id)}
                            >
                              Revoke Access
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'attachments' && (
              <div className="attachment-list">
                <div style={{ marginBottom: '16px' }}>
                  <div className="text-sm text-muted" style={{ marginBottom: '8px', fontWeight: 700 }}>Main Document</div>
                  {mainAttachment ? (
                    <div className="note-attachment-row note-attachment-row-main">
                      <span>{mainAttachment.file_name} <small>(MAIN)</small></span>
                      <div className="attachment-actions">
                        <button
                          type="button"
                          className="attachment-action-btn"
                          onClick={() => openDownloadPrompt({
                            url: `/notes/${note.id}/attachments/${mainAttachment.id}?disposition=attachment`,
                            fallbackName: mainAttachment.file_name,
                            title: 'Main document'
                          })}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ) : <div className="text-muted">No main document found.</div>}
                </div>
                <div>
                  <div className="text-sm text-muted" style={{ marginBottom: '8px', fontWeight: 700 }}>Supporting Documents</div>
                  {supportingAttachments.length === 0 ? (
                    <div className="text-muted">No supporting documents attached to this version.</div>
                  ) : supportingAttachments.map((attachment) => (
                    <div key={attachment.id} className="note-attachment-row">
                      <span>{attachment.file_name} <small>(SUPPORTING)</small></span>
                      <div className="attachment-actions">
                        <button
                          type="button"
                          className="attachment-action-btn"
                          onClick={() => openDownloadPrompt({
                            url: `/notes/${note.id}/attachments/${attachment.id}?disposition=attachment`,
                            fallbackName: attachment.file_name,
                            title: 'Supporting document'
                          })}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        {canUserAction && (
          <div className="action-footer">
            <textarea
              ref={commentInputRef}
              className="note-action-textarea"
              placeholder={activeStep.role_type === 'RECOMMENDER' ? 'Required: recommendation or return note' : 'Required: approval, return, or rejection note'}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />

            <div className="note-action-row">
              <div className="text-sm text-muted">Comments are mandatory for every action.</div>
              <div className="note-action-buttons">
                {activeStep.role_type === 'RECOMMENDER' && (
                  <>
                    <button
                      type="button"
                      className={`btn btn-danger ${submitting && submittingActionType === 'RETURN' ? 'btn-loading' : ''}`}
                      onClick={() => handleAction('RETURN')}
                      disabled={submitting}
                      aria-busy={submitting && submittingActionType === 'RETURN'}
                    >
                      {submitting && submittingActionType === 'RETURN' ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          {getWorkflowActionBusyLabel('RETURN')}
                        </>
                      ) : 'Return'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-primary ${submitting && submittingActionType === 'RECOMMEND' ? 'btn-loading' : ''}`}
                      onClick={() => handleAction('RECOMMEND')}
                      disabled={submitting}
                      aria-busy={submitting && submittingActionType === 'RECOMMEND'}
                    >
                      {submitting && submittingActionType === 'RECOMMEND' ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          {getWorkflowActionBusyLabel('RECOMMEND')}
                        </>
                      ) : 'Recommend'}
                    </button>
                  </>
                )}
                {activeStep.role_type === 'APPROVER' && (
                  <>
                    <button
                      type="button"
                      className={`btn btn-outline ${submitting && submittingActionType === 'RETURN' ? 'btn-loading' : ''}`}
                      onClick={() => handleAction('RETURN')}
                      disabled={submitting}
                      aria-busy={submitting && submittingActionType === 'RETURN'}
                    >
                      {submitting && submittingActionType === 'RETURN' ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          {getWorkflowActionBusyLabel('RETURN')}
                        </>
                      ) : 'Return'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-danger ${submitting && submittingActionType === 'REJECT' ? 'btn-loading' : ''}`}
                      onClick={() => handleAction('REJECT')}
                      disabled={submitting}
                      aria-busy={submitting && submittingActionType === 'REJECT'}
                    >
                      {submitting && submittingActionType === 'REJECT' ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          {getWorkflowActionBusyLabel('REJECT')}
                        </>
                      ) : 'Reject'}
                    </button>
                    <button
                      type="button"
                      className={`btn btn-success ${submitting && submittingActionType === 'APPROVE' ? 'btn-loading' : ''}`}
                      onClick={() => handleAction('APPROVE')}
                      disabled={submitting}
                      aria-busy={submitting && submittingActionType === 'APPROVE'}
                    >
                      {submitting && submittingActionType === 'APPROVE' ? (
                        <>
                          <span className="btn-spinner" aria-hidden="true" />
                          {getWorkflowActionBusyLabel('APPROVE')}
                        </>
                      ) : 'Approve'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {showReadOnlyState && (
          <div className="action-footer" style={{ borderTop: '1px solid #e2e8f0', background: '#f8fafc' }}>
            <div className="form-section-title" style={{ marginBottom: '8px' }}>
              Workflow Completed
            </div>
            <div className="text-sm text-muted" style={{ lineHeight: 1.6 }}>
              {note.workflow_state === 'APPROVED' && 'This file is approved and has moved into approved / closed history.'}
              {note.workflow_state === 'REJECTED' && 'This file is finally rejected and has moved into completed history. The full rejection trail remains available in the audit tab.'}
            </div>
          </div>
        )}

        {canReupload && (
          <div className="action-footer" style={{ borderTop: '1px solid #e2e8f0' }}>
            <div className="form-section-title">Upload New Version</div>
            <input className="mobile-file-input" type="file" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff" onChange={(event) => setReuploadFile(event.target.files?.[0] || null)} />
            <div className="text-sm text-muted" style={{ marginTop: '10px' }}>
              Existing supporting documents stay attached to the next version. Add more supporting files below only when needed.
            </div>
            <input
              className="mobile-file-input"
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff"
              onChange={(event) => setReuploadAnnexures(Array.from(event.target.files || []))}
              style={{ marginTop: '12px' }}
            />
            {reuploadAnnexures.length > 0 && (
              <div className="text-sm text-muted" style={{ marginTop: '8px' }}>
                {reuploadAnnexures.length} new supporting document{reuploadAnnexures.length === 1 ? '' : 's'} selected for this version.
              </div>
            )}
            <textarea
              className="note-action-textarea"
              placeholder="Required: reason for new version"
              value={reuploadComment}
              onChange={(event) => setReuploadComment(event.target.value)}
              style={{ marginTop: '12px', marginBottom: '12px' }}
            />
            <button className="btn btn-primary" onClick={handleReupload} disabled={submitting}>Create Next Version</button>
          </div>
        )}

        {note.status === 'FINAL_APPROVED' && (
          <div className="action-footer" style={{ borderTop: '1px solid #e2e8f0' }}>
            <div className="form-section-title">FMS Custody</div>
            <div className="text-sm text-muted" style={{ marginBottom: '12px' }}>
              This approved file is automatically archived in FMS backup custody after workflow completion. DMS remains the working record and FMS keeps the controlled retrieval copy.
            </div>
            <div className="text-sm text-muted" style={{ marginBottom: '12px' }}>
              Bank admin or HO admin can later release it into the searchable FMS register and grant branch or user access with view-only or download rights.
            </div>
            <div className="info-grid" style={{ marginTop: '14px' }}>
              <span className="lbl">Custody Status</span>
              <span className="val">{note.fms_publications?.length ? 'Archived in FMS backup custody' : 'Awaiting FMS archive sync'}</span>
              <span className="lbl">Visibility</span>
              <span className="val">{note.fms_publications?.some((item) => item.status === 'ACTIVE') ? 'Visible in register' : 'Hidden until admin release'}</span>
              <span className="lbl">Release Control</span>
              <span className="val">Bank admin / HO admin / super admin</span>
              <span className="lbl">Access Control</span>
              <span className="val">Granted later to user or branch with restrictions</span>
            </div>
            {canUseFms && (
              <div className="action-row" style={{ marginTop: '14px' }}>
                <a className="btn btn-outline" href="/fms/register">Open FMS Register</a>
              </div>
            )}
            {!note.fms_publications?.length && (
              <div className="text-sm text-muted" style={{ marginTop: '12px', color: '#92400e' }}>
                If the archive does not appear yet, refresh once. The approved artifact and the backup-custody copy are synchronized right after approval.
              </div>
            )}
          </div>
        )}
        </div>
      </div>

      <div className="doc-viewer-pane">
        <div className="pdf-controls doc-viewer-toolbar">
          <span>{note.status === 'FINAL_APPROVED' && note.approved_file_path ? 'Approved Artifact' : (mainAttachment?.file_name || 'Main File')}</span>
          <div className="doc-viewer-toolbar-actions">
            {canDeleteVersion && (
              <>
                <button className="btn btn-danger btn-sm" onClick={handleAdminDelete}>
                  Delete File
                </button>
              </>
            )}
            {note.status === 'FINAL_APPROVED' && isPdfFile(previewPath) && (
              <button
                className="btn btn-success btn-sm"
                onClick={() => openDownloadPrompt({
                  url: `/notes/${note.id}/generate-pdf`,
                  fallbackName: `${note.note_id}-approved.pdf`,
                  title: 'Approved PDF'
                })}
              >
                Download Approved PDF
              </button>
            )}
            {note.status === 'FINAL_APPROVED' && note.approved_file_path && isImageFile(note.approved_file_path) && (
              <>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => openDownloadPrompt({
                    url: `/notes/${note.id}/approved-file?disposition=attachment`,
                    fallbackName: note.approved_file_name || `${note.note_id}-approved`,
                    title: 'Approved image'
                  })}
                >
                  Download Approved Image
                </button>
              </>
            )}
          </div>
        </div>

        <div className="doc-viewer-scroll">
          {previewPages.length > 0 ? (
            <div style={{ display: 'grid', gap: '18px' }}>
              {previewPages.map((page) => (
                <div
                  key={page.page_number}
                  style={{
                    position: 'relative',
                    background: '#fff',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.12)'
                  }}
                >
                  <img
                    src={page.image_url}
                    alt={`Preview page ${page.page_number}`}
                    style={{ width: '100%', display: 'block', userSelect: 'none' }}
                    draggable={false}
                  />
                </div>
              ))}
            </div>
          ) : approvedPreviewUrl ? (
            <iframe
              title="Approved PDF"
              src={`${approvedPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
              style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none', background: 'white', borderRadius: '8px' }}
            />
          ) : note.status === 'FINAL_APPROVED' && isPdfFile(previewPath || '') ? (
            <div className="mock-pdf" style={{ maxWidth: '800px', margin: '0 auto', background: 'white', padding: '40px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', position: 'relative', textAlign: 'center' }}>
              <div className="text-muted">Loading approved PDF preview...</div>
            </div>
          ) : previewPath && isImageFile(previewPath) ? (
            <div style={{ width: '100%', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={note.status === 'FINAL_APPROVED' ? getApprovedArtifactUrl() : getAttachmentUrl(mainAttachment)} alt="Document preview" style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: '8px', background: 'white' }} />
            </div>
          ) : previewPath && isPdfFile(previewPath) ? (
            <iframe
              title="Main File PDF"
              src={`${getAttachmentUrl(mainAttachment)}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              style={{ width: '100%', height: '100%', minHeight: '70vh', border: 'none', background: 'white', borderRadius: '8px' }}
            />
          ) : (
            <div className="mock-pdf" style={{ maxWidth: '800px', margin: '0 auto', background: 'white', padding: '40px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', position: 'relative', textAlign: 'center' }}>
              <div className="text-muted">No inline preview available for this file type.</div>
            </div>
          )}
        </div>
      </div>

      {downloadPrompt && (
        <div className="bank-download-modal-backdrop" role="presentation" onClick={() => !downloadSubmitting && setDownloadPrompt(null)}>
          <div className="bank-download-modal" role="dialog" aria-modal="true" aria-labelledby="bank-download-title" onClick={(event) => event.stopPropagation()}>
            <div className="bank-download-kicker">Controlled Download Release</div>
            <h3 id="bank-download-title">{downloadPrompt.title}</h3>
            <p>
              {isDemoDownloadMode
                ? 'For demo testing, use employee ID 123456. In production, the download will validate against the real employee ID mapped to the signed-in bank user.'
                : 'Enter the bank employee ID mapped to your signed-in profile. The downloaded copy will be released only after bank validation and will carry your employee watermark.'}
            </p>
            <label className="bank-download-label" htmlFor="bank-download-employee-id">Employee ID</label>
            <input
              id="bank-download-employee-id"
              ref={downloadEmployeeInputRef}
              type="text"
              className="bank-download-input"
              value={downloadEmployeeId}
              onChange={(event) => setDownloadEmployeeId(event.target.value.toUpperCase())}
              placeholder={isDemoDownloadMode ? DEMO_DOWNLOAD_EMPLOYEE_ID : 'Enter bank employee ID'}
              disabled={downloadSubmitting}
            />
            <div className="bank-download-hint">
              {isDemoDownloadMode
                ? 'Demo mode: every bank user can test downloads with 123456. Production mode will switch back to each user\'s real employee ID.'
                : 'Bank users only. Every released copy is stamped and added to the audit trail with employee ID, user, date, and time.'}
            </div>
            <div className="bank-download-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDownloadPrompt(null)} disabled={downloadSubmitting}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleProtectedDownload} disabled={downloadSubmitting}>
                {downloadSubmitting ? 'Validating...' : 'Validate & Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .note-workspace {
          display: grid;
          grid-template-columns: minmax(380px, 0.92fr) minmax(460px, 1.08fr);
          min-height: calc(100vh - 86px);
          border-radius: 24px;
          overflow: hidden;
          border: 1px solid #d8e2ef;
          background:
            radial-gradient(circle at top left, rgba(196, 211, 232, 0.22) 0%, transparent 24%),
            linear-gradient(180deg, #f9fbfe 0%, #f1f5fb 100%);
          box-shadow: 0 22px 44px rgba(15, 23, 42, 0.08);
        }
        .activity-pane {
          display: flex;
          min-width: 0;
          background:
            linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,251,255,0.98) 100%);
          border-right: 1px solid #d9e3f0;
        }
        .doc-viewer-pane {
          display: flex;
          flex-direction: column;
          min-width: 0;
          background:
            linear-gradient(180deg, #dce6f2 0%, #ccd8e8 100%);
        }
        .activity-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .note-card,
        .section,
        .action-footer {
          border: 1px solid #dde6f1;
          border-radius: 18px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }
        .note-card {
          padding: 20px;
        }
        .section,
        .action-footer {
          padding: 18px 20px;
        }
        .bank-note-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 16px;
        }
        .bank-note-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .info-grid {
          display: grid;
          grid-template-columns: minmax(140px, 160px) minmax(0, 1fr);
          gap: 12px 18px;
          padding: 18px;
          border-radius: 16px;
          background: linear-gradient(180deg, #f8fbff 0%, #f2f7fd 100%);
          border: 1px solid #d8e3f0;
        }
        .info-grid .lbl {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #60748e;
        }
        .info-grid .val {
          color: #20324c;
          font-size: 14px;
          font-weight: 600;
          line-height: 1.55;
        }
        .form-section-title {
          margin: 0 0 14px;
          color: #16355b;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .steps-bar {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 12px;
        }
        .step-item {
          display: grid;
          gap: 6px;
          padding: 14px 15px;
          border-radius: 14px;
          border: 1px solid #dbe4f0;
          background: linear-gradient(180deg, #f8fbff 0%, #f3f7fd 100%);
          color: #5b6f88;
          font-size: 13px;
          font-weight: 700;
        }
        .step-item.done {
          border-color: #cfe7d5;
          background: linear-gradient(180deg, #f2fbf4 0%, #ebf8ef 100%);
          color: #1f6a3a;
        }
        .step-item.active {
          border-color: #b7cdea;
          background: linear-gradient(180deg, #eef5ff 0%, #e6f0ff 100%);
          color: #17447d;
          box-shadow: 0 10px 22px rgba(23, 68, 125, 0.08);
        }
        .step-num {
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: inherit;
          opacity: 0.78;
        }
        .tabs {
          border: 1px solid #dde6f1;
          border-radius: 18px;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
          padding: 18px 20px;
          box-shadow: 0 12px 30px rgba(15, 23, 42, 0.05);
        }
        .comment-entry,
        .audit-entry {
          padding: 14px 16px;
          border-radius: 14px;
          border: 1px solid #dfe7f1;
          background: #f9fbfe;
          margin-bottom: 12px;
        }
        .comment-meta,
        .audit-time {
          color: #657890;
          font-size: 12px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        .comment-text,
        .audit-action {
          color: #20324c;
          font-size: 14px;
          line-height: 1.6;
        }
        .ui-message {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid #d9e2ef;
          background: #f8fbff;
          color: #23446f;
        }
        .ui-message.error {
          background: #fff5f5;
          border-color: #f1c7c7;
          color: #9b1c1c;
        }
        .ui-message.success {
          background: #f2fbf5;
          border-color: #c7e7d0;
          color: #19633a;
        }
        .ui-message-close {
          border: none;
          background: transparent;
          color: inherit;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .confirm-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 14px 16px;
          border: 1px solid #f0d4bf;
          border-radius: 12px;
          background: #fff8f2;
        }
        .confirm-strip-title {
          font-size: 13px;
          font-weight: 700;
          color: #7c3b12;
          margin-bottom: 4px;
        }
        .confirm-strip-text {
          font-size: 12px;
          color: #8a5b3b;
        }
        .confirm-strip-actions {
          display: flex;
          gap: 10px;
          flex-shrink: 0;
        }
        .note-attachment-row {
          padding: 14px 16px;
          background: linear-gradient(180deg, #f8fbff 0%, #f2f7fd 100%);
          border-radius: 14px;
          margin-bottom: 12px;
          display: flex;
          justify-content: space-between;
          gap: 10px;
          border: 1px solid #d9e3ef;
          align-items: center;
        }
        .note-attachment-row-main {
          background: linear-gradient(180deg, #edf4ff 0%, #e7f0ff 100%);
          border: 1px solid #bfd2ee;
        }
        .attachment-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .attachment-actions a,
        .attachment-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 34px;
          padding: 0 14px;
          border-radius: 999px;
          border: 1px solid #cdd8e6;
          background: #ffffff;
          color: #234873;
          font-size: 12px;
          font-weight: 700;
          text-decoration: none;
          cursor: pointer;
          transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease, transform 160ms ease;
        }
        .attachment-actions a:hover,
        .attachment-actions a:focus,
        .attachment-action-btn:hover,
        .attachment-action-btn:focus {
          border-color: #9eb8da;
          background: #f4f8ff;
          color: #173d79;
          transform: translateY(-1px);
          outline: none;
        }
        .note-action-textarea {
          width: 100%;
          min-height: 88px;
          padding: 14px 15px;
          border: 1px solid #d6e0ec;
          border-radius: 12px;
          margin-bottom: 12px;
          resize: vertical;
          background: #ffffff;
          color: #20324c;
        }
        .note-action-row {
          display: flex;
          gap: 10px;
          justify-content: space-between;
          align-items: center;
        }
        .note-action-buttons {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .tab-btn {
          padding: 0 0 12px;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          color: #64748b;
          cursor: pointer;
          font-weight: 600;
          transition: color 160ms ease, transform 160ms ease, border-color 160ms ease;
        }
        .tab-btn:hover {
          color: #1a4fa0;
          transform: translateY(-1px);
        }
        .tab-btn.active {
          color: #1a4fa0;
          border-bottom-color: #1a4fa0;
        }
        .audit-tools {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 12px;
          padding: 12px 14px;
          margin-bottom: 12px;
          border: 1px solid #dbeafe;
          border-radius: 12px;
          background: linear-gradient(135deg, #f8fbff, #eef6ff);
        }
        .audit-title {
          font-size: 13px;
          font-weight: 700;
          color: #0f3270;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .doc-viewer-toolbar {
          background:
            linear-gradient(135deg, #1d2b3f 0%, #22344c 45%, #1c2b42 100%);
          padding: 14px 20px;
          color: white;
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          border-bottom: 1px solid rgba(201, 214, 229, 0.24);
        }
        .doc-viewer-toolbar-actions {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .doc-viewer-scroll {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
        }
        .audit-comment {
          background: #f8fafc;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          color: #475569;
          margin-top: 5px;
          border-left: 2px solid #cbd5e1;
        }
        .workflow-reassign-panel {
          border-top: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .workflow-reassign-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 14px;
          margin-bottom: 8px;
        }
        .workflow-reassign-header-text {
          font-size: 15px;
          font-weight: 600;
          color: #223e64;
          line-height: 1.4;
        }
        .workflow-reassign-header-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .draft-readonly-panel,
        .draft-resume-panel {
          border-top: 1px solid #e2e8f0;
          background: #fbfdff;
        }
        .draft-status-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 12px 14px;
          border: 1px solid #dbe6f2;
          border-radius: 12px;
          background: #ffffff;
        }
        .draft-status-title {
          font-size: 13px;
          font-weight: 700;
          color: #1d3f70;
          margin-bottom: 4px;
        }
        .draft-status-text {
          font-size: 12px;
          color: #6b7f98;
          line-height: 1.55;
        }
        .draft-status-pill {
          padding: 6px 10px;
          border-radius: 999px;
          background: #eef4fb;
          color: #35557f;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .draft-resume-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          align-items: start;
        }
        .workflow-reassign-stage-pill {
          display: inline-flex;
          align-items: center;
          width: fit-content;
          padding: 5px 10px;
          border-radius: 999px;
          background: #edf3fa;
          color: #284b78;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .workflow-reassign-form {
          display: grid;
          gap: 14px;
        }
        .workflow-reassign-field {
          display: grid;
          gap: 8px;
          min-width: 0;
        }
        .draft-resume-grid > .workflow-reassign-field {
          align-self: start;
        }
        .draft-resume-grid .user-search-select {
          width: 100%;
          min-width: 0;
          align-content: start;
        }
        .draft-resume-grid .user-search-field,
        .draft-resume-grid .user-search-input {
          width: 100%;
        }
        .draft-resume-grid .user-search-input,
        .workflow-reassign-select {
          min-height: 48px;
        }
        .draft-resume-grid .user-search-hint {
          min-height: 18px;
          margin-top: 0;
          line-height: 1.45;
        }
        .workflow-multi-assignee-stack {
          gap: 12px;
        }
        .workflow-multi-assignee-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 10px;
          align-items: start;
        }
        .workflow-multi-assignee-row.with-remove {
          grid-template-columns: minmax(0, 1fr) auto;
        }
        .workflow-add-assignee-btn {
          margin-top: 2px;
        }
        .workflow-reassign-label {
          font-size: 12px;
          font-weight: 700;
          color: #425a78;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .workflow-reassign-select,
        .workflow-reassign-textarea {
          width: 100%;
          border: 1px solid #d6e0ec;
          border-radius: 12px;
          background: #ffffff;
          color: #1f3554;
          font-size: 14px;
          font-family: inherit;
          padding: 12px 14px;
          transition: border-color 140ms ease, box-shadow 140ms ease;
        }
        .workflow-reassign-select:focus,
        .workflow-reassign-textarea:focus {
          outline: none;
          border-color: #7ea5e3;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
        }
        .workflow-reassign-textarea {
          min-height: 78px;
          resize: vertical;
        }
        .workflow-reassign-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
          margin-top: 4px;
        }
        .workflow-reassign-note {
          max-width: 560px;
          font-size: 12px;
          color: #74849a;
          line-height: 1.6;
        }
        .bank-download-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(7, 18, 34, 0.58);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          z-index: 1200;
        }
        .bank-download-modal {
          width: min(100%, 460px);
          border-radius: 22px;
          border: 1px solid #d6e0eb;
          background:
            radial-gradient(circle at top right, rgba(184, 203, 229, 0.18) 0%, transparent 26%),
            linear-gradient(180deg, #ffffff 0%, #f7fbff 100%);
          box-shadow: 0 28px 56px rgba(15, 23, 42, 0.22);
          padding: 24px;
        }
        .bank-download-kicker {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #56708d;
          margin-bottom: 8px;
        }
        .bank-download-modal h3 {
          margin: 0 0 8px;
          color: #173252;
          font-size: 22px;
        }
        .bank-download-modal p {
          margin: 0 0 16px;
          color: #687c95;
          font-size: 14px;
          line-height: 1.6;
        }
        .bank-download-label {
          display: block;
          margin-bottom: 8px;
          color: #49617d;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .bank-download-input {
          width: 100%;
          min-height: 48px;
          padding: 12px 14px;
          border: 1px solid #ced9e6;
          border-radius: 14px;
          background: #ffffff;
          color: #1f3554;
          font-size: 15px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .bank-download-input:focus {
          outline: none;
          border-color: #7ea5e3;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.12);
        }
        .bank-download-hint {
          margin-top: 10px;
          color: #6d8199;
          font-size: 12px;
          line-height: 1.55;
        }
        .bank-download-actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
          margin-top: 18px;
        }
        @media (max-width: 980px) {
          .note-workspace {
            grid-template-columns: 1fr;
            height: auto;
            min-height: calc(100vh - 64px);
          }
          .activity-pane,
          .doc-viewer-pane {
            flex: none;
            min-height: 0;
          }
          .doc-viewer-pane {
            border-top: 1px solid #e2e8f0;
          }
          .activity-scroll,
          .doc-viewer-scroll {
            padding: 16px;
          }
          .draft-resume-grid {
            grid-template-columns: 1fr;
          }
          .draft-status-strip {
            align-items: flex-start;
            flex-direction: column;
          }
          .confirm-strip,
          .audit-tools,
          .note-action-row,
          .workflow-reassign-header {
            flex-direction: column;
            align-items: flex-start;
          }
          .note-action-buttons {
            width: 100%;
          }
          .note-action-buttons .btn,
          .doc-viewer-toolbar-actions .btn {
            flex: 1 1 100%;
          }
          .workflow-reassign-header-actions {
            justify-content: flex-start;
          }
          .doc-viewer-toolbar,
          .doc-viewer-toolbar-actions,
          .note-attachment-row {
            flex-direction: column;
            align-items: flex-start;
          }
          .info-grid {
            grid-template-columns: 1fr;
          }
          .bank-note-header,
          .bank-download-actions {
            flex-direction: column;
            align-items: flex-start;
          }
        }
        @media (max-width: 640px) {
          .note-action-textarea {
            min-height: 96px;
          }
        }
      `}</style>
    </div>
  );
};

export default NoteDetail;

