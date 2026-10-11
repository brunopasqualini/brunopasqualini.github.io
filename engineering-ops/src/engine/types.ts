// Typed data models shared by the simulation, missions, scoring and UI.
// The simulation never imports React — it is a pure, deterministic library.

export type CategoryId = 'app' | 'aws' | 'delivery' | 'reliability';

/** Behavioural role — decides which simulation rules apply to a component. */
export type Role =
  | 'source'
  | 'edge'
  | 'cdn'
  | 'waf'
  | 'lb'
  | 'gateway'
  | 'compute'
  | 'worker'
  | 'db'
  | 'kv'
  | 'search'
  | 'cache'
  | 'queue'
  | 'bus'
  | 'storage'
  | 'external'
  | 'network'
  | 'identity'
  | 'delivery'
  | 'observability'
  | 'policy'
  | 'resilience';

export type FieldType = 'number' | 'select' | 'bool' | 'text' | 'ref' | 'rules';

export interface FieldOption {
  value: string | number;
  label: string;
}

export interface Field {
  key: string;
  label: string;
  type: FieldType;
  options?: FieldOption[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** For `ref` fields: which catalog kinds can be referenced. */
  refKinds?: string[];
  help?: string;
}

export type Scope = 'global' | 'regional' | 'zonal' | 'vpc' | 'none';

export interface CatalogEntry {
  kind: string;
  name: string;
  category: CategoryId;
  group: string;
  role: Role;
  icon: string;
  desc: string;
  /** Short educational note shown in the inspector (beginner mode expands it). */
  learn: string;
  /** Unlock tier: 1 = always available, 2 = after a few missions, 3 = later. */
  tier: 1 | 2 | 3;
  scope: Scope;
  aws?: boolean;
  defaults: Record<string, any>;
  fields: Field[];
}

export type Config = Record<string, any>;

export interface Fault {
  id: string;
  label: string;
  /** Hidden defect injected by a mission — surfaced only through telemetry. */
  errorRate?: number;
  latencyMult?: number;
  cpuMult?: number;
  memAdd?: number;
  poisonShare?: number;
  /** Log line surfaced in application logs while the fault is active (evidence, not the root cause). */
  log?: string;
}

export interface ArchNode {
  id: string;
  kind: string;
  label: string;
  position: { x: number; y: number };
  config: Config;
  faults?: Fault[];
}

export interface EdgeConfig {
  /** Calls to the target per request handled by the source (queries per request, etc.). */
  weight: number;
  timeoutMs: number;
  retries: number;
  circuitBreaker: boolean;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  config: EdgeConfig;
}

export interface Arch {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export interface Workload {
  baseRps: number;
  /** Piecewise-linear multiplier profile over virtual minutes. */
  profile: { t: number; mult: number }[];
  /** When set, the profile repeats every this many virtual minutes (a daily curve, a cron-driven batch). Unset: it plays once and holds its last value. */
  profileCycle?: number;
  readRatio: number;
  /** Share of reads that are cacheable (same key requested repeatedly). */
  cacheableShare: number;
  /** Share of query cost that is a slow, unindexed scan until fixed. */
  slowQueryShare: number;
  staticShare: number;
  maliciousShare: number;
  payloadKB: number;
  /** Messages whose handler always fails (poison). */
  poisonShare: number;
  /** Average message processing time (ms). */
  avgProcessMs: number;
  /** Maximum tolerated staleness for cached reads (seconds). */
  freshnessSeconds: number;
  /** Share of reads issued right after the same user's own write (read-your-writes), e.g. an order confirmation page. */
  readAfterWriteShare?: number;
  /** Share of writes aimed at one single item (a counter, a stock level, a celebrity's profile). */
  hotKeyShare?: number;
  /** Average seconds between requests for the same cacheable key. Popular keys (an on-sale page) are re-read within seconds. */
  keyReuseSeconds?: number;
  /** Customers' data volume growth (GB/day) used by storage cost. */
  logGBPerMillionReq: number;
}

export type NodeStatus = 'healthy' | 'degraded' | 'overloaded' | 'unavailable' | 'insecure' | 'misconfigured' | 'idle';

export interface Reason {
  code: string;
  severity: 'info' | 'warn' | 'crit';
  text: string;
}

export interface NodeMetrics {
  id: string;
  kind: string;
  role: Role;
  offered: number;
  served: number;
  capacity: number;
  util: number;
  mem: number;
  latencyMs: number;
  p95Ms: number;
  errorRate: number;
  status: NodeStatus;
  replicas: number;
  costMonthly: number;
  reasons: Reason[];
  connUsed?: number;
  connMax?: number;
  hitRate?: number;
  queueDepth?: number;
  dlqDepth?: number;
  drainRate?: number;
  arrivalRate?: number;
  queueDelaySec?: number;
  dupRate?: number;
  replicaLagSec?: number;
  /** Percent of read-after-write reads that return data from before the write (replica lag). */
  staleReadPct?: number;
  /** Writes per second landing on the single hottest item of a key-value table. */
  hotItemWritesPerSec?: number;
  blocked?: string;
}

export interface EdgeMetrics {
  rps: number;
  errorRate: number;
  amplification: number;
  breakerOpen: boolean;
  blocked?: string;
}

export interface SystemMetrics {
  rps: number;
  throughput: number;
  successRate: number;
  errorRate: number;
  p50: number;
  p95: number;
  costMonthly: number;
  queueBacklog: number;
  queueDelaySec: number;
  dlqDepth: number;
  duplicateRate: number;
  lostPerMin: number;
  dbConnPct: number;
  maxUtil: number;
  failedRequests: number;
  customerImpact: number;
}

export interface Snapshot {
  minute: number;
  rps: number;
  nodes: Record<string, NodeMetrics>;
  edges: Record<string, EdgeMetrics>;
  system: SystemMetrics;
}

export interface QueueState {
  depth: number;
  poison: number;
  dlq: number;
  lost: number;
}

export interface SimState {
  queues: Record<string, QueueState>;
  /** Autoscaled replica counts (lag behind demand). */
  replicas: Record<string, number>;
}

export interface MetricChange {
  key: string;
  label: string;
  before: number;
  after: number;
  unit: string;
  better: boolean | null;
  because: string;
}
