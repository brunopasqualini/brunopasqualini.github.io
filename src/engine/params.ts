// Documented parameters for the simulation. All numbers are *simulated estimates*
// loosely inspired by real-world orders of magnitude. They are NOT AWS list prices
// and NOT production measurements — they exist to make trade-offs explainable.

export const HOURS_PER_MONTH = 730;
export const SECONDS_PER_MONTH = 2_592_000; // 30 days
export const APP_PORT = 8080;

/** Capacity and price scale linearly with instance size. */
export const SIZE_MULT: Record<string, number> = { small: 1, medium: 2, large: 4, xlarge: 8 };

export interface ComputeParams {
  /** Sustainable requests/second per replica at "small" size. */
  rps: number;
  /** Median processing latency (ms) of the replica itself. */
  latency: number;
  /** Simulated $/hour per replica at "small" size. */
  hourly: number;
  /** Fixed monthly extras (control plane, etc.). */
  fixed?: number;
  /** Per-million-request price (serverless). */
  perMillionReq?: number;
}

export const COMPUTE: Record<string, ComputeParams> = {
  'web-frontend': { rps: 220, latency: 18, hourly: 0.05 },
  'backend-service': { rps: 120, latency: 35, hourly: 0.05 },
  monolith: { rps: 90, latency: 45, hourly: 0.05 },
  microservice: { rps: 140, latency: 30, hourly: 0.05 },
  'auth-service': { rps: 260, latency: 12, hourly: 0.05 },
  worker: { rps: 100, latency: 100, hourly: 0.05 },
  ec2: { rps: 120, latency: 35, hourly: 0.05 },
  ecs: { rps: 130, latency: 32, hourly: 0.058 },
  eks: { rps: 130, latency: 32, hourly: 0.05, fixed: 73 },
  'k8s-cluster': { rps: 130, latency: 32, hourly: 0.05, fixed: 73 },
  lambda: { rps: 40, latency: 55, hourly: 0, perMillionReq: 2.2 },
};

export interface DbParams {
  qps: number;
  maxConn: number;
  hourly: number;
}
export const DB: Record<string, DbParams> = {
  small: { qps: 300, maxConn: 100, hourly: 0.09 },
  medium: { qps: 700, maxConn: 250, hourly: 0.18 },
  large: { qps: 1600, maxConn: 600, hourly: 0.36 },
  xlarge: { qps: 3600, maxConn: 1500, hourly: 0.72 },
};
export const DB_STORAGE_PER_GB = 0.115;
export const DB_READ_UNITS = 1;
export const DB_WRITE_UNITS = 3;
export const DB_SLOW_SCAN_MULT = 12; // an unindexed hot query costs this many times a normal read
/**
 * A user typically re-reads within about this long after their own write. A replica further behind than the tolerated
 * lag misses the write for that read; the share that misses grows linearly until lag reaches tolerated + window.
 * An approximation of read-after-write staleness, not a measurement.
 */
export const RAW_TOLERATED_LAG_SEC = 0.3;
export const RAW_READ_WINDOW_SEC = 2;
/**
 * DynamoDB serves one partition, and so any single item, at up to about 1,000 write units per second (1 KB items).
 * Provisioned capacity and on-demand mode share this ceiling: it is per item, not per table.
 */
export const KV_ITEM_WRITES_PER_SEC = 1000;
export const DB_BASE_READ_MS = 4;
export const DB_BASE_WRITE_MS = 8;

export const CACHE_NODE_HOURLY = 0.034;
export const CACHE_KEYSPACE_RPS_PER_UNIT = 2000; // requests/s one "small node" worth of memory serves well

export const QUEUE_PER_MILLION_REQ = 0.4 * 3; // send + receive + delete
export const BUS_PER_MILLION = 1.0;

export const NAT_HOURLY = 0.045;
export const NAT_PER_GB = 0.045;
export const ALB_HOURLY = 0.0225;
export const ALB_LCU_HOURLY = 0.008;
export const EGRESS_PER_GB = 0.09;
export const CDN_PER_GB = 0.06;
export const APIGW_PER_MILLION = 3.5;
export const WAF_BASE = 11;
export const WAF_PER_MILLION = 0.6;
export const ROUTE53_BASE = 0.9;

export const LOG_INGEST_PER_GB = 0.5;
export const LOG_STORE_PER_GB_MONTH = 0.03;
export const METRIC_PER_NODE = 3;
export const LOG_LEVEL_MULT: Record<string, number> = { debug: 6, info: 1, warn: 0.3 };

export const S3_PRICE: Record<string, number> = { standard: 0.023, ia: 0.0125, glacier: 0.004 };
export const S3_LIFECYCLE_COLD_SHARE = 0.65; // share of data that transitions to cheaper classes

export const DDB_READ_PER_MILLION = 0.125; // on-demand, after the November 2024 price reduction
export const DDB_WRITE_PER_MILLION = 0.625;
export const DDB_RCU_HOURLY = 0.00013;
export const DDB_WCU_HOURLY = 0.00065;

export const SEARCH_NODE_HOURLY = 0.11;

/** Flat monthly cost for components that do not scale with traffic. */
export const FIXED_MONTHLY: Record<string, number> = {
  'source-repo': 4,
  'ci-pipeline': 20,
  'test-suite': 15,
  'artifact-repo': 5,
  'container-image': 0,
  'container-registry': 6,
  'cd-pipeline': 18,
  'deploy-env': 40,
  'approval-gate': 0,
  'feature-flag': 10,
  canary: 0,
  'blue-green': 0,
  rollback: 0,
  iac: 0,
  terraform: 0,
  'config-mgmt': 3,
  'secrets-mgmt': 8,
  'dev-portal': 60,
  'service-template': 0,
  'observability-stack': 160,
  kms: 1,
  'secrets-manager': 0.4,
  cloudtrail: 2.5,
  'metrics-collector': 14,
  'central-logging': 20,
  tracing: 25,
  dashboard: 3,
  'alert-rule': 0.1,
  'synthetic-monitoring': 12,
  slo: 0,
  'error-budget': 0,
  'circuit-breaker': 0,
  'retry-policy': 0,
  'rate-limiter': 0,
  bulkhead: 0,
  'health-check': 1.5,
  autoscaling: 0,
  backup: 6,
  'dr-config': 30,
  vpc: 0,
  subnet: 0,
  igw: 0,
  sg: 0,
  nacl: 0,
  iam: 0,
  users: 0,
};

export const DEFAULT_WORKLOAD = {
  baseRps: 100,
  profile: [{ t: 0, mult: 1 }],
  readRatio: 0.8,
  cacheableShare: 0.7,
  slowQueryShare: 0,
  staticShare: 0.3,
  maliciousShare: 0.02,
  payloadKB: 24,
  poisonShare: 0,
  avgProcessMs: 120,
  freshnessSeconds: 60,
  readAfterWriteShare: 0,
  hotKeyShare: 0,
  logGBPerMillionReq: 1.2,
};
