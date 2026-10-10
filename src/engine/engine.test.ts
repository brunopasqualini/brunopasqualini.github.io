import { describe, expect, it } from 'vitest';
import { makeEdge, makeNode } from '@/engine/arch';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import { emptyState, rpsAt, solve } from '@/engine/engine';
import type { Arch, Workload } from '@/engine/types';

const W = (o: Partial<Workload> = {}): Workload => ({ ...DEFAULT_WORKLOAD, baseRps: 200, ...o });

function webStack(app: Record<string, any> = {}, db: Record<string, any> = {}): Arch {
  const nodes = [
    makeNode('users', { x: 0, y: 0 }, { id: 'u' }),
    makeNode('alb', { x: 0, y: 0 }, { id: 'lb' }),
    makeNode('backend-service', { x: 0, y: 0 }, { id: 'app', config: { replicas: 4, ...app } }),
    makeNode('relational-db', { x: 0, y: 0 }, { id: 'db', config: db }),
  ];
  const edges = [makeEdge('u', 'lb'), makeEdge('lb', 'app'), makeEdge('app', 'db', { weight: 2 })];
  return { nodes, edges };
}

const run = (a: Arch, w: Workload, minute = 0) => solve(a, w, minute, emptyState()).snapshot;

describe('workload', () => {
  it('interpolates the traffic profile', () => {
    const w = W({
      baseRps: 100,
      profile: [
        { t: 0, mult: 1 },
        { t: 10, mult: 3 },
      ],
    });
    expect(rpsAt(w, 0)).toBe(100);
    expect(rpsAt(w, 5)).toBeCloseTo(200);
    expect(rpsAt(w, 99)).toBe(300);
  });
});

describe('capacity & latency', () => {
  it('is healthy when capacity exceeds load', () => {
    const s = run(webStack({ replicas: 4 }, { size: 'medium' }), W());
    expect(s.system.successRate).toBeGreaterThan(0.99);
    expect(s.nodes.app.status).toBe('healthy');
  });
  it('rejects excess traffic when saturated and latency grows near saturation', () => {
    const low = run(webStack({ replicas: 2 }, { size: 'large' }), W({ baseRps: 100 }));
    const hot = run(webStack({ replicas: 2 }, { size: 'large' }), W({ baseRps: 215 }));
    const over = run(webStack({ replicas: 2 }, { size: 'large' }), W({ baseRps: 400 }));
    expect(hot.nodes.app.latencyMs).toBeGreaterThan(low.nodes.app.latencyMs * 3);
    expect(over.system.successRate).toBeLessThan(0.7);
    expect(over.nodes.app.status).toBe('overloaded');
  });
});

describe('causal rules: scaling out can overwhelm a shared database', () => {
  it('more app replicas multiplies DB connections and can break a healthy database', () => {
    const before = run(webStack({ replicas: 4, dbPoolSize: 20 }, { size: 'small' }), W({ baseRps: 100 }));
    const after = run(webStack({ replicas: 8, dbPoolSize: 20 }, { size: 'small' }), W({ baseRps: 100 }));
    expect(before.system.successRate).toBeGreaterThan(0.99);
    expect(after.nodes.db.connUsed).toBeGreaterThan(before.nodes.db.connUsed!);
    expect(after.system.successRate).toBeLessThan(before.system.successRate - 0.1);
    expect(after.nodes.db.reasons.some((r) => r.code === 'connections')).toBe(true);
  });
  it('a connection pooler removes the connection limit', () => {
    const s = run(webStack({ replicas: 8, dbPoolSize: 20 }, { size: 'small', connectionPooler: true }), W({ baseRps: 100 }));
    expect(s.system.successRate).toBeGreaterThan(0.99);
  });
  it('an unindexed hot query saturates the database until fixed', () => {
    const w = W({ baseRps: 80, slowQueryShare: 0.4 });
    const bad = run(webStack({ replicas: 6, dbPoolSize: 10 }, { size: 'small', indexed: false }), w);
    const good = run(webStack({ replicas: 6, dbPoolSize: 10 }, { size: 'small', indexed: true }), w);
    expect(bad.nodes.db.util).toBeGreaterThan(1);
    expect(good.nodes.db.util).toBeLessThan(0.8);
    expect(good.system.p95).toBeLessThan(bad.system.p95);
  });
  it('a bigger database costs more and does not fix an unindexed query as cost-effectively', () => {
    const w = W({ baseRps: 80, slowQueryShare: 0.4 });
    const big = run(webStack({ replicas: 6, dbPoolSize: 10 }, { size: 'xlarge', indexed: false }), w);
    const idx = run(webStack({ replicas: 6, dbPoolSize: 10 }, { size: 'small', indexed: true }), w);
    expect(big.system.costMonthly).toBeGreaterThan(idx.system.costMonthly);
  });
});

describe('cache', () => {
  it('reduces database load for read-heavy workloads and raises a freshness risk', () => {
    const base = webStack({ replicas: 6, dbPoolSize: 10 }, { size: 'small' });
    const cached: Arch = {
      nodes: [...base.nodes, makeNode('cache', { x: 0, y: 0 }, { id: 'c', config: { ttlSeconds: 300, nodes: 2 } })],
      edges: [...base.edges, makeEdge('app', 'c')],
    };
    const w = W({ baseRps: 150, freshnessSeconds: 30, cacheableShare: 0.8 });
    const a = run(base, w);
    const b = run(cached, w);
    expect(b.nodes.db.offered).toBeLessThan(a.nodes.db.offered * 0.7);
    expect(b.nodes.c.hitRate).toBeGreaterThan(0.3);
    expect(b.nodes.c.reasons.some((r) => r.code === 'stale')).toBe(true);
  });
});

describe('retries amplify load during an outage', () => {
  it('aggressive retries against a saturated dependency make it worse; a circuit breaker contains it', () => {
    const mk = (retries: number, breaker: boolean): Arch => {
      const a = webStack({ replicas: 4, dbPoolSize: 5 }, { size: 'small' });
      a.edges = a.edges.map((e) => (e.id === 'e-app-db' ? { ...e, config: { ...e.config, retries, circuitBreaker: breaker } } : e));
      return a;
    };
    const w = W({ baseRps: 140 });
    const noRetry = run(mk(0, false), w);
    const retry = run(mk(5, false), w);
    const breaker = run(mk(5, true), w);
    expect(retry.edges['e-app-db'].amplification).toBeGreaterThan(noRetry.edges['e-app-db'].amplification);
    expect(retry.nodes.db.offered).toBeGreaterThan(noRetry.nodes.db.offered);
    expect(breaker.nodes.db.offered).toBeLessThan(retry.nodes.db.offered);
  });
});

describe('load balancer health checks', () => {
  it('a probe timeout shorter than endpoint latency evicts healthy instances', () => {
    const a = webStack({ replicas: 4 }, { size: 'medium' });
    const lb = a.nodes.find((n) => n.id === 'lb')!;
    lb.config.healthTimeoutMs = 20;
    const s = run(a, W({ baseRps: 150 }));
    expect(s.nodes.app.reasons.some((r) => r.code === 'health')).toBe(true);
    expect(s.system.successRate).toBeLessThan(0.9);
  });
});

describe('queue dynamics', () => {
  const qArch = (worker: Record<string, any>, queue: Record<string, any> = {}, dlq = false): Arch => {
    const nodes = [
      makeNode('users', { x: 0, y: 0 }, { id: 'u' }),
      makeNode('backend-service', { x: 0, y: 0 }, { id: 'api', config: { replicas: 4 } }),
      makeNode('message-queue', { x: 0, y: 0 }, { id: 'q', config: queue }),
      makeNode('worker', { x: 0, y: 0 }, { id: 'w', config: worker }),
    ];
    const edges = [makeEdge('u', 'api'), makeEdge('api', 'q'), makeEdge('q', 'w')];
    if (dlq) {
      nodes.push(makeNode('dlq', { x: 0, y: 0 }, { id: 'dlq' }));
      edges.push(makeEdge('q', 'dlq'));
    }
    return { nodes, edges };
  };
  const drive = (a: Arch, w: Workload, minutes: number) => {
    let st = emptyState();
    let snap = solve(a, w, 0, st).snapshot;
    for (let m = 0; m < minutes; m++) {
      const r = solve(a, w, m, st);
      st = r.next;
      snap = r.snapshot;
    }
    return snap;
  };
  it('backlog grows when consumers are slower than producers and drains after scaling', () => {
    const w = W({ baseRps: 100, avgProcessMs: 200 });
    const slow = drive(qArch({ replicas: 1, concurrency: 5 }), w, 10);
    expect(slow.nodes.q.queueDepth).toBeGreaterThan(1000);
    const fast = drive(qArch({ replicas: 4, concurrency: 20 }), w, 10);
    expect(fast.nodes.q.queueDepth ?? 0).toBeLessThan(10);
  });
  it('poison messages without a DLQ waste capacity; a DLQ parks them', () => {
    const w = W({ baseRps: 60, avgProcessMs: 100, poisonShare: 0.1 });
    const noDlq = drive(qArch({ replicas: 2, concurrency: 20 }), w, 30);
    const withDlq = drive(qArch({ replicas: 2, concurrency: 20 }, {}, true), w, 30);
    expect(noDlq.nodes.q.reasons.some((r) => r.code === 'poison')).toBe(true);
    expect(withDlq.nodes.dlq.queueDepth).toBeGreaterThan(0);
    expect(withDlq.nodes.q.reasons.some((r) => r.code === 'poison')).toBe(false);
  });
  it('a short visibility timeout causes redelivery; non-idempotent consumers corrupt data', () => {
    const w = W({ baseRps: 20, avgProcessMs: 2000 });
    const s = drive(qArch({ replicas: 4, concurrency: 20, idempotent: false }, { visibilityTimeoutSec: 2 }), w, 5);
    expect(s.nodes.q.dupRate).toBeGreaterThan(0.05);
    expect(s.system.duplicateRate).toBeGreaterThan(0.05);
    const ok = drive(qArch({ replicas: 4, concurrency: 20, idempotent: true }, { visibilityTimeoutSec: 30 }), w, 5);
    expect(ok.system.duplicateRate).toBe(0);
  });
});

describe('autoscaling', () => {
  it('lags behind demand rather than fixing it instantly', () => {
    const a = webStack({ replicas: 2, autoscale: true, maxReplicas: 20 }, { size: 'xlarge' });
    const w = W({
      baseRps: 100,
      profile: [
        { t: 0, mult: 1 },
        { t: 1, mult: 5 },
      ],
    });
    let st = emptyState();
    const hist: number[] = [];
    for (let m = 0; m < 8; m++) {
      const r = solve(a, w, m, st);
      st = r.next;
      hist.push(r.snapshot.system.successRate);
    }
    expect(hist[1]).toBeLessThan(0.9);
    expect(hist[7]).toBeGreaterThan(hist[1]);
    expect(hist[7]).toBeGreaterThan(0.99);
  });
});

describe('determinism', () => {
  it('same inputs produce the same outputs', () => {
    const a = webStack({ replicas: 5 }, { size: 'small' });
    expect(JSON.stringify(run(a, W()))).toBe(JSON.stringify(run(a, W())));
  });
});
