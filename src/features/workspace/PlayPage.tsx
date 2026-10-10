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
import { StatusBar } from '@/features/workspace/StatusBar';

export function Play({ missionId, template }: { missionId: string; template?: string }) {
  const session = useGame((s) => s.session);
  const openMission = useGame((s) => s.openMission);
  const rightTab = useGame((s) => s.rightTab);
  const setRightTab = useGame((s) => s.setRightTab);
  const pane = useGame((s) => s.mobilePane);
  const setPane = useGame((s) => s.setMobilePane);
  const setRunning = useGame((s) => s.setRunning);
  const closeSession = useGame((s) => s.closeSession);
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
      if (t && ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const g = useGame.getState();
        g.setRunning(!g.running);
      }
      if (e.key === '.') useGame.getState().step(1);
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
    <div className="workspace" data-pane={pane}>
      <StatusBar />
      <div className="ws-main">
        <div className="ws-left">
          <Library />
        </div>
        <div className="ws-center">
          <Canvas />
          <Dock />
        </div>
        <div className="ws-right">
          <Tabs
            label="Side panel"
            value={rightTab}
            onChange={setRightTab}
            tabs={[
              { id: 'inspect', label: 'Inspector' },
              { id: 'mission', label: isLab ? 'Lab' : 'Mission' },
              { id: 'plan', label: 'Plan', badge: pending > 0 ? <span className="badge badge-warn">{pending}</span> : null },
            ]}
          />
          <div className="ws-right-body">
            {rightTab === 'inspect' && <Inspector />}
            {rightTab === 'mission' && (isLab ? <LabPanel /> : <MissionPanel />)}
            {rightTab === 'plan' && <PlanPanel />}
          </div>
        </div>
      </div>
      <nav className="mobile-nav" aria-label="Workspace sections">
        {(
          [
            ['library', 'Components'],
            ['canvas', 'Canvas'],
            ['inspect', 'Inspect'],
            ['evidence', 'Evidence'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={pane === id ? 'on' : ''} aria-pressed={pane === id} onClick={() => setPane(id)}>
            {label}
            {id === 'inspect' && pending > 0 ? <span className="badge badge-warn">{pending}</span> : null}
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
