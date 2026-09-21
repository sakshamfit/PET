/**
 * Sync state UI (docs/PET/11): Synced / Syncing / Pending / Failed — Tap to
 * retry. Unsynchronized data is always visible to the employee.
 */

import { useEffect, useState } from 'react';
import { onSyncQueueChange, pushQueue, queueSummary, requeue, discard, installAutoSync, QueueSummary } from '../../../src/services/petSyncQueue';
import { getAccessToken } from '../../../src/services/petApi';
import { Badge, Modal } from '../ui';

export function useAutoSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    return installAutoSync();
  }, [enabled]);
}

export function SyncBadge() {
  const [summary, setSummary] = useState<QueueSummary>(queueSummary);
  const [open, setOpen] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => onSyncQueueChange(() => setSummary(queueSummary())), []);

  const active = summary.pending + summary.syncing + summary.failed;
  if (active === 0 && summary.synced === 0) return null;

  const tone = summary.failed > 0 ? 'red' : active > 0 ? 'amber' : 'green';
  const label = summary.failed > 0
    ? `${summary.failed} failed`
    : summary.syncing > 0
      ? 'Syncing…'
      : summary.pending > 0
        ? `${summary.pending} pending`
        : 'Synced';

  return (
    <>
      <button
        className="fixed bottom-20 right-4 z-40 flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-bold shadow-lg border border-slate-200"
        onClick={() => setOpen(true)}
      >
        {navigator.onLine ? '📶' : '📵'} <Badge tone={tone}>{label}</Badge>
      </button>
      {open ? (
        <Modal title="Sync queue" onClose={() => setOpen(false)}>
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
              Offline work is queued on this device and pushed with idempotency keys — retries never create
              duplicate records.
            </p>
            {summary.items.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing queued.</p>
            ) : (
              summary.items.map(item => (
                <div key={item.idempotency_key} className="p-card flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{item.entityLabel}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.type} · {new Date(item.created_at).toLocaleString()}
                      {item.last_error ? ` · ${item.last_error}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={item.status === 'synced' ? 'green' : item.status === 'failed' ? 'red' : item.status === 'syncing' ? 'blue' : 'amber'}>
                      {item.status}
                    </Badge>
                    {item.status === 'failed' ? (
                      <button className="p-btn-ghost !min-h-8 !px-2 text-xs" onClick={() => { requeue(item.idempotency_key); void pushQueue(); }}>
                        Retry
                      </button>
                    ) : null}
                    {item.status === 'synced' ? (
                      <button className="p-btn-ghost !min-h-8 !px-2 text-xs" onClick={() => discard(item.idempotency_key)}>✕</button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
            {summary.pending > 0 ? (
              <button
                className="p-btn-primary w-full"
                disabled={pushing || !getAccessToken()}
                onClick={async () => { setPushing(true); await pushQueue(); setPushing(false); }}
              >
                {pushing ? 'Syncing…' : `Sync ${summary.pending} item${summary.pending > 1 ? 's' : ''} now`}
              </button>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
