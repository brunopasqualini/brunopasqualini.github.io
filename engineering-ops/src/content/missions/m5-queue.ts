import { E, N, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

export const m5: Mission = {
  id: 'm5-queue',
  number: 5,
  title: 'The Queue That Never Drains',
  tagline: 'Fulfilment events pile up, some messages fail forever, and the ledger database spikes.',
  difficulty: 'Advanced',
  kind: 'incident',
  estMinutes: 35,
  prerequisites: ['m2-db-meltdown'],
  skills: { sd: 65, data: 45, sre: 40, aws: 25 },
  learning: [
    'SQS semantics: at-least-once delivery, visibility timeout, redrive',
    'Dead-letter queues and poison messages',
    'Idempotent consumers',
    'Backpressure and concurrency limits',
    'Eventual consistency and its customer impact',
  ],
  story:
    'Orders are accepted instantly, but shipping labels are minutes — now hours — late. The fulfilment queue keeps growing. Some customers received two labels; some messages seem to fail every single time. When the team scaled workers last week, the ledger database spiked and everything got worse. Find out why the queue never drains, and fix it without breaking correctness or the database.',
  business: {
    context: 'Fulfilment pipeline: order API → queue → worker (label printing, 3 s of work per message) → ledger database.',
    impact: 'Late and duplicate shipments; support tickets are rising; every duplicated label costs money.',
  },
  constraints: {
    budget: 900,
    availability: 99,
    p95: 500,
    notes: [
      'Backlog delay must come back under 2 minutes.',
      'No message may be lost silently and poison messages must not block healthy ones.',
      'Duplicate deliveries must be harmless.',
      'The ledger database must stay below 90% CPU while draining.',
      'Budget $900 / month (simulated estimate). Write a postmortem.',
    ],
  },
  workload: wl({
    baseRps: 20,
    profile: [
      { t: 0, mult: 1 },
      { t: 10, mult: 1 },
      { t: 12, mult: 2.5 },
    ],
    readRatio: 0.4,
    avgProcessMs: 3000,
    poisonShare: 0.02,
    slowQueryShare: 0,
    payloadKB: 4,
  }),
  initial: {
    nodes: [
      N('users', 'users', 20, 160),
      N('backend-service', 'api', 200, 160, { replicas: 3, instanceSize: 'small', costTag: 'team=fulfilment' }, 'order-api'),
      N(
        'sqs',
        'q',
        420,
        160,
        { visibilityTimeoutSec: 10, maxReceiveCount: 5, retentionDays: 4, costTag: 'team=fulfilment' },
        'fulfilment-queue',
      ),
      N(
        'worker',
        'w',
        640,
        160,
        {
          replicas: 4,
          instanceSize: 'small',
          concurrency: 25,
          maxConcurrency: 500,
          idempotent: false,
          dbPoolSize: 10,
          costTag: 'team=fulfilment',
        },
        'label-worker',
      ),
      N(
        'rds',
        'ledger',
        860,
        160,
        { size: 'small', storageGB: 100, indexed: true, multiAZ: false, costTag: 'team=fulfilment' },
        'ledger-db',
      ),
      N('cloudwatch', 'cw', 420, 330, {}),
      N('tracing', 'trace', 640, 330, {}),
    ],
    edges: [E('users', 'api'), E('api', 'q'), E('q', 'w'), E('w', 'ledger', { weight: 4, timeoutMs: 3000 })],
  },
  components: [
    'users',
    'backend-service',
    'ecs',
    'sqs',
    'message-queue',
    'dlq',
    'worker',
    'rds',
    'relational-db',
    'dynamodb',
    'autoscaling',
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'retry-policy',
    'circuit-breaker',
    'rate-limiter',
    'bulkhead',
    'sns',
    'eventbridge',
    'event-bus',
    'central-logging',
    'metrics-collector',
  ],
  startMinute: 20,
  verifyMinutes: 45,
  verifyAt: 45,
  deployments: [
    {
      minute: -10080,
      kind: 'config',
      title: 'Worker replicas 2 → 3',
      detail: 'Scaled workers “to drain faster”. Ledger DB CPU spiked shortly after.',
      by: 'fulfilment-team',
    },
    {
      minute: -4320,
      kind: 'deploy',
      title: 'label-worker v1.9 — new carrier integration',
      detail: 'Messages with legacy address format now throw ProcessingError.',
      by: 'fulfilment-team',
    },
    { minute: 12, kind: 'incident', title: 'Black Friday pre-orders open', detail: 'Order rate ×2.5.', by: 'marketing' },
  ],
  notes: [
    {
      panel: 'notes',
      title: 'Architecture note',
      body: 'Standard SQS queue. Delivery is at-least-once. Worker is not idempotent: it always asks the carrier for a new label. Visibility timeout was set to 10 s “because that’s what the tutorial used”. There is no dead-letter queue.',
    },
    {
      panel: 'notes',
      title: 'Support digest',
      body: '14 customers received duplicate shipping labels yesterday. 6 orders have been “processing” for 3+ hours.',
    },
  ],
  rootCauses: [
    {
      id: 'poison',
      label: 'Poison messages are redelivered forever (no dead-letter queue)',
      correct: true,
      evidencePanels: ['queues', 'logs'],
      why: 'Messages with a legacy address format fail on every attempt. With no redrive policy they stay in the queue and consume consumer capacity on every redelivery.',
    },
    {
      id: 'vis',
      label: 'Visibility timeout (10 s) is shorter than safe for processing time',
      correct: true,
      evidencePanels: ['queues', 'logs'],
      why: 'Processing takes ~3 s at p50 and several seconds at the tail; with a 10 s timeout slow messages become visible again while still being worked on: duplicates and wasted capacity.',
    },
    {
      id: 'capacity',
      label: 'Consumer capacity is below the arrival rate',
      correct: true,
      evidencePanels: ['queues', 'metrics'],
      why: 'At 2.5× arrival the three workers cannot keep up even with healthy messages.',
    },
    {
      id: 'sqs',
      label: 'The SQS service is degraded',
      correct: false,
      evidencePanels: ['queues'],
      why: 'SQS is healthy: enqueue succeeds instantly; the symptom is on the consumer side.',
    },
    {
      id: 'producer',
      label: 'The producer is flooding the queue abnormally',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'The arrival rate matches the order rate, so the producer is not flooding the queue; the consumers are the problem.',
    },
  ],
  actions: [],
  requirements: [
    {
      id: 'delay',
      label: 'Backlog delay ≤ 2 minutes',
      hard: true,
      metric: 'queueDelaySec',
      op: '<=',
      value: 120,
      why: 'Customers expect labels in minutes, not hours.',
    },
    {
      id: 'dlq',
      label: 'A dead-letter queue is configured on the queue',
      hard: true,
      check: (c) => {
        const ok = c.arch.edges.some((e) => {
          const s = c.arch.nodes.find((n) => n.id === e.source);
          const t = c.arch.nodes.find((n) => n.id === e.target);
          return s?.kind === 'sqs' || s?.kind === 'message-queue' ? t?.config.isDlq : false;
        });
        return { pass: ok, detail: ok ? 'DLQ attached' : 'Attach a dead-letter queue to the main queue' };
      },
      why: 'Poison messages must be parked, not retried forever.',
    },
    {
      id: 'lost',
      label: 'No messages stuck / silently expiring',
      hard: true,
      metric: 'lostPerMin',
      op: '<=',
      value: 0,
      why: 'Silent message loss is a correctness failure.',
    },
    {
      id: 'dup',
      label: 'Duplicate deliveries are harmless (idempotent consumers)',
      hard: true,
      metric: 'duplicateRate',
      op: '<=',
      value: 0.5,
      why: 'Standard SQS is at-least-once — consumers must tolerate duplicates.',
    },
    {
      id: 'db',
      label: 'Ledger database CPU ≤ 90% while draining',
      hard: true,
      check: (c) => {
        const worst = Math.max(
          0,
          ...Object.values(c.snap.nodes)
            .filter((m) => m.role === 'db')
            .map((m) => m.util),
        );
        return { pass: worst <= 0.9, detail: `Peak database utilisation ${(worst * 100).toFixed(0)}%` };
      },
      why: 'Backpressure: draining faster than the downstream can absorb just moves the outage.',
    },
    {
      id: 'alert',
      label: 'Alert on queue age or DLQ depth',
      hard: false,
      check: (c) => ({
        pass: c.arch.nodes.some((n) => n.kind === 'alert-rule' && (n.config.metric === 'queueAge' || n.config.metric === 'dlq')),
        detail: 'Detect backlog before customers do',
      }),
      why: 'A queue hides overload as latency.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $900/mo',
      hard: false,
      metric: 'cost',
      op: '<=',
      value: 900,
      why: 'Do not buy your way out of a design problem.',
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
      id: 'pm',
      label: 'Postmortem recorded',
      hard: true,
      check: (c) => ({ pass: !!c.postmortem, detail: c.postmortem ? 'Recorded' : 'Write the postmortem' }),
      why: 'Learning requires writing it down.',
    },
  ],
  weights: { reliability: 1, diagnosis: 3, correctness: 3, security: 1, cost: 1, rationale: 2, opSimplicity: 1 },
  failure: { maxQueueDelaySec: 14400, text: 'Fulfilment SLA breached: labels are more than 4 hours late.' },
  hints: [
    {
      tier: 1,
      text: 'In Queue health, compare arrival rate with drain rate. Is the drain rate pinned at consumer capacity — or lower than capacity because something else is eating it?',
    },
    {
      tier: 2,
      text: 'Check the logs: which message keeps failing, and what happens to it after its 5th attempt? Also compare the visibility timeout with how long processing takes.',
    },
    {
      tier: 3,
      text: 'Attach a DLQ (redrive after N receives), raise the visibility timeout well above worst-case processing time (≥ 6× the processing time is a common rule), make the worker idempotent, scale workers — but cap concurrency (or scale the ledger DB) so the drain rate stays within what the database can take.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'At-least-once delivery',
        body: 'Standard SQS may deliver a message more than once — after a visibility timeout expires, or after a failed delete. Consumers must be idempotent (e.g., deduplicate on message ID or use conditional writes).',
      },
      {
        title: 'Visibility timeout',
        body: 'The window during which a received message is hidden from other consumers. If it is shorter than worst-case processing time, messages are processed twice. AWS recommends at least six times the function timeout when a Lambda function consumes the queue; for other consumers, set it above the worst-case processing time with headroom.',
      },
      {
        title: 'Poison messages and DLQs',
        body: 'A message that always fails will be retried forever, wasting capacity and hiding in the backlog. A dead-letter queue parks it after maxReceiveCount attempts so healthy traffic flows, and gives you something to alert on and redrive after fixing the bug.',
      },
      {
        title: 'Backpressure',
        body: 'Queues decouple rates, but draining a large backlog at full speed can overwhelm downstream systems. Limit consumer concurrency to what the slowest dependency can absorb.',
      },
    ],
    rootCause:
      'Three stacked causes: poison messages with no DLQ were redelivered endlessly, a 5 s visibility timeout caused duplicate processing, and consumer capacity was below the post-spike arrival rate. Scaling workers without a concurrency cap then overloaded the ledger database.',
    alternatives: [
      {
        name: 'FIFO queue with deduplication',
        when: 'Ordering or exactly-once-like semantics matter and throughput is moderate.',
        tradeoffs: 'Lower throughput limits; message group design needed.',
      },
      {
        name: 'Lambda consumers with reserved concurrency',
        when: 'Spiky load; want automatic scaling with a hard concurrency ceiling.',
        tradeoffs: 'Per-invocation cost; connection management to the database (use RDS Proxy).',
      },
      {
        name: 'Rate-limited consumers + larger database',
        when: 'Downstream is the true limit and growth is expected.',
        tradeoffs: 'Cost; the queue absorbs the burst as delay — acceptable only if SLAs allow.',
      },
    ],
    mistakes: [
      'Raising worker count without a concurrency limit — drain spike overloads the database.',
      'No DLQ alarm: parked messages are invisible failures.',
      'Treating duplicates as a queue bug rather than a consumer-design requirement.',
      'Setting the visibility timeout from a tutorial default.',
    ],
    aws: [
      'SQS redrive policy + DLQ redrive to source',
      'Lambda event source mapping maximum concurrency',
      'CloudWatch alarms: ApproximateAgeOfOldestMessage, DLQ ApproximateNumberOfMessagesVisible',
      'Powertools for AWS Lambda idempotency utility',
    ],
    experiments: [
      'Attach a DLQ but leave the 5 s visibility timeout: how much capacity is still wasted?',
      'Set worker concurrency to 500 and watch the ledger database.',
      'Replace the worker with an autoscaling policy and observe the lag.',
    ],
  },
  seed: 505,
  guidance: ['queues', 'logs', 'metrics'],
  needsPostmortem: true,
  needsADR: false,
};
