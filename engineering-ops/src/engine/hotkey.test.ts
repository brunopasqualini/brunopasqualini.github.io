import { describe, expect, it } from 'vitest';
import { makeEdge, makeNode } from '@/engine/arch';
import { emptyState, solve } from '@/engine/engine';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

const node = (kind: string, id: string, config: Record<string, unknown> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });
const arch = (table: Record<string, unknown>): Arch => ({
  nodes: [
    node('users', 'u'),
    node('alb', 'lb'),
    node('ecs', 'api', { replicas: 12, instanceSize: 'medium' }),
    node('dynamodb', 'kv', table),
  ],
  edges: [makeEdge('u', 'lb'), makeEdge('lb', 'api'), makeEdge('api', 'kv', { weight: 1 })],
});
const load = (o: Partial<Workload> = {}): Workload => ({
  ...DEFAULT_WORKLOAD,
  baseRps: 2000,
  profile: [{ t: 0, mult: 1 }],
  readRatio: 0.25,
  hotKeyShare: 0.9,
  ...o,
});
const kvOf = (a: Arch, w: Workload) => solve(a, w, 1, emptyState()).snapshot.nodes.kv;
const roomy = { capacityMode: 'provisioned', rcu: 4000, wcu: 4000 };

describe('hot item on a key-value table', () => {
  it('throttles one item even though the table has spare capacity', () => {
    const m = kvOf(arch(roomy), load());
    expect(m.util).toBeLessThan(0.5);
    expect(m.hotItemWritesPerSec).toBeGreaterThan(1000);
    expect(m.errorRate).toBeGreaterThan(0.05);
    expect(m.reasons.some((r) => r.code === 'hot-key')).toBe(true);
  });

  it('buying more capacity does not lift the per-item limit', () => {
    const a = kvOf(arch({ ...roomy, wcu: 4000 }), load());
    const b = kvOf(arch({ ...roomy, wcu: 20000 }), load());
    expect(b.errorRate).toBeCloseTo(a.errorRate, 6);
  });

  it('on-demand mode has the same per-item ceiling', () => {
    expect(kvOf(arch({ capacityMode: 'on-demand' }), load()).errorRate).toBeGreaterThan(0.05);
  });

  it('sharding the key spreads the writes below the limit and removes the throttling', () => {
    const m = kvOf(arch({ ...roomy, writeShards: 4 }), load());
    expect(m.hotItemWritesPerSec).toBeLessThan(1000);
    expect(m.errorRate).toBeLessThan(0.001);
  });

  it('a workload with no hot key is unaffected', () => {
    expect(kvOf(arch(roomy), load({ hotKeyShare: 0 })).errorRate).toBeLessThan(0.001);
  });
});
