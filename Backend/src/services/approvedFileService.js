import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import {
  buildVersionFileStoredRelativePath,
  ensureStoredParentDir,
  ensureStorageRoot,
  getStorageRoot,
  resolveStoredPath
} from '../utils/storage.js';
import { toPublicDocumentReference } from '../utils/documentReference.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = getStorageRoot();

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff']);
const MIME_BY_EXTENSION = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
};
const WORKFLOW_TIMEZONE = 'Asia/Kolkata';

const SUMMARY_PAGE_SIZE = [595, 842];
const SUMMARY_COLORS = {
  primary: rgb(0.1, 0.2, 0.34),
  primarySoft: rgb(0.95, 0.97, 0.99),
  sectionFill: rgb(0.91, 0.95, 0.98),
  border: rgb(0.76, 0.8, 0.85),
  text: rgb(0.12, 0.15, 0.21),
  muted: rgb(0.42, 0.47, 0.55),
  statusFill: rgb(0.9, 0.96, 0.91),
  statusText: rgb(0.13, 0.39, 0.2),
  rowAlt: rgb(0.985, 0.989, 0.994),
  labelFill: rgb(0.975, 0.982, 0.989),
  pageFill: rgb(0.992, 0.995, 0.998),
  headerTextSoft: rgb(0.82, 0.88, 0.95)
};

const ensureUploadsDir = async () => {
  await ensureStorageRoot();
};

const resolveFilePath = (filePath) => {
  if (!filePath) {
    throw new Error('Missing file path for approved artifact generation');
  }

  return resolveStoredPath(filePath);
};

const getApprovedFileName = (originalName, versionNumber) => {
  const extension = path.extname(originalName || '') || '.pdf';
  const base = path.basename(originalName || `note-v${versionNumber}`, extension);
  return `${base}-approved-v${versionNumber}${extension}`;
};

const fitTextSize = (font, text, targetWidth, minSize, maxSize) => {
  const unitWidth = font.widthOfTextAtSize(text, 1) || 1;
  const fitted = targetWidth / unitWidth;
  return Math.max(minSize, Math.min(maxSize, fitted));
};

const formatTimestamp = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: WORKFLOW_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(date);
};

const formatPublicDocumentReference = (value, fallback = '-', branchContext = null) => {
  return toPublicDocumentReference(value, fallback, branchContext);
};

const buildBranchLocationLine = (note) => {
  const cityName = String(note?.branch?.city?.city_name || '').trim();
  const branchName = String(note?.branch?.branch_name || '').trim();
  if (cityName && branchName) return `${cityName} (${branchName})`;
  return cityName || branchName || 'Branch location not mapped';
};

const buildBranchAddressLine = (note) => {
  const address = String(note?.branch?.branch_address || '').trim();
  const stateName = String(note?.branch?.city?.state_name || '').trim();
  if (address && stateName && !address.toLowerCase().includes(stateName.toLowerCase())) {
    return `${address}, ${stateName}`;
  }
  return address || stateName || 'Address not available';
};

const loadTenantLogoForPdf = async (pdfDoc, note) => {
  const logoPath = String(note?.tenant?.brand_logo_path || '').trim();
  if (!logoPath) return null;

  try {
    const absolutePath = resolveStoredPath(logoPath);
    const sourceBuffer = await fs.readFile(absolutePath);
    const extension = path.extname(absolutePath).toLowerCase();

    if (extension === '.jpg' || extension === '.jpeg') {
      const image = await pdfDoc.embedJpg(sourceBuffer);
      return { image, width: image.width, height: image.height };
    }

    const pngBuffer = extension === '.png' ? sourceBuffer : await sharp(sourceBuffer).png().toBuffer();
    const image = await pdfDoc.embedPng(pngBuffer);
    return { image, width: image.width, height: image.height };
  } catch {
    return null;
  }
};

const wrapText = (font, text, size, maxWidth) => {
  const safeText = String(text ?? '-').replace(/\s+/g, ' ').trim() || '-';
  const words = safeText.split(' ');
  const lines = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : ['-'];
};

const normalizeAuditAction = (value) => String(value || '').trim().toUpperCase();
const DOWNLOAD_AUDIT_ACTIONS = new Set([
  'DOWNLOAD_APPROVED_ARTIFACT',
  'DOWNLOAD_MAIN_DOCUMENT',
  'DOWNLOAD_SUPPORTING_DOCUMENT'
]);

const extractAuditActor = (log, fallback = 'Unknown User') => {
  const name = String(log?.performed_by || fallback).trim() || fallback;
  const remarks = String(log?.remarks || '');
  const employeeIdMatch = remarks.match(/Emp ID:\s*([^|]+)/i);
  const employeeId = String(employeeIdMatch?.[1] || '').trim();

  if (!employeeId) {
    return name;
  }

  return `${name} / ${employeeId}`;
};

const formatAuditSummaryAction = (action) => {
  const normalized = normalizeAuditAction(action);
  if (DOWNLOAD_AUDIT_ACTIONS.has(normalized)) {
    return 'DOWNLOADED';
  }
  if (normalized === 'UPLOAD' || normalized === 'UPLOAD_MAIN') {
    return 'DRAFT';
  }
  if (normalized === 'WORKFLOW_STARTED' || normalized === 'SUBMITTED') {
    return 'SUBMITTED';
  }
  if (normalized === 'RESUBMITTED') {
    return 'RESUBMITTED';
  }
  if (normalized === 'RECOMMEND' || normalized === 'RECOMMENDED') {
    return 'RECOMMENDED';
  }
  if (normalized === 'RETURN' || normalized === 'RETURN_WITH_REMARK' || normalized === 'RETURNED_WITH_REMARK') {
    return 'RETURNED';
  }
  if (normalized === 'REJECT' || normalized === 'REJECTED') {
    return 'REJECTED';
  }
  if (normalized === 'APPROVE' || normalized === 'APPROVED' || normalized === 'FINAL_APPROVE') {
    return 'APPROVED';
  }
  return normalized.replace(/_/g, ' ');
};

const buildWorkflowAuditSummaryRows = (note) => {
  const logs = [...(note.workflow_audit_history || note.audit_logs || [])].sort((left, right) => (
    new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  ));
  const workflowRows = logs
    .filter((log) => !log?.attachment_id)
    .filter((log) => !DOWNLOAD_AUDIT_ACTIONS.has(normalizeAuditAction(log.action)))
    .map((log) => ({
      action: formatAuditSummaryAction(log.action),
      actor: extractAuditActor(
        log,
        ['WORKFLOW_STARTED', 'UPLOAD', 'UPLOAD_MAIN'].includes(normalizeAuditAction(log.action)) ? (note.initiator?.name || 'Unknown User') : 'Unknown User'
      ),
      timestamp: formatTimestamp(log.timestamp)
    }))
    .filter((row) => ['DRAFT', 'SUBMITTED', 'RESUBMITTED', 'RECOMMENDED', 'RETURNED', 'REJECTED', 'APPROVED'].includes(row.action));

  if (workflowRows.length > 0) {
    const dedupedRows = workflowRows.filter((row, index, allRows) => (
      index === allRows.findIndex((candidate) => (
        candidate.action === row.action
        && candidate.actor === row.actor
        && candidate.timestamp === row.timestamp
      ))
    ));

    return dedupedRows.slice(-8);
  }

  return [];
};

const buildDownloadTraceRows = (note) => {
  const logs = [...(note.audit_logs || [])]
    .filter((log) => DOWNLOAD_AUDIT_ACTIONS.has(normalizeAuditAction(log.action)))
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  return logs.slice(-5).map((log) => ({
    action: 'CONTROLLED COPY ISSUED',
    actor: extractAuditActor(log),
    timestamp: formatTimestamp(log.timestamp)
  }));
};

const buildCommentRows = (note, mainAttachment) => {
  const docReference = formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || mainAttachment?.file_name || '-', '-', note.branch || null);
  const uniqueRows = [];

  for (const comment of note.comments || []) {
    const row = {
      page: '-',
      reference: docReference,
      comment: comment.comment_text || '-',
      name: comment.user?.name || 'Unknown User'
    };

    const alreadyExists = uniqueRows.some((item) => (
      item.comment.trim().toLowerCase() === row.comment.trim().toLowerCase() &&
      item.name.trim().toLowerCase() === row.name.trim().toLowerCase()
    ));

    if (!alreadyExists) {
      uniqueRows.push(row);
    }
  }

  const commentRows = uniqueRows.slice(0, 5);

  if (uniqueRows.length > 5) {
    commentRows.push({
      page: '-',
      reference: docReference,
      comment: 'Additional comments are available in the system record.',
      name: 'System'
    });
  }

  return commentRows;
};

const drawApprovalWatermark = (page, boldFont, regularFont, note) => {
  const { width, height } = page.getSize();
  const angle = degrees(-29);
  const mainText = 'Approved';
  const detailText = `DMS Approved ${formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || '', '', note.branch || null)}`.trim();
  const diagonalWidth = Math.sqrt((width ** 2) + (height ** 2));
  const mainSize = fitTextSize(boldFont, mainText, diagonalWidth * 0.56, 54, 92);
  const detailSize = Math.max(16, Math.min(28, mainSize * 0.28));
  const mainWidth = boldFont.widthOfTextAtSize(mainText, mainSize);
  const detailWidth = regularFont.widthOfTextAtSize(detailText, detailSize);
  const anchorX = width * 0.56;
  const anchorY = height * 0.6;

  page.drawText(mainText, {
    x: anchorX - (mainWidth / 2),
    y: anchorY,
    size: mainSize,
    font: boldFont,
    color: rgb(0.72, 0.18, 0.18),
    opacity: 0.17,
    rotate: angle
  });

  if (detailText) {
    page.drawText(detailText, {
      x: anchorX - (detailWidth / 2),
      y: anchorY - (mainSize * 0.42),
      size: detailSize,
      font: regularFont,
      color: rgb(0.72, 0.18, 0.18),
      opacity: 0.13,
      rotate: angle
    });
  }
};

const drawSummaryPage = async (pdfDoc, boldFont, regularFont, note, mainAttachment) => {
  const page = pdfDoc.addPage(SUMMARY_PAGE_SIZE);
  const [pageWidth, pageHeight] = SUMMARY_PAGE_SIZE;
  const left = 32;
  const tableWidth = pageWidth - (left * 2);
  const defaultSize = 10;
  const lineGap = 3;
  let cursorY = pageHeight - 44;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: SUMMARY_COLORS.pageFill
  });

  const drawTextBlock = (x, topY, width, text, options = {}) => {
    const font = options.font || regularFont;
    const size = options.size || defaultSize;
    const lines = wrapText(font, text, size, Math.max(12, width - 12));
    const contentHeight = (lines.length * (size + lineGap)) + 8;
    const minHeight = options.minHeight || 24;
    const height = Math.max(minHeight, contentHeight);

    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      borderColor: SUMMARY_COLORS.border,
      borderWidth: 1,
      color: options.fill || rgb(1, 1, 1)
    });

    const startY = topY - 15;
    for (const [index, line] of lines.entries()) {
      const lineWidth = font.widthOfTextAtSize(line, size);
      const textX = options.align === 'center'
        ? x + ((width - lineWidth) / 2)
        : x + 8;

      page.drawText(line, {
        x: textX,
        y: startY - (index * (size + lineGap)),
        size,
        font,
        color: options.textColor || SUMMARY_COLORS.text
      });
    }

    return height;
  };

  const drawSectionTitle = (label) => {
    page.drawRectangle({
      x: left,
      y: cursorY - 20,
      width: tableWidth,
      height: 20,
      color: SUMMARY_COLORS.sectionFill,
      borderColor: SUMMARY_COLORS.border,
      borderWidth: 1
    });

    const labelWidth = boldFont.widthOfTextAtSize(label, 11);
    page.drawText(label, {
      x: left + ((tableWidth - labelWidth) / 2),
      y: cursorY - 13,
      size: 11,
      font: boldFont,
      color: SUMMARY_COLORS.primary
    });

    cursorY -= 20;
  };

  const drawRow = (cells) => {
    const rowHeight = Math.max(...cells.map((cell) => {
      const font = cell.font || regularFont;
      const size = cell.size || defaultSize;
      const lines = wrapText(font, cell.value, size, Math.max(12, cell.width - 12));
      return Math.max(cell.minHeight || 24, (lines.length * (size + lineGap)) + 8);
    }));

    let x = left;
    for (const cell of cells) {
      drawTextBlock(x, cursorY, cell.width, cell.value, {
        fill: cell.fill,
        font: cell.font || regularFont,
        size: cell.size || defaultSize,
        minHeight: rowHeight,
        align: cell.align,
        textColor: cell.textColor
      });
      x += cell.width;
    }
    cursorY -= rowHeight;
  };

  const headerHeight = 78;
  const headerBottomY = pageHeight - 122;
  page.drawRectangle({
    x: left,
    y: headerBottomY,
    width: tableWidth,
    height: headerHeight,
    color: SUMMARY_COLORS.primary,
    borderColor: SUMMARY_COLORS.primary,
    borderWidth: 1
  });
  const bankName = String(note?.tenant?.brand_display_name || note?.tenant?.tenant_name || 'Bank').trim() || 'Bank';
  const branchLocationLine = buildBranchLocationLine(note);
  const branchAddressLine = buildBranchAddressLine(note);
  const logo = await loadTenantLogoForPdf(pdfDoc, note);
  const logoBoxSize = 42;
  const logoX = left + 16;
  const logoY = pageHeight - 94;
  let textStartX = left + 18;

  if (logo?.image) {
    const scale = Math.min(logoBoxSize / (logo.width || logoBoxSize), logoBoxSize / (logo.height || logoBoxSize));
    const drawWidth = (logo.width || logoBoxSize) * scale;
    const drawHeight = (logo.height || logoBoxSize) * scale;
    page.drawRectangle({
      x: logoX - 4,
      y: logoY - 6,
      width: logoBoxSize + 8,
      height: logoBoxSize + 8,
      color: rgb(1, 1, 1),
      borderColor: rgb(1, 1, 1),
      borderWidth: 1,
      opacity: 0.12
    });
    page.drawImage(logo.image, {
      x: logoX + ((logoBoxSize - drawWidth) / 2),
      y: logoY + ((logoBoxSize - drawHeight) / 2),
      width: drawWidth,
      height: drawHeight
    });
    textStartX = logoX + logoBoxSize + 18;
  }

  const headerTopY = headerBottomY + headerHeight;
  page.drawText(bankName, {
    x: textStartX,
    y: headerTopY - 26,
    size: 18,
    font: boldFont,
    color: rgb(1, 1, 1)
  });
  page.drawText(branchLocationLine, {
    x: textStartX,
    y: headerTopY - 42,
    size: 9.5,
    font: boldFont,
    color: SUMMARY_COLORS.headerTextSoft
  });
  page.drawText(branchAddressLine, {
    x: textStartX,
    y: headerTopY - 55,
    size: 8.5,
    font: regularFont,
    color: SUMMARY_COLORS.headerTextSoft
  });
  page.drawText('Approved Artifact Summary', {
    x: textStartX,
    y: headerTopY - 67,
    size: 10,
    font: regularFont,
    color: SUMMARY_COLORS.headerTextSoft
  });

  const approvedDateText = `Generated: ${formatTimestamp(note.approved_at)}`;
  const approvedDateWidth = regularFont.widthOfTextAtSize(approvedDateText, 9);
  page.drawText(approvedDateText, {
    x: left + tableWidth - approvedDateWidth - 18,
    y: headerTopY - 24,
    size: 9,
    font: regularFont,
    color: SUMMARY_COLORS.headerTextSoft
  });

  const noteRefText = formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || `#${note.id}`, '-', note.branch || null);
  const noteRefWidth = boldFont.widthOfTextAtSize(noteRefText, 11);
  page.drawText(noteRefText, {
    x: left + tableWidth - noteRefWidth - 18,
    y: headerTopY - 47,
    size: 11,
    font: boldFont,
    color: rgb(1, 1, 1)
  });

  cursorY = headerBottomY - 18;

  drawSectionTitle('NOTE DETAILS');
  drawRow([
    { width: 92, value: 'NOTE ID', fill: SUMMARY_COLORS.labelFill, font: boldFont, size: 10, minHeight: 28 },
    { width: 234, value: formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || `#${note.id}`, '-', note.branch || null), font: boldFont, size: 11, minHeight: 28 },
    { width: 92, value: 'STATUS', fill: SUMMARY_COLORS.labelFill, font: boldFont, size: 10, minHeight: 28 },
    {
      width: tableWidth - 418,
      value: 'APPROVED',
      font: boldFont,
      size: 10,
      minHeight: 28,
      fill: SUMMARY_COLORS.statusFill,
      align: 'center',
      textColor: SUMMARY_COLORS.statusText
    }
  ]);
  drawRow([
    { width: 92, value: 'SUBJECT', fill: SUMMARY_COLORS.labelFill, font: boldFont, size: 10, minHeight: 38 },
    { width: tableWidth - 92, value: note.subject || mainAttachment?.file_name || '-', font: regularFont, size: 11, minHeight: 38 }
  ]);
  drawRow([
    { width: 92, value: 'DOC REF', fill: SUMMARY_COLORS.labelFill, font: boldFont, size: 10, minHeight: 28 },
    { width: 234, value: mainAttachment?.file_name || formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || '-', '-', note.branch || null) || '-', font: regularFont, size: 10, minHeight: 28 },
    { width: 92, value: 'APPROVED ON', fill: SUMMARY_COLORS.labelFill, font: boldFont, size: 10, minHeight: 28 },
    { width: tableWidth - 418, value: formatTimestamp(note.approved_at), font: regularFont, size: 10, minHeight: 28 }
  ]);

  drawSectionTitle('COMMENT LOG');
  drawRow([
    { width: 52, value: 'Page#', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
    { width: 150, value: 'Doc Reference', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
    { width: 226, value: 'Comment', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
    { width: tableWidth - 428, value: 'Name', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 }
  ]);

  const commentRows = buildCommentRows(note, mainAttachment);
  if (commentRows.length === 0) {
    drawRow([{ width: tableWidth, value: 'No comments available.', minHeight: 26 }]);
  } else {
    for (const [index, row] of commentRows.entries()) {
      const fill = index % 2 === 0 ? rgb(1, 1, 1) : SUMMARY_COLORS.rowAlt;
      drawRow([
        { width: 52, value: row.page, minHeight: 24, fill, align: 'center', size: 9 },
        { width: 150, value: row.reference, minHeight: 24, fill, size: 9 },
        { width: 226, value: row.comment, minHeight: 24, fill, size: 9 },
        { width: tableWidth - 428, value: row.name, minHeight: 24, fill, size: 9 }
      ]);
    }
  }

  drawSectionTitle('AUDIT LOG');
  drawRow([
    { width: 130, value: 'Action', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
    { width: 182, value: 'Performed By', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
    { width: tableWidth - 312, value: 'Date & Time', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 }
  ]);
  const auditRows = buildWorkflowAuditSummaryRows(note);
  if (auditRows.length === 0) {
    drawRow([{ width: tableWidth, value: 'No audit entries available.', minHeight: 26 }]);
  } else {
    for (const [index, row] of auditRows.entries()) {
      const fill = index % 2 === 0 ? rgb(1, 1, 1) : SUMMARY_COLORS.rowAlt;
      drawRow([
        { width: 130, value: row.action, minHeight: 24, fill, font: boldFont, size: 9 },
        { width: 182, value: row.actor, minHeight: 24, fill, size: 9 },
        { width: tableWidth - 312, value: row.timestamp, minHeight: 24, fill, size: 9 }
      ]);
    }
  }

  const downloadTraceRows = buildDownloadTraceRows(note);
  if (downloadTraceRows.length > 0) {
    drawSectionTitle('COPY ACCESS TRACE');
    drawRow([
      { width: 160, value: 'Action', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
      { width: 210, value: 'Issued To', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 },
      { width: tableWidth - 370, value: 'Date & Time', fill: SUMMARY_COLORS.primarySoft, font: boldFont, minHeight: 22, size: 9 }
    ]);

    for (const [index, row] of downloadTraceRows.entries()) {
      const fill = index % 2 === 0 ? rgb(1, 1, 1) : SUMMARY_COLORS.rowAlt;
      drawRow([
        { width: 160, value: row.action, minHeight: 24, fill, font: boldFont, size: 9 },
        { width: 210, value: row.actor, minHeight: 24, fill, size: 9 },
        { width: tableWidth - 370, value: row.timestamp, minHeight: 24, fill, size: 9 }
      ]);
    }
  }

  page.drawLine({
    start: { x: left, y: 28 },
    end: { x: left + tableWidth, y: 28 },
    color: SUMMARY_COLORS.border,
    thickness: 1
  });
  page.drawText(`${bankName} confidential approval record`, {
    x: left,
    y: 16,
    size: 8,
    font: regularFont,
    color: SUMMARY_COLORS.muted
  });
  const footerText = `Prepared on ${formatTimestamp(new Date())}`;
  const footerWidth = regularFont.widthOfTextAtSize(footerText, 8);
  page.drawText(footerText, {
    x: left + tableWidth - footerWidth,
    y: 16,
    size: 8,
    font: regularFont,
    color: SUMMARY_COLORS.muted
  });

  return page;
};

const createPdfArtifact = async (sourcePath, targetPath, note, mainAttachment) => {
  const sourceBytes = await fs.readFile(sourcePath);
  const sourcePdf = await PDFDocument.load(sourceBytes);
  const approvedPdf = await PDFDocument.create();
  const boldFont = await approvedPdf.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await approvedPdf.embedFont(StandardFonts.Helvetica);

  await drawSummaryPage(approvedPdf, boldFont, regularFont, note, mainAttachment);

  const copiedPages = await approvedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
  for (const copiedPage of copiedPages) {
    approvedPdf.addPage(copiedPage);
    drawApprovalWatermark(copiedPage, boldFont, regularFont, note);
  }

  const approvedBytes = await approvedPdf.save();
  await fs.writeFile(targetPath, approvedBytes);
};

const createImageOverlay = (width, height, note) => {
  const diagonal = Math.sqrt((width ** 2) + (height ** 2));
  const mainText = 'Approved';
  const detailText = `DMS Approved ${formatPublicDocumentReference(note.document_group_key || note.document_code || note.note_id || '', '', note.branch || null)}`.trim();
  const mainSize = Math.max(82, Math.min(150, Math.round(diagonal * 0.105)));
  const detailSize = Math.max(18, Math.round(mainSize * 0.26));

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <g transform="translate(${width * 0.56}, ${height * 0.6}) rotate(-29)">
        <text
          x="0"
          y="0"
          text-anchor="middle"
          fill="rgba(184, 46, 46, 0.18)"
          font-size="${mainSize}"
          font-family="Arial, Helvetica, sans-serif"
          font-weight="700"
        >${mainText}</text>
        <text
          x="0"
          y="${mainSize * 0.34}"
          text-anchor="middle"
          fill="rgba(184, 46, 46, 0.14)"
          font-size="${detailSize}"
          font-family="Arial, Helvetica, sans-serif"
          font-weight="500"
        >${detailText}</text>
      </g>
    </svg>
  `);
};

const createImageArtifact = async (sourcePath, targetPath, note) => {
  const image = sharp(sourcePath, { animated: true });
  const metadata = await image.metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 1600;
  const overlay = createImageOverlay(width, height, note);
  const extension = path.extname(targetPath).toLowerCase();

  let pipeline = sharp(sourcePath, { animated: true }).composite([{ input: overlay, top: 0, left: 0 }]);

  if (extension === '.jpg' || extension === '.jpeg') pipeline = pipeline.jpeg({ quality: 92 });
  if (extension === '.png') pipeline = pipeline.png();
  if (extension === '.webp') pipeline = pipeline.webp({ quality: 92 });
  if (extension === '.gif') pipeline = pipeline.gif();
  if (extension === '.tif' || extension === '.tiff') pipeline = pipeline.tiff();

  await pipeline.toFile(targetPath);
};

const escapeSvgText = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildControlledWatermarkLines = (_note, downloadContext = {}) => [
  downloadContext.title || 'APPROVED COPY',
  downloadContext.downloadedAt ? `Downloaded On ${downloadContext.downloadedAt}` : null
].filter(Boolean);

const resolveControlledWatermarkPalette = (downloadContext = {}) => {
  if (downloadContext.watermarkVariant === 'approved') {
    return {
      pdfColor: rgb(0.72, 0.19, 0.19),
      pdfHeadlineOpacities: [0.11, 0.16, 0.11],
      pdfDetailOpacities: [0.09, 0.13, 0.09],
      imageHeadlineOpacities: [0.14, 0.2, 0.14],
      imageDetailOpacities: [0.11, 0.16, 0.11],
      imageRgb: '184, 46, 46'
    };
  }

  return {
    pdfColor: rgb(0.48, 0.55, 0.63),
    pdfHeadlineOpacities: [0.055, 0.095, 0.055],
    pdfDetailOpacities: [0.05, 0.09, 0.05],
    imageHeadlineOpacities: [0.08, 0.12, 0.08],
    imageDetailOpacities: [0.07, 0.1, 0.07],
    imageRgb: '97, 111, 127'
  };
};

const drawControlledPdfWatermark = (page, boldFont, regularFont, note, downloadContext) => {
  const { width, height } = page.getSize();
  const lines = buildControlledWatermarkLines(note, downloadContext);
  if (lines.length === 0) {
    return;
  }

  const palette = resolveControlledWatermarkPalette(downloadContext);
  const angle = degrees(-31);
  const diagonal = Math.sqrt((width ** 2) + (height ** 2));
  const headlineSize = Math.max(28, Math.min(54, diagonal * 0.05));
  const detailSize = Math.max(10, Math.min(18, headlineSize * 0.34));
  const headline = lines[0];
  const anchorPoints = [
    {
      x: width * 0.28,
      y: height * 0.3,
      headlineOpacity: palette.pdfHeadlineOpacities[0],
      detailOpacity: palette.pdfDetailOpacities[0]
    },
    {
      x: width * 0.52,
      y: height * 0.56,
      headlineOpacity: palette.pdfHeadlineOpacities[1],
      detailOpacity: palette.pdfDetailOpacities[1]
    },
    {
      x: width * 0.76,
      y: height * 0.82,
      headlineOpacity: palette.pdfHeadlineOpacities[2],
      detailOpacity: palette.pdfDetailOpacities[2]
    }
  ];

  for (const anchor of anchorPoints) {
    const headlineWidth = boldFont.widthOfTextAtSize(headline, headlineSize);
    page.drawText(headline, {
      x: anchor.x - (headlineWidth / 2),
      y: anchor.y,
      size: headlineSize,
      font: boldFont,
      color: palette.pdfColor,
      opacity: anchor.headlineOpacity,
      rotate: angle
    });

    for (const [index, line] of lines.slice(1).entries()) {
      const lineWidth = regularFont.widthOfTextAtSize(line, detailSize);
      page.drawText(line, {
        x: anchor.x - (lineWidth / 2),
        y: anchor.y - ((index + 1) * (detailSize + 8)) - 8,
        size: detailSize,
        font: regularFont,
        color: palette.pdfColor,
        opacity: anchor.detailOpacity,
        rotate: angle
      });
    }
  }
};

const createControlledImageOverlay = (width, height, note, downloadContext) => {
  const lines = buildControlledWatermarkLines(note, downloadContext);
  const headline = escapeSvgText(lines[0] || 'Controlled Copy');
  const detailLines = lines.slice(1, 4).map((line) => escapeSvgText(line));
  const diagonal = Math.sqrt((width ** 2) + (height ** 2));
  const headlineSize = Math.max(54, Math.min(104, Math.round(diagonal * 0.065)));
  const detailSize = Math.max(18, Math.round(headlineSize * 0.25));
  const palette = resolveControlledWatermarkPalette(downloadContext);
  const groups = [
    {
      x: width * 0.28,
      y: height * 0.34,
      headlineOpacity: palette.imageHeadlineOpacities[0],
      detailOpacity: palette.imageDetailOpacities[0]
    },
    {
      x: width * 0.52,
      y: height * 0.58,
      headlineOpacity: palette.imageHeadlineOpacities[1],
      detailOpacity: palette.imageDetailOpacities[1]
    },
    {
      x: width * 0.76,
      y: height * 0.82,
      headlineOpacity: palette.imageHeadlineOpacities[2],
      detailOpacity: palette.imageDetailOpacities[2]
    }
  ];

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      ${groups.map((group) => `
        <g transform="translate(${group.x}, ${group.y}) rotate(-31)">
          <text
            x="0"
            y="0"
            text-anchor="middle"
            fill="rgba(${palette.imageRgb}, ${group.headlineOpacity})"
            font-size="${headlineSize}"
            font-family="Arial, Helvetica, sans-serif"
            font-weight="700"
          >${headline}</text>
          ${detailLines.map((line, index) => `
            <text
              x="0"
              y="${(index + 1) * (detailSize + 16)}"
              text-anchor="middle"
              fill="rgba(${palette.imageRgb}, ${group.detailOpacity})"
              font-size="${detailSize}"
              font-family="Arial, Helvetica, sans-serif"
              font-weight="500"
            >${line}</text>
          `).join('')}
        </g>
      `).join('')}
    </svg>
  `);
};

class ApprovedFileService {
  async createApprovedArtifact(note, mainAttachment) {
    if (!mainAttachment?.file_path) {
      return null;
    }

    await ensureUploadsDir();

    const sourcePath = resolveFilePath(mainAttachment.file_path);
    const approvedFileName = getApprovedFileName(mainAttachment.file_name, note.version_number || note.id);
    const approvedRelativePath = buildVersionFileStoredRelativePath({
      documentGroupKey: note.document_group_key || note.note_id || `note-${note.id}`,
      versionNumber: note.version_number || 1,
      bucket: 'approved',
      fileName: approvedFileName,
      fallbackBase: 'approved-artifact'
    });
    const targetPath = await ensureStoredParentDir(approvedRelativePath);
    const extension = path.extname(mainAttachment.file_name || '').toLowerCase();

    if (extension === '.pdf') {
      await createPdfArtifact(sourcePath, targetPath, note, mainAttachment);
    } else if (IMAGE_EXTENSIONS.has(extension)) {
      await createImageArtifact(sourcePath, targetPath, note);
    } else {
      return null;
    }

    return {
      approved_file_name: approvedFileName,
      approved_file_path: approvedRelativePath,
      approved_file_mime: MIME_BY_EXTENSION[extension] || null
    };
  }

  async createControlledDownloadBuffer({ storedPath, note, downloadContext = {} }) {
    const sourcePath = resolveFilePath(storedPath);
    const extension = path.extname(storedPath || '').toLowerCase();

    if (extension === '.pdf') {
      const sourceBytes = await fs.readFile(sourcePath);
      const sourcePdf = await PDFDocument.load(sourceBytes);
      const stampedPdf = await PDFDocument.create();
      const boldFont = await stampedPdf.embedFont(StandardFonts.HelveticaBold);
      const regularFont = await stampedPdf.embedFont(StandardFonts.Helvetica);
      const copiedPages = await stampedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

      for (const copiedPage of copiedPages) {
        stampedPdf.addPage(copiedPage);
        drawControlledPdfWatermark(copiedPage, boldFont, regularFont, note, downloadContext);
      }

      const buffer = Buffer.from(await stampedPdf.save());
      return {
        buffer,
        contentType: MIME_BY_EXTENSION[extension] || 'application/pdf'
      };
    }

    if (IMAGE_EXTENSIONS.has(extension)) {
      const metadata = await sharp(sourcePath, { animated: true }).metadata();
      const width = metadata.width || 1200;
      const height = metadata.height || 1600;
      const overlay = createControlledImageOverlay(width, height, note, downloadContext);
      let pipeline = sharp(sourcePath, { animated: true }).composite([{ input: overlay, top: 0, left: 0 }]);

      if (extension === '.jpg' || extension === '.jpeg') pipeline = pipeline.jpeg({ quality: 92 });
      if (extension === '.png') pipeline = pipeline.png();
      if (extension === '.webp') pipeline = pipeline.webp({ quality: 92 });
      if (extension === '.gif') pipeline = pipeline.gif();
      if (extension === '.tif' || extension === '.tiff') pipeline = pipeline.tiff();

      return {
        buffer: await pipeline.toBuffer(),
        contentType: MIME_BY_EXTENSION[extension] || 'application/octet-stream'
      };
    }

    return null;
  }
}

export default new ApprovedFileService();
