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
}

export type FaultDef = Fault;
