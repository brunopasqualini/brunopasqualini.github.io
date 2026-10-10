import {
  Download,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  GraduationCap,
  HelpCircle,
  Hexagon,
  LayoutDashboard,
  NotebookPen,
  Settings as SettingsIcon,
  Siren,
  Target,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Suspense, useEffect, useState } from 'react';
import { levelFromXp } from '@/game/progression';
import { useGame } from '@/game/store';
import { Link, Outlet, useLocation } from 'react-router';
import { Onboarding } from '@/app/dialogs/Onboarding';
import { SettingsDialog } from '@/app/dialogs/SettingsDialog';

function routeOf(pathname: string): { page: string; id?: string } {
  const [head, id] = pathname.split('/').filter(Boolean);
  if (!head) return { page: 'command' };
  if (head === 'play') return { page: 'play', id };
  return { page: head };
}

const NAV = [
  { id: 'command', path: '/', label: 'Command Center', icon: LayoutDashboard },
  { id: 'missions', path: '/missions', label: 'Mission Control', icon: Target },
  { id: 'lab', path: '/lab', label: 'Architecture Lab', icon: FlaskConical },
  { id: 'incidents', path: '/incidents', label: 'Incident Response', icon: Siren },
  { id: 'learning', path: '/learning', label: 'Engineering Academy', icon: GraduationCap },
  { id: 'journal', path: '/journal', label: 'Engineering Journal', icon: NotebookPen },
] as const;

export function AppShell() {
  const { pathname } = useLocation();
  const route = routeOf(pathname);
  const settings = useGame((s) => s.settings);
  const xp = useGame((s) => s.progress.xp);
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const finishOnboarding = useGame((s) => s.finishOnboarding);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [navHidden, setNavHidden] = useState(() => {
    try {
      return window.localStorage.getItem('eo-nav-hidden') === '1';
    } catch {
      return false;
    }
  });
  const toggleNav = () => {
    setNavHidden((v) => {
      try {
        window.localStorage.setItem('eo-nav-hidden', v ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !v;
    });
    // let the canvas re-fit once the layout has changed width
    setTimeout(() => window.dispatchEvent(new Event('eo-fit')), 260);
  };
  const level = levelFromXp(xp);
  const inWorkspace = route.page === 'play' || route.page === 'lab';

  useEffect(() => {
    const g = useGame.getState();
    if (route.page !== 'play' && route.page !== 'lab' && g.session) {
      g.setRunning(false);
    }
  }, [route.page]);

  return (
    <div className={`app ${inWorkspace ? 'app-ws' : ''} ${navHidden ? 'nav-hidden' : ''}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <nav className="sidenav" id="primary-nav" aria-label="Primary">
        <div className="brand-row">
          <Link className="brand" to="/" aria-label="Engineering Ops home">
            <Hexagon size={30} className="brand-ico" />
            <div>
              <b>EngOps</b>
              <small>Build. Break. Learn.</small>
            </div>
          </Link>
          <button
            className="icon-btn nav-toggle"
            onClick={toggleNav}
            aria-label="Hide navigation panel"
            aria-expanded={!navHidden}
            aria-controls="primary-nav"
            title="Hide navigation"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>
        <ul>
          {NAV.map((n) => {
            const Icon = n.icon;
            const active =
              route.page === n.id ||
              (n.id === 'missions' &&
                route.page === 'play' &&
                route.id !== undefined &&
                !['m2-db-meltdown', 'm3-deployment', 'm5-queue'].includes(route.id)) ||
              (n.id === 'incidents' && route.page === 'play' && ['m2-db-meltdown', 'm3-deployment', 'm5-queue'].includes(route.id ?? ''));
            return (
              <li key={n.id}>
                <Link to={n.path} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}>
                  <Icon size={18} />
                  <span>{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="sidenav-foot">
          <span className="muted tiny">All infrastructure behaviour is simulated. Costs are estimates, not AWS prices.</span>
        </div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <button
              className="icon-btn nav-toggle-top"
              onClick={toggleNav}
              aria-label={navHidden ? 'Show navigation panel' : 'Hide navigation panel'}
              aria-expanded={!navHidden}
              aria-controls="primary-nav"
              title={navHidden ? 'Show navigation' : 'Hide navigation'}
            >
              {navHidden ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
            <span>Platform</span>
            <i>/</i>
            <b>
              {route.page === 'play'
                ? 'Mission'
                : route.page === 'command'
                  ? 'Command Center'
                  : NAV.find((n) => n.id === route.page)?.label}
            </b>
          </div>
          <div className="top-right">
            <span className="levelchip" title={`${xp} XP`}>
              Lv {level} <small>{xp} XP</small>
            </span>
            <span className="modechip">{settings.mode}</span>
            <button className="icon-btn" aria-label="How to play" onClick={() => setShowHelp(true)}>
              <HelpCircle size={18} />
            </button>
            <button className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}>
              <SettingsIcon size={18} />
            </button>
          </div>
        </header>
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
      </div>
      {navHidden && (
        <button className="nav-fab" onClick={toggleNav} aria-label="Show navigation panel" title="Show navigation">
          <PanelLeftOpen size={18} />
        </button>
      )}
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
      {(!settings.onboarded || showHelp) && (
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
