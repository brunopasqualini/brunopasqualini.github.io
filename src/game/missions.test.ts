import { describe, expect, it } from 'vitest';
import { makeEdge, makeNode } from '@/engine/arch';
import type { Arch } from '@/engine/types';
import { advance, applyAction, createSession, deployDraft, replay, verify, type Session } from '@/game/session';
import type { ADR, Postmortem } from '@/content/missions/types';

const ADR_OK: ADR = {
  id: 'a1',
  title: 'Decision',
  minute: 0,
  context: 'Fourteen engineers in three squads share one deployable and release rarely because changes collide.',
  problem: 'Cross-module regressions and slow releases are hurting delivery; we need independent change with a small platform team.',
  options: 'Modular monolith with enforced boundaries; extract one service; full microservices. Alternative: do nothing.',
  decision: 'Choose the option that gives clear boundaries with the least operational complexity and cost.',
  pros: 'Lower coupling because modules only use public interfaces, faster tests, no new network failure modes.',
  cons: 'One deployable remains a shared failure domain and scaling is all-or-nothing; the trade-off is accepted.',
  implications: 'Security unchanged; reliability stable; cost flat; operational complexity stays low; we will monitor and revisit.',
};
const PM_OK: Postmortem = {
  what: 'A defect shipped through the pipeline and exposed all customers because tests and rollout were inadequate.',
  impact: 'About one in five checkouts failed for many minutes; revenue and trust were affected.',
  evidence: 'The error rate stepped at the deploy time, logs named the release, and the database metrics were normal.',
  restored: 'We rolled back to the previous release; then added integration tests, canary with automatic abort and monitoring.',
  worsened: 'Restarting instances masked the leak and wasted time; scaling is not a fix for a code defect.',
  prevent:
    'Integration test coverage, canary rollout with auto rollback, a feature flag kill switch and an error-rate alert to reduce detection time.',
};

const add = (a: Arch, ...nodes: ReturnType<typeof makeNode>[]) => {
  a.nodes.push(...nodes);
};
const connect = (a: Arch, s: string, t: string, cfg = {}) => {
  a.edges.push(makeEdge(s, t, cfg));
};
const cfg = (a: Arch, id: string, c: Record<string, any>) => {
  Object.assign(a.nodes.find((n) => n.id === id)!.config, c);
};
const N = (kind: string, id: string, config: Record<string, any> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });
const ship = (s: Session, minutes = 4) => {
  const r = deployDraft(s);
  expect(r.blocked ?? []).toEqual([]);
  advance(s, minutes);
};

describe('Mission 1 — The Growing Monolith', () => {
  const pipeline = (a: Arch, target = 'mono') => {
    add(a, N('source-repo', 'repo'), N('ci-pipeline', 'ci'), N('test-suite', 'ts', { unitCoverage: 70, integrationCoverage: 40 }));
    connect(a, 'repo', 'ci');
    connect(a, 'ci', 'ts');
    connect(a, 'ts', target);
  };
  it('modular monolith + CI passes', () => {
    const s = createSession('m1-monolith', 'beginner');
    cfg(s.draft, 'mono', { moduleBoundaries: 'enforced' });
    pipeline(s.draft);
    ship(s);
    s.adrs = [ADR_OK];
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
    expect(v.outcome.overall).toBeGreaterThan(70);
  });
  it('extracting one service with its own database also passes (alternative valid solution)', () => {
    const s = createSession('m1-monolith', 'beginner');
    cfg(s.draft, 'mono', { moduleBoundaries: 'enforced', modules: 4 });
    add(
      s.draft,
      N('microservice', 'billing', { domain: 'billing', ownsData: true, replicas: 2 }),
      N('relational-db', 'billing-db', { size: 'small', storageGB: 50, multiAZ: false, costTag: 'team=payments' }),
    );
    s.draft.nodes.find((n) => n.id === 'billing')!.label = 'Billing service';
    connect(s.draft, 'mono', 'billing');
    connect(s.draft, 'billing', 'billing-db', { weight: 2 });
    pipeline(s.draft);
    add(s.draft, N('tracing', 'tr'), N('cd-pipeline', 'cd', { strategy: 'rolling', autoRollback: true }));
    connect(s.draft, 'ts', 'cd');
    connect(s.draft, 'cd', 'billing');
    ship(s);
    s.adrs = [ADR_OK];
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });
  it('six microservices sharing one database fails on complexity, coupling and cost', () => {
    const s = createSession('m1-monolith', 'beginner');
    const kinds = ['billing', 'catalogue', 'orders', 'accounts', 'notifications', 'search'];
    for (const k of kinds) {
      add(s.draft, N('microservice', k, { domain: k, ownsData: false, replicas: 2 }));
      connect(s.draft, 'mono', k);
      connect(s.draft, k, 'db', { weight: 2 });
    }
    ship(s);
    s.adrs = [ADR_OK];
    const v = verify(s, true);
    const failed = v.outcome.reqs.filter((r) => !r.pass).map((r) => r.id);
    expect(v.outcome.passed).toBe(false);
    expect(failed).toEqual(expect.arrayContaining(['ops']));
    expect(v.report.design.sharedDbs.length).toBeGreaterThan(0);
  });
});

describe('Mission 2 — The Database Meltdown', () => {
  const finish = (s: Session) => {
    s.postmortem = PM_OK;
    s.chosenCauses = ['unindexed'];
    s.panelsSeen = ['database', 'metrics', 'deployments'];
    return verify(s, true);
  };
  it('starts in a meltdown', () => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    expect(s.history[s.history.length - 1].system.successRate).toBeLessThan(0.5);
  });
  it('index + connection pooler restores service within budget', () => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    expect(applyAction(s, 'add-index').ok).toBe(true);
    cfg(s.draft, 'db', { connectionPooler: true });
    ship(s);
    const v = finish(s);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });
  it('doubling application replicas makes things worse (connection exhaustion)', () => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    const before = s.history[s.history.length - 1].system.successRate;
    applyAction(s, 'scale-app');
    advance(s, 3);
    const after = s.history[s.history.length - 1];
    expect(after.nodes.db.reasons.some((r) => r.code === 'connections')).toBe(true);
    expect(after.system.successRate).toBeLessThanOrEqual(before + 0.02);
    expect(finish(s).outcome.passed).toBe(false);
  });
  it('scaling the database to large plus a pooler is an acceptable but costlier alternative', () => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    cfg(s.draft, 'db', { size: 'large', connectionPooler: true });
    ship(s);
    const v = finish(s);
    const idx = createSession('m2-db-meltdown', 'intermediate');
    applyAction(idx, 'add-index');
    cfg(idx.draft, 'db', { connectionPooler: true });
    ship(idx);
    const vi = finish(idx);
    expect(v.report.metrics.cost).toBeGreaterThan(vi.report.metrics.cost);
    expect(v.outcome.reqs.find((r) => r.id === 'avail')!.pass).toBe(true);
  });
  it('a long-TTL cache without invalidation introduces a freshness violation', () => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    applyAction(s, 'add-index');
    add(s.draft, N('elasticache', 'ec', { ttlSeconds: 600, nodes: 2 }));
    connect(s.draft, 'api', 'ec');
    cfg(s.draft, 'db', { connectionPooler: true });
    ship(s);
    const v = finish(s);
    expect(v.report.metrics.staleRisk).toBe(1);
    expect(v.outcome.reqs.find((r) => r.id === 'fresh')!.pass).toBe(false);
  });
});

describe('Mission 3 — The Unreliable Deployment', () => {
  const safeDraft = (s: Session) => {
    cfg(s.draft, 'tests', { integrationCoverage: 60, unitCoverage: 70 });
    cfg(s.draft, 'cd', { strategy: 'canary', autoRollback: true });
    add(
      s.draft,
      N('canary', 'can', { initialPercent: 5, autoAbort: true }),
      N('rollback', 'rb', { automated: true, maxMinutes: 3 }),
      N('feature-flag', 'ff', { killSwitch: true }),
      N('alert-rule', 'al', { metric: 'errorRate', threshold: 2, forMinutes: 2, actionable: true }),
    );
    connect(s.draft, 'can', 'api');
    connect(s.draft, 'rb', 'api');
    connect(s.draft, 'ff', 'api');
    connect(s.draft, 'al', 'lb');
  };
  it('starts with ~22% errors after the release', () => {
    const s = createSession('m3-deployment', 'intermediate');
    expect(s.history[s.history.length - 1].system.errorRate).toBeGreaterThan(0.2);
    expect(s.history[3].system.errorRate).toBeLessThan(0.01);
  });
  it('restarting only masks the problem: errors return', () => {
    const s = createSession('m3-deployment', 'intermediate');
    applyAction(s, 'restart');
    const dipped = s.history[s.history.length - 1].system.errorRate;
    advance(s, 8);
    expect(dipped).toBeLessThan(0.1);
    expect(s.history[s.history.length - 1].system.errorRate).toBeGreaterThan(0.15);
  });
  it('rollback + safer pipeline + shipping v2.5.0 passes; tests block the bad release first', () => {
    const s = createSession('m3-deployment', 'intermediate');
    applyAction(s, 'rollback');
    safeDraft(s);
    ship(s);
    expect(applyAction(s, 'ship-v25').ok).toBe(true);
    expect(s.flags.shipOutcome).toBe('blocked');
    applyAction(s, 'ship-v25');
    expect(s.flags.shipOutcome).toBe('clean');
    s.postmortem = PM_OK;
    s.chosenCauses = ['bad-release'];
    s.panelsSeen = ['deployments', 'logs', 'metrics'];
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });
  it('without integration tests a canary with auto-abort still limits the damage', () => {
    const s = createSession('m3-deployment', 'intermediate');
    applyAction(s, 'rollback');
    cfg(s.draft, 'cd', { strategy: 'canary' });
    add(s.draft, N('canary', 'can', { autoAbort: true }));
    connect(s.draft, 'can', 'api');
    ship(s);
    applyAction(s, 'ship-v25');
    expect(s.flags.shipOutcome).toBe('caught');
  });
  it('shipping all-at-once with no integration tests causes a second incident that needs another rollback', () => {
    const s = createSession('m3-deployment', 'intermediate');
    applyAction(s, 'rollback');
    applyAction(s, 'ship-v25');
    expect(s.flags.shipOutcome).toBe('incident');
    advance(s, 2);
    expect(s.history[s.history.length - 1].system.errorRate).toBeGreaterThan(0.2);
    applyAction(s, 'rollback');
    advance(s, 2);
    expect(s.history[s.history.length - 1].system.errorRate).toBeLessThan(0.01);
  });
});

describe('Mission 4 — The AWS Networking Puzzle', () => {
  it('fixing every network layer and security exposure passes', () => {
    const s = createSession('m4-network', 'intermediate');
    const d = s.draft;
    cfg(d, 'nat1', { subnet: 'pub-a' });
    cfg(d, 'nacl-priv', { allowEphemeralReturn: true });
    cfg(d, 'sg-alb', { inbound: [{ port: 443, source: 'world' }] });
    cfg(d, 'sg-app', { inbound: [{ port: 8080, source: 'sg-alb' }], egressMode: 'restricted', egressPorts: '443' });
    cfg(d, 'sg-db', { inbound: [{ port: 5432, source: 'sg-app' }] });
    cfg(d, 'db', { publicAccess: false });
    cfg(d, 'role-app', { policy: 'scoped' });
    cfg(d, 'uploads', { publicAccess: false, vpcEndpoint: true });
    ship(s);
    s.adrs = [ADR_OK];
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });
  it('fixing only the NAT leaves the other layers broken', () => {
    const s = createSession('m4-network', 'intermediate');
    cfg(s.draft, 'nat1', { subnet: 'pub-a' });
    ship(s);
    const v = verify(s, true);
    expect(v.outcome.passed).toBe(false);
    expect(v.report.metrics.availability).toBeLessThan(10);
  });
});

describe('Mission 5 — The Queue That Never Drains', () => {
  const solved = (s: Session, over: { concurrency?: number; ledger?: string; vis?: number; idempotent?: boolean; dlq?: boolean } = {}) => {
    if (over.dlq !== false) {
      add(s.draft, N('dlq', 'dlq'));
      connect(s.draft, 'q', 'dlq');
    }
    cfg(s.draft, 'q', { visibilityTimeoutSec: over.vis ?? 60 });
    cfg(s.draft, 'w', {
      idempotent: over.idempotent ?? true,
      replicas: 6,
      concurrency: over.concurrency ?? 50,
      maxConcurrency: over.concurrency ? 500 : 300,
    });
    cfg(s.draft, 'ledger', { size: over.ledger ?? 'large', connectionPooler: true });
    add(s.draft, N('alert-rule', 'al', { metric: 'queueAge', threshold: 120, forMinutes: 2, actionable: true }));
    connect(s.draft, 'al', 'q');
    ship(s);
    s.postmortem = PM_OK;
    s.chosenCauses = ['poison', 'vis', 'capacity'];
    s.panelsSeen = ['queues', 'logs', 'metrics'];
  };
  it('starts with a growing backlog', () => {
    const s = createSession('m5-queue', 'advanced');
    expect(s.history[s.history.length - 1].system.queueBacklog).toBeGreaterThan(5000);
  });
  it('DLQ + longer visibility + idempotency + capped concurrency + bigger ledger passes', () => {
    const s = createSession('m5-queue', 'advanced');
    solved(s);
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });
  it('scaling workers without a concurrency cap overloads the database', () => {
    const s = createSession('m5-queue', 'advanced');
    solved(s, { concurrency: 150, ledger: 'small' });
    const v = verify(s, true);
    const db = v.outcome.reqs.find((r) => r.id === 'db')!;
    expect(db.pass).toBe(false);
  });
  it('fixing throughput alone (no DLQ, not idempotent) fails correctness', () => {
    const s = createSession('m5-queue', 'advanced');
    solved(s, { dlq: false, idempotent: false, vis: 5 });
    const v = verify(s, true);
    expect(v.outcome.passed).toBe(false);
    const failed = v.outcome.reqs.filter((r) => !r.pass).map((r) => r.id);
    expect(failed).toEqual(expect.arrayContaining(['dlq', 'lost']));
  });
});

describe('Mission 6 — The Cloud Bill Shock', () => {
  const optimise = (
    s: Session,
    o: { cache?: boolean; cdn?: boolean; replicas?: number; size?: string; db?: string; tags?: boolean; dropMultiAZ?: boolean } = {},
  ) => {
    const d = s.draft;
    const tag = o.tags === false ? '' : 'team=storefront';
    d.nodes = d.nodes.filter((n) => !['idle-cache', 'idle-search'].includes(n.id));
    cfg(d, 'api', { replicas: o.replicas ?? 6, instanceSize: o.size ?? 'medium', logLevel: 'info', costTag: tag });
    cfg(d, 'cw', { retentionDays: 30 });
    cfg(d, 'db', { size: o.db ?? 'large', readReplicas: 0, backupRetentionDays: 14, multiAZ: !o.dropMultiAZ, costTag: tag });
    cfg(d, 'exports', { lifecycle: true, versioning: false, vpcEndpoint: true, costTag: tag });
    cfg(d, 'lb', { costTag: tag });
    cfg(d, 'nat1', { costTag: tag });
    if (o.cache !== false) {
      add(d, N('elasticache', 'ec', { nodes: 2, size: 'medium', ttlSeconds: 90, invalidateOnWrite: true, costTag: tag }));
      connect(d, 'api', 'ec');
    }
    if (o.cdn) {
      add(d, N('cloudfront', 'cdn'));
      d.edges = d.edges.filter((e) => !(e.source === 'users'));
      connect(d, 'users', 'cdn');
      connect(d, 'cdn', 'lb');
    }
    ship(s);
    s.adrs = [ADR_OK];
  };
  it('the starting bill is far above budget', () => {
    const s = createSession('m6-bill-shock', 'advanced');
    expect(verify(s, true).report.metrics.cost).toBeGreaterThan(4000);
  });
  it('right-sizing + cache + hygiene passes under budget while preserving resilience', () => {
    const s = createSession('m6-bill-shock', 'advanced');
    optimise(s);
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
    expect(v.report.metrics.cost).toBeLessThan(2500);
    expect(v.outcome.passed).toBe(true);
  });
  it('CDN variant is also valid', () => {
    const s = createSession('m6-bill-shock', 'advanced');
    optimise(s, { cdn: true });
    const v = verify(s, true);
    expect(v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id + ':' + r.detail)).toEqual([]);
  });
  it('cutting redundancy to save money is not rewarded (AZ drill fails)', () => {
    const s = createSession('m6-bill-shock', 'advanced');
    optimise(s, { replicas: 2, size: 'small', dropMultiAZ: true });
    const v = verify(s, true);
    expect(v.outcome.passed).toBe(false);
    const failed = v.outcome.reqs.filter((r) => !r.pass).map((r) => r.id);
    expect(failed.some((id) => ['az', 'avail', 'p95'].includes(id))).toBe(true);
  });
});

const last = (s: Session) => s.history[s.history.length - 1].system;
const hardOpen = (v: ReturnType<typeof verify>) => v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id);

describe('Mission 7 — The N+1 Endpoint', () => {
  const start = () => createSession('m7-n-plus-one', 'beginner');
  it('starts with a saturated database', () => {
    const s = start();
    expect(last(s).maxUtil).toBeGreaterThan(1.2);
    expect(last(s).successRate).toBeLessThan(0.5);
  });
  it('batching the lookups removes the cause and passes with a high score', () => {
    const s = start();
    expect(applyAction(s, 'batch').ok).toBe(true);
    advance(s, 6);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
    expect(v.outcome.reqs.find((r) => r.id === 'calls')!.pass).toBe(true);
    expect(v.outcome.decisions!.map((d) => d.tag)).toEqual(['m7-n-plus-one:fixed-in-code']);
  });
  it('buying a bigger database blows the budget', () => {
    const s = start();
    cfg(s.draft, 'db', { size: 'large' });
    ship(s, 6);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual(['budget']);
    expect(v.outcome.decisions!.map((d) => d.tag)).toContain('m7-n-plus-one:bought-a-bigger-database');
  });
  it('a cache alone is not enough, and the pattern is still there', () => {
    const s = start();
    add(s.draft, N('elasticache', 'c', { nodes: 1, size: 'small', ttlSeconds: 60 }));
    connect(s.draft, 'api', 'c');
    ship(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v)).toContain('p95');
  });
  it('a cache plus pagination is a valid but weaker alternative that keeps the defect', () => {
    const s = start();
    add(s.draft, N('elasticache', 'c', { nodes: 1, size: 'small', ttlSeconds: 60 }));
    connect(s.draft, 'api', 'c');
    applyAction(s, 'paginate');
    ship(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual([]);
    expect(v.outcome.reqs.find((r) => r.id === 'calls')!.pass).toBe(false);
    expect(v.outcome.decisions!.map((d) => d.tag)).toContain('m7-n-plus-one:hid-it-behind-a-cache');
  });
  it('adding application replicas makes no difference to a saturated database', () => {
    const s = start();
    cfg(s.draft, 'api', { replicas: 8 });
    ship(s, 6);
    expect(last(s).successRate).toBeLessThan(0.1);
  });
});

describe('Mission 8 — The Impatient Client', () => {
  const start = () => createSession('m8-impatient-client', 'beginner');
  const worst = (s: Session) => Math.max(...Object.values(s.history[s.history.length - 1].edges).map((e) => e.amplification));
  it('starts in a retry storm', () => {
    const s = start();
    expect(worst(s)).toBeGreaterThan(2);
    expect(last(s).successRate).toBeLessThan(0.1);
  });
  it('a measured timeout plus a retry budget passes', () => {
    const s = start();
    applyAction(s, 'timeout');
    applyAction(s, 'retries');
    advance(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
    expect(v.outcome.decisions!.map((d) => d.tag)).toEqual(['m8-impatient-client:retry-budget']);
  });
  it('fixing only the timeout works but leaves loose retries on the record', () => {
    const s = start();
    applyAction(s, 'timeout');
    advance(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual([]);
    expect(v.outcome.reqs.find((r) => r.id === 'retry-budget')!.pass).toBe(false);
    expect(v.outcome.decisions!.map((d) => d.tag)).toEqual(['m8-impatient-client:left-retries-loose']);
  });
  it('adding pricing replicas does not stop the storm and blows the budget', () => {
    const s = start();
    cfg(s.draft, 'pricing', { replicas: 8 });
    ship(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v)).toContain('avail');
    expect(hardOpen(v)).toContain('budget');
  });
  it('a circuit breaker alone does not fix an over-eager contract', () => {
    const s = start();
    applyAction(s, 'breaker');
    advance(s, 8);
    expect(hardOpen(verify(s, true))).toContain('avail');
  });
});

describe('Mission 9 — The Merger (capstone)', () => {
  const ADR2: ADR[] = [ADR_OK, { ...ADR_OK, id: 'a2', title: 'Second decision' }];
  const merger = (inherited: string[] = []) => createSession('m9-merger', 'advanced', 1, undefined, inherited);
  const delivery = (a: Arch) => {
    add(a, N('source-repo', 'repo'), N('ci-pipeline', 'ci'), N('test-suite', 'ts', { unitCoverage: 70, integrationCoverage: 40 }));
    connect(a, 'repo', 'ci');
    connect(a, 'ci', 'ts');
    connect(a, 'ts', 'shop');
  };
  const observe = (a: Arch) => {
    add(a, N('tracing', 'tr'), N('alert-rule', 'al'), N('central-logging', 'lg'));
    connect(a, 'tr', 'shop');
    connect(a, 'al', 'shop');
    connect(a, 'lg', 'shop');
  };
  /** The intended plan: safe first (private, Multi-AZ, headroom), cheap second (cache, log level, tags), written down. */
  const balanced = (s: Session, o: { cache?: boolean; parcelDb?: string } = {}) => {
    const a = s.draft;
    cfg(a, 'shop', { moduleBoundaries: 'enforced', logLevel: 'warn', replicas: 4 });
    cfg(a, 'tracking', { logLevel: 'warn', costTag: 'team=parcel' });
    cfg(a, 'parcel-alb', { costTag: 'team=parcel' });
    cfg(a, 'shop-db', { multiAZ: true });
    cfg(a, 'parcel-db', { size: o.parcelDb ?? 'medium', multiAZ: true, publicAccess: false, costTag: 'team=parcel' });
    if (o.cache !== false) {
      add(a, N('elasticache', 'cache', { nodes: 2, size: 'small', ttlSeconds: 90, invalidateOnWrite: true, costTag: 'team=shop' }));
      connect(a, 'shop', 'cache');
    }
    observe(a);
    delivery(a);
    ship(s, 8);
    s.adrs = ADR2;
  };

  it('looks healthy off-peak, but the audit, the zone drill and the peak all fail', () => {
    const s = merger();
    expect(last(s).successRate).toBeGreaterThan(0.99);
    advance(s, 8);
    const v = verify(s, true);
    expect(hardOpen(v).sort()).toEqual(['adr2', 'avail', 'az', 'p95', 'sec'].sort());
    expect(v.outcome.passed).toBe(false);
  });
  it('the balanced plan passes with a strong score', () => {
    const s = merger();
    balanced(s);
    const v = verify(s, true);
    expect(hardOpen(v)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
    expect(v.outcome.overall).toBeGreaterThan(80);
    expect(v.outcome.decisions!.map((d) => d.tag)).toEqual(['m9-merger:owned-data']);
  });
  it('without the cache the storefront database cannot take the peak', () => {
    const s = merger();
    balanced(s, { cache: false });
    expect(hardOpen(verify(s, true))).toEqual(expect.arrayContaining(['avail']));
  });
  it('leaving Parcelly’s database small fails at peak', () => {
    const s = merger();
    balanced(s, { parcelDb: 'small' });
    expect(hardOpen(verify(s, true))).toContain('avail');
  });
  it('buying capacity everywhere passes the technical bars and fails the budget', () => {
    const s = merger();
    const a = s.draft;
    cfg(a, 'shop', { moduleBoundaries: 'enforced', replicas: 8, instanceSize: 'large' });
    cfg(a, 'tracking', { replicas: 4, instanceSize: 'large' });
    cfg(a, 'shop-db', { size: 'large', multiAZ: true });
    cfg(a, 'parcel-db', { size: 'large', multiAZ: true, publicAccess: false });
    observe(a);
    delivery(a);
    ship(s, 8);
    s.adrs = ADR2;
    expect(hardOpen(verify(s, true))).toEqual(['budget']);
  });
  it('one ADR is not enough: leadership is written down', () => {
    const s = merger();
    balanced(s);
    s.adrs = [ADR_OK];
    expect(hardOpen(verify(s, true))).toEqual(['adr2']);
  });

  describe('consequences of earlier decisions', () => {
    const ALL_DEBTS = [
      'm1-monolith:extracted-services',
      'm2-db-meltdown:scaled-the-database',
      'm7-n-plus-one:hid-it-behind-a-cache',
      'm7-n-plus-one:bought-a-bigger-database',
      'm8-impatient-client:left-retries-loose',
    ];
    it('with no history the capstone starts from its own baseline and lists nothing inherited', () => {
      const s = merger();
      expect(s.consequences).toEqual([]);
      expect(s.draft.nodes.find((n) => n.id === 'shop')!.config.moduleBoundaries).toBe('none');
    });
    it('good habits start the player ahead; sloppy ones leave named debts on the canvas', () => {
      const good = merger(['m1-monolith:modular-monolith', 'm2-db-meltdown:fixed-the-query', 'm8-impatient-client:retry-budget']);
      expect(good.consequences.map((c) => c.id)).toEqual(['inherited-modular', 'inherited-index', 'inherited-retry-budget']);
      expect(good.draft.nodes.find((n) => n.id === 'shop')!.config.moduleBoundaries).toBe('enforced');
      const bad = merger(ALL_DEBTS);
      expect(bad.consequences).toHaveLength(5);
      expect(bad.draft.nodes.some((n) => n.id === 'billing')).toBe(true);
      expect(bad.draft.nodes.find((n) => n.id === 'shop-db')!.config).toMatchObject({ size: 'large', indexed: false });
      expect(bad.draft.edges.find((e) => e.id === 'e-shop-shop-db')!.config.weight).toBe(7);
      expect(bad.draft.edges.find((e) => e.id === 'e-shop-tracking')!.config).toMatchObject({ retries: 3, timeoutMs: 250 });
      expect(bad.workload.slowQueryShare).toBeGreaterThan(0);
    });
    it('every debt is repairable: the same plan, plus fixing what you inherited, still passes', () => {
      const s = merger(ALL_DEBTS);
      const a = s.draft;
      a.nodes = a.nodes.filter((n) => !['billing', 'accounts'].includes(n.id));
      a.edges = a.edges.filter((e) => !['billing', 'accounts'].some((id) => e.source === id || e.target === id));
      cfg(a, 'shop-db', { indexed: true, size: 'medium' });
      a.edges.find((e) => e.id === 'e-shop-shop-db')!.config.weight = 2;
      Object.assign(a.edges.find((e) => e.id === 'e-shop-tracking')!.config, { timeoutMs: 1500, retries: 1 });
      balanced(s);
      const v = verify(s, true);
      expect(hardOpen(v)).toEqual([]);
      expect(v.outcome.passed).toBe(true);
    });
    it('ignoring the debts costs the player: the unrepaired plan fails', () => {
      const s = merger(ALL_DEBTS);
      balanced(s);
      expect(verify(s, true).outcome.passed).toBe(false);
    });
    it('inherited tags survive save and replay so a resumed run rebuilds the same start', () => {
      const s = merger(ALL_DEBTS);
      cfg(s.draft, 'shop', { replicas: 5 });
      ship(s, 3);
      const again = replay('m9-merger', 'advanced', 1, s.ops, undefined, ALL_DEBTS);
      expect(again.live.nodes.find((n) => n.id === 'shop-db')!.config.size).toBe('large');
      expect(again.minute).toBe(s.minute);
      expect(JSON.stringify(again.history[again.history.length - 1].system)).toBe(JSON.stringify(s.history[s.history.length - 1].system));
    });
  });
});

describe('Mission 10 — The Stale Receipt', () => {
  const PM = PM_OK;
  const finish = (s: Session) => {
    s.postmortem = PM;
    s.chosenCauses = ['replica-lag'];
    s.panelsSeen = ['database', 'logs', 'deployments'];
    return verify(s, true);
  };
  const failing = (v: ReturnType<typeof verify>) => v.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => r.id);
  const db = (s: Session) => s.draft.nodes.find((n) => n.id === 'db')!;

  it('starts looking healthy while customers read old data', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    const v = finish(s);
    expect(v.report.metrics.availability).toBeGreaterThan(99);
    expect(v.report.metrics.staleReadPct).toBeGreaterThan(30);
    expect(failing(v)).toEqual(['stale']);
  });

  it('routing reads that follow a write to the primary passes, and the primary copes', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    expect(applyAction(s, 'pin-reads').ok).toBe(true);
    advance(s, 5);
    const v = finish(s);
    expect(v.report.metrics.staleReadPct).toBe(0);
    expect(failing(v)).toEqual([]);
    expect(v.outcome.passed).toBe(true);
  });

  it('a much bigger primary lowers the staleness but never removes it, and blows the budget', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    const before = createSession('m10-stale-receipt', 'intermediate');
    cfg(s.draft, 'db', { size: 'xlarge' });
    ship(s, 5);
    const v = finish(s);
    const v0 = finish(before);
    expect(v.report.metrics.staleReadPct).toBeLessThan(v0.report.metrics.staleReadPct);
    expect(v.report.metrics.staleReadPct).toBeGreaterThan(1);
    expect(failing(v)).toEqual(expect.arrayContaining(['stale', 'budget']));
    expect(v.outcome.passed).toBe(false);
  });

  it('more replicas and a Multi-AZ standby do not help', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    cfg(s.draft, 'db', { readReplicas: 4, multiAZ: true });
    ship(s, 5);
    const v = finish(s);
    expect(v.report.metrics.staleReadPct).toBeGreaterThan(20);
    expect(v.outcome.passed).toBe(false);
  });

  it('removing the replicas “fixes” staleness but breaks what the product pages need', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    cfg(s.draft, 'db', { readReplicas: 0 });
    ship(s, 5);
    const v = finish(s);
    expect(v.report.metrics.staleReadPct).toBe(0);
    expect(failing(v)).toContain('replicas');
    expect(v.outcome.passed).toBe(false);
  });

  it('pinning reads is recorded as a decision for later missions', () => {
    const s = createSession('m10-stale-receipt', 'intermediate');
    applyAction(s, 'pin-reads');
    advance(s, 5);
    expect(finish(s).outcome.decisions?.map((d) => d.tag)).toContain('m10-stale-receipt:read-your-writes');
  });
});

describe('persistence by replay', () => {
  it('replaying logged ops reproduces the same state', async () => {
    const { replay } = await import('@/game/session');
    const s = createSession('m2-db-meltdown', 'intermediate');
    advance(s, 2);
    applyAction(s, 'add-index');
    cfg(s.draft, 'db', { connectionPooler: true });
    ship(s);
    const r = replay('m2-db-meltdown', 'intermediate', 1, s.ops);
    expect(r.minute).toBe(s.minute);
    expect(JSON.stringify(r.history[r.history.length - 1].system)).toBe(JSON.stringify(s.history[s.history.length - 1].system));
    expect(r.live.nodes.find((n) => n.id === 'db')!.config.indexed).toBe(true);
  });
});
