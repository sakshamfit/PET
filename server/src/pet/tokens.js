/**
 * PET token service — employees + Main Admin.
 *
 * Deliberately reuses the exact pattern of the proven control-plane token
 * service (src/lib/tokens.js), bound to the PET operational database:
 *
 *  - Access tokens : short-lived JWT (HS256). Claims carry only operational
 *    identity (subject, session id, role, type, expiry) — never passwords,
 *    hashes, or sensitive student data.
 *  - Refresh tokens: opaque random `${sessionId}.${secret}`; only the
 *    SHA-256 of the secret is stored server-side.
 *  - Rotation on every refresh with replay detection: presenting a
 *    previously rotated (or revoked) token flags the whole session family
 *    REUSED and revokes it immediately.
 */

import jwt from 'jsonwebtoken';
import config from '../config.js';
import { getPetDb } from './db.js';
import { randomId, randomToken, sha256 } from '../lib/crypto.js';

const now = () => new Date().toISOString();

function jwtSecret() {
  return config.secrets.petJwtSecret || config.secrets.licenseTokenSecret;
}

export function signPetAccessToken({ sessionId, subjectId, role }) {
  return jwt.sign(
    {
      sid: sessionId,
      sub: subjectId,
      type: 'access',
      subj: 'pet_user',
      role,
    },
    jwtSecret(),
    { expiresIn: config.tokens.accessTtlSeconds }
  );
}

/** Verify a PET access token. Returns claims or null (never throws). */
export function verifyPetAccessToken(token) {
  try {
    const claims = jwt.verify(String(token), jwtSecret());
    if (claims.type !== 'access' || claims.subj !== 'pet_user') return null;
    return claims;
  } catch {
    return null;
  }
}

/** Create a new PET session + refresh token pair. */
export function createPetSession({ subjectId, userAgent = '', ip = '', familyId = null }) {
  const db = getPetDb();
  const id = randomId('ses');
  const secret = randomToken(32);
  const ttlMs = config.tokens.refreshTtlDays * 24 * 3600 * 1000;
  const row = {
    id,
    subject_type: 'pet_user',
    subject_id: subjectId,
    refresh_hash: sha256(secret),
    prev_refresh_hash: null,
    family_id: familyId || randomId('fam'),
    status: 'ACTIVE',
    user_agent: userAgent.slice(0, 300),
    ip,
    created_at: now(),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  };
  db.prepare(
    `INSERT INTO sessions (id, subject_type, subject_id, refresh_hash, prev_refresh_hash,
       family_id, status, user_agent, ip, created_at, expires_at)
     VALUES (@id, @subject_type, @subject_id, @refresh_hash, @prev_refresh_hash,
       @family_id, @status, @user_agent, @ip, @created_at, @expires_at)`
  ).run(row);
  return { sessionId: id, refreshToken: `${id}.${secret}`, session: row };
}

export function getPetSession(id) {
  return getPetDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id);
}

export function isPetSessionUsable(session) {
  return !!session && session.status === 'ACTIVE' && session.expires_at > now();
}

export class PetTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Rotate a presented PET refresh token.
 * Throws PetTokenError('REFRESH_REPLAY_DETECTED') and revokes the session
 * family when an already-rotated token is replayed.
 */
export function rotatePetRefreshToken(refreshToken, { userAgent = '', ip = '' } = {}) {
  const db = getPetDb();
  const [sessionId, secret] = String(refreshToken || '').split('.');
  if (!sessionId || !secret) {
    throw new PetTokenError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }

  const session = getPetSession(sessionId);
  const presentedHash = sha256(secret);

  if (!session) {
    throw new PetTokenError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }

  if (
    (session.prev_refresh_hash && session.prev_refresh_hash === presentedHash) ||
    session.status === 'REUSED' ||
    (session.status === 'REVOKED' && session.refresh_hash === presentedHash)
  ) {
    db.prepare(
      `UPDATE sessions SET status = 'REUSED', revoked_at = ? WHERE family_id = ? AND status = 'ACTIVE'`
    ).run(now(), session.family_id);
    db.prepare(`UPDATE sessions SET status = 'REUSED' WHERE id = ?`).run(session.id);
    const err = new PetTokenError('REFRESH_REPLAY_DETECTED', 'Token reuse detected. Session revoked.');
    err.session = session;
    throw err;
  }

  if (session.status !== 'ACTIVE' || session.refresh_hash !== presentedHash) {
    throw new PetTokenError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }
  if (session.expires_at <= now()) {
    throw new PetTokenError('INVALID_REFRESH_TOKEN', 'Invalid or expired refresh token.');
  }

  const newSecret = randomToken(32);
  db.prepare(
    `UPDATE sessions
     SET refresh_hash = ?, prev_refresh_hash = ?, rotated_at = ?, user_agent = ?, ip = ?
     WHERE id = ?`
  ).run(sha256(newSecret), session.refresh_hash, now(), userAgent.slice(0, 300), ip, sessionId);

  return {
    sessionId,
    refreshToken: `${sessionId}.${newSecret}`,
    session: getPetSession(sessionId),
  };
}

/** Revoke a single PET session (logout). Safe to call twice. */
export function revokePetSession(sessionId) {
  getPetDb()
    .prepare(`UPDATE sessions SET status = 'REVOKED', revoked_at = ? WHERE id = ? AND status = 'ACTIVE'`)
    .run(now(), sessionId);
}

/** Revoke every active PET session for a user (deactivation, password reset). */
export function revokeAllPetSessionsFor(subjectId) {
  getPetDb()
    .prepare(
      `UPDATE sessions SET status = 'REVOKED', revoked_at = ?
       WHERE subject_type = 'pet_user' AND subject_id = ? AND status = 'ACTIVE'`
    )
    .run(now(), subjectId);
}
