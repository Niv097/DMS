import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import api from '../utils/api';
import { useBranding } from '../context/BrandingContext';

const accessLevelLabel = {
  VIEW: 'View Only',
  DOWNLOAD: 'View + Download'
};

const formatDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
};

const getDownloadName = (contentDisposition, fallbackName) => {
  const match = /filename="?([^"]+)"?/i.exec(contentDisposition || '');
  return match?.[1] || fallbackName;
};

const formatScopeLabel = (document) => {
  const pathKey = String(document?.department_master?.path_key || '').trim();
  if (pathKey) {
    return pathKey.split('/').map((item) => item.trim()).filter(Boolean).join(' / ');
  }
  const category = String(document?.document_category || '').trim();
  if (category && !['GENERAL', 'STRICT'].includes(category.toUpperCase())) {
    return category;
  }
  return document?.department_master?.name || document?.owner_node?.name || 'FMS';
};

const formatAuditAction = (value = '') => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'FMS_CONTROLLED_COPY_ISSUED') return 'DOWNLOADED';
  if (normalized === 'FMS_RECORD_VIEWED') return 'OPENED';
  return normalized.replace(/^FMS_/, '').replace(/_/g, ' ').trim() || 'FMS EVENT';
};

const isImageMime = (mime = '', name = '') => {
  const normalizedMime = String(mime || '').toLowerCase();
  if (normalizedMime.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(String(name || ''));
};

const isPdfMime = (mime = '', name = '') => {
  const normalizedMime = String(mime || '').toLowerCase();
  if (normalizedMime.includes('pdf')) return true;
  return /\.pdf$/i.test(String(name || ''));
};

const FmsDocumentDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { branding } = useBranding();
  const [documentDetail, setDocumentDetail] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [downloadPrompt, setDownloadPrompt] = useState(null);
  const [downloadEmployeeId, setDownloadEmployeeId] = useState('123456');
  const [downloadSubmitting, setDownloadSubmitting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewMimeType, setPreviewMimeType] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const employeeInputRef = useRef(null);
  const downloadModalRef = useRef(null);

  const scopeLabel = useMemo(() => formatScopeLabel(documentDetail), [documentDetail]);
  const canViewSensitiveFileDetails = Boolean(documentDetail?.can_view_sensitive_file_details);
  const previewType = isPdfMime(previewMimeType, documentDetail?.file_name)
    ? 'pdf'
    : isImageMime(previewMimeType, documentDetail?.file_name)
      ? 'image'
      : 'unsupported';
  const canDeleteDocument = Boolean(documentDetail?.can_delete_document);

  const releaseAuditCopy = async (documentId = id) => {
    if (!documentId) return;
    setPreviewLoading(true);
    try {
      const response = await api.get(`/fms/documents/${documentId}/file?disposition=inline`, { responseType: 'blob' });
      setPreviewMimeType(response.data?.type || '');
      const blobUrl = window.URL.createObjectURL(response.data);
      setPreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current);
        return blobUrl;
      });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to load file preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadDetail = async (documentId = id) => {
    setLoading(true);
    try {
      const response = await api.get(`/fms/documents/${documentId}`);
      setDocumentDetail({
        ...(response.data?.document || null),
        node_grants: response.data?.node_grants || []
      });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to load FMS document.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail().catch(() => {});
    return () => {
      setPreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current);
        return '';
      });
    };
  }, [id]);

  useEffect(() => {
    if (!documentDetail?.id || !canViewSensitiveFileDetails) {
      setPreviewUrl((current) => {
        if (current) window.URL.revokeObjectURL(current);
        return '';
      });
      setPreviewMimeType('');
      setPreviewLoading(false);
      return undefined;
    }
    releaseAuditCopy(documentDetail.id).catch(() => {});
    return undefined;
  }, [documentDetail?.id, canViewSensitiveFileDetails]);

  useEffect(() => {
    if (!documentDetail?.id) return undefined;
    const intervalId = window.setInterval(() => {
      loadDetail(documentDetail.id).catch(() => {});
    }, 15000);
    return () => window.clearInterval(intervalId);
  }, [documentDetail?.id]);

  useEffect(() => {
    if (!downloadPrompt) return;
    if (downloadModalRef.current) {
      downloadModalRef.current.scrollTop = 0;
    }
    employeeInputRef.current?.focus({ preventScroll: true });
    employeeInputRef.current?.select();
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

  useEffect(() => {
    if (canViewSensitiveFileDetails || activeTab === 'summary') return;
    setActiveTab('summary');
  }, [activeTab, canViewSensitiveFileDetails]);

  const handleProtectedDownload = async () => {
    if (!downloadPrompt?.documentId) return;
    setDownloadSubmitting(true);
    setMessage('');
    try {
      const response = await api.get(`/fms/documents/${downloadPrompt.documentId}/file`, {
        params: {
          disposition: 'attachment',
          employee_id: downloadEmployeeId
        },
        responseType: 'blob'
      });
      const blobUrl = window.URL.createObjectURL(response.data);
      const anchor = window.document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = getDownloadName(response.headers?.['content-disposition'], downloadPrompt.fallbackName || 'fms-document');
      window.document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setDownloadPrompt(null);
      await loadDetail(downloadPrompt.documentId);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to download file.');
    } finally {
      setDownloadSubmitting(false);
    }
  };

  const handleArchiveDocument = async () => {
    if (!documentDetail?.id) return;
    const confirmed = window.confirm(`Archive "${documentDetail.title || documentDetail.file_name || 'this FMS record'}" from the active register?`);
    if (!confirmed) return;
    try {
      await api.delete(`/fms/documents/${documentDetail.id}`);
      const returnTo = location.state?.returnTo || '/fms/register';
      navigate(returnTo, {
        replace: true,
        state: {
          flashMessage: 'FMS record archived successfully.'
        }
      });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Unable to archive FMS record.');
    }
  };

  if (loading && !documentDetail) {
    return <div className="card" style={{ padding: '24px' }}>Loading FMS file...</div>;
  }

  if (!documentDetail) {
    return (
      <div className="card" style={{ padding: '24px' }}>
        <div style={{ marginBottom: '16px' }}>{message || 'FMS file not found.'}</div>
      </div>
    );
  }

  return (
    <div className="fms-file-detail-page">
      <div className="page-header fms-file-header">
        <div>
          <div className="page-badge">{scopeLabel} File</div>
          <h1>{documentDetail.title}</h1>
          <p>{documentDetail.file_name} | {documentDetail.document_reference || documentDetail.customer_reference || 'No reference'} | {scopeLabel}</p>
        </div>
        <div className="fms-file-header-actions">
          {canDeleteDocument && (
            <button
              type="button"
              className="btn btn-danger"
              onClick={handleArchiveDocument}
            >
              Delete Record
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setDownloadPrompt({
              documentId: documentDetail.id,
              title: documentDetail.title || 'FMS Record',
              fallbackName: documentDetail.file_name || 'fms-document'
            })}
          >
            Download Original File
          </button>
        </div>
      </div>

      {message && (
        <div className="ui-message error" style={{ marginBottom: '16px' }}>
          <span>{message}</span>
          <button type="button" className="ui-message-close" onClick={() => setMessage('')}>Dismiss</button>
        </div>
      )}

      <div className="fms-file-shell">
        <section className="fms-file-sheet">
          <div className="fms-sheet-card">
            <div className="fms-sheet-banner">
              <div className="fms-file-brand">
                {branding.logoUrl ? <img src={branding.logoUrl} alt={branding.brandName || 'Bank logo'} /> : <div className="fms-file-brand-mark">FMS</div>}
                <div>
                  <strong>{branding.brandName || 'Bank Record Sheet'}</strong>
                  <span>{branding.subtitle || 'Controlled FMS Record Summary'}</span>
                </div>
              </div>
              <div className="fms-file-sheet-code">
                <span>{scopeLabel} Record Sheet</span>
                <strong>{documentDetail.document_reference || documentDetail.customer_reference || documentDetail.file_name || '-'}</strong>
              </div>
            </div>
            <div className="fms-sheet-understanding-strip">
              This first banking sheet is only for understanding inside FMS. Download keeps the original file unchanged; only the audit on this page is updated.
            </div>

            <table className="fms-sheet-table">
              <tbody>
                <tr>
                  <th>Document</th>
                  <td>{documentDetail.title}</td>
                  <th>Status</th>
                  <td>{documentDetail.visibility_label || documentDetail.status}</td>
                </tr>
                <tr>
                  <th>File Name</th>
                  <td>{documentDetail.file_name}</td>
                  <th>Record Type</th>
                  <td>{documentDetail.document_type}</td>
                </tr>
                <tr>
                  <th>Department Scope</th>
                  <td>{scopeLabel}</td>
                  <th>Library Folder</th>
                  <td>{documentDetail.owner_node?.name || 'Library custody folder'}</td>
                </tr>
                <tr>
                  <th>Reference</th>
                  <td>{documentDetail.document_reference || documentDetail.customer_reference || '-'}</td>
                  <th>Classification</th>
                  <td>{documentDetail.classification}</td>
                </tr>
                <tr>
                  <th>Your Access</th>
                  <td>{accessLevelLabel[documentDetail.viewer_access_level] || documentDetail.viewer_access_level || 'View Only'}</td>
                  <th>Version</th>
                  <td>v{documentDetail.version_number || 1}</td>
                </tr>
                <tr>
                  <th>Published By</th>
                  <td>{documentDetail.published_by?.name || documentDetail.uploaded_by?.name || '-'}</td>
                  <th>Published On</th>
                  <td>{formatDateTime(documentDetail.published_at || documentDetail.created_at)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="fms-file-tabs">
            <button type="button" className={activeTab === 'summary' ? 'active' : ''} onClick={() => setActiveTab('summary')}>Summary</button>
            {canViewSensitiveFileDetails && <button type="button" className={activeTab === 'audit' ? 'active' : ''} onClick={() => setActiveTab('audit')}>Audit</button>}
            {canViewSensitiveFileDetails && <button type="button" className={activeTab === 'access' ? 'active' : ''} onClick={() => setActiveTab('access')}>Access</button>}
          </div>

          {activeTab === 'summary' && (
            <div className="fms-file-panel">
              <div className="fms-file-panel-title">Bank Record Understanding Sheet</div>
              <p className="fms-file-panel-copy">
                This record page is the bank-facing understanding view. The downloaded file remains the real stored original and does not get this first sheet inserted into it.
              </p>
              <div className="fms-file-summary-table compact">
                <div><span>Business Scope</span><strong>{documentDetail.department_master?.name || scopeLabel}</strong></div>
                <div><span>Identity Key</span><strong>{documentDetail.cif_reference || documentDetail.account_reference || documentDetail.identity_reference || documentDetail.id_proof_number || 'No extra identity key stored'}</strong></div>
              </div>
              {canViewSensitiveFileDetails ? (
                <div className="fms-inline-preview-card">
                  <div className="fms-file-preview-head">
                    <div>
                      <strong>Stored Original Record</strong>
                      <small>Users first understand the bank record here. Open or download still uses the original stored file only.</small>
                    </div>
                  </div>
                  <div className="fms-file-preview-body compact">
                    {previewLoading ? (
                      <div className="fms-preview-empty">Loading preview...</div>
                    ) : !previewUrl ? (
                      <div className="fms-preview-empty">Preview is not available right now.</div>
                    ) : previewType === 'image' ? (
                      <img className="fms-preview-image compact" src={previewUrl} alt={documentDetail.file_name || 'FMS preview'} />
                    ) : previewType === 'pdf' ? (
                      <iframe className="fms-preview-frame compact" title="FMS preview" src={previewUrl} />
                    ) : (
                      <div className="fms-preview-empty">
                        This file type opens in the original viewer. Use <strong>Open Original File</strong> when needed.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="fms-privacy-box">
                  Only bank admin and super admin can open the original file, download it, or inspect deeper record controls. Other bank users can work from this summary only.
                </div>
              )}
            </div>
          )}

          {canViewSensitiveFileDetails && activeTab === 'audit' && (
            <div className="fms-file-panel">
              <div className="fms-file-panel-title">{scopeLabel} File Audit Log</div>
              <p className="fms-file-panel-copy">
                Downloads should enter audit here in real time. The original file stays original when downloaded; only the audit gets updated on this page.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th>Performed By</th>
                      <th>Employee ID</th>
                      <th>Date & Time</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(documentDetail.audit_logs || []).length === 0 ? (
                      <tr><td colSpan="5" style={{ textAlign: 'center', padding: '20px' }}>No FMS audit events have been recorded for this file yet.</td></tr>
                    ) : (
                      documentDetail.audit_logs.map((log) => (
                        <tr key={`audit-${log.id}`}>
                          <td><span className={`badge ${String(log.action_label || log.action || '').includes('DOWNLOADED') ? 'badge-green' : 'badge-blue'}`}>{log.action_label || formatAuditAction(log.action)}</span></td>
                          <td>{log.actor?.name || log.performed_by || '-'}</td>
                          <td>{log.actor?.employee_id || log.metadata?.employee_id || '-'}</td>
                          <td>{formatDateTime(log.timestamp)}</td>
                          <td>{log.remarks || '-'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {canViewSensitiveFileDetails && activeTab === 'access' && (
            <div className="fms-file-panel">
              <div className="fms-file-panel-title">Who Can See This Record</div>
              <div className="fms-grant-list">
                <div className="fms-grant-card">
                  <div>
                    <strong>{documentDetail.owner_node?.name || 'Default library folder'}</strong>
                    <div className="text-muted text-sm">DEFAULT LIBRARY FOLDER - default custody scope</div>
                  </div>
                </div>
                {(documentDetail.access_grants || []).map((grant) => (
                  <div key={grant.id} className="fms-grant-card">
                    <div>
                      <strong>{grant.grant_type === 'USER' ? grant.user?.name : grant.branch?.branch_name}</strong>
                      <div className="text-muted text-sm">
                        {grant.access_type} - {accessLevelLabel[grant.access_level] || grant.access_level} - Granted by {grant.granted_by?.name || grant.granted_by_user_id || '-'}
                      </div>
                    </div>
                  </div>
                ))}
                {(documentDetail.access_grants || []).length === 0 && (
                  <div className="fms-empty-box">No explicit access grants exist for this file yet.</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {downloadPrompt && (
        <div className="bank-download-modal-backdrop" role="presentation" onClick={() => !downloadSubmitting && setDownloadPrompt(null)}>
          <div ref={downloadModalRef} className="bank-download-modal" role="dialog" aria-modal="true" aria-labelledby="fms-document-download-title" onClick={(event) => event.stopPropagation()}>
            <div className="bank-download-kicker">Controlled Download Release</div>
            <h3 id="fms-document-download-title">{downloadPrompt.title}</h3>
            <p>Enter employee ID before releasing this controlled FMS copy.</p>
            <label className="bank-download-label" htmlFor="fms-document-download-employee-id">Employee ID</label>
            <input
              id="fms-document-download-employee-id"
              ref={employeeInputRef}
              className="bank-download-input"
              type="text"
              value={downloadEmployeeId}
              onChange={(event) => setDownloadEmployeeId(event.target.value)}
              disabled={downloadSubmitting}
            />
            <div className="bank-download-hint">
              Download keeps the original file unchanged. Only the audit trail on this FMS page is updated with the controlled-copy event.
            </div>
            <div className="bank-download-actions">
              <button type="button" className="btn btn-outline" onClick={() => setDownloadPrompt(null)} disabled={downloadSubmitting}>Cancel</button>
              <button type="button" className="btn btn-primary" onClick={handleProtectedDownload} disabled={downloadSubmitting || !String(downloadEmployeeId || '').trim()}>
                {downloadSubmitting ? 'Validating...' : 'Validate & Download'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .fms-file-detail-page {
          display: grid;
          gap: 18px;
        }
        .fms-file-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          flex-wrap: wrap;
        }
        .fms-file-header-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .fms-file-shell {
          display: grid;
          gap: 18px;
        }
        .fms-file-sheet {
          border: 1px solid #d8e2ee;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 10px 24px rgba(15, 35, 64, 0.06);
          overflow: hidden;
        }
        .fms-file-sheet {
          padding: 22px;
        }
        .fms-sheet-card {
          border: 1px solid #dce6f2;
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
        }
        .fms-sheet-banner {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
          padding: 18px 20px;
          background: linear-gradient(135deg, #173b6f 0%, #234f95 100%);
          border-bottom: 1px solid #e5edf6;
        }
        .fms-file-brand {
          display: flex;
          gap: 14px;
          align-items: center;
        }
        .fms-file-brand img,
        .fms-file-brand-mark {
          width: 54px;
          height: 54px;
          border-radius: 12px;
          object-fit: cover;
          background: #15345d;
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          letter-spacing: 0.08em;
        }
        .fms-file-brand strong,
        .fms-file-sheet-code strong {
          display: block;
          color: #ffffff;
          font-size: 1.35rem;
          line-height: 1.2;
        }
        .fms-file-brand span,
        .fms-file-sheet-code span {
          display: block;
          color: rgba(255,255,255,0.82);
          font-size: 0.9rem;
          margin-top: 4px;
        }
        .fms-file-sheet-code {
          text-align: right;
        }
        .fms-sheet-understanding-strip {
          padding: 13px 18px;
          background: #f5f9fe;
          color: #55718f;
          border-bottom: 1px solid #e2eaf4;
          line-height: 1.55;
        }
        .fms-file-summary-table {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px 18px;
        }
        .fms-sheet-table {
          width: 100%;
          border-collapse: collapse;
        }
        .fms-sheet-table th,
        .fms-sheet-table td {
          padding: 14px 16px;
          border: 1px solid #e2eaf4;
          text-align: left;
          vertical-align: top;
        }
        .fms-sheet-table th {
          width: 18%;
          background: #f3f8fd;
          color: #5f7693;
          font-size: 0.8rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 800;
        }
        .fms-sheet-table td {
          color: #18365b;
          font-weight: 700;
        }
        .fms-file-summary-table.compact {
          margin-top: 12px;
        }
        .fms-file-summary-table div {
          border: 1px solid #e1e9f3;
          border-radius: 16px;
          padding: 14px 16px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
        }
        .fms-file-summary-table span {
          display: block;
          color: #7b8ea7;
          font-size: 0.76rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .fms-file-summary-table strong {
          color: #1f3551;
          font-size: 1.05rem;
          line-height: 1.35;
          word-break: break-word;
        }
        .fms-file-tabs {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          margin: 20px 0 14px;
          padding-bottom: 14px;
          border-bottom: 1px solid #e6edf6;
        }
        .fms-file-tabs button {
          border: 1px solid #d6e1ee;
          border-radius: 999px;
          background: #f7fbff;
          color: #547093;
          padding: 10px 16px;
          font-weight: 700;
          cursor: pointer;
        }
        .fms-file-tabs button.active {
          background: #214f9d;
          color: #fff;
          border-color: #214f9d;
        }
        .fms-file-panel {
          display: grid;
          gap: 14px;
        }
        .fms-file-panel-title {
          color: #173c6d;
          font-size: 1.14rem;
          font-weight: 800;
        }
        .fms-file-panel-copy {
          margin: 0;
          color: #6983a5;
          line-height: 1.6;
        }
        .fms-privacy-box {
          border: 1px dashed #c8d6e6;
          border-radius: 18px;
          padding: 18px 20px;
          background: #f7fbff;
          color: #607a9d;
          line-height: 1.7;
        }
        .fms-inline-preview-card {
          border: 1px solid #dbe5f0;
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
        }
        .fms-file-preview-head {
          padding: 18px 20px;
          background: #214f9d;
          color: #fff;
        }
        .fms-file-preview-head strong {
          display: block;
          font-size: 1.06rem;
        }
        .fms-file-preview-head small {
          display: block;
          margin-top: 6px;
          color: rgba(255,255,255,0.8);
          line-height: 1.55;
        }
        .fms-file-preview-body {
          min-height: 420px;
          background: #dbe5f1;
          padding: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fms-preview-frame,
        .fms-preview-image {
          width: 100%;
          max-width: 100%;
          min-height: 460px;
          border: none;
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 10px 24px rgba(15, 35, 64, 0.08);
          object-fit: contain;
        }
        .fms-preview-image {
          min-height: 0;
          max-height: 520px;
        }
        .fms-file-preview-body.compact {
          min-height: 420px;
        }
        .fms-preview-frame.compact {
          min-height: 520px;
        }
        .fms-preview-image.compact {
          max-height: 520px;
        }
        .fms-preview-empty {
          width: 100%;
          min-height: 320px;
          border: 1px dashed #b9c9dd;
          border-radius: 18px;
          background: rgba(255,255,255,0.78);
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: #5f7695;
          padding: 24px;
          line-height: 1.6;
        }
        @media (max-width: 1100px) {
          .fms-file-preview-body {
            min-height: 340px;
          }
          .fms-preview-frame {
            min-height: 340px;
          }
          .fms-preview-frame.compact {
            min-height: 360px;
          }
          .fms-preview-image.compact {
            max-height: 360px;
          }
        }
        @media (max-width: 720px) {
          .fms-file-sheet {
            padding: 16px;
          }
          .fms-sheet-banner {
            flex-direction: column;
          }
          .fms-file-sheet-code {
            text-align: left;
          }
          .fms-file-summary-table {
            grid-template-columns: 1fr;
          }
          .fms-sheet-table,
          .fms-sheet-table tbody,
          .fms-sheet-table tr,
          .fms-sheet-table th,
          .fms-sheet-table td {
            display: block;
            width: 100%;
          }
          .fms-sheet-table tr {
            border-bottom: 1px solid #e2eaf4;
          }
          .fms-sheet-table th {
            border-bottom: none;
          }
          .fms-sheet-table td {
            border-top: none;
          }
          .fms-file-tabs {
            gap: 8px;
          }
          .fms-file-tabs button {
            flex: 1 1 120px;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
};

export default FmsDocumentDetail;
