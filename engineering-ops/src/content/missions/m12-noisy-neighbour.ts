import { E, N, patchNode, wl } from '@/content/missions/helpers';
import type { Arch } from '@/engine/types';
import type { Mission } from '@/content/missions/types';

const PARTNER_RPS_CONTRACT = 25;

/** Requests per second of the partner's traffic that get served end to end (zero when it has no way in). */
const partnerServed = (c: { arch: Arch; snap: { nodes: Record<string, { offered: number; errorRate: number }> } }) => {
  const p = c.snap.nodes.partner;
  const connected = c.arch.edges.some((e) => e.source === 'partner');
  return p && connected ? p.offered * (1 - p.errorRate) : 0;
};

const withoutPartnerEdge = (arch: Arch): Arch => ({
  ...arch,
  edges: arch.edges.filter((e) => !(e.source === 'partner' && e.target === 'lb')),
});

export const m12: Mission = {
  id: 'm12-noisy-neighbour',
  number: 12,
  title: 'The Noisy Neighbour',
  tagline: 'One partner’s runaway sync job is using everyone’s capacity.',
  difficulty: 'Intermediate',
  kind: 'incident',
  estMinutes: 25,
  prerequisites: [],
  skills: { sre: 50, plat: 35, sa: 25, sd: 25 },
  learning: [
    'Rate limiting as protection: shed load at the edge, per client',
    'Why a global limit and more capacity both fail the wrong people',
    'Backpressure and 429s: telling a client to slow down',
    'Fairness between tenants that share capacity',
  ],
  story:
    'At 02:10 a retail partner’s nightly catalogue-sync job hit an error and went into a tight retry loop with no backoff. It now sends about 120 requests per second to the public catalogue API instead of the 10 to 25 its contract allows. Shoppers use the same API and the same database. Page loads are timing out for shoppers. The partner’s own sync is failing too, which makes it retry harder.',
  business: {
    context:
      'Brightcart’s public catalogue API serves shoppers and about 350 partners. Each partner is contracted for up to 25 requests per second.',
    impact: 'Shoppers see timeouts during the busiest browsing hours, and the partner’s integration is down as well.',
  },
  constraints: {
    budget: 2200,
    availability: 99,
    p95: 400,
    notes: [
      'Shoppers must see ≥ 99% availability and p95 ≤ 400 ms. Requests the partner makes beyond its quota are not counted against that.',
      'Keep the partner working inside its contract: it must still be served at least 25 requests per second.',
      'The flood must not reach the API: no more than about 40 partner requests per second may get through.',
      'Budget $2,200 / month (simulated estimate). The gateway bills per request it receives, including the ones it rejects. Capacity is not the fix.',
      'Write a short postmortem when you are done.',
    ],
  },
  workload: wl({
    baseRps: 200,
    profile: [{ t: 0, mult: 1 }],
    readRatio: 0.95,
    slowQueryShare: 0,
    cacheableShare: 0,
    maliciousShare: 0,
    payloadKB: 6,
    logGBPerMillionReq: 0.2,
  }),
  initial: {
    nodes: [
      N('users', 'customers', 20, 90, { share: 0.3 }, 'Shoppers'),
      N('users', 'partner', 20, 280, { share: 0.6, excludeFromSlo: true }, 'Partner sync job'),
      N('alb', 'lb', 240, 170, { costTag: 'team=catalogue' }, 'Public ALB'),
      N('ecs', 'api', 460, 170, { replicas: 3, instanceSize: 'small', dbPoolSize: 10, costTag: 'team=catalogue' }, 'catalogue-api'),
      N('rds', 'db', 700, 170, { size: 'medium', storageGB: 100, indexed: true, costTag: 'team=catalogue' }, 'catalogue-db'),
      N('cloudwatch', 'cw', 460, 340, {}),
    ],
    edges: [E('customers', 'lb'), E('partner', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 5, timeoutMs: 2000 })],
  },
  components: [
    'users',
    'alb',
    'apigw',
    'waf',
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
    'rate-limiter',
    'retry-policy',
    'circuit-breaker',
    'autoscaling',
    'health-check',
    'central-logging',
    'metrics-collector',
  ],
  startMinute: 12,
  verifyMinutes: 6,
  verifyAt: 18,
  deployments: [
    {
      minute: -90,
      kind: 'incident',
      title: 'Partner sync job starts failing',
      detail: 'A partner’s catalogue sync begins retrying immediately and continuously after an error.',
      by: 'partner',
    },
    {
      minute: -20,
      kind: 'infra',
      title: 'Shopper timeouts reported',
      detail: 'Support: “the catalogue won’t load”. Dashboards show the API saturated.',
      by: 'support',
    },
  ],
  notes: [
    {
      panel: 'dependencies',
      title: 'Where is the traffic coming from?',
      body: 'Compare the requests each client sends with what it is entitled to. One client may be using most of the capacity.',
    },
    {
      panel: 'logs',
      title: 'Access log sample',
      body: 'GET /catalog/changes?since=… 200 (partner-key=pk_4411) repeated hundreds of times per second, no delay between calls.',
    },
  ],
  firstMove:
    'Give the partner its own limited door: run the “Give the partner its own usage plan” action, then open Plan and press Deploy. Shoppers get their capacity back and the partner still gets what its contract says.',
  rootCauses: [
    {
      id: 'runaway-client',
      label: 'One client is sending far more than its quota and shares capacity with everyone else',
      correct: true,
      evidencePanels: ['dependencies', 'logs', 'metrics'],
      why: 'The dependency map shows about three quarters of the requests come from the partner, the access log shows the same call repeated without a pause, and the API is saturated while shopper traffic is normal.',
    },
    {
      id: 'api-undersized',
      label: 'The API does not have enough capacity for shopper traffic',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'Shopper traffic alone fits comfortably. The saturation comes from the partner’s extra requests.',
    },
    {
      id: 'db-slow',
      label: 'The database is slow',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'The database is saturated only because the API forwards every partner request to it, five queries each. The queries are fast and indexed; there are simply too many.',
    },
    {
      id: 'attack',
      label: 'The site is under a malicious attack',
      correct: false,
      evidencePanels: ['logs'],
      why: 'The traffic uses one valid partner key and a legitimate endpoint. It is a buggy client, not an attacker, and the fix is a quota, not blocking.',
    },
  ],
  actions: [
    {
      id: 'partner-usage-plan',
      label: 'Give the partner its own usage plan',
      description:
        'Route the partner through a dedicated API Gateway stage with a throttle just above its contract (30 requests per second). Requests over the limit get 429 Too Many Requests before they reach the API.',
      minutes: 10,
      available: (arch) => !arch.nodes.some((n) => n.id === 'partner-gw'),
      apply: (arch) => {
        const base = withoutPartnerEdge(arch);
        return {
          arch: {
            nodes: [
              ...base.nodes,
              N('apigw', 'partner-gw', 240, 330, { throttleRps: 30, costTag: 'team=catalogue' }, 'Partner usage plan'),
            ],
            edges: [...base.edges, E('partner', 'partner-gw'), E('partner-gw', 'lb')],
          },
          log: 'Created a usage plan for the partner API key: 30 requests/s steady. Excess requests receive 429 Too Many Requests.',
        };
      },
    },
    {
      id: 'scale-api',
      label: 'Triple the API replicas',
      description: 'More application capacity for everyone, including the runaway client. The database is shared too.',
      minutes: 6,
      available: (arch) => (arch.nodes.find((n) => n.id === 'api')?.config.replicas ?? 0) < 24,
      apply: (arch) => ({
        arch: patchNode(arch, 'api', { replicas: (arch.nodes.find((n) => n.id === 'api')?.config.replicas ?? 2) * 3 }),
        log: 'catalogue-api: replicas tripled.',
      }),
    },
    {
      id: 'global-limit',
      label: 'Cap the whole API at 150 requests per second',
      description: 'A single limit on the API, shared by every client.',
      minutes: 5,
      available: (arch) => !arch.nodes.some((n) => n.id === 'limiter'),
      apply: (arch) => ({
        arch: {
          nodes: [...arch.nodes, N('rate-limiter', 'limiter', 460, 20, { maxRps: 150 }, 'API limit')],
          edges: [...arch.edges, E('limiter', 'api')],
        },
        log: 'catalogue-api: global limit of 150 requests per second.',
      }),
    },
    {
      id: 'block-partner',
      label: 'Block the partner completely',
      description: 'Remove the partner’s access until their bug is fixed.',
      minutes: 2,
      available: (arch) => arch.edges.some((e) => e.source === 'partner' && e.target === 'lb'),
      apply: (arch) => ({ arch: withoutPartnerEdge(arch), log: 'The partner’s API key was revoked.' }),
    },
  ],
  requirements: [
    {
      id: 'avail',
      label: 'Shoppers: availability ≥ 99%',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99,
      why: 'Shoppers must be able to browse.',
    },
    {
      id: 'p95',
      label: 'Shoppers: p95 latency ≤ 400 ms',
      hard: true,
      metric: 'p95',
      op: '<=',
      value: 400,
      why: 'Pages must load quickly.',
    },
    {
      id: 'contract',
      label: `The partner is still served at least ${PARTNER_RPS_CONTRACT} requests/s`,
      hard: true,
      check: (c) => {
        const r = partnerServed(c);
        return { pass: r >= PARTNER_RPS_CONTRACT, detail: `${r.toFixed(0)} requests/s served` };
      },
      why: 'The partner has a contract. Protecting shoppers by cutting the partner off breaks it.',
    },
    {
      id: 'flood',
      label: 'The partner is limited to 40 requests/s before it reaches the API',
      hard: true,
      check: (c) => {
        const out = c.arch.edges.filter((e) => e.source === 'partner');
        if (!out.length) return { pass: true, detail: 'the partner has no route in' };
        const limits = out
          .map((e) => c.arch.nodes.find((n) => n.id === e.target))
          .map((n) => (n && n.kind === 'apigw' ? n.config.throttleRps : 0));
        const best = Math.max(0, ...limits);
        return { pass: best > 0 && best <= 40, detail: best > 0 ? `throttle ${best} requests/s` : 'no limit on the partner’s route' };
      },
      why: 'A limit that lets the flood through protects nobody.',
    },
    {
      id: 'headroom',
      label: 'The database runs below 85% utilisation',
      hard: true,
      check: (c) => {
        const u = c.snap.nodes.db?.util ?? 0;
        return { pass: u <= 0.85, detail: `database at ${(u * 100).toFixed(0)}%` };
      },
      why: 'Without headroom the next spike takes shoppers down again.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $2,200/mo',
      hard: true,
      metric: 'cost',
      op: '<=',
      value: 2200,
      why: 'More capacity for a runaway client is money wasted.',
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
    {
      id: 'alert',
      label: 'An alert would have caught this earlier',
      hard: false,
      check: (c) => {
        const ok = c.arch.nodes.some((n) => n.kind === 'alert-rule');
        return { pass: ok, detail: ok ? 'alert rule present' : 'no alert rule' };
      },
      why: 'A per-client rate alarm turns a 2 a.m. surprise into a page.',
    },
  ],
  weights: { reliability: 3, performance: 2, cost: 2, diagnosis: 3, correctness: 3, security: 1, rationale: 1 },
  hints: [
    {
      tier: 1,
      text: 'Open the Dependencies panel and compare the traffic each client sends. Who is using most of the API?',
    },
    {
      tier: 2,
      text: 'Shopper traffic alone fits. The partner is entitled to about 25 requests per second. What would let the API refuse only the excess, from only that client?',
    },
    {
      tier: 3,
      text: 'Give the partner its own entry with a throttle just above its contract (the usage-plan action, or an API Gateway between the partner and the load balancer). A global limit or more replicas will not protect shoppers properly.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Shared capacity needs per-client limits',
        body: 'When clients share a pool of capacity, one that misbehaves takes it from the rest. A limit per client (an API key, a tenant) contains the damage to the client that caused it.',
      },
      {
        title: 'A global limit punishes the innocent',
        body: 'Capping the whole API sheds traffic from everyone in proportion to how much they send. The runaway client keeps most of the capacity and shoppers lose most of theirs.',
      },
      {
        title: 'More capacity feeds the problem',
        body: 'Tripling the API makes room for the flood, costs money, and leaves the next runaway client as dangerous as this one.',
      },
      {
        title: 'Backpressure should be cheap and explicit',
        body: 'Reject at the edge, before the request touches the API or the database, with a 429 and a clear signal to slow down. A good client backs off with jitter; a broken one still only costs you the cheap rejection.',
      },
    ],
    rootCause:
      'A partner’s sync job retried in a tight loop and sent roughly twelve times its contracted rate. The partner and shoppers share one API and one database, so the partner’s excess consumed the capacity shoppers needed.',
    alternatives: [
      {
        name: 'Per-client quotas at the edge (usage plans or per-key limits)',
        when: 'Many clients share an API and each has an agreed rate: the default for public and partner APIs.',
        tradeoffs: 'Needs client identification (keys) and limits that match contracts; burst settings need care.',
      },
      {
        name: 'Separate capacity for partners',
        when: 'Partner traffic is large, predictable and contractually guaranteed.',
        tradeoffs: 'Costs more and can sit idle; the isolation is stronger than a quota.',
      },
      {
        name: 'Adaptive load shedding with priorities',
        when: 'Overload can come from anywhere and some traffic matters more (checkout over browsing).',
        tradeoffs: 'Needs request classification and tuning; harder to explain to clients.',
      },
      {
        name: 'WAF rate-based rules by client IP',
        when: 'Clients are identified by network address and there is no API key.',
        tradeoffs: 'Shared IPs (offices, NAT) can be blocked together; windows are minutes, not seconds.',
      },
    ],
    mistakes: [
      'Scaling the API to absorb a client that has no upper bound.',
      'Using one global limit and rejecting shoppers along with the offender.',
      'Blocking the partner outright and breaking the contract.',
      'Limiting after the request has already reached the API and the database.',
    ],
    aws: [
      'API Gateway usage plans and API keys set a steady rate and burst per client; over the limit the client receives 429 Too Many Requests',
      'AWS WAF rate-based rules count requests per IP over a window and block above a threshold',
      'The Amazon Builders’ Library covers load shedding and retries with jitter',
      'CloudWatch alarms can watch per-key request counts and 429 rates',
    ],
    experiments: [
      'Set the partner’s throttle to 10 and see which requirement fails.',
      'Set it to 200: how much of the flood still reaches the API?',
      'Apply the global limit first, then the usage plan, and compare shopper availability.',
    ],
  },
  seed: 112,
  guidance: ['dependencies', 'logs', 'metrics'],
  needsPostmortem: true,
  needsADR: false,
  baselineCost: 1900,
  decisions: (arch) => {
    if (arch.nodes.some((n) => n.kind === 'apigw' && n.config.throttleRps > 0))
      return [
        {
          tag: 'm12-noisy-neighbour:per-client-limits',
          label: 'You put a per-client limit at the edge.',
          carries: 'Later designs start with quotas per client instead of discovering the noisy one in production.',
        },
      ];
    return [];
  },
};
