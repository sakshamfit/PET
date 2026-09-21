/**
 * /api/conversations (+messages) — internal team chat with context links.
 */

import { Router } from 'express';
import { ok } from '../../lib/respond.js';
import { assertAllowedKeys, vOptionalString, vString } from '../../lib/validate.js';
import { requirePetAuth } from '../auth.js';
import { clientIp } from '../../middleware/auth.js';
import {
  openDirectConversation, createGroupConversation, listConversations,
  listMessages, sendMessage, unreadCount,
} from '../services/chat.js';

const router = Router();
router.use(requirePetAuth);

router.get('/', (req, res, next) => {
  try { ok(res, { conversations: listConversations(req.petAuth.user) }); } catch (err) { next(err); }
});

router.get('/unread-count', (req, res, next) => {
  try { ok(res, { unread: unreadCount(req.petAuth.user) }); } catch (err) { next(err); }
});

/** Open a direct conversation with another active user (deduplicated). */
router.post('/direct', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['user_id']);
    const userId = vString(req.body.user_id, 'user_id', { min: 1, max: 80 });
    const { conversation, created } = openDirectConversation(req.petAuth.user, userId);
    ok(res, { conversation }, created ? 201 : 200);
  } catch (err) { next(err); }
});

router.post('/group', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, ['title', 'member_ids']);
    const title = vString(req.body.title, 'title', { min: 2, max: 120 });
    const memberIds = Array.isArray(req.body.member_ids) ? req.body.member_ids.slice(0, 50) : [];
    for (const id of memberIds) vString(id, 'member_ids[]', { min: 1, max: 80 });
    ok(res, { conversation: createGroupConversation(req.petAuth.user, { title, memberIds }) }, 201);
  } catch (err) { next(err); }
});

router.get('/:id/messages', (req, res, next) => {
  try { ok(res, { messages: listMessages(req.petAuth.user, req.params.id, req.query) }); } catch (err) { next(err); }
});

router.post('/:id/messages', (req, res, next) => {
  try {
    assertAllowedKeys(req.body, [
      'text', 'attachment_paths', 'linked_task_id', 'linked_student_id',
      'linked_school_id', 'linked_visit_id',
    ]);
    const input = {
      text: vString(req.body.text, 'text', { min: 1, max: 2000 }),
      attachment_paths: Array.isArray(req.body.attachment_paths)
        ? req.body.attachment_paths.slice(0, 10).map(p => vString(p, 'attachment_paths[]', { min: 5, max: 300 }))
        : [],
      linked_task_id: vOptionalString(req.body.linked_task_id, 'linked_task_id', { max: 80 }) || null,
      linked_student_id: vOptionalString(req.body.linked_student_id, 'linked_student_id', { max: 80 }) || null,
      linked_school_id: vOptionalString(req.body.linked_school_id, 'linked_school_id', { max: 80 }) || null,
      linked_visit_id: vOptionalString(req.body.linked_visit_id, 'linked_visit_id', { max: 80 }) || null,
    };
    ok(res, { message: sendMessage(req.petAuth.user, req.params.id, input, clientIp(req)) }, 201);
  } catch (err) { next(err); }
});

export default router;
