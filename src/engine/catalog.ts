import type { CatalogEntry, CategoryId, Field, Role, Scope } from '@/engine/types';

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------
const num = (key: string, label: string, min: number, max: number, extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type: 'number',
  min,
  max,
  step: 1,
  ...extra,
});
const sel = (key: string, label: string, options: (string | [string | number, string])[], extra: Partial<Field> = {}): Field => ({
  key,
  label,
  type: 'select',
  options: options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : { value: o, label: o })),
  ...extra,
});
const bool = (key: string, label: string, help?: string): Field => ({ key, label, type: 'bool', help });
const txt = (key: string, label: string, help?: string): Field => ({ key, label, type: 'text', help });
const ref = (key: string, label: string, refKinds: string[], help?: string): Field => ({ key, label, type: 'ref', refKinds, help });

const SIZES: [string, string][] = [
  ['small', 'small (1×)'],
  ['medium', 'medium (2×)'],
  ['large', 'large (4×)'],
  ['xlarge', 'xlarge (8×)'],
];
const DB_SIZES: [string, string][] = [
  ['small', 'db.small'],
  ['medium', 'db.medium'],
  ['large', 'db.large'],
  ['xlarge', 'db.xlarge'],
];

const computeFields: Field[] = [
  num('replicas', 'Replicas', 1, 64, {
    help: 'Identical instances behind the entry point. More replicas = more capacity AND more downstream connections.',
  }),
  sel('instanceSize', 'Instance size', SIZES),
  bool('autoscale', 'Autoscaling', 'Scales toward demand with a delay — it cannot fix a saturated dependency.'),
  num('maxReplicas', 'Max replicas (autoscale)', 1, 128),
  num('dbPoolSize', 'DB pool size per replica', 1, 200, { help: 'Connections each replica opens to databases.' }),
  sel('logLevel', 'Log level', ['info', 'debug', 'warn'], { help: 'Debug logging multiplies log ingestion cost.' }),
  txt('costTag', 'Cost allocation tag', 'e.g. team=checkout. Untagged spend cannot be attributed.'),
];
const awsPlacement: Field[] = [
  ref('subnet', 'Subnet', ['subnet']),
  ref('sg', 'Security group', ['sg']),
  ref('iamRole', 'IAM role', ['iam']),
];
const dbFields: Field[] = [
  sel('size', 'Instance size', DB_SIZES),
  num('storageGB', 'Storage', 20, 20000, { unit: 'GB' }),
  bool('multiAZ', 'Multi-AZ standby', 'Synchronous standby in a second AZ. Survives an AZ outage; does not fix slow queries.'),
  num('readReplicas', 'Read replicas', 0, 5, { help: 'Spread reads. Replicas lag behind the writer.' }),
  sel(
    'readYourWrites',
    'Reads that follow a write',
    [
      ['replica', 'Served by a replica (may be stale)'],
      ['primary', 'Pinned to the primary (fresh)'],
    ],
    { help: 'Reads that must show the user’s own write can be routed to the primary for a few seconds after it. They load the primary.' },
  ),
  bool(
    'connectionPooler',
    'Connection pooler / proxy',
    'Multiplexes thousands of client connections onto few database connections (RDS Proxy, PgBouncer).',
  ),
  bool('indexed', 'Hot-path queries indexed', 'Resolves slow sequential scans. Found via query statistics.'),
  num('backupRetentionDays', 'Backup retention', 0, 35, { unit: 'days' }),
  bool('encrypted', 'Encryption at rest'),
  bool('publicAccess', 'Publicly accessible'),
  bool('crossRegionReplica', 'Cross-region replica', 'Improves disaster recovery; adds cost and replication lag.'),
  ref('sg', 'Security group', ['sg']),
  txt('costTag', 'Cost allocation tag'),
];
const cacheFields: Field[] = [
  num('nodes', 'Nodes', 1, 6),
  sel('size', 'Node size', SIZES),
  num('ttlSeconds', 'TTL', 1, 86400, { unit: 's', help: 'Longer TTL → higher hit rate but staler data.' }),
  bool('invalidateOnWrite', 'Invalidate on write', 'Evict keys when the source of truth changes.'),
  ref('sg', 'Security group', ['sg']),
  txt('costTag', 'Cost allocation tag'),
];
const queueFields: Field[] = [
  num('visibilityTimeoutSec', 'Visibility timeout', 1, 43200, {
    unit: 's',
    help: 'Must exceed worst-case processing time or messages are delivered twice.',
  }),
  num('maxReceiveCount', 'Max receives before DLQ', 1, 20),
  num('retentionDays', 'Retention', 1, 14, { unit: 'days' }),
  txt('costTag', 'Cost allocation tag'),
];
const storageFields: Field[] = [
  num('storageGB', 'Stored data', 1, 500000, { unit: 'GB' }),
  sel('storageClass', 'Storage class', [
    ['standard', 'Standard'],
    ['ia', 'Infrequent Access'],
    ['glacier', 'Glacier / archive'],
  ]),
  bool('lifecycle', 'Lifecycle policy', 'Transition cold objects to cheaper classes and expire old versions.'),
  bool('versioning', 'Versioning'),
  bool('encrypted', 'Encryption at rest'),
  bool('publicAccess', 'Public access'),
  bool('vpcEndpoint', 'Gateway VPC endpoint', 'Keeps S3 traffic off the NAT gateway (no per-GB NAT fee).'),
  txt('costTag', 'Cost allocation tag'),
];

// ---------------------------------------------------------------------------
// Catalog construction
// ---------------------------------------------------------------------------
const entries: CatalogEntry[] = [];
interface Opts {
  tier?: 1 | 2 | 3;
  scope?: Scope;
  aws?: boolean;
  defaults?: Record<string, any>;
  fields?: Field[];
}
function E(
  kind: string,
  name: string,
  category: CategoryId,
  group: string,
  role: Role,
  icon: string,
  desc: string,
  learn: string,
  o: Opts = {},
) {
  const fields = o.fields ?? [];
  // Every editable field has a default so new components always start in a valid state.
  const defaults: Record<string, any> = { ...(o.defaults ?? {}) };
  for (const f of fields) {
    if (f.key in defaults || f.type === 'rules') continue;
    defaults[f.key] = f.type === 'bool' ? false : f.type === 'number' ? (f.min ?? 0) : f.type === 'select' ? f.options![0].value : '';
  }
  entries.push({
    kind,
    name,
    category,
    group,
    role,
    icon,
    desc,
    learn,
    tier: o.tier ?? 1,
    scope: o.scope ?? 'none',
    aws: o.aws,
    defaults,
    fields,
  });
}

const computeDefaults = {
  replicas: 2,
  instanceSize: 'small',
  autoscale: false,
  maxReplicas: 8,
  dbPoolSize: 10,
  logLevel: 'info',
  costTag: '',
};

// ---- Application & software architecture ---------------------------------
E(
  'users',
  'Users / Traffic',
  'app',
  'Traffic',
  'source',
  'Users',
  'Where requests originate: browsers, apps and partners.',
  'Every simulation starts from a workload. Capacity planning is meaningless without one.',
  {
    defaults: { share: 1 },
    fields: [
      num('share', 'Share of mission traffic', 0, 2, { step: 0.05 }),
      bool(
        'excludeFromSlo',
        'Exclude from availability and latency',
        'Requests you are entitled to reject, such as an abusive client over its quota, are not counted against your SLO.',
      ),
    ],
  },
);
E(
  'web-frontend',
  'Web frontend',
  'app',
  'Application',
  'compute',
  'Monitor',
  'Serves the UI and static bundles; calls APIs.',
  'Static assets belong on a CDN — frontends should stay thin.',
  { defaults: { ...computeDefaults, replicas: 2 }, fields: computeFields },
);
E(
  'api-gateway',
  'API gateway',
  'app',
  'Application',
  'gateway',
  'Router',
  'Single entry point: routing, auth, throttling.',
  'A gateway centralises cross-cutting concerns but is also a shared dependency.',
  {
    defaults: { maxRps: 5000, throttleRps: 0 },
    fields: [num('maxRps', 'Capacity', 100, 100000, { unit: 'rps' }), num('throttleRps', 'Throttle (0 = off)', 0, 100000, { unit: 'rps' })],
  },
);
E(
  'backend-service',
  'Backend service',
  'app',
  'Application',
  'compute',
  'Server',
  'A stateless service that implements business logic.',
  'Stateless services scale horizontally; their shared data stores do not.',
  { defaults: { ...computeDefaults }, fields: computeFields },
);
E(
  'monolith',
  'Monolith',
  'app',
  'Application',
  'compute',
  'Layers',
  'One deployable containing many modules.',
  'A modular monolith with enforced boundaries keeps coupling low without distributed-systems overhead.',
  {
    defaults: { ...computeDefaults, instanceSize: 'medium', moduleBoundaries: 'none', modules: 1 },
    fields: [
      ...computeFields,
      sel('moduleBoundaries', 'Module boundaries', [
        ['none', 'None (big ball of mud)'],
        ['packages', 'Packages by convention'],
        ['enforced', 'Enforced (public interfaces only)'],
      ]),
      num('modules', 'Domain modules', 1, 12, { help: 'Billing, catalogue, orders, …' }),
    ],
  },
);
E(
  'microservice',
  'Microservice',
  'app',
  'Application',
  'compute',
  'Boxes',
  'An independently deployable service owning one domain.',
  'Each service adds deployment, monitoring and failure-mode overhead — split along domain boundaries, not layers.',
  {
    tier: 2,
    defaults: { ...computeDefaults, domain: '', ownsData: true },
    fields: [txt('domain', 'Owned domain', 'e.g. billing, catalogue'), bool('ownsData', 'Owns its data store'), ...computeFields],
  },
);
E(
  'auth-service',
  'Authentication service',
  'app',
  'Application',
  'compute',
  'KeyRound',
  'Issues and validates sessions/tokens.',
  'Auth sits on every request path — its availability bounds yours.',
  { tier: 2, defaults: { ...computeDefaults }, fields: computeFields },
);
E(
  'worker',
  'Worker process',
  'app',
  'Application',
  'worker',
  'Cog',
  'Consumes jobs from a queue in the background.',
  'Idempotent handlers make at-least-once delivery safe.',
  {
    tier: 2,
    defaults: { ...computeDefaults, concurrency: 10, idempotent: false, maxConcurrency: 200 },
    fields: [
      num('concurrency', 'Concurrency per replica', 1, 500),
      bool('idempotent', 'Idempotent handler', 'Safe to process the same message twice.'),
      ...computeFields,
    ],
  },
);
E(
  'external-api',
  'External API',
  'app',
  'Application',
  'external',
  'ExternalLink',
  'A third-party dependency you do not control.',
  'Third parties rate-limit and fail. Retries without backoff amplify their outages.',
  {
    defaults: { rpsLimit: 200, latencyMs: 120, availability: 99.9 },
    fields: [num('rpsLimit', 'Rate limit', 10, 100000, { unit: 'rps' }), num('latencyMs', 'Latency', 5, 5000, { unit: 'ms' })],
  },
);
E(
  'relational-db',
  'Relational database',
  'app',
  'Data',
  'db',
  'Database',
  'ACID transactions and rich queries.',
  'Connections, not CPU, are often the first limit hit.',
  {
    defaults: {
      size: 'small',
      storageGB: 100,
      multiAZ: false,
      readReplicas: 0,
      readYourWrites: 'replica',
      connectionPooler: false,
      indexed: true,
      backupRetentionDays: 7,
      encrypted: true,
      publicAccess: false,
      crossRegionReplica: false,
      costTag: '',
    },
    fields: dbFields,
  },
);
E(
  'document-db',
  'Document database',
  'app',
  'Data',
  'kv',
  'FileJson',
  'Flexible schema with horizontal scaling.',
  'Access patterns, not schemas, drive the design.',
  {
    tier: 2,
    defaults: { capacityMode: 'on-demand', rcu: 1000, wcu: 500, writeShards: 1, encrypted: true, costTag: '' },
    fields: [
      sel('capacityMode', 'Capacity mode', ['on-demand', 'provisioned']),
      num('rcu', 'Read capacity', 10, 100000),
      num('wcu', 'Write capacity', 10, 100000),
      num('writeShards', 'Write shards for the hottest key', 1, 64, {
        help: 'Spread one hot key across N items (key#1 … key#N). Reads must then combine the shards.',
      }),
      bool('encrypted', 'Encryption at rest'),
      txt('costTag', 'Cost allocation tag'),
    ],
  },
);
E(
  'cache',
  'Cache',
  'app',
  'Data',
  'cache',
  'Zap',
  'In-memory store for hot, repeatable reads.',
  'Caching trades freshness for speed; invalidation is the hard part.',
  { tier: 2, defaults: { nodes: 1, size: 'small', ttlSeconds: 60, invalidateOnWrite: false, costTag: '' }, fields: cacheFields },
);
E(
  'message-queue',
  'Message queue',
  'app',
  'Data',
  'queue',
  'Inbox',
  'Buffers work between producers and consumers.',
  'Queues absorb spikes but hide overload as latency — watch depth and age.',
  { tier: 2, defaults: { visibilityTimeoutSec: 30, maxReceiveCount: 5, retentionDays: 4, costTag: '' }, fields: queueFields },
);
E(
  'event-bus',
  'Event bus',
  'app',
  'Data',
  'bus',
  'Radio',
  'Publish events; many subscribers react.',
  'Pub/sub decouples producers from consumers but makes flows harder to trace.',
  { tier: 3, defaults: {}, fields: [] },
);
E(
  'object-storage',
  'Object storage',
  'app',
  'Data',
  'storage',
  'Archive',
  'Durable storage for blobs, exports and backups.',
  'Cheap per GB, but unlimited retention quietly accumulates cost.',
  {
    defaults: {
      storageGB: 500,
      storageClass: 'standard',
      lifecycle: false,
      versioning: false,
      encrypted: true,
      publicAccess: false,
      vpcEndpoint: false,
      costTag: '',
    },
    fields: storageFields,
  },
);
E(
  'search-index',
  'Search index',
  'app',
  'Data',
  'search',
  'Search',
  'Full-text search and analytics queries.',
  'Search indexes are derived data: rebuildable but eventually consistent.',
  {
    tier: 3,
    defaults: { nodes: 2, size: 'medium', costTag: '' },
    fields: [num('nodes', 'Nodes', 1, 12), sel('size', 'Node size', SIZES), txt('costTag', 'Cost allocation tag')],
  },
);

// ---- Networking & AWS ----------------------------------------------------
E(
  'route53',
  'Amazon Route 53',
  'aws',
  'Edge & DNS',
  'edge',
  'Globe',
  'Global DNS with health-checked routing policies.',
  'DNS is global and highly available; TTLs make failover slower than you expect.',
  {
    aws: true,
    scope: 'global',
    defaults: { routing: 'simple', healthChecks: false },
    fields: [sel('routing', 'Routing policy', ['simple', 'weighted', 'latency', 'failover']), bool('healthChecks', 'Health checks')],
  },
);
E(
  'cloudfront',
  'Amazon CloudFront',
  'aws',
  'Edge & DNS',
  'cdn',
  'CloudCog',
  'Global CDN: caches static content near users.',
  'Offload static and cacheable responses before they reach your VPC.',
  {
    aws: true,
    scope: 'global',
    tier: 2,
    defaults: { cacheTTLSec: 3600 },
    fields: [num('cacheTTLSec', 'Default TTL', 0, 86400, { unit: 's' })],
  },
);
E(
  'waf',
  'AWS WAF',
  'aws',
  'Edge & DNS',
  'waf',
  'ShieldCheck',
  'Filters malicious HTTP traffic with managed rules.',
  'WAF reduces abusive load and attack surface at the edge.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { managedRules: true, rateLimit: 0 },
    fields: [bool('managedRules', 'Managed rule groups'), num('rateLimit', 'Rate limit per IP (0 = off)', 0, 20000)],
  },
);
E(
  'alb',
  'Application Load Balancer',
  'aws',
  'Edge & DNS',
  'lb',
  'Network',
  'Layer-7 load balancing across targets in multiple AZs.',
  'A load balancer distributes traffic — it does not fix a saturated downstream.',
  {
    aws: true,
    scope: 'vpc',
    defaults: { subnet: '', sg: '', crossZone: true, healthTimeoutMs: 5000, healthIntervalSec: 15, unhealthyThreshold: 3, costTag: '' },
    fields: [
      ref('subnet', 'Subnet', ['subnet']),
      ref('sg', 'Security group', ['sg']),
      bool('crossZone', 'Cross-zone balancing'),
      num('healthTimeoutMs', 'Health check timeout', 100, 30000, {
        unit: 'ms',
        help: 'Deep health check: probes include dependency time. If the timeout is below the target’s latency, healthy targets get removed.',
      }),
      num('healthIntervalSec', 'Health check interval', 5, 300, { unit: 's' }),
      num('unhealthyThreshold', 'Unhealthy threshold', 1, 10),
      txt('costTag', 'Cost allocation tag'),
    ],
  },
);
E(
  'apigw',
  'Amazon API Gateway',
  'aws',
  'Edge & DNS',
  'gateway',
  'Router',
  'Managed API front door with throttling and auth.',
  'Managed gateways have account-level throttles (default quotas you can ask to raise) and per-request pricing.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { maxRps: 10000, throttleRps: 0 },
    fields: [num('maxRps', 'Capacity', 100, 100000, { unit: 'rps' }), num('throttleRps', 'Throttle (0 = off)', 0, 100000, { unit: 'rps' })],
  },
);
E(
  'vpc',
  'Amazon VPC',
  'aws',
  'Network',
  'network',
  'Cloud',
  'A logically isolated network in one Region.',
  'A VPC spans AZs within a Region; subnets are AZ-scoped.',
  { aws: true, scope: 'regional', defaults: { cidr: '10.0.0.0/16' }, fields: [txt('cidr', 'CIDR block')] },
);
E(
  'subnet',
  'Subnet',
  'aws',
  'Network',
  'network',
  'Layers3',
  'A range of IPs in one Availability Zone. Public if its route table sends 0.0.0.0/0 to an internet gateway.',
  'Public vs private is defined by routes, not by a label.',
  {
    aws: true,
    scope: 'zonal',
    defaults: { vpc: '', az: 'a', routeInternet: 'none', nat: '', nacl: '' },
    fields: [
      ref('vpc', 'VPC', ['vpc']),
      sel('az', 'Availability Zone', ['a', 'b', 'c']),
      sel('routeInternet', 'Default route (0.0.0.0/0)', [
        ['none', 'none (local only)'],
        ['igw', 'Internet gateway'],
        ['nat', 'NAT gateway'],
      ]),
      ref('nat', 'NAT gateway (if route = NAT)', ['nat']),
      ref('nacl', 'Network ACL', ['nacl']),
    ],
  },
);
E(
  'igw',
  'Internet gateway',
  'aws',
  'Network',
  'network',
  'DoorOpen',
  'Lets resources with public IPs reach and be reached from the internet.',
  'Required for public subnets and for NAT gateways to reach the internet.',
  { aws: true, scope: 'vpc', defaults: { vpc: '' }, fields: [ref('vpc', 'Attached VPC', ['vpc'])] },
);
E(
  'nat',
  'NAT gateway',
  'aws',
  'Network',
  'network',
  'ArrowUpRight',
  'Outbound-only internet access for private subnets. Must live in a public subnet.',
  'NAT is zonal, billed hourly and per GB — it is a classic cost trap.',
  {
    aws: true,
    scope: 'zonal',
    defaults: { subnet: '', costTag: '' },
    fields: [ref('subnet', 'Subnet (must be public)', ['subnet']), txt('costTag', 'Cost allocation tag')],
  },
);
E(
  'sg',
  'Security group',
  'aws',
  'Network',
  'network',
  'ShieldHalf',
  'Stateful virtual firewall attached to resources.',
  'Reference other security groups instead of CIDR ranges; least privilege applies to networks too.',
  {
    aws: true,
    scope: 'vpc',
    defaults: { inbound: [], egressMode: 'all', egressPorts: '443' },
    fields: [
      { key: 'inbound', label: 'Inbound rules', type: 'rules' },
      sel('egressMode', 'Outbound', [
        ['all', 'Allow all'],
        ['restricted', 'Restricted to ports below'],
      ]),
      txt('egressPorts', 'Allowed outbound ports (comma separated)'),
    ],
  },
);
E(
  'nacl',
  'Network ACL',
  'aws',
  'Network',
  'network',
  'ListChecks',
  'Stateless subnet-level allow/deny rules.',
  'NACLs are stateless: return traffic must be allowed explicitly.',
  {
    aws: true,
    scope: 'vpc',
    tier: 2,
    defaults: { allowOutbound: true, allowEphemeralReturn: true },
    fields: [bool('allowOutbound', 'Allow outbound'), bool('allowEphemeralReturn', 'Allow ephemeral return ports (1024-65535)')],
  },
);
E(
  'ec2',
  'Amazon EC2',
  'aws',
  'Compute',
  'compute',
  'Server',
  'Virtual machines you patch and scale yourself.',
  'Maximum control, maximum operational burden.',
  {
    aws: true,
    scope: 'zonal',
    defaults: { ...computeDefaults, subnet: '', sg: '', iamRole: '' },
    fields: [...awsPlacement, ...computeFields],
  },
);
E(
  'ecs',
  'Amazon ECS',
  'aws',
  'Compute',
  'compute',
  'Container',
  'Managed container orchestration.',
  'Containers improve density and deploy speed; placement still matters.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { ...computeDefaults, subnet: '', sg: '', iamRole: '' },
    fields: [...awsPlacement, ...computeFields],
  },
);
E(
  'eks',
  'Amazon EKS',
  'aws',
  'Compute',
  'compute',
  'Boxes',
  'Managed Kubernetes control plane.',
  'Kubernetes is a platform foundation, not a platform — golden paths still need building.',
  {
    aws: true,
    scope: 'regional',
    tier: 3,
    defaults: { ...computeDefaults, subnet: '', sg: '', iamRole: '' },
    fields: [...awsPlacement, ...computeFields],
  },
);
E(
  'lambda',
  'AWS Lambda',
  'aws',
  'Compute',
  'compute',
  'Zap',
  'Event-driven functions, scaled per request.',
  'Scales out quickly, within account concurrency and burst limits, and multiplies downstream connections.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { ...computeDefaults, replicas: 20, maxReplicas: 100, autoscale: true, subnet: '', sg: '', iamRole: '' },
    fields: [...awsPlacement, ...computeFields],
  },
);
E(
  's3',
  'Amazon S3',
  'aws',
  'Data & storage',
  'storage',
  'Archive',
  'Regional object storage with 11 nines of durability.',
  'Block public access, encrypt, add lifecycle rules.',
  {
    aws: true,
    scope: 'regional',
    defaults: {
      storageGB: 500,
      storageClass: 'standard',
      lifecycle: false,
      versioning: false,
      encrypted: true,
      publicAccess: false,
      vpcEndpoint: false,
      costTag: '',
    },
    fields: storageFields,
  },
);
E(
  'rds',
  'Amazon RDS',
  'aws',
  'Data & storage',
  'db',
  'Database',
  'Managed relational database with Multi-AZ and read replicas.',
  'Multi-AZ is for availability; read replicas are for read scale — different tools.',
  {
    aws: true,
    scope: 'zonal',
    defaults: {
      size: 'small',
      storageGB: 100,
      multiAZ: false,
      readReplicas: 0,
      readYourWrites: 'replica',
      connectionPooler: false,
      indexed: true,
      backupRetentionDays: 7,
      encrypted: true,
      publicAccess: false,
      crossRegionReplica: false,
      sg: '',
      costTag: '',
    },
    fields: dbFields,
  },
);
E(
  'dynamodb',
  'Amazon DynamoDB',
  'aws',
  'Data & storage',
  'kv',
  'Table',
  'Serverless key-value / document database.',
  'Single-digit-ms at any scale — if you design around access patterns and avoid hot partitions.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { capacityMode: 'on-demand', rcu: 1000, wcu: 500, writeShards: 1, encrypted: true, costTag: '' },
    fields: [
      sel('capacityMode', 'Capacity mode', ['on-demand', 'provisioned']),
      num('rcu', 'Read capacity', 10, 100000),
      num('wcu', 'Write capacity', 10, 100000),
      num('writeShards', 'Write shards for the hottest key', 1, 64, {
        help: 'Spread one hot key across N items (key#1 … key#N). Reads must then combine the shards.',
      }),
      bool('encrypted', 'Encryption at rest'),
      txt('costTag', 'Cost allocation tag'),
    ],
  },
);
E(
  'elasticache',
  'Amazon ElastiCache',
  'aws',
  'Data & storage',
  'cache',
  'Zap',
  'Managed Redis / Memcached.',
  'Place it in private subnets; protect it with security groups.',
  {
    aws: true,
    scope: 'zonal',
    tier: 2,
    defaults: { nodes: 1, size: 'small', ttlSeconds: 60, invalidateOnWrite: false, sg: '', costTag: '' },
    fields: cacheFields,
  },
);
E(
  'sqs',
  'Amazon SQS',
  'aws',
  'Messaging',
  'queue',
  'Inbox',
  'Fully managed message queue with at-least-once delivery.',
  'Standard queues deliver at least once and may reorder — consumers must be idempotent.',
  {
    aws: true,
    scope: 'regional',
    tier: 2,
    defaults: { visibilityTimeoutSec: 30, maxReceiveCount: 5, retentionDays: 4, costTag: '' },
    fields: queueFields,
  },
);
E(
  'sns',
  'Amazon SNS',
  'aws',
  'Messaging',
  'bus',
  'Megaphone',
  'Pub/sub fan-out to queues, functions and HTTP endpoints.',
  'Pair SNS with SQS per subscriber for durable fan-out.',
  { aws: true, scope: 'regional', tier: 3, defaults: {}, fields: [] },
);
E(
  'eventbridge',
  'Amazon EventBridge',
  'aws',
  'Messaging',
  'bus',
  'Workflow',
  'Serverless event bus with rules and schema registry.',
  'Great for loosely coupled integrations; not a high-throughput data pipeline.',
  { aws: true, scope: 'regional', tier: 3, defaults: {}, fields: [] },
);
E(
  'iam',
  'AWS IAM role',
  'aws',
  'Security',
  'identity',
  'UserCheck',
  'Identity and permissions for workloads.',
  'Least privilege: grant only the actions and resources required.',
  {
    aws: true,
    scope: 'global',
    defaults: { policy: 'scoped', canReadSecrets: false, canReachExternal: true },
    fields: [
      sel('policy', 'Policy', [
        ['scoped', 'Scoped (least privilege)'],
        ['broad', 'Broad service permissions'],
        ['admin', 'AdministratorAccess (*:*)'],
      ]),
      bool('canReadSecrets', 'Can read Secrets Manager'),
    ],
  },
);
E(
  'kms',
  'AWS KMS',
  'aws',
  'Security',
  'identity',
  'Key',
  'Managed encryption keys with audit trails.',
  'Customer-managed keys give control and a CloudTrail audit record of every use.',
  { aws: true, scope: 'regional', tier: 2, defaults: { rotation: true }, fields: [bool('rotation', 'Automatic rotation')] },
);
E(
  'secrets-manager',
  'AWS Secrets Manager',
  'aws',
  'Security',
  'identity',
  'Lock',
  'Stores and rotates credentials.',
  'Never bake secrets into images or repositories.',
  { aws: true, scope: 'regional', tier: 2, defaults: { rotation: false }, fields: [bool('rotation', 'Automatic rotation')] },
);
E(
  'cloudwatch',
  'Amazon CloudWatch',
  'aws',
  'Observability',
  'observability',
  'Activity',
  'Metrics, logs and alarms for AWS workloads.',
  'Metrics tell you something is wrong; logs and traces tell you why.',
  {
    aws: true,
    scope: 'regional',
    defaults: { metrics: true, logs: true, retentionDays: 30, logGB: 0 },
    fields: [
      bool('metrics', 'Metrics'),
      bool('logs', 'Application logs'),
      num('retentionDays', 'Log retention', 1, 3650, {
        unit: 'days',
        help: '0 would mean never expire — long retention is a hidden cost.',
      }),
    ],
  },
);
E(
  'cloudtrail',
  'AWS CloudTrail',
  'aws',
  'Observability',
  'observability',
  'ScrollText',
  'Audit log of AWS API activity.',
  'Answers "who changed what, and when?" during an investigation.',
  { aws: true, scope: 'regional', tier: 2, defaults: {}, fields: [] },
);

// ---- Delivery & platform engineering ------------------------------------
E(
  'source-repo',
  'Source repository',
  'delivery',
  'Pipeline',
  'delivery',
  'GitBranch',
  'Version-controlled code with reviews.',
  'Trunk-based flow with short-lived branches keeps integration pain small.',
  { defaults: { branchProtection: true }, fields: [bool('branchProtection', 'Branch protection + reviews')] },
);
E(
  'ci-pipeline',
  'CI pipeline',
  'delivery',
  'Pipeline',
  'delivery',
  'GitMerge',
  'Builds and checks every commit.',
  'Fast feedback beats big-bang integration.',
  { defaults: { lint: true }, fields: [bool('lint', 'Lint & static analysis')] },
);
E(
  'test-suite',
  'Automated test suite',
  'delivery',
  'Pipeline',
  'delivery',
  'FlaskConical',
  'Unit, integration and end-to-end tests.',
  'Tests that exercise real dependencies catch the regressions unit tests miss.',
  {
    defaults: { unitCoverage: 40, integrationCoverage: 0, e2e: false },
    fields: [
      num('unitCoverage', 'Unit test coverage', 0, 100, { unit: '%' }),
      num('integrationCoverage', 'Integration coverage', 0, 100, { unit: '%' }),
      bool('e2e', 'End-to-end smoke tests'),
    ],
  },
);
E(
  'artifact-repo',
  'Artifact repository',
  'delivery',
  'Pipeline',
  'delivery',
  'Package',
  'Immutable build artifacts.',
  'Build once, promote the same artifact through environments.',
  { tier: 2, defaults: {}, fields: [] },
);
E(
  'container-image',
  'Container image',
  'delivery',
  'Pipeline',
  'delivery',
  'Container',
  'A reproducible runtime package.',
  'Pin base images and scan for vulnerabilities.',
  { tier: 2, defaults: { scan: false }, fields: [bool('scan', 'Vulnerability scan')] },
);
E(
  'container-registry',
  'Container registry',
  'delivery',
  'Pipeline',
  'delivery',
  'Warehouse',
  'Stores and distributes images.',
  'Scan on push; keep tags immutable.',
  { tier: 2, defaults: { scanOnPush: false }, fields: [bool('scanOnPush', 'Scan on push')] },
);
E(
  'cd-pipeline',
  'CD pipeline',
  'delivery',
  'Release',
  'delivery',
  'Rocket',
  'Automates releases to environments.',
  'Deploy strategy decides blast radius: all-at-once exposes everyone immediately.',
  {
    defaults: { strategy: 'all-at-once', autoRollback: false },
    fields: [
      sel('strategy', 'Rollout strategy', [
        ['all-at-once', 'All at once'],
        ['rolling', 'Rolling'],
        ['canary', 'Canary'],
        ['blue-green', 'Blue / green'],
      ]),
      bool('autoRollback', 'Automatic rollback on failed health checks'),
    ],
  },
);
E(
  'deploy-env',
  'Deployment environment',
  'delivery',
  'Release',
  'delivery',
  'Layers',
  'Staging/production with parity.',
  'Environment parity prevents "works on staging" surprises.',
  { tier: 2, defaults: { parity: 'partial' }, fields: [sel('parity', 'Parity with production', ['low', 'partial', 'high'])] },
);
E(
  'approval-gate',
  'Deployment approval gate',
  'delivery',
  'Release',
  'delivery',
  'UserCheck',
  'Human approval before risky releases.',
  'Gates add safety and latency; automate checks before adding people.',
  { tier: 2, defaults: { approvers: 1 }, fields: [num('approvers', 'Required approvers', 1, 5)] },
);
E(
  'feature-flag',
  'Feature flag',
  'delivery',
  'Release',
  'delivery',
  'Flag',
  'Decouple deploy from release.',
  'Flags give you a kill switch without a redeploy — but add code paths to test.',
  { tier: 2, defaults: { killSwitch: true }, fields: [bool('killSwitch', 'Runtime kill switch')] },
);
E(
  'canary',
  'Canary deployment',
  'delivery',
  'Release',
  'delivery',
  'Bird',
  'Release to a small percentage first.',
  'A canary only helps if you watch error rates and can stop automatically.',
  {
    tier: 2,
    defaults: { initialPercent: 5, autoAbort: true },
    fields: [num('initialPercent', 'Initial exposure', 1, 50, { unit: '%' }), bool('autoAbort', 'Abort on elevated errors')],
  },
);
E(
  'blue-green',
  'Blue-green deployment',
  'delivery',
  'Release',
  'delivery',
  'Shuffle',
  'Two identical environments; switch traffic.',
  'Instant rollback, but double capacity during cut-over and shared databases remain a risk.',
  { tier: 2, defaults: { instantSwitchBack: true }, fields: [bool('instantSwitchBack', 'Instant switch back')] },
);
E(
  'rollback',
  'Rollback mechanism',
  'delivery',
  'Release',
  'delivery',
  'Undo2',
  'Return to the last known-good version.',
  'Practice rollbacks; make them a button, not a project.',
  {
    tier: 2,
    defaults: { automated: false, maxMinutes: 15 },
    fields: [bool('automated', 'Automated'), num('maxMinutes', 'Time to roll back', 1, 120, { unit: 'min' })],
  },
);
E(
  'iac',
  'Infrastructure as code',
  'delivery',
  'Platform',
  'delivery',
  'FileCode',
  'Declarative, reviewable infrastructure.',
  'IaC makes environments reproducible and drift visible.',
  {
    tier: 2,
    defaults: { driftDetection: false, policyChecks: false },
    fields: [bool('driftDetection', 'Drift detection'), bool('policyChecks', 'Policy-as-code checks')],
  },
);
E(
  'terraform',
  'Terraform configuration',
  'delivery',
  'Platform',
  'delivery',
  'Terminal',
  'HCL describing cloud resources (educational, non-executable).',
  'Remote state with locking prevents two applies colliding.',
  { tier: 2, defaults: { remoteState: true }, fields: [bool('remoteState', 'Remote state with locking')] },
);
E(
  'config-mgmt',
  'Configuration management',
  'delivery',
  'Platform',
  'delivery',
  'SlidersHorizontal',
  'Versioned configuration per environment.',
  'Config changes cause as many outages as code changes — review and roll them out the same way.',
  { tier: 2, defaults: { versioned: true }, fields: [bool('versioned', 'Versioned & reviewed')] },
);
E(
  'secrets-mgmt',
  'Secrets management',
  'delivery',
  'Platform',
  'delivery',
  'Lock',
  'Central, rotated secrets with audit.',
  'Injection at runtime beats secrets in env files.',
  { tier: 2, defaults: { rotation: false }, fields: [bool('rotation', 'Automatic rotation')] },
);
E(
  'k8s-cluster',
  'Kubernetes cluster',
  'delivery',
  'Platform',
  'compute',
  'Boxes',
  'A cluster running containerised workloads.',
  'Plan capacity for nodes AND for the control plane add-ons you will run.',
  { tier: 3, defaults: { ...computeDefaults, replicas: 3, instanceSize: 'medium' }, fields: computeFields },
);
E(
  'autoscaling',
  'Autoscaling configuration',
  'delivery',
  'Platform',
  'policy',
  'TrendingUp',
  'Scale targets on demand signals.',
  'Scaling reacts after the load arrives; pre-warm for predictable spikes.',
  {
    tier: 2,
    defaults: { targetUtil: 60, minReplicas: 2, maxReplicas: 12 },
    fields: [
      num('targetUtil', 'Target utilisation', 20, 90, { unit: '%' }),
      num('minReplicas', 'Min replicas', 1, 64),
      num('maxReplicas', 'Max replicas', 1, 128),
    ],
  },
);
E(
  'dev-portal',
  'Developer portal',
  'delivery',
  'Platform',
  'delivery',
  'LayoutDashboard',
  'Self-service catalog and docs for engineers.',
  'A portal is only valuable if it makes the golden path the easy path.',
  { tier: 3, defaults: { selfService: true }, fields: [bool('selfService', 'Self-service provisioning')] },
);
E(
  'service-template',
  'Reusable service template',
  'delivery',
  'Platform',
  'delivery',
  'Copy',
  'A golden path: CI, logging, alerts pre-wired.',
  'Templates embed standards so teams inherit good defaults.',
  {
    tier: 3,
    defaults: { includesObservability: true, includesCI: true },
    fields: [bool('includesObservability', 'Includes observability'), bool('includesCI', 'Includes CI/CD')],
  },
);
E(
  'observability-stack',
  'Observability stack',
  'delivery',
  'Platform',
  'observability',
  'Eye',
  'Metrics, logs and traces as a shared platform capability.',
  'A platform team offers observability as a product to service teams.',
  {
    tier: 3,
    defaults: { metrics: true, logs: true, traces: true },
    fields: [bool('metrics', 'Metrics'), bool('logs', 'Logs'), bool('traces', 'Traces')],
  },
);

// ---- Reliability & observability ------------------------------------------
E(
  'metrics-collector',
  'Metrics collector',
  'reliability',
  'Observability',
  'observability',
  'Gauge',
  'Collects time-series metrics.',
  'Golden signals: latency, traffic, errors, saturation.',
  { defaults: { metrics: true }, fields: [] },
);
E(
  'central-logging',
  'Centralized logging',
  'reliability',
  'Observability',
  'observability',
  'ScrollText',
  'Aggregates logs from all services.',
  'Structured logs with correlation IDs make cross-service debugging possible.',
  { defaults: { logs: true, retentionDays: 30 }, fields: [num('retentionDays', 'Retention', 1, 3650, { unit: 'days' })] },
);
E(
  'tracing',
  'Distributed tracing',
  'reliability',
  'Observability',
  'observability',
  'Waypoints',
  'Follows one request across services.',
  'Traces show where time goes; they are the fastest path to a latency culprit.',
  { tier: 2, defaults: { traces: true, samplePercent: 10 }, fields: [num('samplePercent', 'Sample rate', 1, 100, { unit: '%' })] },
);
E(
  'dashboard',
  'Dashboard',
  'reliability',
  'Observability',
  'observability',
  'LayoutDashboard',
  'Shared view of system health.',
  'Dashboards help only if they answer a question.',
  { defaults: {}, fields: [] },
);
E(
  'alert-rule',
  'Alert rule',
  'reliability',
  'Observability',
  'observability',
  'Bell',
  'Pages a human when a symptom threshold is crossed.',
  'Alert on symptoms customers feel, not every cause — and every page should be actionable.',
  {
    defaults: { metric: 'errorRate', threshold: 5, forMinutes: 2, actionable: true },
    fields: [
      sel('metric', 'Metric', [
        ['errorRate', 'Error rate %'],
        ['p95', 'p95 latency ms'],
        ['cpu', 'CPU utilisation %'],
        ['queueAge', 'Queue age (s)'],
        ['dbConn', 'DB connections %'],
        ['dlq', 'DLQ depth'],
      ]),
      num('threshold', 'Threshold', 0.1, 100000, { step: 0.1 }),
      num('forMinutes', 'For (minutes)', 1, 30),
      bool('actionable', 'Links to a runbook'),
    ],
  },
);
E(
  'synthetic-monitoring',
  'Synthetic monitoring',
  'reliability',
  'Observability',
  'observability',
  'Radar',
  'Scripted probes of critical user journeys.',
  'Detects outages before users do — even at 3am with no traffic.',
  { tier: 2, defaults: { intervalMin: 1 }, fields: [num('intervalMin', 'Probe interval', 1, 15, { unit: 'min' })] },
);
E(
  'health-check',
  'Health check',
  'reliability',
  'Resilience',
  'policy',
  'HeartPulse',
  'Probes targets and removes the unhealthy.',
  'A check that is too strict removes healthy instances and causes the outage it guards against.',
  {
    defaults: { timeoutMs: 2000, intervalSec: 15, unhealthyThreshold: 3 },
    fields: [
      num('timeoutMs', 'Timeout', 100, 30000, { unit: 'ms' }),
      num('intervalSec', 'Interval', 5, 300, { unit: 's' }),
      num('unhealthyThreshold', 'Unhealthy threshold', 1, 10),
    ],
  },
);
E(
  'slo',
  'Service-level objective',
  'reliability',
  'Observability',
  'observability',
  'Target',
  'A reliability target users care about.',
  'SLOs turn "reliable enough" into an explicit, negotiable number.',
  { tier: 2, defaults: { target: 99.9 }, fields: [num('target', 'Availability target', 90, 99.999, { unit: '%', step: 0.01 })] },
);
E(
  'error-budget',
  'Error budget',
  'reliability',
  'Observability',
  'observability',
  'Wallet',
  'Allowed unreliability derived from the SLO.',
  'Spend the budget on features; freeze releases when it is gone.',
  { tier: 3, defaults: { freezeOnExhaustion: true }, fields: [bool('freezeOnExhaustion', 'Release freeze when exhausted')] },
);
E(
  'circuit-breaker',
  'Circuit breaker',
  'reliability',
  'Resilience',
  'policy',
  'ToggleRight',
  'Stops calling a failing dependency.',
  'Failing fast protects both caller and callee and gives dependencies room to recover.',
  { tier: 2, defaults: { failureThreshold: 50 }, fields: [num('failureThreshold', 'Open at error rate', 10, 100, { unit: '%' })] },
);
E(
  'retry-policy',
  'Retry policy',
  'reliability',
  'Resilience',
  'policy',
  'Repeat',
  'Retries transient failures with backoff.',
  'Retries multiply load during an outage — combine with backoff, jitter and a breaker.',
  {
    tier: 2,
    defaults: { maxRetries: 3, backoff: false },
    fields: [num('maxRetries', 'Max retries', 0, 10), bool('backoff', 'Exponential backoff + jitter')],
  },
);
E(
  'rate-limiter',
  'Rate limiter',
  'reliability',
  'Resilience',
  'policy',
  'Timer',
  'Caps request rate to protect capacity.',
  'Shed load deliberately rather than failing everyone.',
  { tier: 2, defaults: { maxRps: 500 }, fields: [num('maxRps', 'Limit', 10, 100000, { unit: 'rps' })] },
);
E(
  'bulkhead',
  'Bulkhead',
  'reliability',
  'Resilience',
  'policy',
  'Split',
  'Isolates resource pools per dependency.',
  'One slow dependency should not consume every thread.',
  { tier: 3, defaults: { poolShare: 30 }, fields: [num('poolShare', 'Pool share per dependency', 5, 100, { unit: '%' })] },
);
E(
  'dlq',
  'Dead-letter queue',
  'reliability',
  'Resilience',
  'queue',
  'MailX',
  'Parks messages that keep failing.',
  'A DLQ is a diagnostic queue: alert on its depth and have a redrive plan.',
  {
    tier: 2,
    defaults: { visibilityTimeoutSec: 30, maxReceiveCount: 5, retentionDays: 14, isDlq: true, costTag: '' },
    fields: [num('retentionDays', 'Retention', 1, 14, { unit: 'days' }), txt('costTag', 'Cost allocation tag')],
  },
);
E(
  'backup',
  'Backup and recovery',
  'reliability',
  'Resilience',
  'resilience',
  'DatabaseBackup',
  'Scheduled backups with a restore process.',
  'A backup you have never restored is a hope, not a backup.',
  {
    tier: 2,
    defaults: { frequencyHours: 24, retentionDays: 7, crossRegion: false, restoreTested: false },
    fields: [
      num('frequencyHours', 'Frequency', 1, 168, { unit: 'h' }),
      num('retentionDays', 'Retention', 1, 365, { unit: 'days' }),
      bool('crossRegion', 'Copy to another Region'),
      bool('restoreTested', 'Restore tested'),
    ],
  },
);
E(
  'dr-config',
  'Disaster recovery configuration',
  'reliability',
  'Resilience',
  'resilience',
  'LifeBuoy',
  'DR strategy across Regions.',
  'Pilot light, warm standby, active-active: each buys lower RTO/RPO for more cost and complexity.',
  {
    tier: 3,
    defaults: { strategy: 'backup-restore' },
    fields: [
      sel('strategy', 'Strategy', [
        ['backup-restore', 'Backup & restore'],
        ['pilot-light', 'Pilot light'],
        ['warm-standby', 'Warm standby'],
        ['active-active', 'Active / active (multi-Region)'],
      ]),
    ],
  },
);

export const CATALOG: CatalogEntry[] = entries;
export const CATALOG_BY_KIND: Record<string, CatalogEntry> = Object.fromEntries(entries.map((e) => [e.kind, e]));

export const CATEGORIES: { id: CategoryId; label: string; blurb: string }[] = [
  { id: 'app', label: 'Application & software', blurb: 'Services, data stores and boundaries' },
  { id: 'aws', label: 'Networking & AWS', blurb: 'Regional building blocks and network boundaries' },
  { id: 'delivery', label: 'Delivery & platform', blurb: 'Pipelines, releases and golden paths' },
  { id: 'reliability', label: 'Reliability & observability', blurb: 'Detect, diagnose, prevent, recover' },
];

export function entryOf(kind: string): CatalogEntry {
  return (
    CATALOG_BY_KIND[kind] ?? {
      kind,
      name: kind,
      category: 'app',
      group: 'Unknown',
      role: 'compute',
      icon: 'Box',
      desc: 'Unknown component',
      learn: '',
      tier: 1,
      scope: 'none',
      defaults: {},
      fields: [],
    }
  );
}

// ---------------------------------------------------------------------------
// Connection rules
// ---------------------------------------------------------------------------
const TRAFFIC_SRC: Role[] = ['source', 'edge', 'cdn', 'waf', 'lb', 'gateway', 'compute', 'worker'];
const TRAFFIC_DST: Role[] = [
  'edge',
  'cdn',
  'waf',
  'lb',
  'gateway',
  'compute',
  'db',
  'kv',
  'search',
  'cache',
  'queue',
  'bus',
  'storage',
  'external',
];
const HOSTS: Role[] = ['compute', 'worker', 'lb', 'gateway', 'db', 'kv', 'cache', 'queue', 'storage', 'search', 'edge', 'cdn', 'waf'];

export type EdgeClass = 'traffic' | 'async' | 'attach' | 'deploy';

export interface ConnectionVerdict {
  ok: boolean;
  cls?: EdgeClass;
  reason?: string;
}

export function canConnect(srcKind: string, dstKind: string): ConnectionVerdict {
  const s = entryOf(srcKind);
  const d = entryOf(dstKind);
  if (s.kind === d.kind && s.role !== 'compute' && s.role !== 'lb')
    return { ok: false, reason: `Connecting two ${s.name} components has no meaning in this model.` };
  if (s.role === 'network' || d.role === 'network') {
    return {
      ok: false,
      reason:
        'Network placement is configured in the inspector (Subnet / VPC / Security group fields), where the simulation can reason about routes and rules.',
    };
  }
  if (d.role === 'source') return { ok: false, reason: 'Traffic sources only send requests; nothing can call them.' };
  if (s.role === 'external') return { ok: false, reason: 'You do not control third-party systems, so they cannot call out in this model.' };
  if (s.role === 'queue') {
    if (d.role === 'worker' || d.role === 'compute') return { ok: true, cls: 'async' };
    if (d.role === 'queue' && d.defaults.isDlq) return { ok: true, cls: 'async' };
    return {
      ok: false,
      reason: 'Queues are consumed by workers (or functions). Connect the queue to a consumer, or to a dead-letter queue.',
    };
  }
  if (s.role === 'bus') {
    if (['queue', 'compute', 'worker', 'bus'].includes(d.role)) return { ok: true, cls: 'async' };
    return { ok: false, reason: 'Event buses deliver to queues, workers, functions or other buses.' };
  }
  if (s.role === 'cache' && (d.role === 'db' || d.role === 'kv' || d.role === 'search')) return { ok: true, cls: 'traffic' };
  if (s.role === 'db' || s.role === 'kv' || s.role === 'search' || s.role === 'cache' || s.role === 'storage') {
    return {
      ok: false,
      reason: `${s.name} is a leaf in the request path — it does not call other components. Draw the connection from the caller to it.`,
    };
  }
  if (TRAFFIC_SRC.includes(s.role) && TRAFFIC_DST.includes(d.role)) {
    if (d.role === 'queue' || d.role === 'bus') return { ok: true, cls: 'async' };
    if (s.role === 'worker' && d.role === 'compute') return { ok: true, cls: 'traffic' };
    return { ok: true, cls: 'traffic' };
  }
  if (s.role === 'policy' || s.role === 'observability' || s.role === 'resilience' || s.role === 'identity') {
    if (s.role === 'resilience' && !['db', 'kv', 'storage', 'queue'].includes(d.role))
      return { ok: false, reason: 'Backups and DR configuration protect data stores — attach them to a database or bucket.' };
    if (HOSTS.includes(d.role)) return { ok: true, cls: 'attach' };
    return { ok: false, reason: `${s.name} attaches to a runtime component such as a service, load balancer or data store.` };
  }
  if (s.role === 'delivery') {
    if (d.role === 'delivery') return { ok: true, cls: 'deploy' };
    if (d.role === 'compute' || d.role === 'worker') return { ok: true, cls: 'deploy' };
    return { ok: false, reason: 'Delivery components connect to each other and to the services they deploy.' };
  }
  return { ok: false, reason: `${s.name} cannot connect to ${d.name} in this model.` };
}

export const KINDS_BY_ROLE = (role: Role): string[] => entries.filter((e) => e.role === role).map((e) => e.kind);
