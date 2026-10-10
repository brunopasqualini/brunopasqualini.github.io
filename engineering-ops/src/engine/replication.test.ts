import { describe, expect, it } from 'vitest';
import { makeEdge, makeNode } from '@/engine/arch';
import { emptyState, solve } from '@/engine/engine';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

const node = (kind: string, id: string, config: Record<string, unknown> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });
const arch = (db: Record<string, unknown>): Arch => ({
  nodes: [node('users', 'u'), node('alb', 'lb'), node('ecs', 'api', { replicas: 12, instanceSize: 'medium' }), node('rds', 'db', db)],
  edges: [makeEdge('u', 'lb'), makeEdge('lb', 'api'), makeEdge('api', 'db', { weight: 1 })],
});
const load = (o: Partial<Workload> = {}): Workload => ({
  ...DEFAULT_WORKLOAD,
  baseRps: 320,
  profile: [{ t: 0, mult: 1 }],
  readRatio: 0.85,
  slowQueryShare: 0,
  readAfterWriteShare: 0.4,
  ...o,
});
const dbOf = (a: Arch, w: Workload) => solve(a, w, 1, emptyState()).snapshot.nodes.db;

describe('read-after-write staleness', () => {
  it('replica lag makes reads that follow a write return old data', () => {
    const m = dbOf(arch({ size: 'small', readReplicas: 2 }), load());
    expect(m.replicaLagSec).toBeGreaterThan(1.5);
    expect(m.staleReadPct).toBeGreaterThan(50);
    expect(m.reasons.some((r) => r.code === 'stale-read')).toBe(true);
  });

  it('is zero without replicas: the primary is always current', () => {
    expect(dbOf(arch({ size: 'small', readReplicas: 0 }), load()).staleReadPct).toBe(0);
  });

  it('is zero when no reads follow a write', () => {
    expect(dbOf(arch({ size: 'small', readReplicas: 2 }), load({ readAfterWriteShare: 0 })).staleReadPct).toBe(0);
  });

  it('pinning those reads to the primary removes the staleness and loads the primary', () => {
    const replica = dbOf(arch({ size: 'small', readReplicas: 2, readYourWrites: 'replica' }), load());
    const pinned = dbOf(arch({ size: 'small', readReplicas: 2, readYourWrites: 'primary' }), load());
    expect(pinned.staleReadPct).toBe(0);
    expect(pinned.util).toBeGreaterThanOrEqual(replica.util);
  });

  it('a bigger primary lowers lag, because replay keeps up with writes', () => {
    const small = dbOf(arch({ size: 'small', readReplicas: 2 }), load());
    const large = dbOf(arch({ size: 'large', readReplicas: 2 }), load());
    expect(large.replicaLagSec!).toBeLessThan(small.replicaLagSec!);
    expect(large.staleReadPct!).toBeLessThan(small.staleReadPct!);
  });

  it('a Multi-AZ standby does not help: it serves no reads and is not a replica', () => {
    const base = dbOf(arch({ size: 'small', readReplicas: 2 }), load());
    const maz = dbOf(arch({ size: 'small', readReplicas: 2, multiAZ: true }), load());
    expect(maz.staleReadPct).toBe(base.staleReadPct);
  });
});
