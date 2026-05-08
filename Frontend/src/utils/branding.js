export const getBrandMark = (brandName = 'DMS', shortCode = '') => {
  const preferred = String(shortCode || '').trim().toUpperCase();
  if (preferred) {
    return preferred.slice(0, 2);
  }

  const words = String(brandName || 'DMS')
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Za-z0-9]/g, ''))
    .filter(Boolean);

  if (words.length === 0) return 'D';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return words.slice(0, 2).map((word) => word[0].toUpperCase()).join('');
};

export const getDefaultBranding = () => ({
  brandName: 'DMS',
  shortCode: 'DMS',
  subtitle: 'Document Management System',
  logoUrl: '',
  watermarkText: 'LUMIEN INNOVATIVE VENTURES Pvt Ltd'
});

export const getOwnerBranding = () => ({
  brandName: 'Lumien',
  shortCode: 'LI',
  subtitle: 'Banking DMS Control',
  logoUrl: '',
  watermarkText: 'LUMIEN INNOVATIVE VENTURES Pvt Ltd'
});

export const buildBrandingTitle = (branding = {}) => {
  const brandName = String(branding.brandName || branding.brand_name || 'DMS').trim() || 'DMS';
  const subtitle = String(branding.subtitle || 'Document Management System').trim();
  return subtitle ? `${brandName} - ${subtitle}` : brandName;
};

export const buildFallbackFaviconDataUrl = (branding = {}) => {
  const brandMark = getBrandMark(branding.brandName || branding.brand_name, branding.shortCode || branding.short_code);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#123764" />
      <text x="32" y="38" text-anchor="middle" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#ffffff">${brandMark}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

export const applyBrandingToDocument = (branding = {}) => {
  if (typeof document === 'undefined') return;

  document.title = buildBrandingTitle(branding);

  const nextIconHref = String(branding.logoUrl || branding.logo_url || '').trim() || buildFallbackFaviconDataUrl(branding);
  let iconLink = document.querySelector('link[rel="icon"]');

  if (!iconLink) {
    iconLink = document.createElement('link');
    iconLink.setAttribute('rel', 'icon');
    document.head.appendChild(iconLink);
  }

  iconLink.setAttribute('href', nextIconHref);
};

export const normalizeBrandingPayload = (payload = {}) => {
  const defaults = getDefaultBranding();
  const brandName = String(payload.brand_name || payload.brandName || defaults.brandName).trim() || defaults.brandName;
  const shortCode = String(payload.short_code || payload.shortCode || defaults.shortCode).trim().toUpperCase() || defaults.shortCode;
  const subtitle = String(payload.subtitle || defaults.subtitle).trim() || defaults.subtitle;
  const logoUrl = String(payload.logo_url || payload.logoUrl || '').trim();
  const watermarkText = String(payload.watermark_text || payload.watermarkText || defaults.watermarkText).trim() || defaults.watermarkText;

  return {
    brandName,
    shortCode,
    subtitle,
    logoUrl,
    watermarkText,
    brandMark: getBrandMark(brandName, shortCode)
  };
};
