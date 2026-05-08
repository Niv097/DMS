const normalizeBranchNameToken = (value = '') => {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean)
    .join('');
};

const normalizeBranchCodeToken = (value = '') => {
  return String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
};

const resolveBranchReferenceSegment = (branchContext = null, fallbackSegment = '') => {
  const branchName = normalizeBranchNameToken(
    branchContext?.branch_name ||
    branchContext?.branchName ||
    branchContext?.name ||
    ''
  );
  const branchCode = normalizeBranchCodeToken(
    branchContext?.branch_code ||
    branchContext?.branchCode ||
    branchContext?.code ||
    ''
  );

  if (branchName && branchCode) {
    return `${branchName}-${branchCode}`;
  }

  if (branchName) return branchName;
  if (branchCode) return branchCode;
  return String(fallbackSegment || '').trim();
};

const parseLegacyReference = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;

  const modernMatch = /^DMS-([^/]+)\/(\d{4})\/([^/]+)$/i.exec(normalized);
  if (modernMatch) {
    return { branchSegment: modernMatch[1], year: modernMatch[2], serial: modernMatch[3] };
  }

  const dmsMatch = /^DMS\/([^/]+)\/(\d{4})\/([^/]+)$/i.exec(normalized);
  if (dmsMatch) {
    return { branchSegment: dmsMatch[1], year: dmsMatch[2], serial: dmsMatch[3] };
  }

  const docWithTenantMatch = /^DOC\/[^/]+\/([^/]+)\/(\d{4})\/([^/]+)$/i.exec(normalized);
  if (docWithTenantMatch) {
    return { branchSegment: docWithTenantMatch[1], year: docWithTenantMatch[2], serial: docWithTenantMatch[3] };
  }

  const docWithoutTenantMatch = /^DOC\/([^/]+)\/(\d{4})\/([^/]+)$/i.exec(normalized);
  if (docWithoutTenantMatch) {
    return { branchSegment: docWithoutTenantMatch[1], year: docWithoutTenantMatch[2], serial: docWithoutTenantMatch[3] };
  }

  return null;
};

export const toPublicDocumentReference = (value, fallback = '-', branchContext = null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;

  const parsed = parseLegacyReference(normalized);
  if (parsed) {
    const branchSegment = resolveBranchReferenceSegment(branchContext, parsed.branchSegment);
    return branchSegment
      ? `DMS-${branchSegment}/${parsed.year}/${parsed.serial}`
      : `DMS/${parsed.year}/${parsed.serial}`;
  }

  if (/^DMS\//i.test(normalized) || /^DMS-/i.test(normalized)) {
    return normalized;
  }

  return normalized || fallback;
};
