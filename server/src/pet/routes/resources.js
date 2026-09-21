/**
 * Operational resource routes:
 *   /api/uploads      — authenticated base64 upload (field media/documents)
 *   /api/files        — authorized file reads (no public static exposure)
 *   /api/media        — field media + student document metadata
 *   /api/sync         — offline queue processing with idempotency
 */

import { Router } from 'express';
import { ApiError, ok } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString } from '../../lib/validate.js';
import { requirePetAuth } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import { uploadLimiter } from '../../middleware/ratelimits.js';
import {
  storeBase64Upload, readUpload, registerFieldMedia, registerStudentDocument,
} from '../services/uploads.js';
import { processSyncBatch } from '../services/sync.js';

export const uploadsRouter = Router();
uploadsRouter.use(requirePetAuth);

/** POST /api/uploads — store an upload; returns the relative path. */
uploadsRouter.post('/', uploadLimiter, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['category', 'fileName', 'mimeType', 'dataBase64']);
    const result = storeBase64Upload(req.petAuth.user, {
      category: vString(req.body.category, 'category', { min: 1, max: 20 }),
      fileName: vString(req.body.fileName, 'fileName', { min: 1, max: 200 }),
      mimeType: vOptionalString(req.body.mimeType, 'mimeType', { max: 60 }),
      dataBase64: req.body.dataBase64,
    });
    ok(res, { relative_path: result.relativePath, size: result.size }, 201);
  } catch (err) { next(err); }
});

export const filesRouter = Router();
filesRouter.use(requirePetAuth);

/** GET /api/files/* — read an uploaded file (any authenticated PET user). */
filesRouter.get(/^\/(.+)$/, (req, res, next) => {
  try {
    const rel = decodeURIComponent(req.params[0] || '');
    const { abs, mime } = readUpload(rel);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(mime);
    res.sendFile(abs);
  } catch (err) { next(err); }
});

export const mediaRouter = Router();
mediaRouter.use(requirePetAuth);

/** POST /api/media/field — register media against a visit/school. */
mediaRouter.post('/field', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['visit_id', 'school_id', 'type', 'relative_path', 'original_name', 'caption']);
    const media = registerFieldMedia(req.petAuth.user, {
      visit_id: vOptionalString(req.body.visit_id, 'visit_id', { max: 80 }) || null,
      school_id: vOptionalString(req.body.school_id, 'school_id', { max: 80 }) || null,
      type: vOptionalString(req.body.type, 'type', { max: 10 }) || 'photo',
      relative_path: vString(req.body.relative_path, 'relative_path', { min: 5, max: 300 }),
      original_name: vOptionalString(req.body.original_name, 'original_name', { max: 200 }),
      caption: vOptionalString(req.body.caption, 'caption', { max: 300 }),
    }, clientIp(req));
    ok(res, { media }, 201);
  } catch (err) { next(err); }
});

/** POST /api/media/student — attach a document to a student record. */
mediaRouter.post('/student', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['student_id', 'type', 'relative_path', 'original_name', 'caption']);
    const doc = registerStudentDocument(req.petAuth.user, {
      student_id: vString(req.body.student_id, 'student_id', { min: 1, max: 80 }),
      type: vOptionalString(req.body.type, 'type', { max: 10 }) || 'document',
      relative_path: vString(req.body.relative_path, 'relative_path', { min: 5, max: 300 }),
      original_name: vOptionalString(req.body.original_name, 'original_name', { max: 200 }),
      caption: vOptionalString(req.body.caption, 'caption', { max: 300 }),
    }, clientIp(req));
    ok(res, { document: doc }, 201);
  } catch (err) { next(err); }
});

export const syncRouter = Router();
syncRouter.use(requirePetAuth);

/**
 * POST /api/sync — { operations: [{ idempotency_key, type, payload }] }
 * Idempotent: replayed keys return the original result, never duplicates.
 */
syncRouter.post('/', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['operations']);
    if (!Array.isArray(req.body.operations) || req.body.operations.length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'operations must be a non-empty array.');
    }
    const operations = req.body.operations.slice(0, 100).map((op, i) => ({
      idempotency_key: vString(op?.idempotency_key, `operations[${i}].idempotency_key`, { min: 8, max: 120 }),
      type: vString(op?.type, `operations[${i}].type`, { min: 1, max: 40 }),
      payload: op?.payload && typeof op.payload === 'object' && !Array.isArray(op.payload) ? op.payload : {},
    }));
    ok(res, processSyncBatch(req.petAuth.user, operations, clientIp(req)));
  } catch (err) { next(err); }
});
