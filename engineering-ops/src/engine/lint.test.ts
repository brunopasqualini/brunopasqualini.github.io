import { describe, expect, it } from 'vitest';
import { LESSONS } from '@/content/academy';
import { MISSIONS } from '@/content/missions';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { clone, makeEdge, makeNode } from '@/engine/arch';
import { LINT_RULES, lintArch } from '@/engine/lint';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

const wl = (o: Partial<Workload> = {}): Workload => ({ ...DEFAULT_WORKLOAD, ...o });
const ids = (a: Arch, w?: Workload) => lintArch(a, w).map((i) => i.rule);
const has = (a: Arch, rule: string, w?: Workload) => ids(a, w).includes(rule);

/** users → api → db, the smallest design the rules reason about. */
const base = (): Arch => ({
  nodes: [
    makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
    makeNode('backend-service', { x: 200, y: 0 }, { id: 'api', label: 'API', config: { replicas: 3 } }),
    makeNode('relational-db', { x: 400, y: 0 }, { id: 'db', label: 'Orders DB', config: { multiAZ: true } }),
  ],
  edges: [makeEdge('users', 'api'), makeEdge('api', 'db')],
});
const node = (a: Arch, id: string) => a.nodes.find((n) => n.id === id)!;

describe('single-AZ database', () => {
  it('flags a called database without Multi-AZ, and not one with it', () => {
    const a = base();
    node(a, 'db').config.multiAZ = false;
    expect(has(a, 'db-single-az')).toBe(true);
    expect(lintArch(a).find((i) => i.rule === 'db-single-az')).toMatchObject({ severity: 'high', nodeId: 'db', lesson: 'aws-2' });
    node(a, 'db').config.multiAZ = true;
    expect(has(a, 'db-single-az')).toBe(false);
  });
  it('ignores a database nothing calls', () => {
    const a = base();
    a.edges = a.edges.filter((e) => e.target !== 'db');
    node(a, 'db').config.multiAZ = false;
    expect(has(a, 'db-single-az')).toBe(false);
  });
});

describe('retries and timeouts', () => {
  it('flags many retries without a breaker, scaled by how many', () => {
    const a = base();
    a.edges[1].config.retries = 3;
    expect(lintArch(a).find((i) => i.rule === 'retry-no-breaker')?.severity).toBe('medium');
    a.edges[1].config.retries = 5;
    expect(lintArch(a).find((i) => i.rule === 'retry-no-breaker')?.severity).toBe('high');
    expect(lintArch(a).find((i) => i.rule === 'retry-no-breaker')?.why).toContain('6×');
  });
  it('is quiet with a breaker, or with few retries', () => {
    const a = base();
    a.edges[1].config.retries = 5;
    a.edges[1].config.circuitBreaker = true;
    expect(has(a, 'retry-no-breaker')).toBe(false);
    a.edges[1].config.circuitBreaker = false;
    a.edges[1].config.retries = 2;
    expect(has(a, 'retry-no-breaker')).toBe(false);
  });
  it('flags a worst-case wait over 12 seconds', () => {
    const a = base();
    a.edges[1].config.timeoutMs = 5000;
    a.edges[1].config.retries = 2; // 15 s
    expect(has(a, 'slow-timeout')).toBe(true);
    a.edges[1].config.retries = 1; // 10 s
    expect(has(a, 'slow-timeout')).toBe(false);
  });
});

describe('queues and workers', () => {
  const pipeline = (): Arch => ({
    nodes: [
      makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
      makeNode('backend-service', { x: 100, y: 0 }, { id: 'api', config: { replicas: 3 } }),
      makeNode('message-queue', { x: 200, y: 0 }, { id: 'q', label: 'Orders queue' }),
      makeNode('worker', { x: 300, y: 0 }, { id: 'w', label: 'Fulfilment', config: { idempotent: false } }),
    ],
    edges: [makeEdge('users', 'api'), makeEdge('api', 'q'), makeEdge('q', 'w')],
  });
  it('flags a consumed queue with no dead-letter queue, and accepts one', () => {
    const a = pipeline();
    expect(has(a, 'queue-no-dlq')).toBe(true);
    a.nodes.push(makeNode('dlq', { x: 300, y: 100 }, { id: 'dead', label: 'DLQ' }));
    a.edges.push(makeEdge('q', 'dead'));
    expect(has(a, 'queue-no-dlq')).toBe(false);
  });
  it('does not flag the dead-letter queue itself', () => {
    const a = pipeline();
    a.nodes.push(makeNode('dlq', { x: 300, y: 100 }, { id: 'dead', label: 'DLQ' }));
    a.edges.push(makeEdge('q', 'dead'));
    expect(lintArch(a).some((i) => i.rule === 'queue-no-dlq' && i.nodeId === 'dead')).toBe(false);
  });
  it('flags a queue consumer that is not idempotent, and not one that is', () => {
    const a = pipeline();
    expect(has(a, 'worker-not-idempotent')).toBe(true);
    node(a, 'w').config.idempotent = true;
    expect(has(a, 'worker-not-idempotent')).toBe(false);
  });
});

describe('capacity and resilience', () => {
  it('flags a single instance in the request path, but not a lambda or an autoscaled service', () => {
    const a = base();
    node(a, 'api').config.replicas = 1;
    expect(has(a, 'single-instance')).toBe(true);
    node(a, 'api').config.autoscale = true;
    expect(has(a, 'single-instance')).toBe(false);
    const b: Arch = {
      nodes: [
        makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
        makeNode('lambda', { x: 1, y: 0 }, { id: 'fn', config: { replicas: 1 } }),
      ],
      edges: [makeEdge('users', 'fn')],
    };
    expect(has(b, 'single-instance')).toBe(false);
  });

  it('asks for alerting once the design has compute and data and no alert rule', () => {
    const a = base();
    expect(has(a, 'no-alerting')).toBe(true);
    a.nodes.push(makeNode('alert-rule', { x: 0, y: 100 }, { id: 'alarm' }));
    expect(has(a, 'no-alerting')).toBe(false);
    expect(has({ nodes: a.nodes.slice(0, 2), edges: [] }, 'no-alerting')).toBe(false); // too small to matter
  });

  it('warns about connection exhaustion now, and about it when callers scale out', () => {
    const a = base();
    node(a, 'db').config.size = 'small'; // 100 connections
    node(a, 'api').config.replicas = 20;
    node(a, 'api').config.dbPoolSize = 10; // 200
    let item = lintArch(a).find((i) => i.rule === 'db-connections')!;
    expect(item.severity).toBe('high');
    expect(item.title).toContain('200');
    node(a, 'api').config.replicas = 4; // 40 now
    node(a, 'api').config.autoscale = true;
    node(a, 'api').config.maxReplicas = 30; // 300 at full scale
    item = lintArch(a).find((i) => i.rule === 'db-connections')!;
    expect(item.severity).toBe('medium');
    node(a, 'db').config.connectionPooler = true;
    expect(has(a, 'db-connections')).toBe(false);
  });

  it('warns when traffic peaks but compute cannot scale', () => {
    const a = base();
    const spiky = wl({
      profile: [
        { t: 0, mult: 1 },
        { t: 10, mult: 6 },
      ],
    });
    expect(has(a, 'no-scaling-for-peak', spiky)).toBe(true);
    expect(has(a, 'no-scaling-for-peak', wl({ profile: [{ t: 0, mult: 1 }] }))).toBe(false);
    expect(has(a, 'no-scaling-for-peak')).toBe(false); // no workload given
    node(a, 'api').config.autoscale = true;
    expect(has(a, 'no-scaling-for-peak', spiky)).toBe(false);
  });
});

describe('data, caching and ownership', () => {
  it('flags a cache whose TTL exceeds the freshness requirement', () => {
    const a = base();
    a.nodes.push(makeNode('cache', { x: 300, y: 0 }, { id: 'c', label: 'Cache', config: { ttlSeconds: 300 } }));
    a.edges.push(makeEdge('api', 'c'));
    expect(has(a, 'cache-stale', wl({ freshnessSeconds: 60 }))).toBe(true);
    expect(has(a, 'cache-stale', wl({ freshnessSeconds: 600 }))).toBe(false);
    node(a, 'c').config.invalidateOnWrite = true;
    expect(has(a, 'cache-stale', wl({ freshnessSeconds: 60 }))).toBe(false);
    expect(has(a, 'cache-stale')).toBe(false); // needs a workload to compare against
  });

  it('flags two microservices sharing a database', () => {
    const a = base();
    node(a, 'api').kind = 'microservice';
    a.nodes.push(makeNode('microservice', { x: 200, y: 100 }, { id: 'api2', label: 'Billing' }));
    a.edges.push(makeEdge('users', 'api2'), makeEdge('api2', 'db'));
    expect(has(a, 'shared-database')).toBe(true);
    a.edges = a.edges.filter((e) => e.source !== 'api2' || e.target !== 'db');
    expect(has(a, 'shared-database')).toBe(false);
  });
});

describe('cost hygiene', () => {
  it('flags a large bucket with no lifecycle rule', () => {
    const a = base();
    a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 's', label: 'Archive', config: { storageGB: 5000, lifecycle: false } }));
    expect(has(a, 'cold-data-standard')).toBe(true);
    node(a, 's').config.lifecycle = true;
    expect(has(a, 'cold-data-standard')).toBe(false);
  });
  it('flags debug logging', () => {
    const a = base();
    node(a, 'api').config.logLevel = 'debug';
    expect(has(a, 'debug-logging')).toBe(true);
    node(a, 'api').config.logLevel = 'info';
    expect(has(a, 'debug-logging')).toBe(false);
  });
  it('flags untagged spend only when nothing is tagged', () => {
    const a = base();
    a.nodes.push(makeNode('cache', { x: 0, y: 0 }, { id: 'c' }));
    expect(has(a, 'no-cost-tags')).toBe(true);
    node(a, 'api').config.costTag = 'team=checkout';
    expect(has(a, 'no-cost-tags')).toBe(false);
  });
});

describe('the linter as a whole', () => {
  it('has a rule documented for everything it can emit, with unique ids', () => {
    expect(new Set(LINT_RULES.map((r) => r.id)).size).toBe(LINT_RULES.length);
    const known = new Set(LINT_RULES.map((r) => r.id));
    const archs = [...TEMPLATES.map((t) => t.arch), ...MISSIONS.map((m) => m.initial)];
    for (const a of archs) for (const i of lintArch(a, wl())) expect(known.has(i.rule), i.rule).toBe(true);
  });

  it('only links to lessons that exist', () => {
    const lessonIds = new Set(Object.values(LESSONS).flatMap((l) => l.map((x) => x.id)));
    const archs = [...TEMPLATES.map((t) => t.arch), ...MISSIONS.map((m) => m.initial)];
    const seen = new Set<string>();
    for (const a of archs)
      for (const i of lintArch(a, wl({ profile: [{ t: 0, mult: 3 }], freshnessSeconds: 5 }))) if (i.lesson) seen.add(i.lesson);
    for (const l of seen) expect(lessonIds.has(l), l).toBe(true);
    // and every lesson a rule can name exists, even ones these designs never trigger
    for (const l of ['aws-2', 'sd-3', 'se-2', 'sre-1', 'sd-4', 'aws-3', 'sd-1', 'sa-3', 'fo-2', 'sd-2', 'fo-3'])
      expect(lessonIds.has(l), l).toBe(true);
  });

  it('gives every finding a title, a reason and a fix, and a component that exists', () => {
    for (const t of TEMPLATES) {
      const a = t.arch;
      for (const i of lintArch(a, templateWorkload(t))) {
        expect(i.title.length).toBeGreaterThan(5);
        expect(i.why.length).toBeGreaterThan(30);
        expect(i.fix.length).toBeGreaterThan(15);
        if (i.nodeId)
          expect(
            a.nodes.some((n) => n.id === i.nodeId),
            `${t.id}: ${i.id}`,
          ).toBe(true);
      }
    }
  });

  it('is deterministic, sorted by severity, and does not mutate the design', () => {
    const t = TEMPLATES.find((x) => x.id === 'three-tier')!;
    const a = clone(t.arch);
    const before = JSON.stringify(a);
    const one = lintArch(a, templateWorkload(t));
    expect(JSON.stringify(lintArch(a, templateWorkload(t)))).toBe(JSON.stringify(one));
    expect(JSON.stringify(a)).toBe(before);
    const order = { high: 0, medium: 1, low: 2 };
    for (let i = 1; i < one.length; i++) expect(order[one[i].severity]).toBeGreaterThanOrEqual(order[one[i - 1].severity]);
    expect(new Set(one.map((i) => i.id)).size).toBe(one.length);
  });

  it('finds the well-known problems in the mission starting designs (they were built to have them)', () => {
    const m2 = MISSIONS.find((m) => m.id === 'm2-db-meltdown')!;
    expect(lintArch(m2.initial, m2.workload).length).toBeGreaterThan(0);
    const m5 = MISSIONS.find((m) => m.id === 'm5-queue')!;
    const rules = lintArch(m5.initial, m5.workload).map((i) => i.rule);
    expect(rules.some((r) => ['queue-no-dlq', 'worker-not-idempotent'].includes(r))).toBe(true);
  });
});
