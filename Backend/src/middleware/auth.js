import dotenv from 'dotenv';
import prisma from '../utils/prisma.js';
import {
  clearAuthCookie,
  extractCsrfTokenFromRequest,
  extractTokenFromRequest,
  parseCookies,
  verifyAuthToken
} from '../utils/authToken.js';
import logger from '../utils/logger.js';
import { touchAuthenticatedSession } from '../utils/sessionStore.js';
import { csrfCookieName } from '../config/env.js';
import { writeSecurityAudit } from '../utils/securityAudit.js';
import { getUserOwnedFmsDepartmentId, hasGrantedFmsAccess } from '../services/fmsService.js';

dotenv.config();

const isSchemaCompatibilityError = (error) => {
  const message = String(error?.message || '');
  return message.includes('Unknown argument `tenant`')
    || message.includes('Unknown argument `branch`')
    || message.includes('Unknown argument `branch_accesses`')
    || message.includes('Unknown field `tenant`')
    || message.includes('Unknown field `branch`')
    || message.includes('Unknown field `branch_accesses`')
    || message.includes('Unknown argument `is_active`')
    || message.includes('Unknown argument `is_first_login`')
    || message.includes('Unknown field `is_active`')
    || message.includes('Unknown field `is_first_login`')
    || message.includes('does not exist in the current database')
    || message.includes('Branch.city_id');
};

const isOtpRecoverySession = (session) => session?.assuranceLevel === 'otp_fallback';

const authMiddleware = async (req, res, next) => {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = verifyAuthToken(token);
    if (decoded?.sid) {
      const sessionState = await touchAuthenticatedSession(decoded.sid);
      if (!sessionState.valid) {
        clearAuthCookie(res);
        if (sessionState.reason === 'SESSION_IDLE_TIMEOUT') {
          writeSecurityAudit('SESSION_IDLE_TIMEOUT', {
            user_id: decoded?.id,
            role: decoded?.role,
            tenant_id: decoded?.tenant_id,
            branch_id: decoded?.branch_id,
            sid: decoded?.sid,
            ip: req.ip
          });
          return res.status(401).json({ error: 'Session timed out due to inactivity.' });
        }
        return res.status(401).json({ error: 'Invalid or expired session.' });
      }
      req.authSession = sessionState.session;
    } else {
      clearAuthCookie(res);
      return res.status(401).json({ error: 'Invalid or expired session.' });
    }

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          role: true,
          tenant: {
            select: {
              id: true,
              tenant_name: true,
              tenant_code: true
            }
          },
          branch: {
            select: {
              id: true,
              branch_name: true,
              branch_code: true,
              branch_address: true,
              city: {
                select: {
                  city_name: true,
                  state_name: true
                }
              },
              tenant_id: true
            }
          },
          department: true,
          vertical: true,
          branch_accesses: {
            include: {
              branch: {
                select: {
                  id: true,
                  branch_name: true,
                  branch_code: true,
                  branch_address: true,
                  tenant_id: true
                }
              }
            }
          }
        }
      });
    } catch (error) {
      if (!isSchemaCompatibilityError(error)) throw error;
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: {
          role: true,
          department: true,
          vertical: true
        }
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    if ((user.is_active ?? true) === false) {
      return res.status(403).json({ error: 'Your account is inactive. Please contact an administrator.' });
    }

    let resetState = {
      must_change_password: user.must_change_password ?? user.is_first_login ?? false
    };
    try {
      const rows = await prisma.$queryRaw`
        SELECT "must_change_password"
        FROM "User"
        WHERE "id" = ${user.id}
      `;
      resetState = {
        must_change_password: rows[0]?.must_change_password ?? resetState.must_change_password
      };
    } catch {
      // Backward-compatible with databases not yet migrated.
    }

    const hasGrantedScope = await hasGrantedFmsAccess({
      ...user,
      tenant_id: user.tenant_id ?? null,
      branch_id: user.branch_id ?? null,
      branch: user.branch ?? null,
      branch_accesses: user.branch_accesses ?? [],
      accessible_branch_ids: user.accessible_branch_ids ?? [],
      department_id: user.department_id ?? user.department?.id ?? null,
      fms_enabled: user.fms_enabled ?? false,
      fms_permissions: user.fms_permissions ?? []
    }).catch(() => false);

    req.user = {
      ...user,
      tenant_id: user.tenant_id ?? null,
      branch_id: user.branch_id ?? null,
      tenant: user.tenant ?? null,
      branch: user.branch ?? null,
      branch_accesses: user.branch_accesses ?? [],
      accessible_branch_ids: user.accessible_branch_ids ?? [],
      is_first_login: user.is_first_login ?? false,
      must_change_password: resetState.must_change_password,
      is_active: user.is_active ?? true,
      fms_enabled: user.fms_enabled ?? false,
      fms_permissions: user.fms_permissions ?? [],
      fms_owned_department_id: getUserOwnedFmsDepartmentId(user),
      has_granted_fms_access: hasGrantedScope
    };

    const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const usesCookieAuth = Boolean(parseCookies(req.headers.cookie)[csrfCookieName]);
    if (unsafeMethods.has(req.method) && usesCookieAuth) {
      const csrfHeaderToken = extractCsrfTokenFromRequest(req);
      const csrfCookieToken = String(parseCookies(req.headers.cookie)[csrfCookieName] || '').trim();
      if (!csrfHeaderToken || !csrfCookieToken || csrfHeaderToken !== csrfCookieToken) {
        return res.status(403).json({
          error: 'CSRF validation failed. Refresh the page and try again.'
        });
      }
    }

    const passwordChangeAllowedPaths = ['/change-password', '/logout', '/me', '/api/auth/change-password', '/api/auth/logout', '/api/auth/me'];
    const passwordChangeRequired = Boolean(req.user.must_change_password || req.user.is_first_login || isOtpRecoverySession(req.authSession));
    if (passwordChangeRequired && !passwordChangeAllowedPaths.includes(req.path) && !passwordChangeAllowedPaths.includes(req.originalUrl)) {
      return res.status(403).json({
        error: 'Password change required before accessing the system.',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }

    next();
  } catch (error) {
    clearAuthCookie(res);
    logger.warn('Authentication rejected', {
      path: req.originalUrl,
      method: req.method,
      reason: error.message
    });
    res.status(401).json({ error: 'Invalid or expired session.' });
  }
};

export default authMiddleware;
