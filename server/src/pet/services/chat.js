/**
 * Team chat service — operational communication, not a social network.
 * Direct (auto-deduplicated) and group conversations. Messages can carry
 * attachments and links to student/school/task/field-visit context.
 * Membership is enforced server-side for every read and write.
 */

import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now, paging } from './common.js';

function isMember(conversationId, userId) {
  return !!getPetDb()
    .prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
}

export function getConversation(id) {
  return getPetDb().prepare('SELECT * FROM conversations WHERE id = ?').get(id);
}

/** Open (or reuse) a direct conversation between the actor and otherUserId. */
export function openDirectConversation(actor, otherUserId) {
  const db = getPetDb();
  const other = db.prepare(`SELECT * FROM users WHERE id = ? AND status = 'ACTIVE'`).get(otherUserId);
  if (!other) throw errors.notFound('User not found or inactive.');
  if (other.id === actor.id) throw new ApiError(400, 'VALIDATION_ERROR', 'Cannot open a chat with yourself.');

  const existing = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = @me
       JOIN conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = @other
       WHERE c.type = 'direct'`
    )
    .get({ me: actor.id, other: other.id });
  if (existing) return { conversation: existing, created: false };

  const id = newId('cnv');
  const ts = now();
  const create = db.transaction(() => {
    db.prepare(
      `INSERT INTO conversations (id, type, title, created_by_user_id, created_at) VALUES (?, 'direct', NULL, ?, ?)`
    ).run(id, actor.id, ts);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, actor.id, ts);
    db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, other.id, ts);
  });
  create();
  return { conversation: getConversation(id), created: true };
}

/** Create a group conversation (Main Admin, or employee-created team thread). */
export function createGroupConversation(actor, { title, memberIds }) {
  const db = getPetDb();
  const uniqueIds = [...new Set([actor.id, ...(memberIds || [])])];
  if (uniqueIds.length < 2) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A group needs at least two members.');
  }
  const placeholders = uniqueIds.map(() => '?').join(',');
  const found = db
    .prepare(`SELECT id FROM users WHERE id IN (${placeholders}) AND status = 'ACTIVE'`)
    .all(...uniqueIds);
  if (found.length !== uniqueIds.length) throw errors.notFound('One or more members not found or inactive.');

  const id = newId('cnv');
  const ts = now();
  const create = db.transaction(() => {
    db.prepare('INSERT INTO conversations (id, type, title, created_by_user_id, created_at) VALUES (?, \'group\', ?, ?, ?)')
      .run(id, title, actor.id, ts);
    for (const uid of uniqueIds) {
      db.prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES (?, ?, ?)').run(id, uid, ts);
    }
  });
  create();
  return getConversation(id);
}

/** List the actor's conversations with last message + unread count. */
export function listConversations(actor) {
  const db = getPetDb();
  const rows = db
    .prepare(
      `SELECT c.*, m.last_read_at,
        (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) AS member_count,
        (SELECT COUNT(*) FROM messages msg
          WHERE msg.conversation_id = c.id AND msg.sender_id != @me
            AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)) AS unread_count,
        (SELECT json_group_array(json_object('user_id', cm2.user_id, 'name', u.name, 'role', u.role))
          FROM conversation_members cm2 JOIN users u ON u.id = cm2.user_id
          WHERE cm2.conversation_id = c.id) AS members_json,
        (SELECT msg2.text FROM messages msg2 WHERE msg2.conversation_id = c.id ORDER BY msg2.created_at DESC LIMIT 1) AS last_message
       FROM conversations c
       JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = @me
       ORDER BY c.last_message_at IS NULL, c.last_message_at DESC, c.created_at DESC`
    )
    .all({ me: actor.id });
  return rows.map(r => ({ ...r, members: JSON.parse(r.members_json || '[]'), members_json: undefined }));
}

export function listMessages(actor, conversationId, query = {}) {
  const db = getPetDb();
  if (!isMember(conversationId, actor.id)) {
    throw errors.forbidden('FORBIDDEN', 'You are not a member of this conversation.');
  }
  const { limit, offset } = paging(query, { defaultLimit: 50, maxLimit: 100 });
  const messages = db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(conversationId, limit, offset);
  // Reading marks the conversation read for the actor.
  db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?')
    .run(now(), conversationId, actor.id);
  return messages.reverse();
}

export function sendMessage(actor, conversationId, input, ip = '') {
  const db = getPetDb();
  if (!isMember(conversationId, actor.id)) {
    throw errors.forbidden('FORBIDDEN', 'You are not a member of this conversation.');
  }
  const id = newId('msg');
  const ts = now();
  const attachments = Array.isArray(input.attachment_paths) && input.attachment_paths.length
    ? JSON.stringify(input.attachment_paths.slice(0, 10))
    : null;

  const send = db.transaction(() => {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, sender_id, sender_name, text, attachment_paths,
          linked_task_id, linked_student_id, linked_school_id, linked_visit_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id, conversationId, actor.id, actor.name, input.text, attachments,
      input.linked_task_id || null, input.linked_student_id || null,
      input.linked_school_id || null, input.linked_visit_id || null, ts
    );
    db.prepare('UPDATE conversations SET last_message_at = ? WHERE id = ?').run(ts, conversationId);
    db.prepare('UPDATE conversation_members SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?')
      .run(ts, conversationId, actor.id);
  });
  send();

  petAudit({
    actorType: actor.role,
    actorId: actor.id,
    actorLabel: actor.name,
    action: PET_AUDIT.MESSAGE_SENT,
    targetType: 'conversation',
    targetId: conversationId,
    metadata: { has_attachments: !!attachments },
    ip,
  });
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

/** Total unread messages for the actor (dashboard badge). */
export function unreadCount(actor) {
  const { c } = getPetDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM messages msg
       JOIN conversation_members m ON m.conversation_id = msg.conversation_id AND m.user_id = @me
       WHERE msg.sender_id != @me AND (m.last_read_at IS NULL OR msg.created_at > m.last_read_at)`
    )
    .get({ me: actor.id });
  return c;
}
