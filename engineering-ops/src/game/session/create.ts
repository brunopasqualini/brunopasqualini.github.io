import { LAB_ID, missionOf } from './missions';
import { stepMinute } from './step';
import type { Mode, Session } from './types';
import { clone } from '@/engine/arch';
import { emptyState } from '@/engine/engine';
import type { Arch } from '@/engine/types';
import { DOCUMENTED } from '@/game/decisions';

export function createSession(missionId: string, mode: Mode, attempt = 1, initialArch?: Arch, inherited: string[] = []): Session {
  const mission = missionOf(missionId);
  let arch = clone(initialArch ?? mission.initial);
  let workload = clone(mission.workload);
  const consequences: Session['consequences'] = [];
  if (missionId !== LAB_ID) {
    for (const c of mission.consequences ?? []) {
      if (!inherited.includes(c.tag)) continue;
      const v = c.documented && inherited.includes(c.tag + DOCUMENTED) ? { ...c, ...c.documented } : c;
      if (v.apply) arch = v.apply(arch);
      if (v.workload) workload = { ...workload, ...v.workload };
      consequences.push({ id: c.id, title: c.title, text: v.text });
    }
  }
  const s: Session = {
    missionId,
    mode,
    attempt,
    ops: [],
    live: arch,
    draft: clone(arch),
    liveStack: [],
    minute: 0,
    sim: emptyState(),
    history: [],
    flags: {},
    workload,
    chaos: [],
    events: [],
    deployLog: [...mission.deployments].map((d) => ({ ...d })),
    failedRequests: 0,
    failed: false,
    actionsTaken: [],
    panelsSeen: [],
    chosenCauses: [],
    hintsUsed: 0,
    adrs: [],
    inherited,
    consequences,
    seed: mission.seed,
  };
  // Pre-roll: simulate the lead-up so the player starts with real telemetry.
  for (let i = 0; i < mission.startMinute; i++) stepMinute(s, mission, true);
  s.events.push({
    minute: s.minute,
    kind: 'note',
    text: missionId === LAB_ID ? 'Sandbox ready. Build a system, then press Deploy.' : `Mission started: ${mission.title}.`,
  });
  return s;
}
