/**
 * PET offline sync queue (docs/PET/11).
 *
 * Field employees work in weak-connectivity schools. Every mutation taken
 * offline is queued locally with an idempotency key; when connectivity
 * returns, the queue is pushed to POST /api/sync, which deduplicates by
 * key — retries can never create duplicate students, visits, attendance
 * or tasks.
 *
 * Sync states exposed to the UI (unsynced data is NEVER hidden):
 *   pending   — waiting for connectivity / next push
 *   syncing   — a push is in flight
 *   failed    — the server rejected it, or repeated network failures
 *   synced    — confirmed by the server (kept for the audit trail badge)
 *
 * Storage: localStorage (queue payloads only — refresh tokens and
 * passwords are never stored here, per docs/PET/09).
 */

import type { SyncOperationType, SyncResultEntry } from '../types/pet';
import { petSync, getAccessToken } from './petApi';

export type QueueItemStatus = 'pending' | 'syncing' | 'failed' | 'synced';

export interface SyncQueueItem {
  idempotency_key: string;
  type: SyncOperationType;
  entityLabel: string;
  payload: Record<string, unknown>;
  created_at: string;
  retry_count: number;
  last_error: string | null;
  status: QueueItemStatus;
}

const STORAGE_KEY = 'pet.syncQueue.v1';
const MAX_RETRY_BEFORE_FAILED = 6;

type Listener = () => void;
const listeners = new Set<Listener>();
let memoryCache: SyncQueueItem[] | null = null;
let pushInFlight: Promise<QueueSummary> | null = null;

export interface QueueSummary {
  pending: number;
  syncing: number;
  failed: number;
  synced: number;
  items: SyncQueueItem[];
}

function read(): SyncQueueItem[] {
  if (memoryCache) return memoryCache;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    memoryCache = raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
  } catch {
    memoryCache = [];
  }
  return memoryCache;
}

function write(items: SyncQueueItem[]) {
  // Keep at most the last 60 synced confirmations; pending/failed always survive.
  const synced = items.filter(i => i.status === 'synced');
  const active = items.filter(i => i.status !== 'synced');
  const trimmed = [...active, ...synced.slice(-60)];
  memoryCache = trimmed;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch { /* storage may be unavailable; in-memory copy still works */ }
  for (const cb of listeners) cb();
}

export function onSyncQueueChange(cb: Listener) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function newIdempotencyKey(): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `q-${uuid}`;
}

/** Queue a mutation for offline-safe delivery. */
export function enqueue(type: SyncOperationType, payload: Record<string, unknown>, entityLabel: string, key?: string): SyncQueueItem {
  const item: SyncQueueItem = {
    idempotency_key: key ?? newIdempotencyKey(),
    type,
    entityLabel,
    payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
    last_error: null,
    status: 'pending',
  };
  write([...read(), item]);
  return item;
}

export function listQueue(): SyncQueueItem[] {
  return read();
}

export function queueSummary(): QueueSummary {
  const items = read();
  return {
    pending: items.filter(i => i.status === 'pending').length,
    syncing: items.filter(i => i.status === 'syncing').length,
    failed: items.filter(i => i.status === 'failed').length,
    synced: items.filter(i => i.status === 'synced').length,
    items,
  };
}

/** Remove a synced item from the visible trail (or force-drop a failed one). */
export function discard(idempotencyKey: string) {
  write(read().filter(i => i.idempotency_key !== idempotencyKey));
}

/** Re-arm a failed item for another push attempt ("Tap to retry"). */
export function requeue(idempotencyKey: string) {
  write(read().map(i => (i.idempotency_key === idempotencyKey ? { ...i, status: 'pending', last_error: null } : i)));
}

/**
 * Push all pending items to the server. Single-flight; marks each item
 * synced/failed from the per-operation server results. Deduplicated
 * responses count as success — the item was already applied.
 */
export async function pushQueue(): Promise<QueueSummary> {
  if (pushInFlight) return pushInFlight;
  pushInFlight = (async () => {
    const pending = read().filter(i => i.status === 'pending');
    if (pending.length === 0 || !getAccessToken()) return queueSummary();

    write(read().map(i => (i.status === 'pending' ? { ...i, status: 'syncing' } : i)));
    let results: SyncResultEntry[];
    try {
      const res = await petSync.push(
        pending.map(i => ({ idempotency_key: i.idempotency_key, type: i.type, payload: i.payload })),
      );
      results = res.results;
    } catch (err) {
      // Network-level failure: everything returns to pending and counts up.
      write(read().map(i => (i.status === 'syncing'
        ? bumpRetry(i, err instanceof Error ? err.message : 'Network unavailable')
        : i)));
      return queueSummary();
    }

    const byKey = new Map(results.map(r => [r.idempotency_key, r]));
    write(read().map(item => {
      if (item.status !== 'syncing') return item;
      const r = byKey.get(item.idempotency_key);
      if (!r) return bumpRetry(item, 'Missing server result');
      if (r.status === 'ok') return { ...item, status: 'synced', last_error: null };
      return { ...item, status: 'failed' as const, last_error: r.message || r.code || 'Rejected by server' };
    }));
    return queueSummary();
  })().finally(() => { pushInFlight = null; });
  return pushInFlight;
}

function bumpRetry(item: SyncQueueItem, message: string): SyncQueueItem {
  const retry = item.retry_count + 1;
  return {
    ...item,
    retry_count: retry,
    last_error: message.slice(0, 200),
    status: retry >= MAX_RETRY_BEFORE_FAILED ? 'failed' : 'pending',
  };
}

/** Online/offline wiring — call once at app start. */
export function installAutoSync(): () => void {
  const online = () => { void pushQueue(); };
  window.addEventListener('online', online);
  const timer = window.setInterval(() => {
    if (navigator.onLine) void pushQueue();
  }, 45_000);
  return () => {
    window.removeEventListener('online', online);
    window.clearInterval(timer);
  };
}
