import { describe, expect, it } from 'vitest';
import { MISSION_BY_ID } from '@/content/missions';
import { compareDesigns } from '@/engine/compare';
import { clone } from '@/engine/arch';

describe('compareDesigns', () => {
  const m = MISSION_BY_ID['m2-db-meltdown'];
  const opts = { from: m.verifyAt, minutes: m.verifyMinutes };

  it('shows the fix as better under identical conditions', () => {
    const fixed = clone(m.initial);
    fixed.nodes.find((n) => n.id === 'db')!.config.indexed = true;
    fixed.nodes.find((n) => n.id === 'db')!.config.connectionPooler = true;
    const c = compareDesigns(m.initial, fixed, m.workload, opts);
    const peak = (p: typeof c.before) => p.scenarios.find((s) => s.id === 'peak')!;
    expect(peak(c.after).successRate).toBeGreaterThan(peak(c.before).successRate);
    expect(peak(c.after).p95).toBeLessThan(peak(c.before).p95);
  });

  it('is deterministic and comparing a design with itself shows no difference', () => {
    const a = compareDesigns(m.initial, m.initial, m.workload, opts);
    expect(a.before).toEqual(a.after);
    expect(JSON.stringify(compareDesigns(m.initial, m.initial, m.workload, opts))).toBe(JSON.stringify(a));
  });

  it('reports three scenarios including a zone loss', () => {
    const c = compareDesigns(m.initial, m.initial, m.workload, opts);
    expect(c.before.scenarios.map((s) => s.id)).toEqual(['normal', 'peak', 'zone-loss']);
  });
});
