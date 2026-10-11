import { missionOf } from './missions';
import type { Session } from './types';
import { type Report, buildReport } from '@/engine/analysis';
import { clone } from '@/engine/arch';
import { solve } from '@/engine/engine';
import type { SimState, Snapshot } from '@/engine/types';
import { resolveDecisions } from '@/game/decisions';
import { type Outcome, scoreMission } from '@/game/scoring';

export function currentSnapshot(s: Session): Snapshot {
  return s.history[s.history.length - 1];
}

/** Run a verification load test from the current state and score it against the mission requirements. */
export function verify(s: Session, firstCompletion: boolean): { outcome: Outcome; report: Report; window: Snapshot[] } {
  const mission = missionOf(s.missionId);
  let sim: SimState = clone(s.sim);
  const flags = clone(s.flags);
  const arch = clone(s.live);
  const base = Math.max(s.minute, mission.verifyAt);
  const window: Snapshot[] = [];
  const a = arch;
  for (let i = 0; i < mission.verifyMinutes; i++) {
    const r = solve(a, s.workload, base + i, sim, s.chaos);
    sim = r.next;
    window.push(r.snapshot);
  }
  const last5 = window.slice(-5);
  const report = buildReport(a, last5, s.workload, { squads: mission.squads });
  const outcome = scoreMission({
    mission,
    arch: a,
    window: last5,
    report,
    workload: s.workload,
    flags,
    actionsTaken: s.actionsTaken,
    adrs: s.adrs,
    postmortem: s.postmortem,
    chosenCauses: s.chosenCauses,
    panelsSeen: s.panelsSeen,
    hintsUsed: s.hintsUsed,
    minutes: s.minute - mission.startMinute,
    attempt: s.attempt,
    failedIncident: s.failed,
    firstCompletion,
  });
  const informed = !outcome.diagnosis || outcome.diagnosis.panelsSeen >= outcome.diagnosis.panelsNeeded;
  outcome.decisions = resolveDecisions(mission.decisions?.(a, { adrs: s.adrs, flags: s.flags }) ?? [], {
    adrs: s.adrs,
    postmortem: s.postmortem,
    informed,
  });
  return { outcome, report, window: last5 };
}
