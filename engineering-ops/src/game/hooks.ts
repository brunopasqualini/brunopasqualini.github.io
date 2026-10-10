import { useEffect, useMemo } from 'react';
import { buildReport, type Report } from '@/engine/analysis';
import type { Snapshot } from '@/engine/types';
import { useGame } from '@/game/store';
import { missionOf, type Session } from '@/game/session';

export interface Live {
  session: Session | null;
  snap: Snapshot | undefined;
  window: Snapshot[];
  report: Report | undefined;
}

/** Derived live data for the current session; recomputed whenever the simulation ticks or the plan changes. */
export function useLive(): Live {
  const tick = useGame((s) => s.tick);
  const session = useGame((s) => s.session);
  return useMemo(() => {
    if (!session || session.history.length === 0) return { session, snap: undefined, window: [], report: undefined };
    const window = session.history.slice(-5);
    const mission = missionOf(session.missionId);
    const report = buildReport(session.live, window, session.workload, { squads: mission.squads });
    return { session, snap: window[window.length - 1], window, report };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session]);
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
