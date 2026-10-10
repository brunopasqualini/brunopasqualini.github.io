import { E, N, wl } from '@/content/missions/helpers';
import type { Arch, Workload } from '@/engine/types';
import type { Chaos } from '@/engine/engine';

export interface LabTemplate {
  id: string;
  name: string;
  blurb: string;
  arch: Arch;
  workload?: Partial<Workload>;
  chaos?: Chaos[];
  drill?: { title: string; goal: string };
}

const blank: Arch = { nodes: [N('users', 'users', 40, 160)], edges: [] };

const threeTier: Arch = {
  nodes: [
    N('users', 'users', 20, 150),
    N('alb', 'lb', 210, 150),
    N('ecs', 'api', 430, 150, { replicas: 3, instanceSize: 'small', dbPoolSize: 10 }, 'api'),
    N('rds', 'db', 660, 150, { size: 'small', storageGB: 100, multiAZ: false }, 'db'),
    N('cloudwatch', 'cw', 430, 320, {}),
  ],
  edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 2 })],
};

const queuePipeline: Arch = {
  nodes: [
    N('users', 'users', 20, 150),
    N('backend-service', 'api', 200, 150, { replicas: 2 }, 'order-api'),
    N('sqs', 'q', 420, 150, {}, 'jobs'),
    N('worker', 'w', 640, 150, { replicas: 2, concurrency: 20, idempotent: true }, 'worker'),
    N('rds', 'db', 860, 150, { size: 'small' }, 'db'),
  ],
  edges: [E('users', 'api'), E('api', 'q'), E('q', 'w'), E('w', 'db', { weight: 3 })],
};

const serverless: Arch = {
  nodes: [
    N('users', 'users', 20, 150),
    N('apigw', 'gw', 210, 150, {}, 'API Gateway'),
    N('lambda', 'fn', 430, 150, { replicas: 10, maxReplicas: 100, autoscale: true, dbPoolSize: 2 }, 'handler'),
    N('dynamodb', 'ddb', 660, 150, { capacityMode: 'on-demand' }, 'table'),
  ],
  edges: [E('users', 'gw'), E('gw', 'fn'), E('fn', 'ddb', { weight: 2 })],
};

/** A scaled web platform: CDN, load balancer, autoscaled web tier, cache-aside, async jobs and object storage. */
const scaledPlatform: Arch = {
  nodes: [
    N('users', 'users', 20, 170),
    N('cloudfront', 'cdn', 150, 170, {}, 'CDN'),
    N('alb', 'lb', 280, 170, {}, 'Load Balancer'),
    N('ecs', 'web', 440, 40, { replicas: 2, maxReplicas: 8, autoscale: true, dbPoolSize: 8 }, 'Web App'),
    N('ecs', 'jobs', 440, 300, { replicas: 2, dbPoolSize: 4 }, 'Background Jobs'),
    N('elasticache', 'cache', 640, 0, {}, 'Cache'),
    N('rds', 'db', 640, 170, { size: 'medium', multiAZ: true, readReplicas: 1 }, 'Database'),
    N('sqs', 'queue', 640, 340, {}, 'Message Queue'),
    N('worker', 'worker', 800, 340, { replicas: 2, concurrency: 10, idempotent: true }, 'Worker'),
    N('s3', 's3', 930, 340, {}, 'Storage'),
    N('cloudwatch', 'cw', 280, 340, {}, 'Monitoring'),
  ],
  edges: [
    E('users', 'cdn'),
    E('cdn', 'lb'),
    E('lb', 'web'),
    E('lb', 'jobs'),
    E('web', 'cache'),
    E('web', 'db', { weight: 2 }),
    E('cache', 'db'),
    E('jobs', 'queue'),
    E('queue', 'worker'),
    E('worker', 'db', { weight: 2 }),
    E('worker', 's3'),
    E('cw', 'web'),
    E('cw', 'jobs'),
  ],
};

export const TEMPLATES: LabTemplate[] = [
  { id: 'blank', name: 'Blank canvas', blurb: 'Start from nothing but a traffic source.', arch: blank },
  { id: 'three-tier', name: 'Classic 3-tier web app', blurb: 'ALB → containers → relational database.', arch: threeTier },
  {
    id: 'queue',
    name: 'Queue + worker pipeline',
    blurb: 'API enqueues; workers process asynchronously.',
    arch: queuePipeline,
    workload: { avgProcessMs: 400 },
  },
  {
    id: 'scaled-platform',
    name: 'Scaled web platform',
    blurb: 'CDN, load balancer, autoscaled web tier, cache, queue + worker and object storage.',
    arch: scaledPlatform,
    workload: { baseRps: 400 },
  },
  { id: 'serverless', name: 'Serverless API', blurb: 'API Gateway → Lambda → DynamoDB.', arch: serverless },
  {
    id: 'drill-az',
    name: 'Drill: AZ outage on a fragile stack',
    blurb: 'A single-AZ database and a one-AZ footprint. Make the system survive losing zone A.',
    arch: threeTier,
    chaos: [{ type: 'az-outage', az: 'a' }],
    workload: { baseRps: 120 },
    drill: { title: 'Availability Zone A is down', goal: 'Restore ≥ 99% availability while AZ A is out.' },
  },
  {
    id: 'drill-retry',
    name: 'Drill: retry storm',
    blurb: 'The database is slow and the app retries aggressively. Contain the cascade.',
    chaos: [{ type: 'slow', nodeId: 'db', mult: 6 }],
    arch: {
      nodes: threeTier.nodes.map((n) => ({ ...n, config: n.id === 'api' ? { ...n.config, replicas: 4 } : n.config })),
      edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 2, retries: 5, timeoutMs: 800 })],
    },
    workload: { baseRps: 70 },
    drill: {
      title: 'Database brown-out with aggressive retries',
      goal: 'Keep success rate ≥ 90% without removing the database dependency.',
    },
  },
  {
    id: 'drill-spike',
    name: 'Drill: 4× traffic spike',
    blurb: 'Marketing sent the email. Absorb the spike with autoscaling, caching or queues.',
    arch: threeTier,
    chaos: [{ type: 'spike', mult: 4 }],
    workload: { baseRps: 100 },
    drill: { title: 'Unexpected 4× traffic spike', goal: 'Hold ≥ 99% availability and p95 under 500 ms during the spike.' },
  },
];

export const templateWorkload = (t: LabTemplate): Workload => wl({ baseRps: 120, ...(t.workload ?? {}) });
