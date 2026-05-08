import axios from 'axios';

export const resolvedBaseUrl = import.meta.env.DEV
  ? (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5002/api')
  : '/api';

export const resolvedNotificationStreamUrl = import.meta.env.DEV
  ? `${resolvedBaseUrl.replace(/\/api$/, '')}/api/notifications/stream`
  : '/api/notifications/stream';

const readCookie = (name) => {
  if (typeof document === 'undefined') return '';
  const escaped = name.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
  const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
};

const api = axios.create({
  baseURL: resolvedBaseUrl,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const csrfToken = readCookie('dms_csrf');
  if (csrfToken) {
    config.headers = config.headers || {};
    config.headers['x-csrf-token'] = csrfToken;
  }
  return config;
});

export default api;
