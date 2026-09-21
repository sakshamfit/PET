/**
 * Brute-force protection.
 *
 * Layer 1: express-rate-limit per endpoint group (per IP).
 * Layer 2: in-memory per-account lockout after repeated failures
 *          (see lib/lockout.js) applied in the login handlers.
 */

import rateLimit from 'express-rate-limit';
import config from '../config.js';
import { clientIp } from './auth.js';

const json = (message) => ({
  error: { code: 'RATE_LIMITED', message },
});

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: req => clientIp(req) || 'unknown',
    // Skip rate limiting entirely during automated tests except when
    // explicitly enabled — tests assert the limiter behavior separately.
    skip: () => config.isTest && !process.env.TEST_ENABLE_RATE_LIMITS,
    message: json(message),
  });
}

// /auth/login, /admin/api/auth/login
export const loginLimiter = makeLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: 'Too many sign-in attempts. Please wait before trying again.',
});

// /auth/refresh — generous but bounded; legitimate clients refresh rarely.
export const refreshLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many token refresh attempts.',
});

// /devices/activate
export const activationLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many device activation attempts.',
});

// /api/public/forms — public website intake; strictest bucket.
export const publicFormLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many submissions. Please wait a minute and try again.',
});

// /api/uploads — bounded but workable for field media batches.
export const uploadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many uploads. Please slow down.',
});

// Everything else API-wide.
export const apiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 600,
  message: 'Too many requests. Please slow down.',
});
