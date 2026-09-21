/**
 * PET authentication & authorization middleware.
 *
 * Every protected /api request must pass the full chain:
 *   verify JWT → verify live server-side session → load user from SQLite →
 *   verify ACTIVE status → attach resolved role.
 *
 * Role/permission checks then happen in requirePetAuth (authentication) and
 * requireMainAdmin / service-level ownership checks (authorization).
 * Role or user IDs supplied by the browser are never trusted.
 */

import { getPetDb } from './db.js';
import { verifyPetAccessToken, isPetSessionUsable, getPetSession } from './tokens.js';
import { ApiError } from '../lib/respond.js';

/**
 * Require an authenticated PET user (Main Admin or Employee).
 * Attaches req.petAuth = { user, session, claims }.
 */
export function requirePetAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');

    const claims = verifyPetAccessToken(token);
    if (!claims) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired access token.');
    }

    const session = getPetSession(claims.sid);
    if (!isPetSessionUsable(session) || session.subject_id !== claims.sub) {
      throw new ApiError(401, 'SESSION_EXPIRED', 'Session expired. Please sign in again.');
    }

    const user = getPetDb().prepare('SELECT * FROM users WHERE id = ?').get(claims.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new ApiError(401, 'ACCOUNT_DISABLED', 'This account is no longer active.');
    }

    req.petAuth = { user, session, claims };
    next();
  } catch (err) {
    next(err);
  }
}

/** Require the Main Admin role (organization-wide access). */
export function requireMainAdmin(req, _res, next) {
  try {
    if (!req.petAuth?.user) throw new ApiError(401, 'UNAUTHORIZED', 'Authentication required.');
    if (req.petAuth.user.role !== 'main_admin') {
      throw new ApiError(403, 'FORBIDDEN', 'Main Admin access required.');
    }
    next();
  } catch (err) {
    next(err);
  }
}
