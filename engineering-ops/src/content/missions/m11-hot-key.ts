import { E, N, patchNode, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

const tableOf = (arch: { nodes: { id: string; config: Record<string, any> }[] }) => arch.nodes.find((n) => n.id === 'inventory');

export const m11: Mission = {
  id: 'm11-hot-key',
  number: 11,
  title: 'The Hot Key',
  tagline: 'The table has spare capacity and it is still throttling.',
  difficulty: 'Intermediate',
  kind: 'incident',
  estMinutes: 25,
  prerequisites: [],
  skills: { sd: 50, data: 55, aws: 35, sre: 15 },
  learning: [
    'Partition limits: why one item can throttle a table with spare capacity',
    'Reading throttling and consumed capacity together',
    'Write sharding, and what it costs in reads and correctness',
    'Why buying capacity does not lift a per-item ceiling',
  ],
  story:
    'The limited-edition sneaker drop opened ten minutes ago. Add-to-cart is failing for roughly one customer in six with a throttling error from DynamoDB, yet the table’s consumed write capacity is well under what you provisioned. The on-call raised the provisioned write capacity twice; nothing changed. Every add-to-cart reserves a pair by decrementing one stock counter item for the drop.',
  business: {
    context: 'Brightcart. A limited sneaker drop: about five times normal traffic for the next hour, nearly all of it on one product.',
    impact: 'Customers are turned away at the moment of highest demand, and the marketing campaign is live.',
  },
  constraints: {
    budget: 4200,
    availability: 99,
    p95: 300,
    notes: [
      'Keep availability ≥ 99% through the drop.',
      'No single item should receive more than 800 writes per second (the limit is about 1,000).',
      'Keep p95 ≤ 300 ms.',
      'Budget $4,200 / month (simulated estimate).',
      'Never sell more pairs than exist. Write an ADR that says how.',
    ],
  },
  workload: wl({
    baseRps: 400,
    profile: [
      { t: 0, mult: 1 },
      { t: 6, mult: 1 },
      { t: 12, mult: 5 },
    ],
    readRatio: 0.25,
    hotKeyShare: 0.9,
    cacheableShare: 0,
    slowQueryShare: 0,
    payloadKB: 2,
    freshnessSeconds: 5,
    logGBPerMillionReq: 0.2,
  }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('alb', 'lb', 220, 170, { costTag: 'team=drops' }, 'Public ALB'),
      N('ecs', 'api', 440, 170, { replicas: 12, instanceSize: 'medium', dbPoolSize: 10, costTag: 'team=drops' }, 'cart-api', [
        {
          id: 'throttle-log',
          label: 'Writes to one stock item are throttled',
          log: 'ProvisionedThroughputExceededException: The level of configured provisioned throughput for the table was exceeded (partition key stock#drop-air-1)',
        },
      ]),
      N(
        'dynamodb',
        'inventory',
        680,
        170,
        { capacityMode: 'provisioned', rcu: 1000, wcu: 2000, writeShards: 1, costTag: 'team=drops' },
        'inventory-table',
      ),
      N('cloudwatch', 'cw', 440, 340, {}),
    ],
    edges: [E('users', 'lb'), E('lb', 'api'), E('api', 'inventory', { weight: 1, timeoutMs: 1000 })],
  },
  components: [
    'users',
    'alb',
    'ecs',
    'ec2',
    'backend-service',
    'dynamodb',
    'document-db',
    'elasticache',
    'cache',
    'message-queue',
    'sqs',
    'worker',
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'autoscaling',
    'central-logging',
    'metrics-collector',
  ],
  startMinute: 14,
  verifyMinutes: 6,
  verifyAt: 18,
  deployments: [
    {
      minute: -10080,
      kind: 'deploy',
      title: 'inventory service v5.0',
      detail: 'Reserving a pair decrements one stock item per drop with a conditional write, so stock can never go below zero.',
      by: 'drops-team',
    },
    {
      minute: -25,
      kind: 'config',
      title: 'Table write capacity 500 → 1,000',
      detail: 'On-call response to throttling alarms.',
      by: 'sre-oncall',
    },
    {
      minute: -12,
      kind: 'config',
      title: 'Table write capacity 1,000 → 2,000',
      detail: 'Second increase. Throttling continues.',
      by: 'sre-oncall',
    },
  ],
  notes: [
    {
      panel: 'metrics',
      title: 'Read the two numbers together',
      body: 'Compare the writes the table is consuming with what you provisioned. Then ask where the throttled writes are going.',
    },
    {
      panel: 'logs',
      title: 'Support ticket #31877',
      body: '“Add to cart says try again, over and over. My friend got through on the first try.”',
    },
  ],
  firstMove:
    'Spread the one hot key across several items: run the “Split the stock counter into shards” action, then open Plan and press Deploy. Do not raise the provisioned capacity again.',
  rootCauses: [
    {
      id: 'hot-item',
      label: 'One item (the drop’s stock counter) receives more writes per second than a single partition can take',
      correct: true,
      evidencePanels: ['logs', 'metrics', 'database'],
      why: 'Consumed write capacity is far below provisioned, the log names one partition key, and the Database panel shows one item above the per-item limit.',
    },
    {
      id: 'table-capacity',
      label: 'The table’s provisioned write capacity is too low',
      correct: false,
      evidencePanels: ['metrics', 'database'],
      why: 'Consumed capacity is about three quarters of what was provisioned and it was already doubled twice without effect.',
    },
    {
      id: 'api-capacity',
      label: 'The cart API tier is overloaded',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'API utilisation is moderate. The errors are throttling responses from the table, not API saturation.',
    },
    {
      id: 'burst',
      label: 'The traffic burst is simply too sudden for the table to absorb',
      correct: false,
      evidencePanels: ['database'],
      why: 'Traffic is steady for ten minutes, and the throttling is confined to writes to one item. A smoother ramp would not change that.',
    },
  ],
  actions: [
    {
      id: 'shard-counter',
      label: 'Split the stock counter into shards',
      description:
        'Store the stock across several items (stock#drop-air-1#1 … #8), each holding a share of the pairs, and have each request pick a shard. Reads add the shards up.',
      minutes: 15,
      available: (arch) => (tableOf(arch)?.config.writeShards ?? 1) < 8,
      apply: (arch) => ({
        arch: patchNode(arch, 'inventory', { writeShards: 8 }),
        log: 'Deployed inventory v5.1: the stock counter is split across 8 shard items.',
      }),
    },
    {
      id: 'raise-wcu',
      label: 'Double the table’s provisioned write capacity',
      description: 'More capacity for the whole table. A single item has its own, lower ceiling.',
      minutes: 3,
      available: (arch) => (tableOf(arch)?.config.wcu ?? 0) < 16000,
      apply: (arch) => ({
        arch: patchNode(arch, 'inventory', { wcu: (tableOf(arch)?.config.wcu ?? 1000) * 2 }),
        log: 'inventory-table: provisioned write capacity doubled.',
      }),
    },
    {
      id: 'on-demand',
      label: 'Switch the table to on-demand capacity',
      description: 'The table scales with traffic without provisioning. Each partition keeps the same limits.',
      minutes: 5,
      available: (arch) => tableOf(arch)?.config.capacityMode !== 'on-demand',
      apply: (arch) => ({
        arch: patchNode(arch, 'inventory', { capacityMode: 'on-demand' }),
        log: 'inventory-table: switched to on-demand capacity.',
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
      why: 'Customers must be able to add to cart during the drop.',
    },
    { id: 'p95', label: 'p95 latency ≤ 300 ms', hard: true, metric: 'p95', op: '<=', value: 300, why: 'Add-to-cart must feel instant.' },
    {
      id: 'hot',
      label: 'No item receives more than 800 writes/s',
      hard: true,
      metric: 'hotItemWritesPerSec',
      op: '<=',
      value: 800,
      why: 'The per-item ceiling is about 1,000 writes per second; stay clear of it.',
    },
    { id: 'budget', label: 'Cost ≤ $4,200/mo', hard: true, metric: 'cost', op: '<=', value: 4200, why: 'Capacity is not the fix.' },
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
      id: 'oversell',
      label: 'The ADR says how the design never oversells',
      hard: false,
      check: (c) => {
        const ok = c.adrs.some((a) =>
          /oversell|sold out|sell more|conditional|reserv|allocat/i.test(`${a.decision} ${a.cons} ${a.implications}`),
        );
        return { pass: ok, detail: ok ? 'addressed in an ADR' : 'no ADR mentions overselling' };
      },
      why: 'Splitting the counter splits the stock. Without a rule for a shard that runs out, you can oversell or turn customers away with stock left.',
    },
  ],
  weights: { reliability: 2, performance: 1, cost: 2, diagnosis: 3, correctness: 3, security: 1, rationale: 2 },
  hints: [
    {
      tier: 1,
      text: 'Compare the writes the table consumes with the capacity you provisioned. If there is room to spare, why are writes still throttled?',
    },
    {
      tier: 2,
      text: 'Look at the Database panel: how many writes per second land on the single hottest item, and what is the limit for one item?',
    },
    {
      tier: 3,
      text: 'A single item has its own ceiling, whatever the table’s capacity. Spread the hot key across several items (the shard action, or “Write shards” on the table) and write an ADR on how you avoid overselling.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Capacity is per partition, not only per table',
        body: 'DynamoDB spreads items over partitions, and a partition serves a limited number of operations per second. A table can have capacity to spare while one item is throttled, because every write for that item lands on the same partition.',
      },
      {
        title: 'Throttling plus spare capacity is the hot-key signature',
        body: 'When consumed capacity is below provisioned and you still see throttling, look for a hot key before buying more capacity.',
      },
      {
        title: 'Write sharding trades simplicity for throughput',
        body: 'Splitting one counter into N items divides the write rate by N. In return reads must combine the shards, and a rule with a global invariant (never below zero) must now be enforced per shard or by a coordinator.',
      },
      {
        title: 'Capacity modes do not lift the ceiling',
        body: 'Provisioned or on-demand, a single item has the same limit. On-demand removes capacity planning, not hot keys.',
      },
    ],
    rootCause:
      'Each add-to-cart decrements one stock item. At the drop’s peak that is more writes per second to a single item than one partition can serve, so those writes are throttled while the rest of the table sits idle.',
    alternatives: [
      {
        name: 'Shard the counter across several items',
        when: 'The invariant can be split: allocate stock per shard, or an approximate count is acceptable.',
        tradeoffs: 'Reads aggregate shards; one shard can sell out while others still have stock unless you rebalance.',
      },
      {
        name: 'Count in an in-memory store and persist asynchronously',
        when: 'Speed matters more than every decrement being durable the instant it happens (for example Redis atomic decrements).',
        tradeoffs: 'A crash can lose recent decrements; you must reconcile with the table.',
      },
      {
        name: 'Serialise reservations through a queue per product',
        when: 'Strict ordering matters and the drop is short enough that waiting in line is acceptable.',
        tradeoffs: 'Customers wait; a queue per item is still one consumer per item.',
      },
      {
        name: 'Pre-allocate inventory to servers or users',
        when: 'The drop is large and you can hand each server a block of pairs to sell locally.',
        tradeoffs: 'Unsold blocks strand stock until returned; needs a reclaim step.',
      },
    ],
    mistakes: [
      'Raising provisioned capacity repeatedly without asking where the throttled writes are going.',
      'Switching to on-demand and expecting a per-item ceiling to move.',
      'Sharding the counter without deciding what happens when one shard sells out.',
      'Choosing a partition key with few distinct, popular values.',
    ],
    aws: [
      'CloudWatch Contributor Insights for DynamoDB shows the most accessed and most throttled keys',
      'DynamoDB metrics: WriteThrottleEvents, ConsumedWriteCapacityUnits',
      'Write sharding is a documented DynamoDB design pattern for high-volume keys',
      'Adaptive capacity can isolate a hot item onto its own partition, but a single item still has a ceiling of about 1,000 write units per second',
    ],
    experiments: [
      'Double the write capacity again and watch what happens to the throttled share.',
      'Try two shards, then eight: how much headroom does each give?',
      'Raise the traffic further and see how many shards you would need.',
    ],
  },
  seed: 111,
  guidance: ['logs', 'metrics', 'database', 'notes'],
  needsPostmortem: false,
  needsADR: true,
  baselineCost: 3800,
  decisions: (arch) => {
    const t = tableOf(arch);
    if ((t?.config.writeShards ?? 1) > 1)
      return [
        {
          tag: 'm11-hot-key:sharded-the-hot-key',
          label: 'You spread the hot key across several items.',
          carries: 'Later designs start by asking which single key will take the traffic.',
        },
      ];
    return [];
  },
};
