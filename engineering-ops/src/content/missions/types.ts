import type { Arch, Fault, Snapshot, Workload } from '@/engine/types';
import type { Report } from '@/engine/analysis';

export type Difficulty = 'Beginner' | 'Intermediate' | 'Advanced';
export type MissionKind = 'project' | 'incident';

export type SkillId = 'se' | 'sa' | 'sd' | 'aws' | 'net' | 'devops' | 'plat' | 'sre' | 'data' | 'finops';

export type DimensionId =
  | 'reliability'
  | 'performance'
  | 'cost'
  | 'security'
  | 'maintainability'
  | 'opSimplicity'
  | 'devProductivity'
  | 'diagnosis'
  | 'correctness'
  | 'rationale';

export type PanelId =
  | 'overview'
  | 'logs'
  | 'metrics'
  | 'traces'
  | 'dependencies'
  | 'deployments'
  | 'cost'
  | 'security'
  | 'alerts'
  | 'database'
  | 'queues'
  | 'network'
  | 'notes';

export interface ADR {
  id: string;
  title: string;
  context: string;
  problem: string;
  options: string;
  decision: string;
  pros: string;
  cons: string;
  implications: string;
  minute: number;
}

export interface Postmortem {
  what: string;
  impact: string;
  evidence: string;
  restored: string;
  worsened: string;
  prevent: string;
}

export interface EvalCtx {
  arch: Arch;
  report: Report;
  snap: Snapshot;
  workload: Workload;
  flags: Record<string, any>;
  actionsTaken: string[];
  adrs: ADR[];
  postmortem?: Postmortem;
}

export interface Requirement {
  id: string;
  label: string;
  hard: boolean;
  /** Declarative check against a report metric... */
  metric?: string;
  op?: '>=' | '<=' | '>' | '<' | '==';
  value?: number;
  /** ...or a custom check. */
  check?: (c: EvalCtx) => { pass: boolean; detail: string };
  /** Why this requirement exists (shown in the debrief). */
  why: string;
}

export interface RootCause {
  id: string;
  label: string;
  correct: boolean;
  evidencePanels: PanelId[];
  why: string;
}

export interface ActionResult {
  arch: Arch;
  log: string;
  flags?: Record<string, any>;
  /** Virtual minutes the action takes to complete (the clock advances). */
  minutes?: number;
}

export interface MissionAction {
  id: string;
  label: string;
  description: string;
  minutes: number;
  /** Only show when this returns true. */
  available?: (arch: Arch, flags: Record<string, any>) => boolean;
  apply: (arch: Arch, flags: Record<string, any>, minute: number) => ActionResult;
}

export interface Hint {
  tier: 1 | 2 | 3;
  text: string;
}

export interface DeployEvent {
  minute: number;
  kind: 'deploy' | 'config' | 'infra' | 'incident';
  title: string;
  detail: string;
  by: string;
}

export interface Debrief {
  concepts: { title: string; body: string }[];
  rootCause: string;
  alternatives: { name: string; when: string; tradeoffs: string }[];
  mistakes: string[];
  aws: string[];
  experiments: string[];
}

/** A choice the player made that later missions can react to. Recorded when a mission is passed. */
export interface Decision {
  /** Stable id other missions refer to, e.g. 'm7-n-plus-one:cached-the-symptom'. */
  tag: string;
  /** What the player did, in plain words (shown in the debrief). */
  label: string;
  /** How it will follow them into later missions (shown in the debrief). */
  carries: string;
  /** True when this trades a lasting cost for speed. Whether it is debt or a justified trade-off is judged from context. */
  shortcut?: boolean;
  /** Set by the game: investment, justified trade-off, or debt. Authors only set it for non-shortcuts. */
  kind?: 'investment' | 'tradeoff' | 'debt';
  /** Set by the game: why it was judged that way (shown in the debrief). */
  judgement?: string;
}

/** A debt or benefit inherited from an earlier decision, applied when this mission starts. */
export interface Consequence {
  id: string;
  /** The Decision.tag that triggers it. */
  tag: string;
  title: string;
  text: string;
  /** Change to the starting architecture (pure: return a new Arch). */
  apply?: (arch: Arch) => Arch;
  /** Change to the starting workload. */
  workload?: Partial<Workload>;
  /** A softer version applied instead when the shortcut was taken knowingly and documented: a known cost is cheaper to carry. */
  documented?: { text: string; apply?: (arch: Arch) => Arch; workload?: Partial<Workload> };
}

export interface Mission {
  id: string;
  number: number;
  title: string;
  tagline: string;
  difficulty: Difficulty;
  kind: MissionKind;
  estMinutes: number;
  prerequisites: string[];
  skills: Partial<Record<SkillId, number>>;
  learning: string[];
  story: string;
  business: { context: string; impact: string };
  constraints: { budget?: number; availability?: number; p95?: number; deadline?: string; notes: string[] };
  workload: Workload;
  initial: Arch;
  /** Component kinds the player may place in this mission. */
  components: string[];
  startMinute: number;
  verifyMinutes: number;
  /** Mission minute at which verification evaluates the system (traffic level). */
  verifyAt: number;
  squads?: number;
  deployments: DeployEvent[];
  notes: { title: string; body: string; panel: PanelId }[];
  rootCauses: RootCause[];
  /** Concrete first move for the guided first run: where to act, in plain words. */
  firstMove?: string;
  actions: MissionAction[];
  requirements: Requirement[];
  weights: Partial<Record<DimensionId, number>>;
  failure?: { maxFailedRequests?: number; maxQueueDelaySec?: number; text: string };
  /** Called every virtual minute (including during pre-roll) to script events such as a bad deploy. */
  onTick?: (arch: Arch, minute: number, flags: Record<string, any>) => Arch | void;
  hints: Hint[];
  debrief: Debrief;
  seed: number;
  /** Panels the beginner is guided toward. */
  guidance: string[];
  needsPostmortem: boolean;
  needsADR: boolean;
  /** Optional baseline cost to compare to (for scoring cost efficiency without a budget). */
  baselineCost?: number;
  /** Decisions to record, derived from the final design, when the mission is passed. */
  decisions?: (arch: Arch, ctx: { adrs: ADR[]; flags: Record<string, any> }) => Decision[];
  /** Debts and benefits inherited from decisions in earlier missions. */
  consequences?: Consequence[];
}

export type FaultDef = Fault;
