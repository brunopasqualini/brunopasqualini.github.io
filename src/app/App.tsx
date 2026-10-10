import { Download, FlaskConical, PanelLeftClose, PanelLeftOpen, GraduationCap, HelpCircle, Hexagon, LayoutDashboard, NotebookPen, Settings as SettingsIcon, Siren, Target, Trash2, Upload, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { levelFromXp } from '@/game/progression';
import { useGame } from '@/game/store';
import { Modal } from '@/shared/ui/common';
import { Academy, CommandCenter, IncidentResponse, Journal, MissionControl } from '@/features/pages';
import { go, useRoute } from '@/app/router';

const Play = lazy(() => import('@/features/workspace/PlayPage').then((m) => ({ default: m.Play })));

const NAV = [
  { id: 'command', path: '/', label: 'Command Center', icon: LayoutDashboard },
  { id: 'missions', path: '/missions', label: 'Mission Control', icon: Target },
  { id: 'lab', path: '/lab', label: 'Architecture Lab', icon: FlaskConical },
  { id: 'incidents', path: '/incidents', label: 'Incident Response', icon: Siren },
  { id: 'academy', path: '/academy', label: 'Engineering Academy', icon: GraduationCap },
  { id: 'journal', path: '/journal', label: 'Engineering Journal', icon: NotebookPen },
] as const;

function Onboarding({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const steps = [
    { t: 'Welcome to Engineering Ops', b: 'Build. Break. Learn. This is a simulator for engineering judgment: you design systems, deploy them, watch what happens, and learn from the consequences. Everything is simulated — no cloud account, no real charges.' },
    { t: 'The loop', b: 'Read the scenario → investigate the evidence (logs, metrics, traces, changes, cost) → form a hypothesis → change the design → deploy → observe → handle side effects → verify → read the debrief. Every change has causal, explainable effects.' },
    { t: 'The workspace', b: 'Drag components from the library onto the canvas and connect them. Select anything to inspect and configure it. Edits are a draft: open the Plan tab and press Deploy. Use Run / +1m to move simulated time; Space toggles the clock.' },
    { t: 'Choose your mode', b: 'Beginner explains concepts and points you to the right evidence. Intermediate gives less guidance. Advanced adds noisy logs, missing telemetry and competing requirements. You can switch any time in the Command Center.' },
  ];
  const s = steps[i];
  return (
    <Modal title={s.t} onClose={onClose} footer={<>
      <button className="btn btn-ghost" onClick={onClose}>Skip</button>
      {i > 0 && <button className="btn btn-ghost" onClick={() => setI(i - 1)}>Back</button>}
      {i < steps.length - 1 ? <button className="btn btn-primary" onClick={() => setI(i + 1)}>Next</button> : <button className="btn btn-primary" onClick={() => { onClose(); go('/play/m1-monolith'); }}>Start Mission 1</button>}
    </>}>
      <p className="story">{s.b}</p>
      <div className="dots" aria-hidden="true">{steps.map((_, k) => <span key={k} className={k === i ? 'on' : ''} />)}</div>
    </Modal>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const mode = useGame((s) => s.settings.mode);
  const showAll = useGame((s) => s.settings.showAllComponents);
  const setMode = useGame((s) => s.setMode);
  const setShowAll = useGame((s) => s.setShowAll);
  const exportSave = useGame((s) => s.exportSave);
  const importSave = useGame((s) => s.importSave);
  const resetAll = useGame((s) => s.resetAll);
  const toast = useGame((s) => s.toast);
  const file = useRef<HTMLInputElement>(null);
  return (
    <Modal title="Settings & save data" onClose={onClose}>
      <div className="form">
        <div className="form-field"><span>Difficulty mode</span>
          <div className="mode-pick" role="radiogroup" aria-label="Difficulty mode">{(['beginner', 'intermediate', 'advanced'] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{m}</button>)}</div></div>
        <label className="form-field row"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /><span>Unlock the entire component catalog in the Architecture Lab (skip progressive disclosure)</span></label>
        <div className="form-field"><span>Save data</span>
          <p className="muted tiny">Progress is stored in this browser (localStorage). Export a file to back it up or move it to another browser.</p>
          <div className="row-gap">
            <button className="btn btn-ghost" onClick={() => { const blob = new Blob([exportSave()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'engineering-ops-save.json'; a.click(); }}><Download size={14} /> Export</button>
            <button className="btn btn-ghost" onClick={() => file.current?.click()}><Upload size={14} /> Import</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; toast(importSave(await f.text()) ? 'Save imported.' : 'That file is not a valid save.', 'info'); }} />
            <button className="btn btn-danger" onClick={() => { if (confirm('Erase all progress, journal entries and saved sessions?')) { resetAll(); toast('Progress reset.', 'info'); onClose(); } }}><Trash2 size={14} /> Reset all progress</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function App() {
  const route = useRoute();
  const settings = useGame((s) => s.settings);
  const xp = useGame((s) => s.progress.xp);
  const toasts = useGame((s) => s.toasts);
  const dismiss = useGame((s) => s.dismissToast);
  const finishOnboarding = useGame((s) => s.finishOnboarding);
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [navHidden, setNavHidden] = useState(() => { try { return window.localStorage.getItem('eo-nav-hidden') === '1'; } catch { return false; } });
  const toggleNav = () => {
    setNavHidden((v) => {
      try { window.localStorage.setItem('eo-nav-hidden', v ? '0' : '1'); } catch { /* storage unavailable */ }
      return !v;
    });
    // let the canvas re-fit once the layout has changed width
    setTimeout(() => window.dispatchEvent(new Event('eo-fit')), 260);
  };
  const level = levelFromXp(xp);
  const inWorkspace = route.page === 'play' || route.page === 'lab';

  useEffect(() => {
    const g = useGame.getState();
    if (route.page !== 'play' && route.page !== 'lab' && g.session) { g.setRunning(false); }
  }, [route.page]);

  return (
    <div className={`app ${inWorkspace ? 'app-ws' : ''} ${navHidden ? 'nav-hidden' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <nav className="sidenav" id="primary-nav" aria-label="Primary">
        <div className="brand-row">
          <a className="brand" href="#/" aria-label="Engineering Ops home"><Hexagon size={30} className="brand-ico" /><div><b>EngOps</b><small>Build. Break. Learn.</small></div></a>
          <button className="icon-btn nav-toggle" onClick={toggleNav} aria-label="Hide navigation panel" aria-expanded={!navHidden} aria-controls="primary-nav" title="Hide navigation"><PanelLeftClose size={18} /></button>
        </div>
        <ul>
          {NAV.map((n) => { const Icon = n.icon; const active = route.page === n.id || (n.id === 'missions' && route.page === 'play' && route.id !== undefined && !['m2-db-meltdown', 'm3-deployment', 'm5-queue'].includes(route.id)) || (n.id === 'incidents' && route.page === 'play' && ['m2-db-meltdown', 'm3-deployment', 'm5-queue'].includes(route.id ?? '')); return (
            <li key={n.id}><a href={`#${n.path}`} className={active ? 'on' : ''} aria-current={active ? 'page' : undefined}><Icon size={18} /><span>{n.label}</span></a></li>
          ); })}
        </ul>
        <div className="sidenav-foot"><span className="muted tiny">All infrastructure behaviour is simulated. Costs are estimates, not AWS prices.</span></div>
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            <button className="icon-btn nav-toggle-top" onClick={toggleNav} aria-label={navHidden ? 'Show navigation panel' : 'Hide navigation panel'} aria-expanded={!navHidden} aria-controls="primary-nav" title={navHidden ? 'Show navigation' : 'Hide navigation'}>{navHidden ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button>
            <span>Platform</span><i>/</i><b>{route.page === 'play' ? 'Mission' : route.page === 'command' ? 'Command Center' : NAV.find((n) => n.id === route.page)?.label}</b></div>
          <div className="top-right">
            <span className="levelchip" title={`${xp} XP`}>Lv {level} <small>{xp} XP</small></span>
            <span className="modechip">{settings.mode}</span>
            <button className="icon-btn" aria-label="How to play" onClick={() => setShowHelp(true)}><HelpCircle size={18} /></button>
            <button className="icon-btn" aria-label="Settings" onClick={() => setShowSettings(true)}><SettingsIcon size={18} /></button>
          </div>
        </header>
        <main className="content" id="main">
          {route.page === 'command' && <CommandCenter />}
          {route.page === 'missions' && <MissionControl />}
          {route.page === 'incidents' && <IncidentResponse />}
          {route.page === 'academy' && <Academy />}
          {route.page === 'journal' && <Journal />}
          <Suspense fallback={<div className="page"><p className="muted">Loading simulation…</p></div>}>
            {route.page === 'lab' && <Play missionId="lab" template={route.query.get('template') ?? undefined} />}
            {route.page === 'play' && route.id && <Play missionId={route.id} />}
          </Suspense>
        </main>
      </div>
      {navHidden && <button className="nav-fab" onClick={toggleNav} aria-label="Show navigation panel" title="Show navigation"><PanelLeftOpen size={18} /></button>}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}<button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}><X size={14} /></button></div>)}
      </div>
      {(!settings.onboarded || showHelp) && <Onboarding onClose={() => { finishOnboarding(); setShowHelp(false); }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
