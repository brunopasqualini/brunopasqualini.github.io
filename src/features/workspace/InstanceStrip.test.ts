import { describe, expect, it } from 'vitest';
import { makeNode } from '@/engine/arch';
import { tilesFor } from '@/features/workspace/InstanceStrip';
import type { NodeMetrics } from '@/engine/types';

const metrics = (over: Partial<NodeMetrics>): NodeMetrics => ({
  id: 'n',
  kind: 'ecs',
  role: 'compute',
  offered: 100,
  served: 100,
  capacity: 200,
  util: 0.5,
  mem: 0.4,
  latencyMs: 50,
  p95Ms: 90,
  errorRate: 0,
  status: 'healthy',
  replicas: 3,
  costMonthly: 0,
  reasons: [],
  ...over,
});

describe('instance tiles', () => {
  it('shows running instances plus autoscaling headroom as ghosts', () => {
    const n = makeNode('ecs', { x: 0, y: 0 }, { config: { replicas: 2, maxReplicas: 8, autoscale: true } });
    const t = tilesFor(n, metrics({ replicas: 3 }), 5);
    expect(t.filter((x) => x.kind === 'on')).toHaveLength(3);
    expect(t.filter((x) => x.kind === 'ghost')).toHaveLength(5);
  });

  it('marks instances down when an outage takes every replica', () => {
    const n = makeNode('ecs', { x: 0, y: 0 }, { config: { replicas: 4, autoscale: false } });
    const t = tilesFor(n, metrics({ replicas: 0, status: 'unavailable', util: 0 }), 5);
    expect(t.every((x) => x.kind === 'down')).toBe(true);
    expect(t).toHaveLength(4);
  });

  it('renders a primary, a standby and each read replica for a database', () => {
    const n = makeNode('rds', { x: 0, y: 0 }, { config: { multiAZ: true, readReplicas: 2 } });
    const t = tilesFor(n, metrics({ role: 'db', kind: 'rds', replicaLagSec: 1.2 }), 5);
    expect(t.map((x) => x.kind)).toEqual(['primary', 'standby', 'replica', 'replica']);
  });

  it('is deterministic for the same minute (visual jitter never flickers between renders)', () => {
    const n = makeNode('ecs', { x: 0, y: 0 }, { config: { replicas: 3 } });
    expect(tilesFor(n, metrics({}), 7)).toEqual(tilesFor(n, metrics({}), 7));
  });
});
