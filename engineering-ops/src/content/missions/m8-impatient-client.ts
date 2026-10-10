import { E, N, wl } from '@/content/missions/helpers';
import type { Arch } from '@/engine/types';
import type { Mission } from '@/content/missions/types';

const EDGE = 'e-web-pricing';
const edgeOf = (arch: Arch) => arch.edges.find((e) => e.id === EDGE);
const patchEdge = (arch: Arch, c: Record<string, unknown>): Arch => ({
  ...arch,
  edges: arch.edges.map((e) => (e.id === EDGE ? { ...e, config: { ...e.config, ...c } } : e)),
});

export const m8: Mission = {
  id: 'm8-impatient-client',
  number: 8,
  title: 'The Impatient Client',
  tagline: 'A timeout that is shorter than the real answer time, and a client that never gives up.',
  difficulty: 'Beginner',
  kind: 'project',
  estMinutes: 15,
  prerequisites: [],
  skills: { se: 45, sa: 25, sre: 25 },
  learning: [
    'Timeouts as part of an API contract, set from measured latency',
    'How retries multiply load: the retry budget',
    'When a circuit breaker helps and when it only hides a problem',
    'Why “add more replicas” does not fix a slow dependency',
  ],
  story:
    'The checkout web tier calls a pricing service to quote taxes. Pricing calls a third-party tax provider that takes about 240 ms to answer. Whoever wrote the client picked a 250 ms timeout “to keep checkout snappy” and three retries “to be safe”. Once the provider is a little slower than usual, calls start timing out, retries pile on top of live requests, and the provider rate-limits you. The team’s instinct is to add pricing replicas. You own the client contract.',
  business: {
    context: 'Brightcart checkout: 60 requests/second, one third-party dependency with a rate limit you do not control.',
    impact: 'Quotes fail intermittently; abandoned carts are up and the provider has emailed about “abusive traffic”.',
  },
  constraints: {
    budget: 480,
    availability: 99,
    p95: 700,
    notes: [
      'Budget: $480 / month (simulated estimate).',
      'The tax provider allows 110 requests per second. You cannot change that.',
      'Checkout may wait up to about a second for a quote; a failed quote is better than a retry storm.',
      'Fix the contract between the services; do not paper over it with capacity.',
    ],
  },
  workload: wl({ baseRps: 60, profile: [{ t: 0, mult: 1 }], readRatio: 0.9, slowQueryShare: 0, cacheableShare: 0, payloadKB: 3 }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('alb', 'lb', 220, 170, { costTag: 'team=checkout' }, 'Public ALB'),
      N('ecs', 'web', 440, 170, { replicas: 2, instanceSize: 'small', dbPoolSize: 5, costTag: 'team=checkout' }, 'checkout-web', [
        {
          id: 'client-timeout',
          label: 'Quote client gives up early and retries',
          log: 'POST /quote to pricing timed out after 250ms; retrying (attempt 3 of 4)',
        },
      ]),
      N('ecs', 'pricing', 680, 170, { replicas: 2, instanceSize: 'small', dbPoolSize: 5, costTag: 'team=checkout' }, 'pricing-service'),
      N('external-api', 'tax', 920, 170, { rpsLimit: 110, latencyMs: 240 }, 'Tax provider'),
      N('cloudwatch', 'cw', 440, 340, {}),
    ],
    edges: [
      E('users', 'lb'),
      E('lb', 'web'),
      E('web', 'pricing', { weight: 1, timeoutMs: 250, retries: 3, circuitBreaker: false }),
      E('pricing', 'tax', { weight: 1, timeoutMs: 3000, retries: 0 }),
    ],
  },
  components: [
    'users',
    'alb',
    'ecs',
    'ec2',
    'backend-service',
    'external-api',
    'cloudwatch',
    'tracing',
    'retry-policy',
    'circuit-breaker',
    'rate-limiter',
    'autoscaling',
    'cache',
    'elasticache',
  ],
  startMinute: 10,
  verifyMinutes: 6,
  verifyAt: 16,
  deployments: [
    {
      minute: -4320,
      kind: 'deploy',
      title: 'checkout-web v9.3 — quote client',
      detail: 'Adds the pricing call. Timeout 250 ms, 3 retries, no breaker. Tested against a mock that answers in 10 ms.',
      by: 'checkout-squad',
    },
    {
      minute: -720,
      kind: 'incident',
      title: 'Tax provider email: rate limit warning',
      detail: 'Your account exceeded 110 requests/second for 6 minutes.',
      by: 'tax-provider',
    },
  ],
  notes: [
    {
      panel: 'dependencies',
      title: 'Read the connections',
      body: 'Compare the traffic leaving each service with the traffic arriving at the next one. If a downstream sees more calls than its caller received, something is repeating.',
    },
    {
      panel: 'traces',
      title: 'How long does a quote really take?',
      body: 'Open a trace and add up the spans. Then compare that total with the timeout configured on the caller.',
    },
  ],
  firstMove:
    'Fix the contract between the two services: run the “Set the quote timeout” action, then open Plan and press Deploy. Watch what happens to the provider’s request rate.',
  rootCauses: [
    {
      id: 'retry-storm',
      label: 'The caller’s timeout is shorter than the real response time, so every call times out and is retried several times',
      correct: true,
      evidencePanels: ['dependencies', 'traces', 'logs'],
      why: 'The provider sees several times the quote rate, the client logs timeouts on healthy responses, and traces total longer than 250 ms.',
    },
    {
      id: 'tax-down',
      label: 'The tax provider is down',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'It answers, just not within 250 ms. It only rejects requests once the retries push it over its rate limit.',
    },
    {
      id: 'pricing-undersized',
      label: 'The pricing service does not have enough replicas',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Pricing is not CPU bound. More replicas make more concurrent calls to the same rate-limited provider.',
    },
    {
      id: 'network',
      label: 'A network fault between the services',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'Calls arrive and are answered; no connection is blocked.',
    },
  ],
  actions: [
    {
      id: 'timeout',
      label: 'Set the quote timeout from measured latency (1.5 s)',
      description: 'Use the observed p99 plus headroom instead of a guess.',
      minutes: 5,
      available: (arch) => (edgeOf(arch)?.config.timeoutMs ?? 0) < 1000,
      apply: (arch) => ({ arch: patchEdge(arch, { timeoutMs: 1500 }), log: 'Deployed checkout-web v9.4: quote timeout is now 1500 ms.' }),
    },
    {
      id: 'retries',
      label: 'Allow at most one retry on the quote call',
      description: 'A retry budget: at most one extra attempt, so load can never quadruple.',
      minutes: 5,
      available: (arch) => (edgeOf(arch)?.config.retries ?? 0) > 1,
      apply: (arch) => ({ arch: patchEdge(arch, { retries: 1 }), log: 'Deployed checkout-web v9.4: quote retries capped at 1.' }),
    },
    {
      id: 'breaker',
      label: 'Add a circuit breaker on the quote call',
      description: 'Stop calling a dependency that is failing, and fail fast instead.',
      minutes: 5,
      available: (arch) => !edgeOf(arch)?.config.circuitBreaker,
      apply: (arch) => ({
        arch: patchEdge(arch, { circuitBreaker: true }),
        log: 'Deployed checkout-web v9.4: circuit breaker enabled on the quote call.',
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
      why: 'Customers must get a quote.',
    },
    { id: 'p95', label: 'p95 latency ≤ 700 ms', hard: true, metric: 'p95', op: '<=', value: 700, why: 'Checkout must stay snappy.' },
    { id: 'budget', label: 'Cost ≤ $480/mo', hard: true, metric: 'cost', op: '<=', value: 480, why: 'Capacity is not the fix.' },
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
      id: 'amp',
      label: 'No connection multiplies load by more than 1.3×',
      hard: true,
      check: (c) => {
        const worst = Math.max(1, ...Object.values(c.snap.edges).map((e) => e.amplification));
        return { pass: worst <= 1.3, detail: `worst amplification ×${worst.toFixed(2)}` };
      },
      why: 'Retries are load. A retry budget keeps a slow dependency from becoming an outage.',
    },
    {
      id: 'retry-budget',
      label: 'At most one retry on the quote call',
      hard: false,
      check: (c) => {
        const r = edgeOf(c.arch)?.config.retries ?? 0;
        return { pass: r <= 1, detail: `${r} retries configured` };
      },
      why: 'Retries multiply load; keep a deliberate, small budget.',
    },
    {
      id: 'timeout-sane',
      label: 'Timeout is longer than the dependency’s real latency',
      hard: false,
      check: (c) => {
        const t = edgeOf(c.arch)?.config.timeoutMs ?? 0;
        return { pass: t >= 800, detail: `timeout ${t} ms vs about 275 ms typical, up to 600 ms at p99` };
      },
      why: 'A timeout is a promise about latency. Set it from measurements, not hope.',
    },
    {
      id: 'breaker',
      label: 'The quote call has a circuit breaker',
      hard: false,
      check: (c) => ({
        pass: !!edgeOf(c.arch)?.config.circuitBreaker,
        detail: edgeOf(c.arch)?.config.circuitBreaker ? 'breaker enabled' : 'no breaker',
      }),
      why: 'When the provider really is down, failing fast protects both services.',
    },
  ],
  weights: { reliability: 3, performance: 2, cost: 2, diagnosis: 3, correctness: 3, security: 1, maintainability: 1 },
  hints: [
    {
      tier: 1,
      text: 'Open the Dependencies panel. How many calls does the tax provider receive compared with the number of quotes customers ask for?',
    },
    {
      tier: 2,
      text: 'Add up the latency along the quote path in a trace, then compare it with the timeout configured on the checkout-web → pricing connection.',
    },
    {
      tier: 3,
      text: 'Select the connection between checkout-web and pricing: raise the timeout above the real latency, cap the retries at one, and consider a circuit breaker. Adding replicas will not help.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'A timeout is a contract',
        body: 'It states how long the caller is willing to wait. Set it from measured latency (p99 plus headroom), and set the callee’s own deadline shorter than the caller’s, never longer.',
      },
      {
        title: 'Retries are load',
        body: 'Each retry is a new request. With a timeout shorter than the real latency every attempt fails, so three retries make four times the traffic, exactly when the dependency is struggling.',
      },
      {
        title: 'Retry budgets and breakers',
        body: 'Cap retries, back off, retry only idempotent calls, and use a circuit breaker so a failing dependency gets room to recover instead of being hammered.',
      },
    ],
    rootCause:
      'The client gave up after 250 ms on answers that take about 275 ms, then retried three times. The provider saw four times the real traffic, hit its rate limit and began rejecting good requests.',
    alternatives: [
      {
        name: 'Longer timeout and one retry',
        when: 'The dependency is reliable but not instantaneous.',
        tradeoffs: 'Requests can wait longer when the provider has a bad moment.',
      },
      {
        name: 'Circuit breaker with a fallback quote',
        when: 'A stale or estimated answer is acceptable.',
        tradeoffs: 'Extra logic and a stale-data risk.',
      },
      {
        name: 'Cache or batch provider lookups',
        when: 'The same inputs repeat often and slightly stale answers are acceptable.',
        tradeoffs: 'Adds freshness rules; not available for every call.',
      },
    ],
    mistakes: [
      'Adding pricing replicas to “absorb” timeouts: more concurrent calls hit the same rate limit.',
      'Raising the provider’s expected limit: you do not control it.',
      'Retrying without a budget or backoff.',
    ],
    aws: [
      'AWS SDK retry modes (standard and adaptive) with a maximum attempts setting',
      'A proxy or service mesh such as Envoy (via Istio or ECS Service Connect) for timeouts, retries and outlier detection. AWS App Mesh itself was discontinued on 30 September 2026.',
      'API Gateway integration timeouts',
    ],
    experiments: [
      'Raise the timeout but keep three retries: what happens when the provider becomes slower?',
      'Add replicas to pricing and watch the provider’s request rate.',
    ],
  },
  seed: 108,
  guidance: ['dependencies', 'traces', 'logs'],
  needsPostmortem: false,
  needsADR: false,
  baselineCost: 300,
  decisions: (arch) => {
    const e = edgeOf(arch);
    const out = [];
    if (e && e.config.retries <= 1 && e.config.timeoutMs >= 800) {
      out.push({
        tag: 'm8-impatient-client:retry-budget',
        label: 'You gave the quote call a sane timeout and a retry budget.',
        carries: 'Service-to-service calls start with measured timeouts and small retry budgets.',
      });
    } else {
      out.push({
        tag: 'm8-impatient-client:left-retries-loose',
        shortcut: true,
        label: 'You left the quote call retrying aggressively.',
        carries: 'Call contracts across the platform are still loose; a slow dependency can start a retry storm again.',
      });
    }
    return out;
  },
};
