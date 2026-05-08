import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  authCookieName,
  csrfCookieName,
  getCookieOptions,
  jwtExpiresIn,
  requiredJwtSecret
} from '../config/env.js';

const cookiePattern = /;\s*/;

export const parseCookies = (cookieHeader = '') => Object.fromEntries(
  String(cookieHeader || '')
    .split(cookiePattern)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const separatorIndex = chunk.indexOf('=');
      if (separatorIndex === -1) return [chunk, ''];
      return [
        decodeURIComponent(chunk.slice(0, separatorIndex)),
        decodeURIComponent(chunk.slice(separatorIndex + 1))
      ];
    })
);

export const extractTokenFromRequest = (req) => {
  const authHeader = String(req.headers.authorization || '');
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  const cookies = parseCookies(req.headers.cookie);
  return String(cookies[authCookieName] || '').trim();
};

export const signAuthToken = (payload) => jwt.sign(payload, requiredJwtSecret, { expiresIn: jwtExpiresIn });

export const verifyAuthToken = (token) => jwt.verify(token, requiredJwtSecret);

export const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

export const getCsrfCookieOptions = () => ({
  ...getCookieOptions(),
  httpOnly: false,
  sameSite: getCookieOptions().sameSite
});

export const setCsrfCookie = (res, token = generateCsrfToken()) => {
  res.cookie(csrfCookieName, token, getCsrfCookieOptions());
  return token;
};

export const ensureCsrfCookie = (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const existingToken = String(cookies[csrfCookieName] || '').trim();
  if (existingToken) return existingToken;
  return setCsrfCookie(res);
};

export const refreshCsrfCookie = (res) => setCsrfCookie(res);

export const clearCsrfCookie = (res) => {
  res.clearCookie(csrfCookieName, {
    ...getCsrfCookieOptions(),
    maxAge: undefined
  });
};

export const extractCsrfTokenFromRequest = (req) => String(req.headers['x-csrf-token'] || '').trim();

export const setAuthCookie = (res, token) => {
  res.cookie(authCookieName, token, getCookieOptions());
};

export const clearAuthCookie = (res) => {
  res.clearCookie(authCookieName, {
    ...getCookieOptions(),
    maxAge: undefined
  });
};
