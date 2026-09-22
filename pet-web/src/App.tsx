/**
 * PET app shell — session gate + role-based navigation.
 * Employee experience is mobile-first; Main Admin gets the same screens
 * with wider layout and organization-level views.
 */

import { useCallback, useEffect, useState } from 'react';
import { getPetUser, onPetAuthChange, petAuth, restoreSession } from '../../src/services/petApi';
import { LoginPage } from './pages/Login';
import { EmployeeDashboard } from './pages/EmployeeDashboard';
import { AdminDashboardPage } from './pages/AdminDashboard';
import { StudentsPage } from './pages/Students';
import { TasksPage } from './pages/Tasks';
import { VisitsPage } from './pages/Visits';
import { ChatPage } from './pages/Chat';
import { TeamPage } from './pages/Team';
import { useAutoSync } from './pages/sync';
import { BuildStamp, UpdateBanner, useBuildWatcher } from './build';

type Route = 'dashboard' | 'students' | 'tasks' | 'visits' | 'chat' | 'team';

const NAV: Array<{ key: Route; label: string; icon: string; adminOnly?: boolean }> = [
  { key: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { key: 'students', label: 'Students', icon: '🎓' },
  { key: 'tasks', label: 'Tasks', icon: '✓' },
  { key: 'visits', label: 'Visits', icon: '🏫' },
  { key: 'chat', label: 'Chat', icon: '💬' },
  { key: 'team', label: 'Team', icon: '👥', adminOnly: true },
];

export default function App() {
  const [signedIn, setSignedIn] = useState(!!getPetUser());
  const [restoring, setRestoring] = useState(true);
  const [route, setRoute] = useState<Route>('dashboard');
  const navigate = useCallback((r: string) => setRoute(r as Route), []);

  useAutoSync(signedIn);
  // Detects (and loudly reports) a server that is serving a newer build than
  // this page is running — the fix for "it still shows the old build".
  const buildWatch = useBuildWatcher();

  useEffect(() => {
    let alive = true;
    void restoreSession().then(ok => {
      if (!alive) return;
      setSignedIn(ok);
      setRestoring(false);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => onPetAuthChange(() => setSignedIn(!!getPetUser())), []);

  const user = getPetUser();

  if (restoring) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-pet-700" />
      </div>
    );
  }

  if (!signedIn || !user) {
    return (
      <>
        <UpdateBanner watch={buildWatch} />
        <LoginPage onLoggedIn={() => setSignedIn(true)} />
      </>
    );
  }

  const isAdmin = user.role === 'main_admin';
  const nav = NAV.filter(item => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-dvh pb-20 lg:pb-0">
      <UpdateBanner watch={buildWatch} />
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pet-800 text-sm font-black text-white">P</span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">Purvanchal Education Trust</p>
              <p className="text-[11px] leading-tight text-slate-500">
                {user.name} · {isAdmin ? 'Main Admin' : `Employee${user.employee_code ? ` · ${user.employee_code}` : ''}`}
              </p>
              <BuildStamp className="mt-0.5" />
            </div>
          </div>
          <button className="p-btn-ghost !min-h-9 !px-3 text-xs" onClick={() => void petAuth.logout()}>
            Sign out
          </button>
        </div>
      </header>

      {/* Desktop side nav + content */}
      <div className="mx-auto flex max-w-5xl gap-6">
        <nav className="sticky top-[57px] hidden h-[calc(100dvh-57px)] w-44 shrink-0 flex-col gap-1 py-4 lg:flex">
          {nav.map(n => (
            <button key={n.key}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${route === n.key ? 'bg-pet-800 text-white' : 'text-slate-600 hover:bg-white'}`}
              onClick={() => setRoute(n.key)}>
              <span>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>

        <main className="min-w-0 flex-1 px-4 py-4 lg:px-0">
          {route === 'dashboard' ? (
            isAdmin ? <AdminDashboardPage navigate={navigate} /> : <EmployeeDashboard navigate={navigate} />
          ) : route === 'students' ? (
            <StudentsPage />
          ) : route === 'tasks' ? (
            <TasksPage />
          ) : route === 'visits' ? (
            <VisitsPage />
          ) : route === 'chat' ? (
            <ChatPage />
          ) : (
            <TeamPage />
          )}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {nav.map(n => (
          <button key={n.key}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-bold ${route === n.key ? 'text-pet-800' : 'text-slate-400'}`}
            onClick={() => setRoute(n.key)}>
            <span className="text-lg">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
