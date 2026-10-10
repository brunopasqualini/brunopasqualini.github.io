import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { clone } from '@/engine/arch';
import { emptyState, solve, type Chaos } from '@/engine/engine';
import type { Arch, Snapshot, Workload } from '@/engine/types';

/**
 * Properties the simulation must hold for ANY architecture, not just the ones missions ship.
 * A failure here means the model contradicts itself or physics, which would teach the wrong lesson.
 */
interface Case {
  name: string;
  arch: Arch;
  workload: Workload;
}

const cases: Case[] = [
  ...MISSIONS.map((m) => ({ name: m.id, arch: m.initial, workload: m.workload })),
  ...TEMPLATES.map((t) => ({ name: `template:${t.id}`, arch: t.arch, workload: templateWorkload(t) })),
];

/** Run the same steady scenario for a few minutes from a cold state; returns the last snapshot. */
function settle(arch: Arch, workload: Workload, chaos: Chaos[] = [], minutes = 6): Snapshot {
  let state = emptyState();
  let snap!: Snapshot;
  for (let t = 0; t < minutes; t++) {
    const r = solve(arch, workload, t, state, chaos);
    state = r.next;
    snap = r.snapshot;
  }
  return snap;
}

const finite = (n: number) => Number.isFinite(n);

describe.each(cases)('invariants: $name', ({ arch, workload }) => {
  it('produces finite, bounded numbers', () => {
    const s = settle(arch, workload);
    for (const [k, v] of Object.entries(s.system)) expect(finite(v as number), `system.${k}`).toBe(true);
    expect(s.system.successRate).toBeGreaterThanOrEqual(0);
    expect(s.system.successRate).toBeLessThanOrEqual(1 + 1e-9);
    expect(s.system.errorRate).toBeGreaterThanOrEqual(-1e-9);
    expect(s.system.p95).toBeGreaterThanOrEqual(s.system.p50 - 1e-9);
    expect(s.system.costMonthly).toBeGreaterThanOrEqual(0);
    for (const n of Object.values(s.nodes)) {
      for (const k of ['offered', 'served', 'util', 'latencyMs', 'errorRate', 'costMonthly'] as const)
        expect(finite(n[k]), `${n.id}.${k}`).toBe(true);
      expect(n.errorRate, `${n.id} errorRate`).toBeGreaterThanOrEqual(-1e-9);
      expect(n.errorRate, `${n.id} errorRate`).toBeLessThanOrEqual(1 + 1e-9);
      // a queue legitimately serves more than arrives while it drains a backlog
      if (n.queueDepth === undefined)
        expect(n.served, `${n.id} cannot serve more than it was offered`).toBeLessThanOrEqual(n.offered + 1e-6);
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(settle(arch, workload))).toBe(JSON.stringify(settle(arch, workload)));
  });

  it('system cost equals the sum of component costs', () => {
    const s = settle(arch, workload);
    const sum = Object.values(s.nodes).reduce((t, n) => t + n.costMonthly, 0);
    expect(Math.abs(s.system.costMonthly - sum)).toBeLessThan(Math.max(1, sum * 0.2)); // data transfer etc. is system-level
  });

  it('more traffic never raises the success rate', () => {
    const lo = settle(arch, workload);
    const hi = settle(arch, { ...workload, baseRps: workload.baseRps * 3 });
    expect(hi.system.successRate).toBeLessThanOrEqual(lo.system.successRate + 1e-6);
  });

  it('a fault never improves what the customer sees', () => {
    const base = settle(arch, workload);
    // Once a design has already collapsed, losing capacity can lower retry amplification and nudge the number up by
    // fractions of a percent (that is what a retry storm is), so the property is only meaningful for a working system.
    if (base.system.successRate < 0.5) return;
    const ids = arch.nodes.filter((n) => !['users', 'cloudwatch'].includes(n.kind)).map((n) => n.id);
    const faults: Chaos[] = [
      { type: 'spike', mult: 3 },
      { type: 'az-outage', az: 'a' },
      ...ids.slice(0, 4).map((id): Chaos => ({ type: 'node-down', nodeId: id })),
    ];
    for (const f of faults) {
      const after = settle(arch, workload, [f]);
      expect(after.system.successRate, JSON.stringify(f)).toBeLessThanOrEqual(base.system.successRate + 1e-6);
    }
  });

  it('a slower dependency never lowers latency', () => {
    const base = settle(arch, workload);
    for (const id of arch.nodes.filter((n) => ['db', 'rds', 'external-api'].includes(n.kind)).map((n) => n.id)) {
      const after = settle(arch, workload, [{ type: 'slow', nodeId: id, mult: 6 }]);
      expect(after.system.p95, `slow ${id}`).toBeGreaterThanOrEqual(base.system.p95 - 1e-6);
    }
  });

  it('adding replicas to compute never lowers its capacity', () => {
    const base = settle(arch, workload);
    const bigger = clone(arch);
    for (const n of bigger.nodes) if (typeof n.config.replicas === 'number') n.config.replicas *= 2;
    const after = settle(bigger, workload);
    for (const n of bigger.nodes)
      if (typeof n.config.replicas === 'number' && base.nodes[n.id])
        expect(after.nodes[n.id].capacity, `${n.id} capacity`).toBeGreaterThanOrEqual(base.nodes[n.id].capacity - 1e-6);
  });

  it('bigger instances never cost less', () => {
    const order = ['micro', 'small', 'medium', 'large', 'xlarge'];
    const base = settle(arch, workload);
    const bigger = clone(arch);
    let changed = false;
    for (const n of bigger.nodes) {
      const k = n.config.instanceSize ?? n.config.size;
      const i = order.indexOf(k);
      if (i >= 0 && i < order.length - 1) {
        const key = n.config.instanceSize !== undefined ? 'instanceSize' : 'size';
        n.config[key] = order[i + 1];
        changed = true;
      }
    }
    if (!changed) return;
    expect(settle(bigger, workload).system.costMonthly).toBeGreaterThanOrEqual(base.system.costMonthly - 1e-6);
  });
});
