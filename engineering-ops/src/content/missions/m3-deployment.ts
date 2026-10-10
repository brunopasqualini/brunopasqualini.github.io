import { analyzePipeline } from '@/engine/analysis';
import { addFault, clearFaults, E, N, patchNode, setFaults, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

const LEAK = {
  id: 'leak',
  label: 'Release v2.4.0 defect',
  errorRate: 0.22,
  latencyMult: 1.5,
  memAdd: 0.3,
  log: 'ConnectionPoolTimeoutException: unable to acquire DB connection within 30000ms — pool exhausted (release=v2.4.0 req={id})',
};
const PROMO = {
  id: 'promo-bug',
  label: 'Release v2.5.0 defect',
  errorRate: 0.3,
  log: "TypeError: Cannot read properties of undefined (reading 'discount') at applyPromo (checkout.js:212) release=v2.5.0 req={id}",
};

export const m3: Mission = {
  id: 'm3-deployment',
  number: 3,
  title: 'The Unreliable Deployment',
  tagline: 'A fresh release is throwing intermittent errors in production.',
  difficulty: 'Intermediate',
  kind: 'incident',
  estMinutes: 30,
  prerequisites: ['m1-monolith'],
  skills: { devops: 60, sre: 35, se: 30, plat: 15 },
  learning: [
    'Release strategies: all-at-once, canary, blue/green',
    'Automated testing that catches real regressions',
    'Health checks and automatic rollback',
    'Feature flags as a kill switch',
    'Making rollback boring',
  ],
  story:
    'Twelve minutes ago the pipeline deployed checkout v2.4.0 to everyone. Since then roughly one request in five fails — but not all of them, so the health checks stay green and nobody has been paged. Support is noticing. Your pipeline ran unit tests only; the integration suite was disabled last month as “flaky”. Restore service, then make sure the next release (v2.5.0, a new promo flow) cannot hurt customers the same way.',
  business: {
    context: 'ShopStream checkout. Deploys several times a day through an all-at-once pipeline.',
    impact: '~22% of checkouts failing intermittently; revenue impact grows every minute.',
  },
  constraints: {
    budget: 650,
    availability: 99,
    p95: 700,
    notes: [
      'Restore ≥ 99% availability.',
      'Prevent recurrence: tests that exercise real dependencies, a gradual rollout with automatic abort, and a rollback path.',
      'Ship v2.5.0 without a customer-visible incident.',
      'Budget $650 / month (simulated estimate).',
      'Write a postmortem.',
    ],
  },
  workload: wl({ baseRps: 40, profile: [{ t: 0, mult: 1 }], readRatio: 0.7, slowQueryShare: 0, payloadKB: 6 }),
  initial: {
    nodes: [
      N('users', 'users', 20, 150),
      N('alb', 'lb', 210, 150, { costTag: 'team=checkout' }, 'Public ALB'),
      N('ecs', 'api', 420, 150, { replicas: 4, instanceSize: 'small', dbPoolSize: 10, costTag: 'team=checkout' }, 'checkout-api'),
      N('rds', 'db', 650, 150, { size: 'small', storageGB: 100, indexed: true, multiAZ: true, costTag: 'team=checkout' }, 'orders-db'),
      N('cloudwatch', 'cw', 420, 330, {}),
      N('tracing', 'trace', 650, 330, {}),
      N('source-repo', 'repo', 20, 440, {}),
      N('ci-pipeline', 'ci', 200, 440, {}),
      N('test-suite', 'tests', 380, 440, { unitCoverage: 55, integrationCoverage: 0, e2e: false }),
      N('cd-pipeline', 'cd', 560, 440, { strategy: 'all-at-once', autoRollback: false }),
    ],
    edges: [
      E('users', 'lb'),
      E('lb', 'api'),
      E('api', 'db', { weight: 2 }),
      E('repo', 'ci'),
      E('ci', 'tests'),
      E('tests', 'cd'),
      E('cd', 'api'),
    ],
  },
  components: [
    'users',
    'alb',
    'ecs',
    'rds',
    'cloudwatch',
    'tracing',
    'alert-rule',
    'dashboard',
    'synthetic-monitoring',
    'health-check',
    'source-repo',
    'ci-pipeline',
    'test-suite',
    'cd-pipeline',
    'canary',
    'blue-green',
    'rollback',
    'feature-flag',
    'approval-gate',
    'container-image',
    'container-registry',
    'artifact-repo',
    'deploy-env',
    'central-logging',
    'metrics-collector',
    'slo',
  ],
  startMinute: 18,
  verifyMinutes: 8,
  verifyAt: 26,
  deployments: [
    { minute: -1440, kind: 'deploy', title: 'v2.3.9 — stable', detail: 'All-at-once rollout; no incidents for 9 days.', by: 'ci-bot' },
    {
      minute: -43200,
      kind: 'config',
      title: 'Integration test job disabled',
      detail: '“checkout_integration” marked flaky; excluded from required checks.',
      by: 'orders-team',
    },
    {
      minute: 6,
      kind: 'deploy',
      title: 'v2.4.0 — order-save refactor',
      detail: 'Deployed to 100% of instances. Unit tests: 412 passed. Integration: skipped. No canary.',
      by: 'ci-bot',
    },
  ],
  notes: [
    {
      panel: 'notes',
      title: 'Release checklist (current)',
      body: '1) Merge to main. 2) CI runs unit tests. 3) CD deploys to every instance at once. 4) Hope.',
    },
    {
      panel: 'notes',
      title: 'Rollback runbook',
      body: 'Manual: re-run the pipeline pinned to the previous tag (≈ 12 minutes). There is no automated rollback.',
    },
  ],
  rootCauses: [
    {
      id: 'bad-release',
      label: 'The latest release (v2.4.0) introduced a defect',
      correct: true,
      evidencePanels: ['deployments', 'logs', 'metrics'],
      why: 'The error rate stepped up at the exact minute v2.4.0 reached production; logs from checkout-api show connection-pool errors tied to that release.',
    },
    {
      id: 'db-overload',
      label: 'The database is overloaded',
      correct: false,
      evidencePanels: ['database'],
      why: 'Database CPU and connection counts are normal; the pool exhaustion is on the client side.',
    },
    {
      id: 'infra',
      label: 'An infrastructure or AZ failure',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'All instances and zones are healthy; errors began with the deploy, not with an infrastructure event.',
    },
    {
      id: 'traffic',
      label: 'Unexpected traffic growth',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Request rate is flat across the release, so more load cannot explain the errors that started at the deploy.',
    },
  ],
  actions: [
    {
      id: 'rollback',
      label: 'Roll back to the previous release',
      description: 'Redeploy the last known-good version. Duration depends on your rollback mechanism.',
      minutes: 12,
      available: (a) => a.nodes.some((n) => n.faults?.some((f) => f.id === 'leak' || f.id === 'promo-bug')),
      apply: (a) => {
        const p = analyzePipeline(a);
        const mins = p.strategy === 'blue-green' ? 1 : p.rollback ? 3 : 12;
        return {
          arch: clearFaults(a, ['leak', 'promo-bug']),
          log: `Rolled back to the previous release (${mins} min).`,
          flags: { rolledBack: true },
          minutes: mins,
        };
      },
    },
    {
      id: 'restart',
      label: 'Restart all instances',
      description: 'Clears pools and memory. Does it address the cause?',
      minutes: 2,
      available: (a) => a.nodes.some((n) => n.faults?.some((f) => f.id === 'leak')),
      apply: (a, _f, minute) => ({
        arch: {
          ...a,
          nodes: a.nodes.map((n) =>
            n.faults?.some((f) => f.id === 'leak')
              ? { ...n, faults: n.faults!.map((f) => (f.id === 'leak' ? { ...f, errorRate: 0.04 } : f)) }
              : n,
          ),
        },
        log: 'Instances restarted. Error rate dropped… for now.',
        flags: { restartAt: minute },
      }),
    },
    {
      id: 'ship-v25',
      label: 'Ship v2.5.0 (fix + new promo flow)',
      description: 'Run the release through YOUR pipeline. What happens depends on its tests and rollout strategy.',
      minutes: 2,
      available: (a, f) => !!f.rolledBack && !a.nodes.some((n) => n.faults?.some((x) => x.id === 'leak')),
      apply: (a, flags) => {
        const p = analyzePipeline(a);
        const flagNode = a.nodes.some((n) => n.kind === 'feature-flag' && n.config.killSwitch);
        if (flags.promoFixed)
          return {
            arch: a,
            log: 'v2.5.1 shipped cleanly: promo flow fixed, integration tests green.',
            flags: { shipOutcome: 'clean', shipped: true },
          };
        if (p.tests && p.intCov >= 40) {
          return {
            arch: a,
            log: 'PIPELINE FAILED at integration stage: checkout_promo_code_test — TypeError reading discount. Release blocked before reaching production. The team fixed the bug (v2.5.1); ship again to release.',
            flags: { shipOutcome: 'blocked', promoFixed: true },
          };
        }
        if (p.strategy === 'canary' && (a.nodes.find((n) => n.kind === 'canary')?.config.autoAbort ?? p.autoRollback)) {
          return {
            arch: a,
            log: 'Canary at 5%: error rate exceeded threshold within 2 minutes; rollout aborted automatically. <1% of customers saw errors. Bug fixed as v2.5.1.',
            flags: { shipOutcome: 'caught', promoFixed: true, shipped: true },
          };
        }
        if (p.strategy === 'rolling' && p.autoRollback) {
          return {
            arch: a,
            log: 'Rolling deploy halted at 25% when health checks failed; automatic rollback. A quarter of requests failed briefly. Bug fixed as v2.5.1.',
            flags: { shipOutcome: 'caught', promoFixed: true, shipped: true },
          };
        }
        const exposure = p.strategy === 'canary' ? 0.05 : 1;
        const fault = { ...PROMO, errorRate: PROMO.errorRate * exposure };
        return {
          arch: addFault(a, 'api', fault),
          log:
            p.strategy === 'canary'
              ? 'v2.5.0 canary is at 5% but nothing aborts it automatically: a small, silent error rate persists until a human notices.'
              : `v2.5.0 reached ${Math.round(exposure * 100)}% of customers. Promo checkouts are failing.${flagNode ? ' The feature is behind a flag — a kill switch can disable it instantly.' : ''}`,
          flags: { shipOutcome: 'incident', shipped: true, flagKill: flagNode },
        };
      },
    },
    {
      id: 'kill-flag',
      label: 'Disable the new-promo feature flag',
      description: 'Instantly turns the new checkout flow off — no redeploy.',
      minutes: 1,
      available: (a, f) => !!f.flagKill && a.nodes.some((n) => n.faults?.some((x) => x.id === 'promo-bug')),
      apply: (a) => ({
        arch: clearFaults(a, ['promo-bug']),
        log: 'Feature flag disabled; promo flow reverted to the old code path.',
        flags: { flagKill: false },
      }),
    },
  ],
  onTick: (arch, minute, flags) => {
    if (minute >= 6 && !flags.leakInjected) {
      flags.leakInjected = true;
      return addFault(arch, 'api', LEAK);
    }
    if (flags.restartAt != null && arch.nodes.some((n) => n.faults?.some((f) => f.id === 'leak'))) {
      const rate = Math.min(0.22, 0.04 + 0.03 * (minute - flags.restartAt));
      return {
        ...arch,
        nodes: arch.nodes.map((n) =>
          n.faults?.some((f) => f.id === 'leak')
            ? { ...n, faults: n.faults!.map((f) => (f.id === 'leak' ? { ...f, errorRate: rate } : f)) }
            : n,
        ),
      };
    }
  },
  requirements: [
    {
      id: 'avail',
      label: 'Availability ≥ 99% (service restored)',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99,
      why: 'The immediate objective: restore service.',
    },
    {
      id: 'integration',
      label: 'Pipeline runs integration tests (coverage ≥ 40%)',
      hard: true,
      check: (c) => {
        const p = analyzePipeline(c.arch);
        return { pass: p.tests && p.intCov >= 40, detail: `Integration coverage ${p.intCov}%` };
      },
      why: 'Unit tests did not catch a regression that appears only with real dependencies.',
    },
    {
      id: 'rollout',
      label: 'Gradual rollout with automatic abort (canary / blue-green / rolling + auto-rollback)',
      hard: true,
      check: (c) => {
        const p = analyzePipeline(c.arch);
        return { pass: p.safeRollout, detail: `Strategy: ${p.strategy}${p.autoRollback ? ' + auto rollback' : ''}` };
      },
      why: 'All-at-once exposes every customer to every bug. Limit blast radius and stop automatically.',
    },
    {
      id: 'ship',
      label: 'Ship v2.5.0 with no customer-visible incident',
      hard: true,
      check: (c) => ({
        pass: c.flags.shipOutcome === 'clean' || c.flags.shipOutcome === 'caught' || (c.flags.shipOutcome === 'blocked' && c.flags.shipped),
        detail: c.flags.shipOutcome ? `Last ship outcome: ${c.flags.shipOutcome}` : 'You have not shipped v2.5.0 yet',
      }),
      why: 'Prove the new safeguards by shipping through them.',
    },
    {
      id: 'rollback-path',
      label: 'A fast rollback path exists',
      hard: false,
      check: (c) => {
        const p = analyzePipeline(c.arch);
        return {
          pass: p.rollback || p.strategy === 'blue-green',
          detail: p.rollback ? 'Rollback mechanism present' : 'No rollback mechanism',
        };
      },
      why: 'Rollback should be a button, not a project.',
    },
    {
      id: 'flag',
      label: 'Feature flag with kill switch',
      hard: false,
      check: (c) => ({ pass: analyzePipeline(c.arch).featureFlag, detail: 'Decouple deploy from release' }),
      why: 'A kill switch limits damage without a redeploy.',
    },
    {
      id: 'alert',
      label: 'Detection: MTTD ≤ 5 minutes',
      hard: false,
      metric: 'mttd',
      op: '<=',
      value: 5,
      why: 'Green health checks hid a 22% error rate. Alert on symptoms.',
    },
    {
      id: 'budget',
      label: 'Cost ≤ $650/mo',
      hard: false,
      metric: 'cost',
      op: '<=',
      value: 650,
      why: 'Safety should not need a blank cheque.',
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
      why: 'Incidents only pay off if you learn from them.',
    },
  ],
  weights: { reliability: 2, diagnosis: 3, correctness: 3, devProductivity: 1, opSimplicity: 1, security: 1, rationale: 2, cost: 1 },
  failure: {
    maxFailedRequests: 70000,
    text: 'Customer impact budget exceeded: too many failed checkouts while the bad release stayed live.',
  },
  hints: [
    {
      tier: 1,
      text: 'When did the error rate change? Overlay that moment with Recent deployments. Do the health checks agree with what customers see?',
    },
    {
      tier: 2,
      text: 'Look at the application logs for checkout-api: which error repeats, and which release does it name? Database health tells you whether the database is the culprit.',
    },
    {
      tier: 3,
      text: 'Roll back first (customers are hurting). Then fix the pipeline: enable integration tests (≥ 40%), choose canary with auto-abort or blue/green, add a rollback mechanism and a feature flag, then ship v2.5.0 and watch the outcome.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Blast radius',
        body: 'Every release is an experiment. Progressive delivery (canary, blue/green, rolling with gates) limits how many customers an unproven change can hurt and gives automation time to notice.',
      },
      {
        title: 'Tests that match the failure',
        body: 'Unit tests verify logic in isolation. The pool-leak regression only appears when real dependencies are exercised, so only integration tests would have caught it. “Flaky” tests deserve fixing, not disabling.',
      },
      {
        title: 'Symptoms vs shallow health checks',
        body: 'A health check that only asks “is the process up?” stays green while 22% of requests fail. Alert on customer-visible symptoms (error rate, latency).',
      },
      {
        title: 'Deploy ≠ release',
        body: 'Feature flags decouple shipping code from exposing behaviour, giving you a kill switch that is faster than any rollback.',
      },
    ],
    rootCause:
      'v2.4.0 leaked database connections on a code path the unit tests do not exercise. All-at-once deployment exposed every customer instantly, and shallow health checks kept the system “green”.',
    alternatives: [
      {
        name: 'Canary with automatic abort',
        when: 'High traffic, mature metrics: the strongest default.',
        tradeoffs: 'Needs good SLIs and enough traffic at 5% to be statistically meaningful.',
      },
      {
        name: 'Blue/green',
        when: 'You need instant, whole-fleet switch-back and have the budget for double capacity.',
        tradeoffs: 'Full exposure at cut-over; shared databases are not rolled back.',
      },
      {
        name: 'Feature flags + dark launch',
        when: 'Risky behaviour changes where you want to ramp exposure by customer cohort.',
        tradeoffs: 'Flag debt; more code paths to test.',
      },
      {
        name: 'Manual approval gates',
        when: 'Regulated changes that require a named approver before release.',
        tradeoffs: 'Adds latency; does not catch bugs — automate checks first.',
      },
    ],
    mistakes: [
      'Restarting instances — it masks a leak and the errors return as pools refill.',
      'Disabling “flaky” tests instead of fixing them.',
      'Canaries without automatic abort criteria.',
      'Rolling back without writing down what the pipeline failed to catch.',
    ],
    aws: [
      'CodeDeploy canary/linear/blue-green configurations',
      'ALB weighted target groups and health checks',
      'CloudWatch alarms driving automatic rollback',
      'AWS AppConfig feature flags',
    ],
    experiments: [
      'Use all-at-once with 80% integration coverage and watch the pipeline block v2.5.0.',
      'Try a canary without auto-abort and watch the silent 1.5% error rate.',
      'Add a health check with a very short timeout to the ALB and look at the side effect.',
    ],
  },
  seed: 303,
  guidance: ['metrics', 'deployments', 'logs'],
  needsPostmortem: true,
  needsADR: false,
};
void patchNode;
void setFaults;
