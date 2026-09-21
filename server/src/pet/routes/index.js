/**
 * PET operational API — /api namespace.
 *
 * Route map (all under /api):
 *   POST /api/auth/login|refresh|logout        public (rate-limited)
 *   POST /api/public/forms                     public website intake
 *   /api/me/*                                  authenticated self-service
 *   /api/employees/*                           Main Admin
 *   /api/students, /api/schools, /api/field-visits, /api/tasks,
 *   /api/conversations, /api/attendance, /api/tests, /api/enrollments,
 *   /api/website-forms, /api/search, /api/reports, /api/activity,
 *   /api/settings, /api/uploads, /api/files, /api/media, /api/sync
 *
 * No route handler contains raw SQL — all data access lives in services.
 */

import { Router } from 'express';
import authRouter from './auth.js';
import meRouter from './me.js';
import employeesRouter from './employees.js';
import studentsRouter from './students.js';
import schoolsRouter from './schools.js';
import visitsRouter from './visits.js';
import tasksRouter from './tasks.js';
import chatRouter from './chat.js';
import attendanceRouter from './attendance.js';
import testsRouter from './tests.js';
import enrollmentsRouter from './enrollments.js';
import websiteFormsRouter, { publicFormsRouter } from './websiteForms.js';
import { reportsRouter, searchRouter, activityRouter, settingsRouter } from './reports.js';
import { uploadsRouter, filesRouter, mediaRouter, syncRouter } from './resources.js';
import { notFoundHandler } from '../../middleware/errorhandler.js';

const router = Router();

// Public (self-limited) endpoints.
router.use('/auth', authRouter);
router.use('/public/forms', publicFormsRouter);

// Authenticated operational endpoints (auth enforced per-router).
router.use('/me', meRouter);
router.use('/employees', employeesRouter);
router.use('/students', studentsRouter);
router.use('/schools', schoolsRouter);
router.use('/field-visits', visitsRouter);
router.use('/tasks', tasksRouter);
router.use('/conversations', chatRouter);
router.use('/attendance', attendanceRouter);
router.use('/tests', testsRouter);
router.use('/enrollments', enrollmentsRouter);
router.use('/website-forms', websiteFormsRouter);
router.use('/search', searchRouter);
router.use('/reports', reportsRouter);
router.use('/activity', activityRouter);
router.use('/settings', settingsRouter);
router.use('/uploads', uploadsRouter);
router.use('/files', filesRouter);
router.use('/media', mediaRouter);
router.use('/sync', syncRouter);

// Unknown /api paths get the sanitized 404 (never fall through to SPAs).
router.use(notFoundHandler);

export default router;
