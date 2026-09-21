/**
 * Central error handler.
 *
 * - Known ApiError / ValidationError instances produce sanitized responses.
 * - express-rate-limit sends its own 429 payload.
 * - Anything unknown is logged server-side (with stack) and returned as a
 *   generic 500. Internal stack traces are never exposed to clients.
 */

import { ApiError } from '../lib/respond.js';
import { ValidationError } from '../lib/validate.js';
import { TokenError } from '../lib/tokens.js';
import { PetTokenError } from '../pet/tokens.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found.' } });
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ValidationError || (err instanceof ApiError)) {
    const body = {
      error: { code: err.code || 'VALIDATION_ERROR', message: err.message },
    };
    // Carry safe, client-relevant details (e.g. duplicate candidates).
    if (err.details && typeof err.details === 'object') {
      body.error.details = err.details;
    }
    return res.status(err.status || 400).json(body);
  }

  if (err instanceof TokenError || err instanceof PetTokenError) {
    return res.status(401).json({ error: { code: err.code, message: err.message } });
  }

  if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Malformed request body.' },
    });
  }

  console.error(`[server] unhandled error on ${req.method} ${req.originalUrl}:`, err);
  return res.status(500).json({
    error: { code: 'INTERNAL', message: 'Unexpected server error.' },
  });
}
