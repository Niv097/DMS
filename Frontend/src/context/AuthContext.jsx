import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);
const SESSION_TIMEOUT_MESSAGE_KEY = 'auth_message';
const inactivityTimeoutMs = Number.parseInt(import.meta.env.VITE_SESSION_INACTIVITY_TIMEOUT_MS || '1800000', 10);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [authContext, setAuthContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const inactivityTimerRef = useRef(null);

  const applyAuthState = useCallback((liveUser, nextAuthContext = null, fallbackMustChangePassword = false) => {
    if (!liveUser) {
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('dms-auth-state-changed', { detail: { tenantId: null } }));
      setUser(null);
      setMustChangePassword(false);
      setAuthContext(null);
      return;
    }

    localStorage.setItem('user', JSON.stringify(liveUser));
    window.dispatchEvent(new CustomEvent('dms-auth-state-changed', { detail: { tenantId: liveUser.tenant_id || null } }));
    setUser(liveUser);
    setAuthContext(nextAuthContext || null);
    setMustChangePassword(Boolean(
      liveUser.must_change_password
      || liveUser.is_first_login
      || nextAuthContext?.passwordChangeRequired
      || fallbackMustChangePassword
    ));
  }, []);

  const clearClientAuth = useCallback(() => {
    applyAuthState(null);
  }, [applyAuthState]);

  const logout = useCallback((options = {}) => {
    const { reason } = options;
    api.post('/auth/logout', { reason: reason || 'manual' }).catch(() => {});
    if (reason === 'inactivity') {
      sessionStorage.setItem(SESSION_TIMEOUT_MESSAGE_KEY, 'Session ended due to inactivity. Please sign in again.');
    }
    clearClientAuth();
  }, [clearClientAuth]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const response = await api.get('/auth/me');
        const liveUser = response.data?.user || null;
        if (liveUser) {
          applyAuthState(liveUser, response.data?.authContext || null);
        }
      } catch {
        if (localStorage.getItem('user')) {
          clearClientAuth();
        }
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [applyAuthState, clearClientAuth]);

  useEffect(() => {
    const interceptorId = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const message = String(error?.response?.data?.error || '');
        const hasClientSession = Boolean(localStorage.getItem('user'));

        if (status === 403 && error?.response?.data?.code === 'PASSWORD_CHANGE_REQUIRED') {
          setMustChangePassword(true);
        }

        if (status === 401 && hasClientSession) {
          if (message === 'Session timed out due to inactivity.') {
            sessionStorage.setItem(SESSION_TIMEOUT_MESSAGE_KEY, 'Session ended due to inactivity. Please sign in again.');
            clearClientAuth();
          } else if (message === 'Invalid or expired session.') {
            clearClientAuth();
          }
        }

        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.response.eject(interceptorId);
    };
  }, [clearClientAuth]);

  const login = (userData, options = {}) => {
    applyAuthState(
      userData,
      options.authContext || null,
      Boolean(options.requirePasswordChange || options.passwordChangeRequired)
    );
  };

  const refreshProfile = useCallback(async () => {
    const response = await api.get('/auth/me');
    const liveUser = response.data?.user || null;
    if (liveUser) {
      applyAuthState(liveUser, response.data?.authContext || null);
    }
    return liveUser;
  }, [applyAuthState]);

  const updateProfile = useCallback(async (payload) => {
    const response = await api.put('/auth/me', payload);
    const liveUser = response.data?.user || null;
    if (liveUser) {
      applyAuthState(liveUser, response.data?.authContext || null);
    }
    return liveUser;
  }, [applyAuthState]);

  const changePassword = useCallback(async (payload) => {
    const response = await api.post('/auth/change-password', payload);
    const liveUser = response.data?.user || null;
    if (liveUser) {
      applyAuthState(liveUser, response.data?.authContext || null);
    }
    return response.data;
  }, [applyAuthState]);

  useEffect(() => {
    if (!user) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return undefined;
    }

    const resetInactivityTimer = () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      inactivityTimerRef.current = setTimeout(() => {
        logout({ reason: 'inactivity' });
      }, inactivityTimeoutMs);
    };

    const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    activityEvents.forEach((eventName) => window.addEventListener(eventName, resetInactivityTimer, true));
    document.addEventListener('visibilitychange', resetInactivityTimer);
    resetInactivityTimer();

    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, resetInactivityTimer, true));
      document.removeEventListener('visibilitychange', resetInactivityTimer);
    };
  }, [logout, user]);

  useEffect(() => {
    if (!user) return undefined;

    let disposed = false;
    let refreshInFlight = false;
    let lastRefreshAt = 0;

    const refreshWindowMs = 90 * 1000;
    const refreshIfNeeded = async (force = false) => {
      if (disposed || refreshInFlight) return;
      const now = Date.now();
      if (!force && now - lastRefreshAt < refreshWindowMs) return;

      refreshInFlight = true;
      try {
        const response = await api.get('/auth/me');
        const liveUser = response.data?.user || null;
        if (!disposed && liveUser) {
          applyAuthState(liveUser, response.data?.authContext || null);
          lastRefreshAt = Date.now();
        }
      } catch {
        // Keep current client auth state until a normal 401/logout path clears it.
      } finally {
        refreshInFlight = false;
      }
    };

    const handleWindowFocus = () => {
      refreshIfNeeded(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshIfNeeded(false);
      }
    };

    const interval = setInterval(() => {
      refreshIfNeeded(false);
    }, refreshWindowMs);

    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [applyAuthState, user]);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, refreshProfile, updateProfile, changePassword, mustChangePassword, authContext }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
