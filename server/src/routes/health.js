/**
 * GET /health — liveness + dependency check for monitoring.
 *
 * Reports the build identity of the web app this server is actually serving
 * (`app_build`) so "is the new build live?" is answerable with one request
 * instead of a guess. Returns no sensitive configuration.
 */

import { Router } from 'express';
import config from '../config.js';
import { checkIntegrity } from '../db.js';
import { healthBuildSummary } from '../lib/build-info.js';

const router = Router();
const startedAt = Date.now();

router.get('/health', (_req, res) => {
  const dbOk = checkIntegrity();
  const appBuild = healthBuildSummary('pet');
  const adminBuild = healthBuildSummary('admin');

  // A missing bundle degrades the service (the API may be fine, but the app
  // employees open is not there). A stale bundle is reported but does not by
  // itself fail liveness — production refuses to boot on stale builds anyway.
  const degraded = !dbOk || !appBuild.present;

  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    version: config.version,
    db: dbOk ? 'ok' : 'error',
    app_build: appBuild,
    admin_build: adminBuild.present ? adminBuild : { present: false },
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    time: new Date().toISOString(),
  });
});

export default router;
