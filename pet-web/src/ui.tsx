/**
 * Shared UI primitives for the PET app — mobile-first, large touch targets.
 */

import type { ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`p-card p-4 ${className}`}>{children}</div>;
}

const BADGE_TONES: Record<string, string> = {
  green: 'bg-emerald-100 text-emerald-800',
  blue: 'bg-sky-100 text-sky-800',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-rose-100 text-rose-800',
  slate: 'bg-slate-100 text-slate-700',
  purple: 'bg-violet-100 text-violet-800',
};

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof BADGE_TONES; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-pet-700" />
      {label}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

export function StatCard({ label, value, sub, children }: {
  label: string; value: string | number; sub?: string; children?: ReactNode;
}) {
  return (
    <div className="p-card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-slate-500">{sub}</p> : null}
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="p-label">{label}</span>
      {children}
    </label>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div
        className="w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <button className="p-btn-ghost !min-h-9 !px-3" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Student lifecycle → badge tone (consistent across the app). */
export function studentStatusTone(status: string): keyof typeof BADGE_TONES {
  switch (status) {
    case 'registered': return 'blue';
    case 'test_scheduled': return 'amber';
    case 'test_completed': return 'purple';
    case 'under_evaluation': return 'purple';
    case 'selected': return 'green';
    case 'waitlisted': return 'amber';
    case 'not_selected': return 'red';
    case 'enrolled': return 'green';
    default: return 'slate';
  }
}

export function taskStatusLabel(status: string): string {
  return status.replaceAll('_', ' ');
}
