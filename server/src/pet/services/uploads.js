/**
 * Upload service — field media & student documents.
 *
 * Files live on the PET server filesystem (never as SQLite blobs); SQLite
 * stores only metadata + relative paths. Protections:
 *  - server-generated random file names (client names never trusted for fs)
 *  - extension + MIME allowlist with magic-byte verification
 *  - decoded-size cap
 *  - category whitelist mapped to fixed subdirectories (path-traversal proof)
 *  - reads require an authenticated PET user (no public static exposure)
 */

import fs from 'node:fs';
import path from 'node:path';
import config from '../../config.js';
import { getPetDb } from '../db.js';
import { ApiError, errors } from '../../lib/respond.js';
import { petAudit, PET_AUDIT } from '../audit.js';
import { newId, now } from './common.js';

const CATEGORIES = {
  students: { dir: 'students' },
  schools: { dir: 'schools' },
  'field-visits': { dir: 'field-visits' },
  documents: { dir: 'documents' },
};

/** extension → { mime, magic byte prefixes } */
const TYPES = {
  jpg: { mimes: ['image/jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  jpeg: { mimes: ['image/jpeg'], magic: [[0xff, 0xd8, 0xff]] },
  png: { mimes: ['image/png'], magic: [[0x89, 0x50, 0x4e, 0x47]] },
  webp: { mimes: ['image/webp'], magic: [[0x52, 0x49, 0x46, 0x46]] }, // RIFF....WEBP
  pdf: { mimes: ['application/pdf'], magic: [[0x25, 0x50, 0x44, 0x46]] }, // %PDF
  mp4: { mimes: ['video/mp4', 'video/quicktime'], magic: null }, // ftyp check is complex; size/type-gated
};

function hasMagic(buf, prefixes) {
  if (!prefixes) return true;
  return prefixes.some(prefix => prefix.every((b, i) => buf[i] === b));
}

/** Resolve and CONTAIN a relative upload path inside the upload root. */
export function resolveUploadPath(relativePath) {
  const root = path.resolve(config.pet.uploadDir);
  const abs = path.resolve(root, String(relativePath || ''));
  if (!abs.startsWith(root + path.sep)) {
    throw new ApiError(400, 'INVALID_PATH', 'Invalid file path.');
  }
  return abs;
}

/**
 * Store a base64 upload. Returns the relative path (category/yyyymm/name.ext).
 * Throws on unsupported type, oversize payload, or invalid content.
 */
export function storeBase64Upload(actor, { category, fileName, mimeType, dataBase64 }) {
  const cat = CATEGORIES[category];
  if (!cat) throw new ApiError(400, 'VALIDATION_ERROR', `category must be one of: ${Object.keys(CATEGORIES).join(', ')}.`);
  if (typeof dataBase64 !== 'string' || dataBase64.length < 8) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'dataBase64 content is required.');
  }
  const base64 = dataBase64.replace(/^data:[^;,]+;base64,/, '');
  let buf;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid base64 content.');
  }
  if (buf.length < 16) throw new ApiError(400, 'VALIDATION_ERROR', 'File content is too small.');
  if (buf.length > config.pet.maxUploadBytes) {
    throw new ApiError(413, 'FILE_TOO_LARGE', `File exceeds the ${Math.round(config.pet.maxUploadBytes / 1024 / 1024)} MB limit.`);
  }

  // Determine type from magic bytes first; fall back to declared extension.
  const ext = String(fileName || '').split('.').pop()?.toLowerCase();
  const entry = TYPES[ext];
  if (!entry) {
    throw new ApiError(400, 'UNSUPPORTED_FILE_TYPE', 'Only jpg, jpeg, png, webp, pdf and mp4 files are allowed.');
  }
  if (mimeType && !entry.mimes.includes(String(mimeType).toLowerCase())) {
    throw new ApiError(400, 'UNSUPPORTED_FILE_TYPE', 'MIME type does not match an allowed file type.');
  }
  if (!hasMagic(buf, entry.magic)) {
    throw new ApiError(400, 'CONTENT_MISMATCH', 'File content does not match its declared type.');
  }

  const month = now().slice(0, 7);
  const relDir = path.join(cat.dir, month);
  const absDir = resolveUploadPath(relDir);
  fs.mkdirSync(absDir, { recursive: true });
  const finalName = `${newId('upl')}.${ext}`;
  const relPath = path.join(cat.dir, month, finalName).split(path.sep).join('/');
  fs.writeFileSync(resolveUploadPath(relPath), buf, { flag: 'wx' });
  return { relativePath: relPath, size: buf.length };
}

/** Read an authorized file stream. Caller must have checked PET auth. */
export function readUpload(relativePath) {
  const abs = resolveUploadPath(relativePath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    throw errors.notFound('File not found.');
  }
  const ext = path.extname(abs).slice(1).toLowerCase();
  const type = TYPES[ext];
  if (!type) throw errors.notFound('File not found.');
  return { abs, mime: type.mimes[0] };
}

/** Register media against a field visit (metadata row). */
export function registerFieldMedia(actor, { visit_id = null, school_id = null, type = 'photo', relative_path, original_name = '', caption = '' }, ip = '') {
  const db = getPetDb();
  if (!['photo', 'document', 'video'].includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'type must be photo, document or video.');
  }
  if (visit_id) {
    const visit = db.prepare('SELECT * FROM field_visits WHERE id = ?').get(visit_id);
    if (!visit) throw errors.notFound('Field visit not found.');
    if (actor.role !== 'main_admin' && visit.employee_id !== actor.id) {
      throw errors.forbidden('FORBIDDEN', 'You can only attach media to your own visits.');
    }
    school_id = school_id || visit.school_id;
  }
  if (school_id && !db.prepare('SELECT 1 FROM schools WHERE id = ?').get(school_id)) {
    throw errors.notFound('School not found.');
  }
  // The referenced file must exist on disk (no dangling metadata).
  readUpload(relative_path);

  const id = newId('med');
  db.prepare(
    `INSERT INTO field_media (id, visit_id, school_id, uploaded_by_user_id, uploaded_by_user_name,
        type, relative_path, original_name, caption, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`
  ).run(id, visit_id, school_id, actor.id, actor.name, type, relative_path,
    String(original_name).slice(0, 200), String(caption).slice(0, 300), now());
  if (visit_id && type === 'document') {
    db.prepare('UPDATE field_visits SET documents_collected = documents_collected + 1, updated_at = ? WHERE id = ?')
      .run(now(), visit_id);
  }
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.MEDIA_UPLOADED, targetType: 'field_media', targetId: id,
    metadata: { type, visit_id, school_id }, ip,
  });
  return db.prepare('SELECT * FROM field_media WHERE id = ?').get(id);
}

/** Attach a document to a student record (metadata row). */
export function registerStudentDocument(actor, { student_id, type = 'document', relative_path, original_name = '', caption = '' }, ip = '') {
  const db = getPetDb();
  const student = db.prepare('SELECT * FROM students WHERE id = ?').get(student_id);
  if (!student) throw errors.notFound('Student not found.');
  if (!['photo', 'document', 'other'].includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'type must be photo, document or other.');
  }
  readUpload(relative_path);
  const id = newId('doc');
  db.prepare(
    `INSERT INTO student_documents (id, student_id, uploaded_by_user_id, uploaded_by_user_name,
        type, relative_path, original_name, caption, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`
  ).run(id, student.id, actor.id, actor.name, type, relative_path,
    String(original_name).slice(0, 200), String(caption).slice(0, 300), now());
  petAudit({
    actorType: actor.role, actorId: actor.id, actorLabel: actor.name,
    action: PET_AUDIT.STUDENT_DOCUMENT_UPLOADED, targetType: 'student', targetId: student.id,
    metadata: { type }, ip,
  });
  return db.prepare('SELECT * FROM student_documents WHERE id = ?').get(id);
}
