import { clone } from '@/engine/arch';
import type { Arch } from '@/engine/types';
import { startGameDay } from '@/game/gameday';
import { applyAction, deployDraft, revertLast } from './actions';
import { createSession } from './create';
import { patchWorkload, setChaos } from './labOps';
import { advance } from './step';
import type { Mode, Op, Session } from './types';

/** How each logged operation is applied when a run is rebuilt. A new `Op` type will not compile until it has a handler here. */
const HANDLERS: { [K in Op['op']]: (s: Session, o: Extract<Op, { op: K }>) => void } = {
  advance: (s, o) => advance(s, o.n, true),
  deploy: (s, o) => {
    s.draft = clone(o.arch);
    deployDraft(s, o.strategy, true);
  },
  action: (s, o) => applyAction(s, o.id, true),
  chaos: (s, o) => setChaos(s, o.chaos, true),
  revert: (s) => revertLast(s, true),
  workload: (s, o) => patchWorkload(s, o.patch, true),
  gameday: (s, o) => startGameDay(s, o.id, true),
};

/** Rebuild a session by deterministically replaying logged operations. */
export function replay(missionId: string, mode: Mode, attempt: number, ops: Op[], initialArch?: Arch, inherited: string[] = []): Session {
  const s = createSession(missionId, mode, attempt, initialArch, inherited);
  for (const o of ops) (HANDLERS[o.op] as (s: Session, o: Op) => void)(s, o);
  return s;
}
