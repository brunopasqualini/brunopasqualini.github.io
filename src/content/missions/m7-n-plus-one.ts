import { E, N, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

const DB_EDGE = 'e-api-db';

const callsPerPage = (arch: { edges: { id: string; config: { weight: number } }[] }) =>
  arch.edges.find((e) => e.id === DB_EDGE)?.config.weight ?? 0;

export const m7: Mission = {
  id: 'm7-n-plus-one',
  number: 7,
  title: 'The N+1 Endpoint',
  tagline: 'One product page, a dozen database round trips, and a database that cannot keep up.',
  difficulty: 'Beginner',
  kind: 'project',
  estMinutes: 15,
  prerequisites: [],
  skills: { se: 55, sd: 25, data: 25 },
  learning: [
    'The N+1 query pattern and how to spot it in telemetry',
    'Fixing the cause in code versus buying hardware or adding a cache',
    'Queries per request as a budget, not an accident',
    'Why a cache can hide a defect instead of removing it',
  ],
  story:
    'The catalogue team shipped a “related products” strip. For every product on the page the handler asks the database for its details one row at a time, and then again for each related item. A page of 12 products now costs about twelve queries per visit: one per row, plus the list itself. Traffic doubled after a campaign, the database CPU is pinned, and product pages take seconds. The team lead suggests either a bigger database or “just add a cache”. You have a small budget and a code change is possible.',
  business: {
    context: 'Brightcart catalogue API: 40 requests/second at peak, read-heavy, one small relational database.',
    impact: 'Slow product pages lower conversion; support is being flooded with “the site is broken” tickets.',
  },
  constraints: {
    budget: 450,
    availability: 99,
    p95: 350,
    notes: [
      'Budget: $450 / month (simulated estimate).',
      'Product pages must answer within 350 ms at the 95th percentile.',
      'Keep the database below 85% of its connection limit.',
      'Prefer a fix that removes the cause. Every other fix is a workaround you will pay for later.',
    ],
  },
  workload: wl({ baseRps: 40, profile: [{ t: 0, mult: 1 }], readRatio: 0.97, slowQueryShare: 0, cacheableShare: 0.6, payloadKB: 8 }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('alb', 'lb', 220, 170, { costTag: 'team=catalogue' }, 'Public ALB'),
      N('ecs', 'api', 440, 170, { replicas: 3, instanceSize: 'small', dbPoolSize: 10, costTag: 'team=catalogue' }, 'catalogue-api', [
        {
          id: 'n-plus-one',
          label: 'Per-row lookups in the product list handler',
          log: 'GET /products?category=shoes rendered 12 items; SELECT id,name,price FROM products WHERE id=$1 executed 12 times for this request',
        },
      ]),
      N('rds', 'db', 680, 170, { size: 'small', storageGB: 100, indexed: true, multiAZ: false, costTag: 'team=catalogue' }, 'catalogue-db'),
      N('cloudwatch', 'cw', 440, 340, {}),
    ],
    edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 12, timeoutMs: 2000 })],
  },
  components: [
    'users',
    'alb',
    'ecs',
    'ec2',
    'backend-service',
    'rds',
    'relational-db',
    'cache',
    'elasticache',
    'cloudwatch',
    'tracing',
    'autoscaling',
  ],
  startMinute: 12,
  verifyMinutes: 6,
  verifyAt: 18,
  deployments: [
    {
      minute: -2880,
      kind: 'deploy',
      title: 'v4.12 — related products strip',
      detail: 'Adds a related-items loop to GET /products. No load test was run.',
      by: 'catalogue-squad',
    },
    {
      minute: -1440,
      kind: 'incident',
      title: 'Campaign email sent',
      detail: 'Traffic doubled for 24 hours; database CPU has stayed high since.',
      by: 'marketing',
    },
  ],
  notes: [
    {
      panel: 'dependencies',
      title: 'Where to look',
      body: 'Compare the traffic that reaches the API with the traffic that reaches the database, then look at the “calls per request” on the connection between them.',
    },
    {
      panel: 'database',
      title: 'The database is busy, but with what?',
      body: 'The query list is dominated by one cheap query executed very often. A cheap query is not a cheap workload when it runs a dozen times per page.',
    },
  ],
  firstMove:
    'Remove the extra round trips: run the “Batch the lookups” action, then open Plan and press Deploy. Compare it with what a bigger database would have cost.',
  rootCauses: [
    {
      id: 'n-plus-one',
      label: 'Each page view makes a dozen separate database calls (an N+1 pattern in the handler)',
      correct: true,
      evidencePanels: ['dependencies', 'database', 'logs'],
      why: 'Database traffic is a dozen times the page traffic, every query is cheap and indexed, and the log names the per-row lookup.',
    },
    {
      id: 'db-too-small',
      label: 'The database instance is too small for this traffic',
      correct: false,
      evidencePanels: ['database'],
      why: 'It is busy, but only because it is asked for ten times more work than the pages need. A bigger instance hides the pattern and raises the bill.',
    },
    {
      id: 'not-enough-replicas',
      label: 'The application tier needs more replicas',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Application CPU is low. More replicas send even more queries to an already saturated database.',
    },
    {
      id: 'missing-index',
      label: 'A hot query is missing an index',
      correct: false,
      evidencePanels: ['database'],
      why: 'Query plans show index scans. The cost is the number of calls, not the cost of each call.',
    },
  ],
  actions: [
    {
      id: 'batch',
      label: 'Batch the lookups into one query (IN list or JOIN)',
      description: 'A code change: fetch all items for the page in a single round trip. Takes a build, review and deploy.',
      minutes: 12,
      available: (arch) => callsPerPage(arch) > 3,
      apply: (arch) => ({
        arch: { ...arch, edges: arch.edges.map((e) => (e.id === DB_EDGE ? { ...e, config: { ...e.config, weight: 2 } } : e)) },
        log: 'Deployed v4.13: product details are now fetched with one batched query (2 queries per page).',
      }),
    },
    {
      id: 'paginate',
      label: 'Show 6 products per page instead of 12',
      description: 'Halves the work per page but does not change the pattern: the number of queries still grows with page size.',
      minutes: 6,
      available: (arch) => callsPerPage(arch) > 6,
      apply: (arch) => ({
        arch: {
          ...arch,
          edges: arch.edges.map((e) =>
            e.id === DB_EDGE ? { ...e, config: { ...e.config, weight: Math.max(2, e.config.weight / 2) } } : e,
          ),
        },
        log: 'Deployed v4.13: product lists are paginated to 6 items (about 6 queries per page).',
      }),
    },
  ],
  requirements: [
    {
      id: 'avail',
      label: 'Availability ≥ 99%',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99,
      why: 'Product pages must load.',
    },
    {
      id: 'p95',
      label: 'p95 latency ≤ 350 ms',
      hard: true,
      metric: 'p95',
      op: '<=',
      value: 350,
      why: 'Slow pages lose customers.',
    },
    {
      id: 'conn',
      label: 'Database connections ≤ 85% of the limit',
      hard: true,
      metric: 'dbConnPct',
      op: '<=',
      value: 85,
      why: 'Headroom for spikes.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $450/mo',
      hard: true,
      metric: 'cost',
      op: '<=',
      value: 450,
      why: 'Money is a constraint: the cheapest fix is the one that removes the work.',
    },
    {
      id: 'security',
      label: 'No critical security findings',
      hard: true,
      metric: 'criticalFindings',
      op: '<=',
      value: 0,
      why: 'Security is a hard constraint in every mission.',
    },
    {
      id: 'calls',
      label: 'Fewer than 4 database calls per page view',
      hard: false,
      check: (c) => {
        const w = callsPerPage(c.arch);
        return { pass: w <= 3, detail: `${w} database calls per request` };
      },
      why: 'Treat queries per request as a budget. Fixing the pattern removes the load instead of absorbing it.',
    },
    {
      id: 'no-upsize',
      label: 'The database was not upsized to hide the problem',
      hard: false,
      check: (c) => {
        const db = c.arch.nodes.find((n) => n.id === 'db');
        const ok = (db?.config.size ?? 'small') === 'small';
        return { pass: ok, detail: ok ? 'database is still the small instance' : `database upsized to ${db?.config.size}` };
      },
      why: 'A bigger database is a bill you pay every month for a defect you still have.',
    },
  ],
  weights: { performance: 3, reliability: 2, cost: 2, diagnosis: 3, correctness: 3, security: 1, maintainability: 1 },
  hints: [
    { tier: 1, text: 'Open the Dependencies panel. How many database calls does one request to the API make?' },
    {
      tier: 2,
      text: 'The database is not slow per query; it is asked for far more queries than the pages need. Which fix removes work, and which only moves it somewhere else?',
    },
    {
      tier: 3,
      text: 'Run the “Batch the lookups” action (or set the calls-per-request on the API→database connection to 2 in the inspector). A cache or a bigger database can also get you under the limits, but both keep the defect and add cost.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'The N+1 query pattern',
        body: 'Fetch a list with one query, then loop and fetch each item’s details with one more query each: 1 + N round trips. Each query is cheap and indexed, so nothing looks wrong in a single request. At scale the count multiplies into the dominant load.',
      },
      {
        title: 'Fix the cause, not the symptom',
        body: 'A bigger database absorbs the load and costs more every month. A cache hides the load until it is cold or invalidated. Batching removes the load. Prefer the fix that deletes work.',
      },
      {
        title: 'Queries per request is a budget',
        body: 'Teams that watch database calls per request in tests and traces catch this before production. It is the cheapest performance review you can automate.',
      },
    ],
    rootCause:
      'Database traffic was about twelve times the page traffic: the handler issued one query per row. The database was busy with perfectly healthy queries, just far too many of them.',
    alternatives: [
      {
        name: 'Batch the lookups (join or IN list)',
        when: 'Always the first thing to try: it removes the work.',
        tradeoffs: 'Needs a code change and a review; the query gets more complex and must be indexed well.',
      },
      {
        name: 'Add a cache in front of the lookups',
        when: 'Reads are repetitive and tolerate staleness; also useful after the pattern is fixed.',
        tradeoffs: 'The defect remains: cold caches and invalidations bring the load back; adds a component to run and keep fresh.',
      },
      {
        name: 'Upsize the database',
        when: 'Only as a short-term mitigation during an incident.',
        tradeoffs: 'Permanent monthly cost for a temporary problem; the pattern continues to scale badly.',
      },
    ],
    mistakes: [
      'Scaling the application tier: the database was the bottleneck.',
      'Buying a bigger database before looking at what it is being asked to do.',
      'Adding a cache and calling it done while the handler still issues dozens of queries.',
    ],
    aws: [
      'CloudWatch Database Insights (the successor to RDS Performance Insights) and pg_stat_statements for per-query call counts',
      'X-Ray / OpenTelemetry traces show repeated spans per request',
      'ElastiCache for read-heavy lookups after the pattern is fixed',
    ],
    experiments: [
      'Set the calls per request to 2, then drop the traffic multiplier: how much headroom did the fix buy compared with a bigger database?',
      'Add a cache without touching the pattern, then look at what happens to latency when the hit rate falls.',
    ],
  },
  seed: 107,
  guidance: ['dependencies', 'database', 'logs'],
  needsPostmortem: false,
  needsADR: false,
  baselineCost: 260,
  decisions: (arch) => {
    const out = [];
    const w = callsPerPage(arch);
    const db = arch.nodes.find((n) => n.id === 'db');
    if (w <= 3) {
      out.push({
        tag: 'm7-n-plus-one:fixed-in-code',
        label: 'You removed the N+1 pattern in the code path.',
        carries: 'Later missions start with healthy query habits: the catalogue API makes few calls per request.',
      });
    } else if (arch.nodes.some((n) => ['cache', 'elasticache'].includes(n.kind))) {
      out.push({
        tag: 'm7-n-plus-one:hid-it-behind-a-cache',
        shortcut: true,
        label: 'You hid the N+1 pattern behind a cache.',
        carries: 'The pattern is still in the code; it comes back whenever a cache is cold or the data is hot.',
      });
    }
    if ((db?.config.size ?? 'small') !== 'small') {
      out.push({
        tag: 'm7-n-plus-one:bought-a-bigger-database',
        shortcut: true,
        label: 'You upsized the database to absorb the load.',
        carries: 'The larger instance keeps costing money every month in later missions.',
      });
    }
    return out;
  },
};
