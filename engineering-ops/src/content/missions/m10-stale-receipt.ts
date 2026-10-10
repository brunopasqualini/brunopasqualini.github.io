import { E, N, patchNode, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

const dbOf = (arch: { nodes: { id: string; config: Record<string, any> }[] }) => arch.nodes.find((n) => n.id === 'db');

export const m10: Mission = {
  id: 'm10-stale-receipt',
  number: 10,
  title: 'The Stale Receipt',
  tagline: 'Customers pay, land on their confirmation page and read “Order not found”.',
  difficulty: 'Intermediate',
  kind: 'incident',
  estMinutes: 25,
  prerequisites: [],
  skills: { sd: 55, data: 45, sre: 20, aws: 20 },
  learning: [
    'Asynchronous replication and replica lag',
    'Read-your-writes consistency and how to get it',
    'Why more capacity lowers lag but never removes it',
    'Multi-AZ standby versus read replica: different tools',
  ],
  story:
    'Last month the team added two read replicas to take read load off the primary. Since the Friday flash sale began, support is flooded: customers pay, land on the order confirmation page and see “Order not found”. A refresh a few seconds later works. Payments show as captured and no order is missing. Some customers, assuming the checkout failed, submit it again and get duplicate orders. A teammate suspects a cache and wants to cut its TTL; another wants a bigger database.',
  business: {
    context: 'ShopStream marketplace. Flash sale: traffic about 2.5× normal for the next few hours.',
    impact: 'Hundreds of support tickets an hour, duplicate orders to refund, and customers who no longer trust the confirmation page.',
  },
  constraints: {
    budget: 1700,
    availability: 99,
    p95: 500,
    notes: [
      'After a customer places an order, at most 1% of confirmation-page reads may return data from before the order.',
      'Keep availability ≥ 99% and p95 ≤ 500 ms through the sale peak.',
      'Budget $1,700 / month (simulated estimate).',
      'Do not take the replicas away: product pages depend on them for read capacity.',
      'Write a short postmortem when you are done.',
    ],
  },
  workload: wl({
    baseRps: 130,
    profile: [
      { t: 0, mult: 1 },
      { t: 8, mult: 1 },
      { t: 14, mult: 2.5 },
    ],
    readRatio: 0.85,
    slowQueryShare: 0,
    cacheableShare: 0,
    readAfterWriteShare: 0.2,
    freshnessSeconds: 5,
    payloadKB: 5,
  }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('alb', 'lb', 220, 170, { costTag: 'team=orders' }, 'Public ALB'),
      N('ecs', 'api', 440, 170, { replicas: 4, instanceSize: 'small', dbPoolSize: 10, costTag: 'team=orders' }, 'orders-api', [
        {
          id: 'stale-read-log',
          label: 'Confirmation page reads from a replica',
          log: 'GET /orders/8841 -> 404 order not found (read from orders-db-replica-2, replica_lag=2.4s, order created 0.6s ago)',
        },
      ]),
      N(
        'rds',
        'db',
        680,
        170,
        { size: 'medium', storageGB: 200, readReplicas: 2, readYourWrites: 'replica', multiAZ: false, costTag: 'team=orders' },
        'orders-db',
      ),
      N('cloudwatch', 'cw', 440, 340, {}),
    ],
    edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 1, timeoutMs: 2000 })],
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
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'autoscaling',
    'health-check',
    'central-logging',
    'metrics-collector',
    'synthetic-monitoring',
  ],
  startMinute: 16,
  verifyMinutes: 8,
  verifyAt: 24,
  deployments: [
    {
      minute: -43200,
      kind: 'infra',
      title: 'orders-db: add two read replicas',
      detail: 'Read scaling for product pages. Replication is asynchronous.',
      by: 'platform-team',
    },
    {
      minute: -4320,
      kind: 'deploy',
      title: 'orders-api v7.2 — order confirmation page',
      detail: 'After checkout the page loads GET /orders/{id}. The data layer routes every read to a replica.',
      by: 'orders-team',
    },
    {
      minute: -45,
      kind: 'infra',
      title: 'Flash sale starts',
      detail: 'Marketing email sent; order volume rising.',
      by: 'marketing',
    },
  ],
  notes: [
    {
      panel: 'database',
      title: 'Replication is not instant',
      body: 'A replica applies the primary’s changes after a delay. Compare the replica lag with how soon a customer’s next request arrives.',
    },
    {
      panel: 'logs',
      title: 'Support ticket #90412',
      body: '“I paid and the page said order not found. I refreshed after five seconds and it was there. Did I get charged twice?”',
    },
  ],
  firstMove:
    'Give the customer a correct page: run the “Route reads that follow a write to the primary” action, then open Plan and press Deploy. Then watch the primary’s load.',
  rootCauses: [
    {
      id: 'replica-lag',
      label: 'Reads right after a write are served by an asynchronous replica that is still behind the primary',
      correct: true,
      evidencePanels: ['database', 'logs', 'deployments'],
      why: 'The log shows the order created 0.6 s earlier and a replica 2.4 s behind. v7.2 started reading the order straight after the write, and routes that read to a replica.',
    },
    {
      id: 'cache-ttl',
      label: 'A cache is serving old order data',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'There is no cache on the order path: the dependency map shows the API reading the database directly.',
    },
    {
      id: 'lost-writes',
      label: 'Orders are being lost or the database is corrupted',
      correct: false,
      evidencePanels: ['database', 'logs'],
      why: 'The primary has every order and the same order appears seconds later. The data is late, not missing.',
    },
    {
      id: 'primary-overload',
      label: 'The primary database is overloaded and dropping requests',
      correct: false,
      evidencePanels: ['metrics', 'database'],
      why: 'Requests succeed and availability is high. The primary is busy but not saturated, and the failures are wrong answers, not errors.',
    },
    {
      id: 'failover',
      label: 'A Multi-AZ failover just happened',
      correct: false,
      evidencePanels: ['deployments'],
      why: 'The timeline shows no failover and the database never changed role. The symptom started when v7.2 shipped.',
    },
  ],
  actions: [
    {
      id: 'pin-reads',
      label: 'Route reads that follow a write to the primary',
      description:
        'For a few seconds after a user’s write, send that user’s reads to the primary. Those reads leave the replicas and load the primary.',
      minutes: 8,
      available: (arch) => dbOf(arch)?.config.readYourWrites !== 'primary',
      apply: (arch) => ({
        arch: patchNode(arch, 'db', { readYourWrites: 'primary' }),
        log: 'Deployed orders-api v7.3: reads within a few seconds of a write are routed to the primary.',
      }),
    },
    {
      id: 'add-replica',
      label: 'Add a third read replica',
      description: 'More read capacity for the product pages. The new replica is as asynchronous as the others.',
      minutes: 15,
      available: (arch) => (dbOf(arch)?.config.readReplicas ?? 0) < 4,
      apply: (arch) => ({
        arch: patchNode(arch, 'db', { readReplicas: (dbOf(arch)?.config.readReplicas ?? 0) + 1 }),
        log: 'orders-db: a read replica was added.',
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
      why: 'Orders must keep flowing during the sale.',
    },
    { id: 'p95', label: 'p95 latency ≤ 500 ms', hard: true, metric: 'p95', op: '<=', value: 500, why: 'Checkout must stay quick.' },
    {
      id: 'stale',
      label: 'At most 1% of reads after an order return old data',
      hard: true,
      metric: 'staleReadPct',
      op: '<=',
      value: 1,
      why: 'A customer must see the order they just placed.',
    },
    { id: 'budget', label: 'Cost ≤ $1,700/mo', hard: true, metric: 'cost', op: '<=', value: 1700, why: 'Capacity alone is not the fix.' },
    {
      id: 'primary',
      label: 'Primary database below 85% CPU',
      hard: true,
      check: (c) => {
        const u = c.snap.nodes.db?.util ?? 0;
        return { pass: u <= 0.85, detail: `primary at ${(u * 100).toFixed(0)}%` };
      },
      why: 'Routing reads to the primary moves load onto it; do not trade a wrong answer for an outage.',
    },
    {
      id: 'replicas',
      label: 'Read replicas are kept',
      hard: true,
      check: (c) => {
        const r = dbOf(c.arch)?.config.readReplicas ?? 0;
        return { pass: r >= 2, detail: `${r} replicas` };
      },
      why: 'Product pages rely on replica read capacity.',
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
      id: 'postmortem',
      label: 'A postmortem is written',
      hard: false,
      check: (c) => ({ pass: !!c.postmortem, detail: c.postmortem ? 'written' : 'missing' }),
      why: 'An incident that is not written down happens again.',
    },
  ],
  weights: { reliability: 2, performance: 1, cost: 1, diagnosis: 3, correctness: 4, security: 1, rationale: 1 },
  hints: [
    {
      tier: 1,
      text: 'The order is there a few seconds later. Open the Database panel and compare the replica lag with how soon the confirmation page reads the order.',
    },
    {
      tier: 2,
      text: 'Replicas copy the primary asynchronously, so a read that arrives before the copy lands returns old data. Which reads need to see a customer’s own write?',
    },
    {
      tier: 3,
      text: 'Route reads that follow a write to the primary (an action, or the “Reads that follow a write” setting on the database), then check the primary’s CPU. A bigger primary lowers lag but cannot remove it; a Multi-AZ standby serves no reads.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Replication is asynchronous',
        body: 'A read replica applies the primary’s changes after a delay. Under heavy writes or a busy replica the delay grows from milliseconds to seconds. Any read can be older than the latest write.',
      },
      {
        title: 'Read-your-writes',
        body: 'Most reads tolerate a little staleness. The ones that follow the user’s own write do not: the user just saw the data change and expects to see it. Route those reads somewhere that has the write, for a short window after it.',
      },
      {
        title: 'Capacity lowers lag, it does not remove it',
        body: 'A bigger primary keeps replay closer to the writes, but lag never reaches zero. A correctness requirement needs a routing rule, not just hardware.',
      },
      {
        title: 'Multi-AZ is not a read replica',
        body: 'In the classic RDS Multi-AZ deployment the standby is synchronous and for failover only; it serves no reads. Replicas add read capacity and lag. Different problems, different tools.',
      },
    ],
    rootCause:
      'Release v7.2 reads an order straight after writing it, and the data layer sends every read to an asynchronous replica. Under sale load the replicas run seconds behind, so the read misses the write.',
    alternatives: [
      {
        name: 'Pin reads to the primary for a few seconds after a write',
        when: 'A small share of reads follow a write and the primary has headroom for them.',
        tradeoffs: 'Moves load onto the primary; needs the window tuned above worst-case lag.',
      },
      {
        name: 'Return the created order in the write response',
        when: 'The page can render from what the write returns instead of reading again.',
        tradeoffs: 'Needs a client or API change; the next page load may still read a replica.',
      },
      {
        name: 'Wait for the replica to reach the write’s position',
        when: 'Many reads need freshness and pinning would overload the primary (for example Aurora session consistency, or waiting on a replication position).',
        tradeoffs: 'Adds latency while waiting; depends on database-specific features.',
      },
      {
        name: 'Synchronous replication',
        when: 'Every read must be current and the latency of waiting on replicas is acceptable.',
        tradeoffs: 'Writes slow down and fail if a synchronous replica is unavailable.',
      },
    ],
    mistakes: [
      'Blaming the cache without checking whether one exists on the path.',
      'Buying a bigger database and calling a correctness bug fixed.',
      'Adding more replicas: each one is as asynchronous as the others.',
      'Treating Multi-AZ as extra read capacity.',
    ],
    aws: [
      'CloudWatch ReplicaLag metric for RDS read replicas',
      'Aurora replicas share storage with the writer, so their lag is typically far lower than asynchronous RDS replicas',
      'The AWS Advanced JDBC Wrapper offers read/write splitting; reads that must be fresh can still be sent to the writer',
      'PostgreSQL synchronous_commit = remote_apply makes a commit wait until a synchronous standby has applied it',
    ],
    experiments: [
      'Add a third replica and watch the lag and the stale percentage.',
      'Make the primary large without changing the routing: how low does the stale percentage get?',
      'Pin the reads, then raise traffic further and watch the primary’s CPU.',
    ],
  },
  seed: 110,
  guidance: ['database', 'logs', 'deployments'],
  needsPostmortem: true,
  needsADR: false,
  baselineCost: 1500,
  decisions: (arch) => {
    const db = dbOf(arch);
    if (db?.config.readYourWrites === 'primary')
      return [
        {
          tag: 'm10-stale-receipt:read-your-writes',
          label: 'You routed reads that follow a write to the primary.',
          carries: 'Later designs start with read-your-writes handled instead of discovered by customers.',
        },
      ];
    return [];
  },
};
