import { useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { diffArch } from '@/engine/arch';
import { LAB_ID } from '@/game/session';
import { useGame } from '@/game/store';
import { Tabs } from '@/shared/ui/common';
import { useLive, useSimLoop } from '@/game/hooks';
import { Canvas } from '@/features/workspace/Canvas';
import { Dock } from '@/features/workspace/Dock';
import { Inspector } from '@/features/workspace/Inspector';
import { LabPanel } from '@/features/workspace/LabPanel';
import { Library } from '@/features/workspace/Library';
import { Debrief, MissionIntro } from '@/features/workspace/Modals';
import { MissionPanel } from '@/features/workspace/MissionPanel';
import { PlanPanel } from '@/features/workspace/PlanPanel';
import { CanvasHeader } from '@/features/workspace/CanvasHeader';
import { EventsCard } from '@/features/workspace/EventsCard';
import { usePersistentFlag } from '@/shared/hooks/usePersistentFlag';

export function Play({ missionId, template }: { missionId: string; template?: string }) {
  const session = useGame((s) => s.session);
  const openMission = useGame((s) => s.openMission);
  const rightTab = useGame((s) => s.rightTab);
  const setRightTab = useGame((s) => s.setRightTab);
  const pane = useGame((s) => s.mobilePane);
  const setPane = useGame((s) => s.setMobilePane);
  const setRunning = useGame((s) => s.setRunning);
  const closeSession = useGame((s) => s.closeSession);
  const [leftOpen, toggleLeft] = usePersistentFlag('eo-ws-left', true);
  const [rightOpen, toggleRight] = usePersistentFlag('eo-ws-right', true);
  useSimLoop();
  const { session: live } = useLive();
  const isLab = missionId === LAB_ID;

  useEffect(() => {
    const cur = useGame.getState().session;
    if (!cur || cur.missionId !== missionId || (template && isLab)) openMission(missionId, { template });
    return () => {
      useGame.getState().setRunning(false);
      closeSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missionId]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable);
      const g = useGame.getState();
      // undo/redo work even with a button focused, but never steal the shortcut from a text field's own undo
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !typing) {
        const k = e.key.toLowerCase();
        if (k === 'z' || k === 'y') {
          e.preventDefault();
          if (k === 'y' || e.shiftKey) g.redoEdit();
          else g.undoEdit();
          return;
        }
      }
      if (typing || t?.tagName === 'BUTTON') return;
      if (e.code === 'Space') {
        e.preventDefault();
        g.setRunning(!g.running);
      }
      if (e.key === '.') g.step(1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [setRunning]);

  const pending = live ? diffArch(live.live, live.draft).length : 0;
  if (!session || session.missionId !== missionId)
    return (
      <div className="page">
        <p className="muted">Loading simulation…</p>
      </div>
    );

  return (
    <div className="workspace" data-pane={pane} data-left={leftOpen ? 'open' : 'closed'} data-right={rightOpen ? 'open' : 'closed'}>
      <div className="ws-main">
        <aside className="ws-left" aria-label="Mission">
          <div className="ws-scroll card-panel">{isLab ? <LabPanel /> : <MissionPanel />}</div>
          <EventsCard />
        </aside>
        <div className="ws-center">
          <CanvasHeader leftOpen={leftOpen} rightOpen={rightOpen} onToggleLeft={() => toggleLeft()} onToggleRight={() => toggleRight()} />
          <Canvas />
          <Dock />
        </div>
        <aside className="ws-right" aria-label="Components and inspector">
          <Library />
          <section className="card-panel ws-side">
            <Tabs
              label="Side panel"
              value={rightTab}
              onChange={setRightTab}
              tabs={[
                { id: 'inspect', label: 'Selected' },
                { id: 'plan', label: 'Plan & deploy', badge: pending > 0 ? <span className="badge badge-warn">{pending}</span> : null },
              ]}
            />
            <div className="ws-right-body">
              {rightTab === 'inspect' && <Inspector />}
              {rightTab === 'plan' && <PlanPanel />}
            </div>
          </section>
        </aside>
      </div>
      <nav className="mobile-nav" aria-label="Workspace sections">
        {(
          [
            ['mission', 'Mission'],
            ['canvas', 'Canvas'],
            ['build', 'Build'],
            ['evidence', 'Evidence'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={pane === id ? 'on' : ''} aria-pressed={pane === id} onClick={() => setPane(id)}>
            {label}
            {id === 'build' && pending > 0 ? <span className="badge badge-warn">{pending}</span> : null}
          </button>
        ))}
      </nav>
      <MissionIntro />
      <Debrief />
    </div>
  );
}

export function PlayRoute() {
  const { missionId } = useParams();
  return missionId ? <Play missionId={missionId} /> : null;
}

export function LabRoute() {
  const [params] = useSearchParams();
  return <Play missionId={LAB_ID} template={params.get('template') ?? undefined} />;
}
