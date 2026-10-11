import type { ADR, Postmortem } from '@/content/missions/types';
import type { Report } from '@/engine/analysis';
import type { ArchDiffItem } from '@/engine/arch';
import type { Chaos } from '@/engine/engine';
import type { ChangeStory } from '@/engine/story';
import type { Arch, MetricChange, SimState, Snapshot, Workload } from '@/engine/types';
import type { GameDayRun } from '@/game/gameday';
import type { Outcome } from '@/game/scoring';

export type Mode = 'beginner' | 'intermediate' | 'advanced';

/** Every player or simulator action that is logged, so a saved run can be replayed exactly. */
export type Op =
  | { op: 'advance'; n: number }
  | { op: 'deploy'; arch: Arch; strategy?: string }
  | { op: 'action'; id: string }
  | { op: 'chaos'; chaos: Chaos[] }
  | { op: 'revert' }
  | { op: 'workload'; patch: Partial<Workload> }
  | { op: 'gameday'; id: string };

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
  /** A scripted multi-fault exercise in progress or finished (Lab only). */
  gameday?: GameDayRun;
}
