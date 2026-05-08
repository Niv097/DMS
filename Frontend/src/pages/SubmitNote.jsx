import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useBackNavigation } from '../components/Layout';
import UserSearchSelect from '../components/UserSearchSelect';

const SubmitNote = () => {
  const navigate = useNavigate();
  const { setBackNavigation } = useBackNavigation();
  const [departments, setDepartments] = useState([]);
  const [verticals, setVerticals] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [pageMessage, setPageMessage] = useState(null);
  const [mainNote, setMainNote] = useState(null);
  const [annexures, setAnnexures] = useState([]);
  const [formData, setFormData] = useState({
    subject: '',
    note_type: 'Financial',
    workflow_type: 'STRICT',
    classification: 'INTERNAL',
    vertical_id: '',
    department_id: '',
    comment_text: '',
    recommender_ids: [''],
    approver_id: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [deptsRes, vertsRes, usersRes] = await Promise.all([
          api.get('/departments'),
          api.get('/verticals'),
          api.get('/users')
        ]);
        setDepartments(deptsRes.data || []);
        setVerticals(vertsRes.data || []);
        setUsers(usersRes.data || []);
      } catch (error) {
        console.error('Error fetching form dependencies', error);
      }
    };

    fetchData();
  }, []);

  const buildFileTitle = (fileName = '') => fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const handleMainNoteChange = (file) => {
    setMainNote(file);
    if (!file) return;

    setPageMessage(null);
    const fallbackSubject = buildFileTitle(file.name);
    if (fallbackSubject) {
      setFormData((prev) => ({
        ...prev,
        subject: prev.subject.trim() ? prev.subject : fallbackSubject
      }));
    }
  };

  const runDocumentScan = async () => {
    if (!mainNote) {
      setPageMessage({ type: 'error', text: 'Choose the main document first, then run auto-fill if needed.' });
      return;
    }

    setScanLoading(true);
    setPageMessage(null);

    try {
      const scanData = new FormData();
      scanData.append('file', mainNote);
      const response = await api.post('/notes/scan', scanData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const data = response.data || {};
      setFormData((prev) => ({
        ...prev,
        subject: prev.subject || data.subject || prev.subject,
        note_type: prev.note_type || data.note_type || prev.note_type,
        comment_text: prev.comment_text || data.comment_text || prev.comment_text
      }));
      setPageMessage({ type: 'success', text: 'Document details were read successfully. You can edit them before upload.' });
    } catch (error) {
      console.error('Document scan failed', error);
      setPageMessage({ type: 'error', text: error.response?.data?.error || 'Auto-fill could not read this file right now. You can still upload it normally.' });
    } finally {
      setScanLoading(false);
    }
  };

  const normalizeRecommenderIds = () => {
    const uniqueIds = [];
    for (const value of formData.recommender_ids || []) {
      const trimmed = String(value || '').trim();
      if (trimmed && !uniqueIds.includes(trimmed)) uniqueIds.push(trimmed);
    }
    return uniqueIds;
  };

  const handleRecommenderChange = (index, value) => {
    setFormData((current) => {
      const nextIds = [...(current.recommender_ids || [''])];
      nextIds[index] = value;
      return { ...current, recommender_ids: nextIds };
    });
  };

  const addRecommenderField = () => {
    setFormData((current) => ({ ...current, recommender_ids: [...(current.recommender_ids || []), ''] }));
  };

  const removeRecommenderField = (index) => {
    setFormData((current) => {
      const currentIds = current.recommender_ids || [''];
      const nextIds = currentIds.filter((_, candidateIndex) => candidateIndex !== index);
      return { ...current, recommender_ids: nextIds.length ? nextIds : [''] };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setPageMessage(null);

    const recommenderIds = normalizeRecommenderIds();
    const derivedSubject = formData.subject.trim() || buildFileTitle(mainNote?.name || '');
    if (!recommenderIds.length || !formData.approver_id) {
      setPageMessage({ type: 'error', text: 'Select at least one recommender and one final approver before starting workflow.' });
      setLoading(false);
      return;
    }

    if (!derivedSubject) {
      setPageMessage({ type: 'error', text: 'Subject is required before upload.' });
      setLoading(false);
      return;
    }

    const payload = new FormData();
    payload.append('subject', derivedSubject);
    payload.append('note_type', formData.note_type);
    payload.append('workflow_type', formData.workflow_type);
    payload.append('classification', formData.classification);
    payload.append('vertical_id', formData.vertical_id);
    payload.append('department_id', formData.department_id);
    payload.append('comment_text', formData.comment_text);

    if (mainNote) payload.append('main_note', mainNote);
    annexures.forEach((file) => payload.append('annexures', file));

    try {
      const createResponse = await api.post('/notes', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const createdNoteId = createResponse.data?.id;
      if (!createdNoteId) throw new Error('File creation failed');

      await api.post(`/notes/${createdNoteId}/submit`, {
        recommender_id: recommenderIds[0],
        recommenders: recommenderIds,
        approver_id: formData.approver_id,
        comment_text: formData.comment_text
      });

      navigate(`/note/${createdNoteId}`);
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || error.message });
    } finally {
      setLoading(false);
    }
  };

  const hasDraftableContent = Boolean(
    formData.subject.trim()
    || formData.comment_text.trim()
    || formData.vertical_id
    || formData.department_id
    || mainNote
    || annexures.length
  );

  const canSaveDraft = Boolean(
    formData.subject.trim()
    && formData.comment_text.trim()
    && formData.vertical_id
    && formData.department_id
    && mainNote
  );

  const persistDraft = async () => {
    const derivedSubject = formData.subject.trim() || buildFileTitle(mainNote?.name || '');
    if (!canSaveDraft) {
      setPageMessage({
        type: 'error',
        text: 'Complete subject, comment, vertical, department, and main document before sending this work to Pending Submission.'
      });
      return false;
    }

    setLoading(true);
    setPageMessage(null);

    const payload = new FormData();
    payload.append('subject', derivedSubject);
    payload.append('note_type', formData.note_type);
    payload.append('workflow_type', formData.workflow_type);
    payload.append('classification', formData.classification);
    payload.append('vertical_id', formData.vertical_id);
    payload.append('department_id', formData.department_id);
    payload.append('comment_text', formData.comment_text);
    if (mainNote) payload.append('main_note', mainNote);
    annexures.forEach((file) => payload.append('annexures', file));

    try {
      const response = await api.post('/notes', payload, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const createdNoteId = response.data?.id;
      if (!createdNoteId) {
        throw new Error('Draft creation failed.');
      }
      navigate(`/note/${createdNoteId}`);
      return true;
    } catch (error) {
      setPageMessage({ type: 'error', text: error.response?.data?.error || error.message || 'Unable to save draft.' });
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setBackNavigation({
      handler: async () => {
        if (!hasDraftableContent) {
          navigate(-1);
          return true;
        }
        return persistDraft();
      }
    });

    return () => setBackNavigation(null);
  }, [setBackNavigation, hasDraftableContent, canSaveDraft, formData, mainNote, annexures]);

  const recommenders = users.filter((user) => user.role?.name === 'RECOMMENDER');
  const approvers = users.filter((user) => user.role?.name === 'APPROVER');

  return (
    <div className="mobile-form-shell">
      <div className="page-header">
        <h1>Upload New File</h1>
        <p>Create a new version-controlled record and route it through uploader, recommender, then final approver.</p>
      </div>

      {pageMessage && (
        <div className={`ui-message ${pageMessage.type === 'error' ? 'error' : 'success'}`} style={{ marginBottom: '16px' }}>
          <span>{pageMessage.text}</span>
          <button type="button" className="ui-message-close" onClick={() => setPageMessage(null)}>Dismiss</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mobile-form-stack">
        <div className="card">
          <div className="card-header blue">File Details</div>
          <div className="card-body">
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>Subject <span className="req">*</span></label>
                <input
                  type="text"
                  value={formData.subject}
                  onChange={(event) => setFormData({ ...formData, subject: event.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Uploader Comment <span className="req">*</span></label>
                <textarea
                  value={formData.comment_text}
                  onChange={(event) => setFormData({ ...formData, comment_text: event.target.value })}
                  placeholder="Required: reason for upload or context for reviewers"
                  style={{ minHeight: '80px' }}
                  required
                />
              </div>
              <div className="form-group">
                <label>Vertical <span className="req">*</span></label>
                <select
                  value={formData.vertical_id}
                  onChange={(event) => setFormData({ ...formData, vertical_id: event.target.value })}
                  required
                >
                  <option value="">Select Vertical</option>
                  {verticals.map((vertical) => <option key={vertical.id} value={vertical.id}>{vertical.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Department <span className="req">*</span></label>
                <select
                  value={formData.department_id}
                  onChange={(event) => setFormData({ ...formData, department_id: event.target.value })}
                  required
                >
                  <option value="">Select Department</option>
                  {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Document Type</label>
                <select
                  value={formData.note_type}
                  onChange={(event) => setFormData({ ...formData, note_type: event.target.value })}
                >
                  <option value="Financial">Financial</option>
                  <option value="Non-Financial">Non-Financial</option>
                  <option value="Administrative">Administrative</option>
                  <option value="Note for Information">Note for Information</option>
                </select>
              </div>
              <div className="form-group">
                <label>Classification <span className="req">*</span></label>
                <select
                  value={formData.classification}
                  onChange={(event) => setFormData({ ...formData, classification: event.target.value })}
                  required
                >
                  <option value="PUBLIC">Public</option>
                  <option value="INTERNAL">Internal</option>
                  <option value="CONFIDENTIAL">Confidential</option>
                  <option value="RESTRICTED">Restricted</option>
                </select>
                <small className="text-sm text-muted">Confidential and restricted documents require stronger publishing control before they can enter FMS.</small>
              </div>
            </div>
          </div>
        </div>

        <div className="card form-card workflow-routing-card">
          <div className="card-header blue">Strict Workflow Assignment</div>
          <div className="card-body">
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>Recommender <span className="req">*</span></label>
                <div className="workflow-multi-assignee-stack">
                  {(formData.recommender_ids || ['']).map((recommenderId, index) => (
                    <div key={`recommender-${index}`} className="workflow-multi-assignee-row">
                      <UserSearchSelect
                        id={`recommender-${index}`}
                        value={recommenderId}
                        onChange={(nextValue) => handleRecommenderChange(index, nextValue)}
                        options={recommenders}
                        placeholder={`Search recommender ${index + 1} by name or employee ID`}
                      />
                      {(formData.recommender_ids || []).length > 1 ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => removeRecommenderField(index)}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button type="button" className="btn btn-outline btn-sm workflow-add-assignee-btn" onClick={addRecommenderField}>
                    + Add Recommender
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Final Approver <span className="req">*</span></label>
                <UserSearchSelect
                  id="final-approver"
                  value={formData.approver_id}
                  onChange={(nextValue) => setFormData({ ...formData, approver_id: nextValue })}
                  options={approvers}
                  placeholder="Search final approver by name or employee ID"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header blue">Document Set</div>
          <div className="card-body">
            <div className="form-grid cols-2">
              <div className="form-group">
                <label>Main Document <span className="req">*</span></label>
                <input
                  className="mobile-file-input"
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                  onChange={(event) => handleMainNoteChange(event.target.files?.[0])}
                  required
                />
                {mainNote ? <div className="mobile-file-pill">{mainNote.name}</div> : null}
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '10px' }}>
                  <button type="button" className="btn btn-outline btn-sm" onClick={runDocumentScan} disabled={!mainNote || scanLoading || loading}>
                    {scanLoading ? 'Reading...' : 'Auto Fill From File'}
                  </button>
                  <small className="text-sm text-muted" style={{ margin: 0 }}>
                    Upload stays fast. Auto-fill is optional and reads the file only when you ask for it.
                  </small>
                </div>
                <small className="text-sm text-muted">This is the only file that goes through recommendation, approval, watermarking, and final legal status.</small>
              </div>
              <div className="form-group">
                <label>Supporting Documents</label>
                <input
                  className="mobile-file-input"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff"
                  onChange={(event) => setAnnexures(Array.from(event.target.files || []))}
                />
                {annexures.length > 0 ? (
                  <div className="mobile-file-pill-group">
                    {annexures.slice(0, 3).map((file) => (
                      <div key={`${file.name}-${file.size}`} className="mobile-file-pill">{file.name}</div>
                    ))}
                    {annexures.length > 3 ? <div className="mobile-file-pill">+{annexures.length - 3} more</div> : null}
                  </div>
                ) : null}
                <small className="text-sm text-muted">Reference files only. These do not move through workflow and are never watermarked.</small>
              </div>
            </div>
          </div>
        </div>

        <div className="action-row mobile-sticky-actions">
          <button type="button" className="btn btn-outline" onClick={persistDraft} disabled={loading}>
            {loading ? 'Saving...' : 'Save as Draft'}
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Uploading...' : 'Upload and Start Workflow'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default SubmitNote;
