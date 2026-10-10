import { E, N, patchNode, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

export const m2: Mission = {
  id: 'm2-db-meltdown',
  number: 2,
  title: 'The Database Meltdown',
  tagline: 'Flash-sale traffic is 3× normal and checkout is timing out.',
  difficulty: 'Intermediate',
  kind: 'incident',
  estMinutes: 25,
  prerequisites: [],
  skills: { sd: 55, aws: 30, sre: 35, data: 30 },
  learning: [
    'Capacity analysis and bottleneck identification',
    'Query optimisation vs scaling',
    'Connection pooling',
    'Caching trade-offs',
    'Why more app replicas can make things worse',
  ],
  story:
    'It is 14:00 and the “Midsummer Sale” email just landed. Traffic tripled in ten minutes. Checkout latency is climbing, customers see errors, and the on-call channel is on fire. Application servers look idle, yet requests are failing. A teammate has proposed doubling the application replicas “to add capacity”.',
  business: {
    context: 'ShopStream — consumer marketplace. Flash sale driving 3× normal traffic for the next hour.',
    impact: 'Every minute of degraded checkout loses revenue and burns your error budget.',
  },
  constraints: {
    budget: 700,
    availability: 99,
    p95: 600,
    notes: [
      'Restore ≥ 99% availability at peak traffic.',
      'Keep p95 latency ≤ 600 ms.',
      'Budget $700 / month (simulated estimate).',
      'Cached data must stay fresh within 30 seconds.',
      'Write a short postmortem when you are done.',
    ],
  },
  workload: wl({
    baseRps: 30,
    profile: [
      { t: 0, mult: 1 },
      { t: 8, mult: 1 },
      { t: 14, mult: 3 },
    ],
    readRatio: 0.8,
    slowQueryShare: 0.2,
    cacheableShare: 0.75,
    freshnessSeconds: 30,
    payloadKB: 4,
  }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('alb', 'lb', 220, 170, { costTag: 'team=checkout' }, 'Public ALB'),
      N('ecs', 'api', 440, 170, { replicas: 4, instanceSize: 'small', dbPoolSize: 20, costTag: 'team=checkout' }, 'checkout-api'),
      N(
        'rds',
        'db',
        680,
        170,
        { size: 'small', storageGB: 200, indexed: false, multiAZ: false, connectionPooler: false, costTag: 'team=checkout' },
        'orders-db',
      ),
      N('cloudwatch', 'cw', 440, 340, {}),
      N('tracing', 'trace', 220, 340, {}),
    ],
    edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 2, timeoutMs: 2000 })],
  },
  components: [
    'users',
    'alb',
    'ecs',
    'ec2',
    'backend-service',
    'rds',
    'relational-db',
    'elasticache',
    'cache',
    'dynamodb',
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'retry-policy',
    'circuit-breaker',
    'rate-limiter',
    'autoscaling',
    'health-check',
    'cloudfront',
    'central-logging',
    'metrics-collector',
    'synthetic-monitoring',
  ],
  startMinute: 18,
  verifyMinutes: 8,
  verifyAt: 26,
  deployments: [
    {
      minute: -2880,
      kind: 'deploy',
      title: 'v3.8.0 — “order history” feature',
      detail: 'New endpoint GET /orders?customer=… filtering by customer and status.',
      by: 'orders-team',
    },
    {
      minute: -1440,
      kind: 'config',
      title: 'Autoscaling min replicas 2 → 4',
      detail: 'Pre-sale capacity prep (application tier).',
      by: 'sre-oncall',
    },
    {
      minute: -30,
      kind: 'infra',
      title: 'Marketing email “Midsummer Sale” sent',
      detail: '1.8M recipients; expect spike within 15 minutes.',
      by: 'marketing',
    },
  ],
  notes: [
    {
      panel: 'notes',
      title: 'Runbook: checkout latency',
      body: '1) Check application utilisation. 2) Check database CPU/connections. 3) Check recent deployments. 4) Never roll back during a sale without sign-off.',
    },
    { panel: 'notes', title: 'Support ticket #88213', body: '“Checkout spinner then 503 after 30 seconds. Worked fine yesterday.”' },
  ],
  firstMove:
    'Fix the cause, not the symptom: run the “Create index” action, or select the orders database and turn on its index in the inspector. Then open Plan and press Deploy.',
  rootCauses: [
    {
      id: 'unindexed',
      label: 'A hot query does sequential scans, saturating database CPU',
      correct: true,
      evidencePanels: ['database', 'metrics', 'deployments'],
      why: 'The “order history” query shipped in v3.8.0 filters on customer_id + status with no supporting index; under 3× load its scans consume the database CPU.',
    },
    {
      id: 'app-capacity',
      label: 'The application tier does not have enough capacity',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Application utilisation is low; requests fail waiting on the database, not on app CPU.',
    },
    {
      id: 'conn-limit',
      label: 'The database connection limit is already exhausted',
      correct: false,
      evidencePanels: ['database'],
      why: 'Connections are high (80%) but not exhausted — a latent risk, not the current cause. Scaling replicas would make it the cause.',
    },
    {
      id: 'network',
      label: 'A network or load-balancer fault is dropping requests',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'The load balancer and network are healthy; errors originate at the database.',
    },
    {
      id: 'attack',
      label: 'A DDoS attack is overwhelming the site',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Traffic follows the marketing email and request mix looks organic.',
    },
  ],
  actions: [
    {
      id: 'add-index',
      label: 'Create index on orders(customer_id, status)',
      description: 'CREATE INDEX CONCURRENTLY — takes ~8 minutes on a large table, no downtime.',
      minutes: 8,
      available: (a) => a.nodes.some((n) => n.id === 'db' && !n.config.indexed),
      apply: (a) => ({
        arch: patchNode(a, 'db', { indexed: true }),
        log: 'Index idx_orders_customer_status built. Query plans switched from Seq Scan to Index Scan.',
      }),
    },
    {
      id: 'scale-app',
      label: 'Double application replicas',
      description: 'Add 4 more checkout-api instances (each opens its own DB connection pool).',
      minutes: 3,
      apply: (a) => ({
        arch: patchNode(a, 'api', { replicas: (a.nodes.find((n) => n.id === 'api')?.config.replicas ?? 4) * 2 }),
        log: 'Application replicas doubled.',
      }),
    },
    {
      id: 'scale-db',
      label: 'Scale database to db.large',
      description: 'Vertical scale with a short failover blip; roughly 4× the cost.',
      minutes: 10,
      apply: (a) => ({ arch: patchNode(a, 'db', { size: 'large' }), log: 'Database resized to db.large.' }),
    },
  ],
  requirements: [
    {
      id: 'avail',
      label: 'Availability ≥ 99% at peak',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99,
      why: 'The incident’s primary objective: restore service.',
    },
    {
      id: 'latency',
      label: 'p95 latency ≤ 600 ms',
      hard: true,
      metric: 'p95',
      op: '<=',
      value: 600,
      why: 'Checkout feels broken above ~600 ms at the tail.',
    },
    {
      id: 'conn',
      label: 'DB connections ≤ 85% of the limit',
      hard: false,
      metric: 'dbConnPct',
      op: '<=',
      value: 85,
      why: 'Headroom: the next scale-out should not exhaust connections.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $700/mo',
      hard: true,
      metric: 'cost',
      op: '<=',
      value: 700,
      why: 'Throwing hardware at a query problem is expensive; fix the cause.',
    },
    {
      id: 'fresh',
      label: 'No stale-cache risk (freshness ≤ 30 s)',
      hard: true,
      metric: 'staleRisk',
      op: '==',
      value: 0,
      why: 'A cache that serves stale prices or stock is a correctness bug.',
    },
    {
      id: 'security',
      label: 'No critical security findings',
      hard: true,
      metric: 'criticalFindings',
      op: '<=',
      value: 0,
      why: 'Security is a hard constraint.',
    },
    {
      id: 'alert',
      label: 'An alert would catch this next time (MTTD ≤ 5 min)',
      hard: false,
      metric: 'mttd',
      op: '<=',
      value: 5,
      why: 'Detect before customers do.',
    },
    {
      id: 'pm',
      label: 'Postmortem recorded',
      hard: true,
      check: (c) => ({ pass: !!c.postmortem, detail: c.postmortem ? 'Recorded' : 'Write the postmortem' }),
      why: 'Learning requires writing down what happened and what you will change.',
    },
  ],
  weights: { reliability: 3, performance: 2, cost: 2, security: 1, diagnosis: 3, correctness: 3, rationale: 2 },
  failure: { maxFailedRequests: 110000, text: 'Customer impact budget exceeded: too many failed checkouts during the sale.' },
  hints: [
    {
      tier: 1,
      text: 'Compare utilisation across tiers in Metrics. Which component is hot, and which one is idle? Where does a request actually wait?',
    },
    {
      tier: 2,
      text: 'Open Database health. What is the slowest, most expensive query doing — and which deployment introduced the endpoint that issues it?',
    },
    {
      tier: 3,
      text: 'Fix the cause (index) before the symptom. Then protect headroom: a connection pooler keeps replica scale-out from exhausting connections. A cache could also help but keep TTL ≤ 30 s or invalidate on write.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Find the bottleneck first',
        body: 'Throughput is limited by the most saturated resource on the request path. Adding capacity anywhere else changes nothing. Always compare utilisation across tiers before scaling.',
      },
      {
        title: 'Connections are a capacity dimension',
        body: 'Each replica holds a connection pool. Replicas × pool size can exceed the database’s connection limit — scaling out the app can take down the database. A pooler/proxy multiplexes many client connections onto few server connections.',
      },
      {
        title: 'Query performance vs hardware',
        body: 'A sequential scan reads every row, so its cost grows with the table; a bigger instance only lets each scan finish sooner, while an index lookup avoids the scan altogether. Indexing removed ~10× the work that a 4× bigger instance could only absorb — at 4× the cost.',
      },
      {
        title: 'Caching trade-offs',
        body: 'Caches absorb read-heavy, repeatable traffic but introduce staleness. Choose TTLs from product freshness requirements, and invalidate on write where correctness matters.',
      },
    ],
    rootCause:
      'Release v3.8.0 added a filter query with no supporting index. Under 3× load the sequential scans saturated database CPU; the application tier was idle, waiting.',
    alternatives: [
      {
        name: 'Index + connection pooler (recommended)',
        when: 'The default: remove the waste, then add headroom.',
        tradeoffs: 'Index build time; pooler adds a hop (~1–2 ms) and a component to operate.',
      },
      {
        name: 'Scale the database vertically',
        when: 'You cannot fix the query now (vendor code, urgent sale).',
        tradeoffs: 'Expensive, temporary; the inefficiency returns as traffic grows.',
      },
      {
        name: 'Add a read-through / aside cache',
        when: 'Read-heavy, repeatable data with tolerant freshness.',
        tradeoffs: 'Stale data risk; invalidation complexity; cold-cache stampedes.',
      },
      {
        name: 'Read replicas',
        when: 'Reads dominate and replica lag is acceptable.',
        tradeoffs: 'Lag can violate freshness; writes still hit the primary.',
      },
    ],
    mistakes: [
      'Scaling application replicas when the database is the bottleneck.',
      'Adding retries during a database brownout — amplifies load.',
      'Rolling back unrelated changes instead of reading query statistics.',
      'No alert on database CPU or connections.',
    ],
    aws: [
      'CloudWatch Database Insights (the successor to RDS Performance Insights) and the slow query log',
      'RDS Proxy for connection pooling',
      'ElastiCache (Redis) with explicit TTL and invalidation',
      'CloudWatch alarms on CPUUtilization and DatabaseConnections',
    ],
    experiments: [
      'Double the app replicas first and watch DB connections; then add RDS Proxy.',
      'Add retry-policy (3 retries) before fixing the index and see load amplification.',
      'Try db.xlarge without the index and compare the bill with the indexed small instance.',
    ],
  },
  seed: 202,
  guidance: ['metrics', 'database', 'deployments'],
  needsPostmortem: true,
  needsADR: false,
  decisions: (arch) => {
    const db = arch.nodes.find((n) => n.id === 'db');
    if (!db) return [];
    if (db.config.indexed) {
      return [
        {
          tag: 'm2-db-meltdown:fixed-the-query',
          label: 'You fixed the slow query with an index.',
          carries: 'Your database starts later missions with its hot queries indexed.',
        },
      ];
    }
    if (db.config.size !== 'small') {
      return [
        {
          tag: 'm2-db-meltdown:scaled-the-database',
          shortcut: true,
          label: 'You scaled the database instead of fixing the query.',
          carries: 'The slow query is still there; it will return as traffic grows, and the bigger instance keeps costing money.',
        },
      ];
    }
    return [];
  },
};
