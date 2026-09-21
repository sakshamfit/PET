/**
 * PET authentication routes: login / refresh / logout / change password.
 *
 * Mirrors the control-plane auth security stance:
 *  - uniform login errors (never reveal account existence)
 *  - rate limiting + per-account lockout
 *  - disabled accounts rejected, sessions created only after verification
 *  - rotating refresh tokens with replay detection
 *  - password changes revoke every session
 */

import { Router } from 'express';
import config from '../../config.js';
import { getPetDb } from '../db.js';
import { verifyPassword, hashPassword } from '../../lib/crypto.js';
import { ok, errors, ApiError } from '../../lib/respond.js';
import { vString, vEmail, assertAllowedKeys } from '../../lib/validate.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { clientIp } from '../../middleware/auth.js';
import { loginLimiter, refreshLimiter } from '../../middleware/ratelimits.js';
import { isLockedOut, recordFailure, recordSuccess, lockoutRemainingSeconds } from '../../lib/lockout.js';
import {
  createPetSession, signPetAccessToken, rotatePetRefreshToken,
  revokePetSession, PetTokenError,
} from '../tokens.js';
import { requirePetAuth } from '../auth.js';
import { publicUser } from '../services/common.js';
import { changeOwnPassword } from '../services/employees.js';

const router = Router();

function sessionPayload(user, sessionId, refreshToken) {
  return {
    access_token: signPetAccessToken({ sessionId, subjectId: user.id, role: user.role }),
    token_type: 'Bearer',
    expires_in: config.tokens.accessTtlSeconds,
    refresh_token: refreshToken,
    user: publicUser(user),
  };
}

/** POST /api/auth/login — { email, password } */
router.post('/login', loginLimiter, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['email', 'password']);
    const email = vEmail(req.body.email);
    const password = vString(req.body.password, 'password', { min: 1, max: 200 });
    const ip = clientIp(req);
    const lockKey = `pet:${email}`;

    if (isLockedOut(lockKey)) {
      petAudit({
        actorType: 'system', actorLabel: email,
        action: PET_AUDIT.LOGIN_FAILED, targetType: 'account',
        metadata: { reason: 'account_locked' }, ip,
      });
      throw new ApiError(429, 'ACCOUNT_LOCKED',
        `Account temporarily locked. Try again in ${Math.ceil(lockoutRemainingSeconds(lockKey) / 60)} minutes.`);
    }

    const user = getPetDb().prepare('SELECT * FROM users WHERE email = ?').get(email);

    // Uniform failure — never reveal whether the email exists.
    if (!user || !verifyPassword(password, user.password_hash)) {
      recordFailure(lockKey);
      petAudit({
        actorType: 'system', actorLabel: email,
        action: PET_AUDIT.LOGIN_FAILED, targetType: 'account',
        metadata: { reason: 'invalid_credentials' }, ip,
      });
      throw errors.invalidCredentials();
    }
    if (user.status !== 'ACTIVE') {
      throw errors.forbidden('ACCOUNT_DISABLED', 'This account has been disabled. Contact your Main Admin.');
    }

    recordSuccess(lockKey);
    const { sessionId, refreshToken } = createPetSession({
      subjectId: user.id,
      userAgent: req.headers['user-agent'] || '',
      ip,
    });

    petAudit({
      actorType: user.role, actorId: user.id, actorLabel: user.email,
      action: PET_AUDIT.LOGIN, targetType: 'user', targetId: user.id, ip,
    });

    ok(res, sessionPayload(user, sessionId, refreshToken));
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/refresh — { refresh_token } (rotates; replay revokes). */
router.post('/refresh', refreshLimiter, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['refresh_token']);
    const presented = vString(req.body.refresh_token, 'refresh_token', { min: 10, max: 500 });
    const ip = clientIp(req);

    try {
      const { sessionId, refreshToken, session } = rotatePetRefreshToken(presented, {
        userAgent: req.headers['user-agent'] || '', ip,
      });
      const user = getPetDb().prepare('SELECT * FROM users WHERE id = ?').get(session.subject_id);
      if (!user || user.status !== 'ACTIVE') {
        revokePetSession(sessionId);
        throw new ApiError(401, 'SESSION_EXPIRED', 'Session is no longer valid. Please sign in again.');
      }
      ok(res, {
        access_token: signPetAccessToken({ sessionId, subjectId: user.id, role: user.role }),
        token_type: 'Bearer',
        expires_in: config.tokens.accessTtlSeconds,
        refresh_token: refreshToken,
      });
    } catch (err) {
      if (err instanceof PetTokenError && err.code === 'REFRESH_REPLAY_DETECTED') {
        petAudit({
          actorType: 'system', actorLabel: 'pet-token-service',
          action: PET_AUDIT.REFRESH_REPLAY_DETECTED, targetType: 'session',
          targetId: err.session?.id || null,
          metadata: { family_id: err.session?.family_id }, ip,
        });
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/logout — { refresh_token } (idempotent). */
router.post('/logout', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['refresh_token']);
    const presented = vString(req.body.refresh_token, 'refresh_token', { min: 10, max: 500 });
    const [sessionId] = presented.split('.');
    if (sessionId) {
      revokePetSession(sessionId);
      petAudit({
        actorType: 'system',
        action: PET_AUDIT.SESSION_REVOKED, targetType: 'session',
        targetId: sessionId, ip: clientIp(req),
      });
    }
    ok(res, { revoked: true });
  } catch (err) {
    next(err);
  }
});

/** POST /api/auth/change-password — { current_password, new_password } */
router.post('/change-password', requirePetAuth, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['current_password', 'new_password']);
    const current = vString(req.body.current_password, 'current_password', { min: 1, max: 200 });
    const next1 = vString(req.body.new_password, 'new_password', { min: 8, max: 200 });
    const { user } = req.petAuth;

    if (!verifyPassword(current, user.password_hash)) {
      throw errors.invalidCredentials();
    }
    if (next1 === current) {
      throw new ApiError(400, 'PASSWORD_REUSED', 'New password must differ from the current password.');
    }
    // Strength floor: length + at least one letter and one digit.
    if (!/[A-Za-z]/.test(next1) || !/\d/.test(next1)) {
      throw new ApiError(400, 'WEAK_PASSWORD', 'Password must be 8+ characters with at least one letter and one number.');
    }
    changeOwnPassword(user, current, hashPassword(next1));
    ok(res, { changed: true, re_login_required: true });
  } catch (err) {
    next(err);
  }
});

export default router;
