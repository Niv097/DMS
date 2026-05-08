import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../utils/api';
import { applyBrandingToDocument, getDefaultBranding, getOwnerBranding, normalizeBrandingPayload } from '../utils/branding';

const BrandingContext = createContext({
  branding: normalizeBrandingPayload(getDefaultBranding()),
  loading: true,
  reloadBranding: async () => {}
});

const BRANDING_QUERY_KEYS = ['bank', 'tenant_code', 'tenantCode', 'brand'];
const BRANDING_SESSION_KEY = 'dms-branding-bank-code';

const getUrlBrandingCode = () => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search || '');
  for (const key of BRANDING_QUERY_KEYS) {
    const value = String(params.get(key) || '').trim().toUpperCase();
    if (value) return value;
  }
  return '';
};

const getStoredBrandingCode = () => {
  if (typeof window === 'undefined') return '';
  return String(window.sessionStorage.getItem(BRANDING_SESSION_KEY) || '').trim().toUpperCase();
};

const isLoginBrandingPreviewRoute = (code = '') => {
  if (typeof window === 'undefined') return false;
  const pathname = String(window.location.pathname || '');
  return pathname.startsWith('/login') && Boolean(String(code || '').trim());
};

const persistBrandingCode = (code = '') => {
  if (typeof window === 'undefined') return;
  const normalized = String(code || '').trim().toUpperCase();
  if (normalized) {
    window.sessionStorage.setItem(BRANDING_SESSION_KEY, normalized);
  } else {
    window.sessionStorage.removeItem(BRANDING_SESSION_KEY);
  }
};

export const BrandingProvider = ({ children }) => {
  const [branding, setBranding] = useState(normalizeBrandingPayload(getDefaultBranding()));
  const [loading, setLoading] = useState(true);

  const loadBranding = async (override = null) => {
    try {
      const overrideTenantId = typeof override === 'number'
        ? override
        : (override && typeof override === 'object' ? override.tenantId || null : null);
      const overrideTenantCode = override && typeof override === 'object'
        ? String(override.tenantCode || '').trim().toUpperCase()
        : '';
      const queryTenantCode = getUrlBrandingCode();
      const storedTenantCode = getStoredBrandingCode();
      const previewTenantCode = overrideTenantCode || queryTenantCode || storedTenantCode;
      const isLoginPreview = isLoginBrandingPreviewRoute(overrideTenantCode || queryTenantCode);

      let storedUser = null;
      try {
        storedUser = JSON.parse(localStorage.getItem('user') || 'null');
      } catch {
        storedUser = null;
      }

      if (storedUser?.role === 'SUPER_ADMIN' && !isLoginPreview) {
        setBranding(normalizeBrandingPayload(getOwnerBranding()));
        setLoading(false);
        return;
      }
      const tenantId = isLoginPreview
        ? (overrideTenantId || null)
        : (overrideTenantId || storedUser?.tenant_id || null);
      const tenantCode = tenantId && !isLoginPreview ? '' : previewTenantCode;

      if (tenantCode) {
        persistBrandingCode(tenantCode);
      }

      const response = await api.get('/branding', {
        params: tenantId ? { tenant_id: tenantId } : (tenantCode ? { tenant_code: tenantCode } : undefined)
      });
      setBranding(normalizeBrandingPayload(response.data || {}));
    } catch {
      setBranding(normalizeBrandingPayload(getDefaultBranding()));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranding();

    const handleAuthStateChanged = (event) => {
      setLoading(true);
      loadBranding({
        tenantId: event?.detail?.tenantId || null,
        tenantCode: event?.detail?.tenantCode || ''
      });
    };

    window.addEventListener('dms-auth-state-changed', handleAuthStateChanged);
    return () => window.removeEventListener('dms-auth-state-changed', handleAuthStateChanged);
  }, []);

  useEffect(() => {
    applyBrandingToDocument(branding);
  }, [branding]);

  return (
    <BrandingContext.Provider value={{ branding, loading, reloadBranding: loadBranding }}>
      {children}
    </BrandingContext.Provider>
  );
};

export const useBranding = () => useContext(BrandingContext);
