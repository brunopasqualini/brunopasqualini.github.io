import { useEffect, useMemo } from 'react';
import { buildReport, type Report } from '@/engine/analysis';
import type { Snapshot } from '@/engine/types';
import { useGame } from '@/game/store';
import { missionOf, type Session } from '@/game/session';
import { indexAt, windowEndingAt } from '@/game/timeline';

export interface Live {
  session: Session | null;
  snap: Snapshot | undefined;
  window: Snapshot[];
  report: Report | undefined;
  /** True when the canvas is showing an older minute instead of the latest. */
  viewing: boolean;
}

/** Derived live data for the current session; recomputed whenever the simulation ticks or the plan changes. */
export function useLive(): Live {
  const tick = useGame((s) => s.tick);
  const session = useGame((s) => s.session);
  const viewMinute = useGame((s) => (s.view.owner === s.session ? s.view.minute : null));
  return useMemo(() => {
    if (!session || session.history.length === 0) return { session, snap: undefined, window: [], report: undefined, viewing: false };
    // when scrubbing, everything that reads the "current" snapshot shows that older minute instead
    const at = indexAt(session.history, viewMinute);
    const window = windowEndingAt(session.history, at);
    const mission = missionOf(session.missionId);
    const report = buildReport(session.live, window, session.workload, { squads: mission.squads });
    return { session, snap: window[window.length - 1], window, report, viewing: at !== session.history.length - 1 };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session, viewMinute]);
}

/** Drives the simulation clock while running. */
export function useSimLoop() {
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const hasSession = useGame((s) => !!s.session);
  useEffect(() => {
    if (!running || !hasSession) return;
    let acc = 0;
    const id = setInterval(() => {
      acc += speed * 0.25;
      const n = Math.floor(acc);
      if (n >= 1) {
        acc -= n;
        useGame.getState().step(n);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, speed, hasSession]);
}
