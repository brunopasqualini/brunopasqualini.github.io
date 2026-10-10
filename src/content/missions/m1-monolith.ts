import { analyzePipeline } from '@/engine/analysis';
import { E, N, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

export const m1: Mission = {
  id: 'm1-monolith',
  number: 1,
  title: 'The Growing Monolith',
  tagline: 'Five domains, one deployable, three squads stepping on each other.',
  difficulty: 'Beginner',
  kind: 'project',
  estMinutes: 20,
  prerequisites: [],
  skills: { sa: 60, se: 30, devops: 20, plat: 15 },
  learning: [
    'Modularity, cohesion and coupling',
    'API boundaries between domains',
    'Modular monolith vs microservices trade-offs',
    'Why shared databases couple services',
  ],
  story:
    'Brightcart started as one developer and one Rails-style app. Three years later 14 engineers in three squads (Storefront, Payments, Fulfilment) ship into the same deployable. A catalogue change last week broke refunds. Releases are fortnightly, five of the last sixteen were rolled back, and review queues take days. The CTO has asked for a design that lets squads move independently — but the team of two platform engineers cannot run twelve services.',
  business: {
    context: 'Series-A e-commerce company, 40 requests/second average, steady growth, small platform team.',
    impact: 'Change failure rate is 31%; features slip by weeks; two senior engineers have resigned citing release pain.',
  },
  constraints: {
    budget: 800,
    availability: 99.5,
    p95: 500,
    notes: [
      'Budget: $800 / month (simulated estimate).',
      'Two platform engineers: operational complexity must stay manageable (≤ 55/100).',
      'Must stay available at 99.5% while you migrate.',
      'Record an Architecture Decision Record explaining your choice.',
    ],
  },
  workload: wl({ baseRps: 40, profile: [{ t: 0, mult: 1 }], readRatio: 0.85, slowQueryShare: 0, cacheableShare: 0.6, payloadKB: 6 }),
  initial: {
    nodes: [
      N('users', 'users', 40, 150),
      N(
        'monolith',
        'mono',
        300,
        150,
        { replicas: 2, instanceSize: 'medium', moduleBoundaries: 'none', modules: 5, costTag: 'team=all' },
        'Brightcart Monolith',
      ),
      N('relational-db', 'db', 580, 150, { size: 'small', storageGB: 200, multiAZ: true, costTag: 'team=all' }, 'Shared Postgres'),
      N('cloudwatch', 'cw', 580, 320, {}),
    ],
    edges: [E('users', 'mono'), E('mono', 'db', { weight: 3 })],
  },
  components: [
    'users',
    'monolith',
    'microservice',
    'backend-service',
    'api-gateway',
    'relational-db',
    'document-db',
    'message-queue',
    'cache',
    'cloudwatch',
    'tracing',
    'central-logging',
    'source-repo',
    'ci-pipeline',
    'test-suite',
    'cd-pipeline',
    'service-template',
    'dev-portal',
    'iac',
    'alb',
    'ecs',
    'rds',
    'dynamodb',
    'sqs',
    'elasticache',
  ],
  startMinute: 6,
  verifyMinutes: 6,
  verifyAt: 10,
  squads: 3,
  deployments: [
    {
      minute: -4320,
      kind: 'deploy',
      title: 'v7.41 — refunds rewrite',
      detail: 'Rolled back after catalogue price rounding broke refund totals.',
      by: 'payments-squad',
    },
    {
      minute: -2880,
      kind: 'deploy',
      title: 'v7.42 — search facets',
      detail: 'Hotfix needed: shared `orders` table lock during migration.',
      by: 'storefront-squad',
    },
    {
      minute: -1440,
      kind: 'deploy',
      title: 'v7.43 — release train (3 squads)',
      detail: 'Merge conflicts in `OrderService`; 41-minute build; rolled back.',
      by: 'release-manager',
    },
  ],
  notes: [
    {
      panel: 'notes',
      title: 'Engineering metrics (last quarter)',
      body: 'Deploy frequency: every 14 days. Change failure rate: 31%. Lead time for changes: 19 days. Build + test: 41 minutes. Cross-module regressions: 7 of 11 incidents.',
    },
    {
      panel: 'notes',
      title: 'Code ownership map',
      body: 'Billing, Catalogue, Orders, Accounts, Notifications are directories in one repository. Any module imports any other module’s internals. There is a single `schema.sql`.',
    },
    {
      panel: 'notes',
      title: 'Team constraints',
      body: 'Platform team = 2 engineers. There is no CD pipeline; releases are manual runbooks. Tracing and service templates do not exist.',
    },
  ],
  rootCauses: [
    {
      id: 'coupling',
      label: 'Every domain shares one deployable, one schema and no enforced boundaries, so a change in one squad can break another',
      correct: true,
      evidencePanels: ['dependencies', 'notes'],
      why: 'The dependency map shows catalogue, payments and fulfilment calling each other directly and sharing one database; that is why a catalogue change broke refunds and why releases collide.',
    },
    {
      id: 'capacity',
      label: 'The servers are too small for the traffic',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Load is about 40 requests per second and utilisation is low. The pain is release coordination, not capacity.',
    },
    {
      id: 'stack',
      label: 'The framework or language is the problem and the app needs a rewrite',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'The failures come from coupling between domains, which a rewrite would reproduce. Boundaries can be introduced without one.',
    },
    {
      id: 'scale-need',
      label: 'The product needs microservices to scale',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Nothing here is limited by scale. Microservices would add operational load a two-person platform team cannot carry.',
    },
  ],
  actions: [],
  requirements: [
    {
      id: 'maint',
      label: 'Maintainability ≥ 70',
      hard: true,
      metric: 'maintainability',
      op: '>=',
      value: 70,
      why: 'Domains need clear boundaries so changes stay local (high cohesion, low coupling).',
    },
    {
      id: 'ops',
      label: 'Operational complexity ≤ 55',
      hard: true,
      metric: 'opComplexity',
      op: '<=',
      value: 55,
      why: 'The two-person platform team cannot operate many services — do not add complexity you cannot run.',
    },
    {
      id: 'avail',
      label: 'Availability ≥ 99.5%',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99.5,
      why: 'Refactoring must not break production.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $800/mo',
      hard: true,
      metric: 'cost',
      op: '<=',
      value: 800,
      why: 'Every service you add brings compute, data stores and observability costs.',
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
      id: 'productivity',
      label: 'Developer productivity ≥ 60',
      hard: false,
      metric: 'devProductivity',
      op: '>=',
      value: 60,
      why: 'The point of the exercise: squads can ship independently, with automation behind them.',
    },
    {
      id: 'ci',
      label: 'CI pipeline with automated tests gates changes',
      hard: false,
      check: (c) => {
        const p = analyzePipeline(c.arch);
        return { pass: p.ci && p.tests, detail: p.ci && p.tests ? 'CI and tests present' : 'Add a CI pipeline and a test suite' };
      },
      why: 'Boundaries only hold if automation enforces them.',
    },
    {
      id: 'units',
      label: 'No more than 4 deployable units',
      hard: false,
      metric: 'units',
      op: '<=',
      value: 4,
      why: 'Premature microservices are a classic cause of distributed-monolith pain.',
    },
    {
      id: 'adr',
      label: 'Architecture Decision Record recorded',
      hard: true,
      check: (c) => ({
        pass: c.adrs.length > 0,
        detail: c.adrs.length ? `${c.adrs.length} ADR(s)` : 'Record an ADR describing options and trade-offs',
      }),
      why: 'Decisions without recorded reasoning are rediscovered — painfully — by the next team.',
    },
  ],
  weights: { maintainability: 3, opSimplicity: 3, devProductivity: 2, correctness: 3, cost: 1, security: 1, reliability: 1, rationale: 2 },
  hints: [
    {
      tier: 1,
      text: 'Look at the Monolith’s inspector. What does “Module boundaries: none” imply for how safely squads can change their own domain?',
    },
    {
      tier: 2,
      text: 'You do not have to split into services to get cohesion. A modular monolith with enforced boundaries gives most of the benefit with none of the network overhead.',
    },
    {
      tier: 3,
      text: 'Two valid paths: (A) set the monolith’s boundaries to “Enforced”, add CI + tests; or (B) extract one or two domains into microservices that OWN their data (separate databases) and keep the rest as a smaller monolith. Avoid sharing one database between services.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Cohesion and coupling',
        body: 'Cohesion is how strongly the things inside a module belong together; coupling is how much one module depends on another’s internals. Squads move fast when their domain is cohesive and the interfaces between domains are narrow and stable.',
      },
      {
        title: 'Modular monolith',
        body: 'A single deployable whose modules interact only through explicit public interfaces. You get independent reasoning and testing, and keep one deployment, one transaction boundary and no network failure modes.',
      },
      {
        title: 'Shared database = shared schema',
        body: 'Services that read and write the same tables are coupled through the schema even if the code is separate. They cannot evolve or deploy independently — a distributed monolith.',
      },
    ],
    rootCause:
      'The problem was not “monolith vs microservices”; it was the absence of enforced boundaries. Five domains shared internals and one schema, so every change had an unbounded blast radius.',
    alternatives: [
      {
        name: 'Modular monolith',
        when: 'Small platform team, domains still being discovered, one transactional boundary matters.',
        tradeoffs:
          'One deployable: a bad module can still take the app down; scaling is all-or-nothing; discipline must be enforced by tooling.',
      },
      {
        name: 'Extract one or two services (strangler)',
        when: 'A domain has very different scaling or release cadence (e.g. Payments with strict compliance).',
        tradeoffs: 'Adds a network hop, data ownership migration, distributed tracing and CD requirements.',
      },
      {
        name: 'Full microservices',
        when: 'Many autonomous teams, mature platform (CD, tracing, templates) and clear domain boundaries.',
        tradeoffs: 'Operational overhead scales with the number of services; consistency and debugging get harder.',
      },
    ],
    mistakes: [
      'Splitting by technical layer (an “API service”, a “DB service”) instead of by business domain.',
      'Microservices sharing one database.',
      'Adopting microservices without tracing, CD and ownership — the overhead arrives before the benefit.',
      'Treating a rewrite as the only path to better boundaries.',
    ],
    aws: [
      'ECS/Fargate or Lambda for independently deployable services',
      'RDS per service (or schema-per-module in a modular monolith)',
      'CodePipeline / GitHub Actions for CI/CD',
    ],
    experiments: [
      'Try extracting Payments with its own database, then add a second service that reads Payments’ database — watch the coupling note.',
      'Build 8 microservices and observe operational complexity and cost.',
      'In the Architecture Lab, add a service template + developer portal and see the productivity effect.',
    ],
  },
  seed: 101,
  guidance: ['notes', 'dependencies'],
  needsPostmortem: false,
  needsADR: true,
  baselineCost: 520,
  decisions: (arch) => {
    const services = arch.nodes.filter((n) => n.kind === 'microservice').length;
    const mono = arch.nodes.find((n) => n.kind === 'monolith');
    if (services >= 1) {
      return [
        {
          tag: 'm1-monolith:extracted-services',
          kind: 'tradeoff' as const,
          label: `You extracted ${services} service${services === 1 ? '' : 's'} from the monolith.`,
          carries:
            'The platform you inherit has more moving parts to operate, and your boundaries are only as good as their data ownership.',
        },
      ];
    }
    if (mono?.config.moduleBoundaries === 'enforced') {
      return [
        {
          tag: 'm1-monolith:modular-monolith',
          label: 'You kept one deployable and enforced module boundaries.',
          carries: 'Later missions start with clean module boundaries and a small operational footprint.',
        },
      ];
    }
    return [];
  },
};
