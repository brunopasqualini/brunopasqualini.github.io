import { archSignature, clone, diffArch, type ArchDiffItem, validateArch } from '@/engine/arch';
import { buildReport, explainChanges, type Report } from '@/engine/analysis';
import { emptyState, solve, type Chaos } from '@/engine/engine';
import { buildChangeStory, type ChangeStory } from '@/engine/story';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, MetricChange, SimState, Snapshot, Workload } from '@/engine/types';
import { MISSION_BY_ID } from '@/content/missions';
import type { ADR, Mission, Postmortem } from '@/content/missions/types';
import { DOCUMENTED, resolveDecisions } from '@/game/decisions';
import { scoreMission, type Outcome } from '@/game/scoring';

export type Mode = 'beginner' | 'intermediate' | 'advanced';

export type Op =
  | { op: 'advance'; n: number }
  | { op: 'deploy'; arch: Arch; strategy?: string }
  | { op: 'action'; id: string }
  | { op: 'chaos'; chaos: Chaos[] }
  | { op: 'revert' }
  | { op: 'workload'; patch: Partial<Workload> };

export interface TimelineEvent {
  minute: number;
  kind: 'deploy' | 'action' | 'incident' | 'chaos' | 'note' | 'revert' | 'verify';
  text: string;
}

export interface ExplainRecord {
  deployedAt: number;
  settled: boolean;
  diff: ArchDiffItem[];
  changes: MetricChange[];
  story: ChangeStory;
  title: string;
}

export interface Session {
  missionId: string;
  mode: Mode;
  attempt: number;
  ops: Op[];
  live: Arch;
  draft: Arch;
  liveStack: Arch[];
  minute: number;
  sim: SimState;
  history: Snapshot[];
  flags: Record<string, any>;
  workload: Workload;
  chaos: Chaos[];
  events: TimelineEvent[];
  deployLog: { minute: number; kind: 'deploy' | 'config' | 'infra' | 'incident'; title: string; detail: string; by: string }[];
  failedRequests: number;
  failed: boolean;
  actionsTaken: string[];
  explain?: ExplainRecord;
  /** non-simulation player state (persisted separately) */
  panelsSeen: string[];
  chosenCauses: string[];
  hintsUsed: number;
  adrs: ADR[];
  postmortem?: Postmortem;
  /** Decision tags from earlier missions that shaped this one (see Mission.consequences). */
  inherited: string[];
  /** Consequences actually applied at the start of this run, for display. */
  consequences: { id: string; title: string; text: string }[];
  verified?: { outcome: Outcome; report: Report; window: Snapshot[]; at: number };
  seed: number;
}

export const LAB_ID = 'lab';
export const LAB_WORKLOAD: Workload = { ...DEFAULT_WORKLOAD, baseRps: 120, profile: [{ t: 0, mult: 1 }] };

export function labMission(): Mission {
  return {
    id: LAB_ID,
    number: 0,
    title: 'Architecture Lab',
    tagline: 'Sandbox',
    difficulty: 'Beginner',
    kind: 'project',
    estMinutes: 0,
    prerequisites: [],
    skills: {},
    learning: [],
    story: '',
    business: { context: '', impact: '' },
    constraints: { notes: [] },
    workload: LAB_WORKLOAD,
    initial: { nodes: [], edges: [] },
    components: [],
    startMinute: 0,
    verifyMinutes: 5,
    verifyAt: 0,
    deployments: [],
    notes: [],
    rootCauses: [],
    actions: [],
    requirements: [],
    weights: {},
    hints: [],
    debrief: { concepts: [], rootCause: '', alternatives: [], mistakes: [], aws: [], experiments: [] },
    seed: 7,
    guidance: [],
    needsPostmortem: false,
    needsADR: false,
  };
}

export function missionOf(id: string): Mission {
  return id === LAB_ID ? labMission() : MISSION_BY_ID[id];
}

const HISTORY_CAP = 480;

function pushHistory(s: Session, snap: Snapshot) {
  s.history.push(snap);
  if (s.history.length > HISTORY_CAP) s.history.splice(0, s.history.length - HISTORY_CAP);
}

/** Preserve live fault state when promoting a draft: faults belong to the running system, not the plan. */
function withLiveFaults(draft: Arch, live: Arch): Arch {
  const faults = new Map(live.nodes.map((n) => [n.id, n.faults]));
  return { ...draft, nodes: draft.nodes.map((n) => ({ ...n, faults: faults.get(n.id) })) };
}

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

function stepMinute(s: Session, mission: Mission, preroll = false) {
  if (mission.onTick) {
    const next = mission.onTick(s.live, s.minute, s.flags);
    if (next) s.live = next;
  }
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

export function setChaos(s: Session, chaos: Chaos[], log = true) {
  s.chaos = chaos;
  s.events.push({
    minute: s.minute,
    kind: 'chaos',
    text: chaos.length ? `Chaos injected: ${chaos.map(describeChaos).join(', ')}` : 'Chaos cleared.',
  });
  if (log) s.ops.push({ op: 'chaos', chaos: clone(chaos) });
}

export function describeChaos(c: Chaos): string {
  switch (c.type) {
    case 'az-outage':
      return `AZ ${c.az} outage`;
    case 'node-down':
      return `component ${c.nodeId} down`;
    case 'slow':
      return `${c.nodeId} ×${c.mult} slower`;
    case 'spike':
      return `traffic ×${c.mult}`;
  }
}

export function patchWorkload(s: Session, patch: Partial<Workload>, log = true) {
  s.workload = { ...s.workload, ...patch };
  if (log) s.ops.push({ op: 'workload', patch: clone(patch) });
}

/** Rebuild a session by deterministically replaying logged operations. */
export function replay(missionId: string, mode: Mode, attempt: number, ops: Op[], initialArch?: Arch, inherited: string[] = []): Session {
  const s = createSession(missionId, mode, attempt, initialArch, inherited);
  for (const o of ops) {
    switch (o.op) {
      case 'advance':
        advance(s, o.n, true);
        break;
      case 'deploy':
        s.draft = clone(o.arch);
        deployDraft(s, o.strategy, true);
        break;
      case 'action':
        applyAction(s, o.id, true);
        break;
      case 'chaos':
        setChaos(s, o.chaos, true);
        break;
      case 'revert':
        revertLast(s, true);
        break;
      case 'workload':
        patchWorkload(s, o.patch, true);
        break;
    }
  }
  return s;
}

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
