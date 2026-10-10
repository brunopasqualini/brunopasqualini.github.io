import { N, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';
import type { Arch } from '@/engine/types';

const kinds = (arch: Arch, ...k: string[]) => arch.nodes.filter((n) => k.includes(n.kind));

export const m14: Mission = {
  id: 'm14-blank-page',
  number: 14,
  title: 'The Blank Page',
  tagline: 'Design a ticketing platform from nothing, against requirements that pull in different directions.',
  difficulty: 'Advanced',
  kind: 'project',
  estMinutes: 40,
  prerequisites: [],
  skills: { sa: 55, sd: 45, aws: 25, sre: 20 },
  learning: [
    'Starting from requirements and the hardest constraint, not from a favourite architecture',
    'Keeping a contended resource (seat inventory) in one transactional source of truth',
    'Caching what may be stale and never what may not',
    'Designing for the failure you must survive, and no more',
  ],
  story:
    'TicketRush sells tickets for live events. There is no platform yet: you start with an empty canvas and a traffic forecast. When a popular tour goes on sale, traffic jumps to five times normal within minutes. Most requests browse event pages and seat maps; a smaller share reserve and buy seats. Two customers must never be sold the same seat. A confirmation email goes out after every purchase, but it can arrive a little late. The company is small and wants to run what it builds. Design the platform, deploy it, and write down why.',
  business: {
    context:
      'A new ticketing marketplace. Normal traffic about 80 requests per second; a big on-sale reaches 400. Nine in ten requests are reads.',
    impact: 'An on-sale that fails is front-page news and costs the venue relationships; a double-sold seat costs a refund and an apology.',
  },
  constraints: {
    budget: 1950,
    availability: 99.9,
    p95: 400,
    notes: [
      'At the on-sale peak (400 requests per second): availability ≥ 99.9% and p95 ≤ 400 ms.',
      'If one Availability Zone fails during the on-sale, at least 95% of traffic must still be served.',
      'Seat inventory must be updated transactionally: the same seat can never be sold twice.',
      'Seat availability shown to customers may be at most 10 seconds old.',
      'Budget $1,950 / month (simulated estimate). Operational complexity ≤ 55: a small team has to run this.',
      'Record an ADR explaining the main trade-offs you made.',
    ],
  },
  workload: wl({
    baseRps: 80,
    profile: [
      { t: 0, mult: 1 },
      { t: 8, mult: 1 },
      { t: 14, mult: 5 },
    ],
    readRatio: 0.9,
    cacheableShare: 0.7,
    slowQueryShare: 0,
    staticShare: 0.3,
    maliciousShare: 0.02,
    payloadKB: 8,
    freshnessSeconds: 10,
    keyReuseSeconds: 3,
    logGBPerMillionReq: 0.2,
  }),
  initial: { nodes: [N('users', 'users', 20, 200)], edges: [] },
  components: [
    'users',
    'route53',
    'cloudfront',
    'waf',
    'alb',
    'apigw',
    'ecs',
    'ec2',
    'eks',
    'lambda',
    'monolith',
    'microservice',
    'backend-service',
    'worker',
    'rds',
    'relational-db',
    'dynamodb',
    'document-db',
    'elasticache',
    'cache',
    'sqs',
    'message-queue',
    'sns',
    'eventbridge',
    's3',
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'autoscaling',
    'health-check',
    'circuit-breaker',
    'retry-policy',
    'rate-limiter',
    'central-logging',
    'metrics-collector',
    'backup',
  ],
  startMinute: 0,
  verifyMinutes: 6,
  verifyAt: 18,
  deployments: [],
  notes: [
    {
      panel: 'notes',
      title: 'Traffic forecast',
      body: 'Normal: 80 requests per second. On-sale peak: about 400 for an hour, 90% reads. Seat maps and event pages are the same for most visitors; seat availability changes constantly.',
    },
    {
      panel: 'notes',
      title: 'Product rule: no double-booking',
      body: 'Reserving a seat must be atomic. If two people click the same seat at the same moment, exactly one succeeds. This is the one rule that is not negotiable.',
    },
    {
      panel: 'notes',
      title: 'Operational reality',
      body: 'Four engineers, one on call. Nobody wants to operate a cluster. A zone going down during an on-sale is a when, not an if.',
    },
  ],
  rootCauses: [
    {
      id: 'read-peak',
      label:
        'Most of the peak is reads of the same event pages and seat maps, so it can be served from a cache and a stateless tier that scales out',
      correct: true,
      evidencePanels: ['notes'],
      why: 'Nine in ten requests are reads and most visitors see the same pages. Absorbing them before the database keeps the transactional store free for the purchases.',
    },
    {
      id: 'contended-inventory',
      label: 'Seat inventory is a contended resource that needs one transactional source of truth',
      correct: true,
      evidencePanels: ['notes'],
      why: 'The rule is that a seat is sold once. That needs atomic updates in a single authoritative store, not in a cache or in several loosely synchronised copies.',
    },
    {
      id: 'zone-failure',
      label: 'The on-sale must survive the loss of one Availability Zone',
      correct: true,
      evidencePanels: ['notes', 'metrics'],
      why: 'The requirement says so and an on-sale is when it is most likely to hurt. It needs a database standby and application capacity spread across zones.',
    },
    {
      id: 'global-scale',
      label: 'The platform needs multiple Regions and active/active data to cope',
      correct: false,
      evidencePanels: ['notes'],
      why: 'Peak is 400 requests per second in one market. A single Region with zone resilience meets the requirements; multi-Region would add enormous cost and complexity.',
    },
    {
      id: 'microservices',
      label: 'It needs many microservices to scale',
      correct: false,
      evidencePanels: ['notes', 'metrics'],
      why: 'Scale comes from caching and stateless replicas. Four engineers cannot operate a fleet of services, and the complexity budget is part of the brief.',
    },
    {
      id: 'nosql',
      label: 'A NoSQL store is required for this traffic',
      correct: false,
      evidencePanels: ['notes'],
      why: '40 writes per second is well within a relational database, and atomic seat reservation is what relational transactions are for.',
    },
  ],
  actions: [],
  requirements: [
    {
      id: 'avail',
      label: 'At the on-sale peak: availability ≥ 99.9%',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99.9,
      why: 'The on-sale is the product.',
    },
    { id: 'p95', label: 'p95 latency ≤ 400 ms at the peak', hard: true, metric: 'p95', op: '<=', value: 400, why: 'Buyers will not wait.' },
    {
      id: 'az',
      label: 'Survives the loss of one zone (≥ 95% still served)',
      hard: true,
      metric: 'azSurvival',
      op: '>=',
      value: 95,
      why: 'Zone failures happen; the on-sale must not depend on luck.',
    },
    {
      id: 'inventory',
      label: 'Seat inventory lives in a relational database the application writes to',
      hard: true,
      check: (c) => {
        const db = kinds(c.arch, 'rds', 'relational-db');
        const wired = db.some((d) =>
          c.arch.edges.some((e) => e.target === d.id && c.arch.nodes.find((n) => n.id === e.source)?.kind !== 'cache'),
        );
        return { pass: wired, detail: wired ? 'relational database in the write path' : 'no relational database in the write path' };
      },
      why: 'Atomic seat reservation needs transactions in a single source of truth.',
    },
    {
      id: 'fresh',
      label: 'Seat availability is never more than 10 seconds old',
      hard: true,
      metric: 'staleRisk',
      op: '==',
      value: 0,
      why: 'A seat map that lies sells seats that are gone.',
    },
    { id: 'budget', label: 'Cost ≤ $1,950/mo', hard: true, metric: 'cost', op: '<=', value: 1950, why: 'A budget is a requirement.' },
    {
      id: 'complexity',
      label: 'Operational complexity ≤ 55',
      hard: true,
      metric: 'opComplexity',
      op: '<=',
      value: 55,
      why: 'A small team has to run it.',
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
      id: 'adr',
      label: 'An ADR explains the main trade-offs',
      hard: true,
      check: (c) => ({ pass: c.adrs.length >= 1, detail: `${c.adrs.length} ADR(s)` }),
      why: 'A design is a set of decisions; write them down.',
    },
    {
      id: 'async',
      label: 'Confirmation emails go through a queue and a worker',
      hard: false,
      check: (c) => {
        const ok = kinds(c.arch, 'sqs', 'message-queue').length > 0 && kinds(c.arch, 'worker').length > 0;
        return { pass: ok, detail: ok ? 'queue and worker present' : 'no queue and worker' };
      },
      why: 'Work that can be a little late should not hold up the purchase.',
    },
    {
      id: 'alert',
      label: 'An alert rule watches customer-visible symptoms',
      hard: false,
      check: (c) => {
        const ok = kinds(c.arch, 'alert-rule').length > 0;
        return { pass: ok, detail: ok ? 'alert rule present' : 'no alert rule' };
      },
      why: 'You find out about a failing on-sale from an alarm, not from Twitter.',
    },
  ],
  weights: {
    reliability: 3,
    performance: 2,
    cost: 2,
    security: 1,
    maintainability: 1,
    opSimplicity: 2,
    diagnosis: 1,
    correctness: 3,
    rationale: 3,
  },
  hints: [
    {
      tier: 1,
      text: 'List the requirements and ask which one is hardest to meet. Nine in ten requests are reads: where could they be absorbed before they reach a database?',
    },
    {
      tier: 2,
      text: 'A load balancer, a stateless application tier with enough replicas to lose a zone, a relational database with a Multi-AZ standby for inventory, and a short-lived cache for event pages and seat maps. Keep the seat inventory out of the cache.',
    },
    {
      tier: 3,
      text: 'Build: users → ALB → ECS service → RDS (Multi-AZ, with a connection pooler) plus an ElastiCache node as a sibling of the database (TTL under 10 seconds), and an SQS queue and worker for confirmation emails. Add an alert rule and write the ADR.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Start from the hardest constraint',
        body: 'Every requirement shapes the design, but one or two decide it. Here they are no double-booking and surviving a zone loss at peak. Find them first; the rest follows.',
      },
      {
        title: 'One source of truth for what cannot be sold twice',
        body: 'A contended resource needs atomic updates in a single authoritative store. Caches and replicas serve reads; they must never decide who gets the seat.',
      },
      {
        title: 'Cache what may be stale',
        body: 'Event pages barely change; seat availability changes every second. A short TTL is a decision about how stale a seat map may be, and it is bounded by the product, not by taste.',
      },
      {
        title: 'Complexity is a cost you pay every day',
        body: 'Microservices, clusters and multiple Regions each solve a real problem you do not have here. A small team that can run the system is itself a requirement.',
      },
    ],
    rootCause:
      'The platform is hard because of three things: a read-heavy spike that can be absorbed by caching and a stateless tier, a contended inventory that needs transactions in one store, and a zone failure that must not take the on-sale down.',
    alternatives: [
      {
        name: 'Modular application on ECS, Multi-AZ relational database, short-TTL cache',
        when: 'A small team, moderate write volume and a hard transactional rule: the default for this problem.',
        tradeoffs: 'The database is the scaling ceiling for writes; the cache needs a TTL decision.',
      },
      {
        name: 'Virtual waiting room in front of the sale',
        when: 'Demand is far above capacity and fairness matters more than speed (for example the biggest tours).',
        tradeoffs: 'Customers wait in a queue; one more component to build or buy.',
      },
      {
        name: 'Serverless: API Gateway, Lambda and DynamoDB with conditional writes',
        when: 'Traffic is very spiky, the team wants no servers, and access patterns are simple.',
        tradeoffs:
          'Hot items are limited per item (see The Hot Key); cost can exceed servers at steady high load; transactions are narrower.',
      },
      {
        name: 'Seat holds with expiry',
        when: 'Buyers need time to pay and unpaid seats must return to the pool.',
        tradeoffs: 'Adds a hold state, a timer and edge cases such as payment arriving after expiry.',
      },
    ],
    mistakes: [
      'Putting seat inventory in a cache and trusting it.',
      'Choosing microservices or Kubernetes because they are fashionable.',
      'Building multi-Region before one Region is solid.',
      'Forgetting the zone-failure requirement until the drill.',
    ],
    aws: [
      'RDS Multi-AZ keeps a synchronous standby in a second zone and fails over automatically',
      'ElastiCache for Redis in front of read-heavy pages; use short TTLs for data that changes',
      'SQS decouples confirmation emails from the purchase path',
      'Application Load Balancer spreads traffic across targets in multiple zones',
    ],
    experiments: [
      'Remove the cache and watch the database at the peak.',
      'Set the cache TTL to five minutes and read the freshness requirement.',
      'Replace the ECS tier with six microservices and compare the complexity score.',
    ],
  },
  seed: 114,
  guidance: ['notes', 'metrics', 'database'],
  needsPostmortem: false,
  needsADR: true,
  baselineCost: 1800,
  decisions: (arch) => {
    const out = [];
    if (kinds(arch, 'rds', 'relational-db').some((d) => d.config.multiAZ))
      out.push({
        tag: 'm14-blank-page:transactional-core',
        label: 'You kept the contended inventory in a Multi-AZ relational database.',
        carries: 'Later designs start with one transactional source of truth for what cannot be double-sold.',
      });
    return out;
  },
};
