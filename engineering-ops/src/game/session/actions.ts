import { missionOf } from './missions';
import { advance } from './step';
import type { Session } from './types';
import { explainChanges } from '@/engine/analysis';
import { archSignature, clone, diffArch, validateArch } from '@/engine/arch';
import { solve } from '@/engine/engine';
import { buildChangeStory } from '@/engine/story';
import type { Arch } from '@/engine/types';

/** Preserve live fault state when promoting a draft: faults belong to the running system, not the plan. */
export function withLiveFaults(draft: Arch, live: Arch): Arch {
  const faults = new Map(live.nodes.map((n) => [n.id, n.faults]));
  return { ...draft, nodes: draft.nodes.map((n) => ({ ...n, faults: faults.get(n.id) })) };
}

export interface DeployResult {
  ok: boolean;
  blocked?: string[];
}

export function deployDraft(s: Session, strategy = 'all-at-once', log = true): DeployResult {
  const issues = validateArch(s.draft).filter((i) => i.severity === 'error');
  if (issues.length) return { ok: false, blocked: issues.map((i) => i.text) };
  if (archSignature(s.draft) === archSignature(s.live)) return { ok: false, blocked: ['No changes to deploy.'] };
  const diff = diffArch(s.live, s.draft);
  const beforeSnap = s.history[s.history.length - 1];
  s.liveStack.push(clone(s.live));
  s.live = withLiveFaults(clone(s.draft), s.live);
  s.draft = clone(s.live);
  // Immediate feedback: first solve with the new architecture and current load.
  const r = solve(s.live, s.workload, Math.max(0, s.minute - 1), s.sim, s.chaos);
  const changes = beforeSnap ? explainChanges(beforeSnap, r.snapshot, s.live) : [];
  s.explain = {
    deployedAt: s.minute,
    settled: false,
    diff,
    changes,
    story: buildChangeStory(diff, changes, r.snapshot, s.live),
    title:
      diff
        .slice(0, 2)
        .map((d) => d.text)
        .join('; ') + (diff.length > 2 ? ` (+${diff.length - 2} more)` : ''),
  };
  s.events.push({
    minute: s.minute,
    kind: 'deploy',
    text: `Deployed (${strategy}): ${diff.length} change${diff.length === 1 ? '' : 's'} — ${diff
      .slice(0, 3)
      .map((d) => d.text)
      .join('; ')}${diff.length > 3 ? '…' : ''}`,
  });
  s.deployLog.push({
    minute: s.minute,
    kind: 'infra',
    title: `Infrastructure change (${diff.length})`,
    detail: diff
      .slice(0, 4)
      .map((d) => d.text)
      .join(' · '),
    by: 'you',
  });
  if (log) s.ops.push({ op: 'deploy', arch: clone(s.live), strategy });
  return { ok: true };
}

export function revertLast(s: Session, log = true): boolean {
  const prev = s.liveStack.pop();
  if (!prev) return false;
  s.live = withLiveFaults(prev, s.live);
  s.draft = clone(s.live);
  s.explain = undefined;
  s.events.push({ minute: s.minute, kind: 'revert', text: 'Reverted to the previous deployed architecture.' });
  if (log) s.ops.push({ op: 'revert' });
  return true;
}

export function applyAction(s: Session, id: string, log = true): { ok: boolean; message: string } {
  const mission = missionOf(s.missionId);
  const action = mission.actions.find((a) => a.id === id);
  if (!action) return { ok: false, message: 'Unknown action.' };
  if (action.available && !action.available(s.live, s.flags)) return { ok: false, message: 'This action is not available right now.' };
  s.events.push({ minute: s.minute, kind: 'action', text: `Started: ${action.label} (~${action.minutes} min)` });
  const first = action.apply(s.live, s.flags, s.minute);
  const minutes = first.minutes ?? action.minutes;
  if (log) s.ops.push({ op: 'action', id });
  // Time passes while the action runs; its effect lands on completion.
  advance(s, Math.max(0, minutes - 1), false);
  const res = action.apply(s.live, s.flags, s.minute);
  const touched = res.arch;
  s.live = touched;
  try {
    s.draft = action.apply(s.draft, s.flags, s.minute).arch;
  } catch {
    s.draft = clone(touched);
  }
  Object.assign(s.flags, res.flags ?? {});
  s.actionsTaken.push(id);
  if (s.draft.nodes.length === 0) s.draft = clone(touched);
  s.events.push({ minute: s.minute, kind: 'action', text: res.log });
  s.deployLog.push({ minute: s.minute, kind: 'config', title: action.label, detail: res.log, by: 'you' });
  advance(s, 1, false);
  return { ok: true, message: res.log };
}
