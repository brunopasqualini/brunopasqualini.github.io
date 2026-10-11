import { missionOf } from './missions';
import type { Session } from './types';
import type { Mission } from '@/content/missions/types';
import { explainChanges } from '@/engine/analysis';
import { solve } from '@/engine/engine';
import { buildChangeStory } from '@/engine/story';
import type { Snapshot } from '@/engine/types';
import { fireGameDay } from '@/game/gameday';

const HISTORY_CAP = 480;

function pushHistory(s: Session, snap: Snapshot) {
  s.history.push(snap);
  if (s.history.length > HISTORY_CAP) s.history.splice(0, s.history.length - HISTORY_CAP);
}

export function stepMinute(s: Session, mission: Mission, preroll = false) {
  if (mission.onTick) {
    const next = mission.onTick(s.live, s.minute, s.flags);
    if (next) s.live = next;
  }
  if (!preroll && s.gameday) fireGameDay(s);
  const r = solve(s.live, s.workload, s.minute, s.sim, s.chaos);
  s.sim = r.next;
  pushHistory(s, r.snapshot);
  s.minute += 1;
  s.failedRequests += r.snapshot.system.failedRequests;
  if (!preroll && !s.failed && mission.failure) {
    const f = mission.failure;
    if (
      (f.maxFailedRequests && s.failedRequests > f.maxFailedRequests) ||
      (f.maxQueueDelaySec && r.snapshot.system.queueDelaySec > f.maxQueueDelaySec)
    ) {
      s.failed = true;
      s.events.push({ minute: s.minute, kind: 'incident', text: f.text });
    }
  }
  if (!preroll && s.explain && !s.explain.settled && s.minute - s.explain.deployedAt >= 3) {
    const before = s.history[Math.max(0, s.history.length - 1 - (s.minute - s.explain.deployedAt))];
    const after = s.history[s.history.length - 1];
    if (before && after) {
      const changes = explainChanges(before, after, s.live);
      s.explain = { ...s.explain, settled: true, changes, story: buildChangeStory(s.explain.diff, changes, after, s.live) };
    }
  }
}

export function advance(s: Session, n: number, log = true): Session {
  const mission = missionOf(s.missionId);
  for (let i = 0; i < n; i++) stepMinute(s, mission);
  if (log && n > 0) {
    const last = s.ops[s.ops.length - 1];
    if (last && last.op === 'advance') last.n += n;
    else s.ops.push({ op: 'advance', n });
  }
  return s;
}
