/**
 * Reports / search / activity / Trust settings routes.
 */

import { Router } from 'express';
import { ok, ApiError } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString } from '../../lib/validate.js';
import { requirePetAuth, requireMainAdmin } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  adminDashboard, globalSearch, activityFeed, getOrganization, upsertOrganization,
} from '../services/reports.js';
import { petAudit, PET_AUDIT } from '../audit.js';

export const reportsRouter = Router();
reportsRouter.use(requirePetAuth);

/** Admin dashboard — Main Admin only. */
reportsRouter.get('/dashboard', requireMainAdmin, (req, res, next) => {
  try { ok(res, adminDashboard()); } catch (err) { next(err); }
});

export const searchRouter = Router();
searchRouter.use(requirePetAuth);

/** Global search: students + schools + employees (admin) + tasks. */
searchRouter.get('/', (req, res, next) => {
  try {
    const q = vOptionalString(req.query.q, 'q', { max: 120 });
    if (q.length < 2) throw new ApiError(400, 'VALIDATION_ERROR', 'q must be at least 2 characters.');
    ok(res, globalSearch(req.petAuth.user, q));
  } catch (err) { next(err); }
});

export const activityRouter = Router();
activityRouter.use(requirePetAuth, requireMainAdmin);

/** Audit/activity feed — Main Admin only. */
activityRouter.get('/', (req, res, next) => {
  try { ok(res, activityFeed(req.query)); } catch (err) { next(err); }
});

export const settingsRouter = Router();
settingsRouter.use(requirePetAuth);

settingsRouter.get('/organization', (req, res, next) => {
  try { ok(res, { organization: getOrganization() }); } catch (err) { next(err); }
});

settingsRouter.patch('/organization', requireMainAdmin, (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['name', 'tagline', 'address', 'phone', 'email', 'logo_path', 'settings']);
    const input = {};
    if (req.body.name !== undefined) input.name = vString(req.body.name, 'name', { min: 2, max: 200 });
    if (req.body.tagline !== undefined) input.tagline = vOptionalString(req.body.tagline, 'tagline', { max: 300 }) || null;
    if (req.body.address !== undefined) input.address = vOptionalString(req.body.address, 'address', { max: 400 }) || null;
    if (req.body.phone !== undefined) input.phone = vOptionalString(req.body.phone, 'phone', { max: 40 }) || null;
    if (req.body.email !== undefined) input.email = vOptionalString(req.body.email, 'email', { max: 200 }) || null;
    if (req.body.logo_path !== undefined) input.logo_path = vOptionalString(req.body.logo_path, 'logo_path', { max: 300 }) || null;
    if (req.body.settings !== undefined) {
      if (typeof req.body.settings !== 'object' || req.body.settings === null || Array.isArray(req.body.settings)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'settings must be an object.');
      }
      input.settings = req.body.settings;
    }
    const organization = upsertOrganization(req.petAuth.user, input);
    petAudit({
      actorType: 'main_admin', actorId: req.petAuth.user.id, actorLabel: req.petAuth.user.name,
      action: PET_AUDIT.SETTINGS_UPDATED, targetType: 'organization', targetId: organization?.id || null,
      metadata: { changed_keys: Object.keys(input) }, ip: clientIp(req),
    });
    ok(res, { organization });
  } catch (err) { next(err); }
});
