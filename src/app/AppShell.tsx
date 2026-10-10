import { X } from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import { Onboarding } from '@/app/dialogs/Onboarding';
import { SettingsDialog } from '@/app/dialogs/SettingsDialog';
import { TopNav } from '@/app/shell/TopNav';
import { useGame } from '@/game/store';

/** Workspace routes get a full-bleed, non-scrolling content area; every other page scrolls. */
const isWorkspace = (pathname: string) => pathname.startsWith('/play/') || pathname === '/lab';

export function AppShell() {
  const { pathname } = useLocation();
  const settings = useGame((s) => s.settings);
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const finishOnboarding = useGame((s) => s.finishOnboarding);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const workspace = isWorkspace(pathname);

  useEffect(() => {
    const g = useGame.getState();
    if (!workspace && g.session) g.setRunning(false);
  }, [workspace]);

  // A player who lands straight in a mission gets that mission's own briefing; never stack the welcome on top of it.
  useEffect(() => {
    if (workspace && !settings.onboarded) finishOnboarding();
  }, [workspace, settings.onboarded, finishOnboarding]);

  return (
    <div className={`app ${workspace ? 'app-ws' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopNav onHelp={() => setShowHelp(true)} onSettings={() => setShowSettings(true)} />
      <main className="content" id="main">
        <Suspense
          fallback={
            <div className="page">
              <p className="muted">Loading…</p>
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.text}
            <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
      {((!settings.onboarded && !workspace) || showHelp) && (
        <Onboarding
          onClose={() => {
            finishOnboarding();
            setShowHelp(false);
          }}
        />
      )}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}
