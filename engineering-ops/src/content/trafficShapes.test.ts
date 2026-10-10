import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { SHAPE_BY_ID, TRAFFIC_SHAPES, matchShape, peakMult, sampleShape, shapePatch } from '@/content/trafficShapes';
import { emptyState, rpsAt, solve } from '@/engine/engine';
import type { Snapshot } from '@/engine/types';

describe.each(TRAFFIC_SHAPES)('traffic shape: $id', (shape) => {
  it('starts at minute 0 with strictly increasing times', () => {
    expect(shape.profile[0].t).toBe(0);
    for (let i = 1; i < shape.profile.length; i++) expect(shape.profile[i].t, `point ${i}`).toBeGreaterThan(shape.profile[i - 1].t);
  });

  it('keeps every multiplier positive and within a believable range', () => {
    for (const p of shape.profile) {
      expect(p.mult).toBeGreaterThan(0);
      expect(p.mult).toBeLessThanOrEqual(10);
    }
  });

  it('repeats without a jump: a cycle ends where it began', () => {
    if (!shape.cycle) return;
    const last = shape.profile[shape.profile.length - 1];
    expect(last.t).toBe(shape.cycle);
    expect(last.mult).toBe(shape.profile[0].mult);
  });

  it('has a name and an explanation', () => {
    expect(shape.name.length).toBeGreaterThan(2);
    expect(shape.blurb.length).toBeGreaterThan(40);
  });

  it('round-trips through the workload patch', () => {
    const patch = shapePatch(shape);
    expect(matchShape(patch)?.id).toBe(shape.id);
    expect(patch.profile).not.toBe(shape.profile); // a copy, so the library cannot be edited by a session
  });

  it('survives a JSON round trip (this is how saved operations are stored and replayed)', () => {
    expect(matchShape(JSON.parse(JSON.stringify(shapePatch(shape))))?.id).toBe(shape.id);
  });

  it('produces finite, bounded output when the real engine runs it', () => {
    const w = { ...templateWorkload(TEMPLATES.find((t) => t.id === 'scaled-platform')!), ...shapePatch(shape) };
    const arch = TEMPLATES.find((t) => t.id === 'scaled-platform')!.arch;
    let state = emptyState();
    let snap: Snapshot | undefined;
    const minutes = Math.min(shape.cycle ?? 60, 200);
    for (let m = 0; m < minutes; m += Math.max(1, Math.floor(minutes / 60))) {
      const r = solve(arch, w, m, state);
      state = r.next;
      snap = r.snapshot;
      expect(Number.isFinite(snap.rps), `rps at ${m}`).toBe(true);
      expect(snap.system.successRate).toBeGreaterThanOrEqual(0);
      expect(snap.system.successRate).toBeLessThanOrEqual(1 + 1e-9);
      expect(Number.isFinite(snap.system.p95)).toBe(true);
    }
    expect(snap).toBeTruthy();
  });
});

describe('the library', () => {
  it('has unique ids and a steady baseline first', () => {
    expect(new Set(TRAFFIC_SHAPES.map((s) => s.id)).size).toBe(TRAFFIC_SHAPES.length);
    expect(TRAFFIC_SHAPES[0].id).toBe('steady');
    expect(SHAPE_BY_ID.daily.name).toBe('Daily cycle');
  });

  it('steady is flat and never repeats', () => {
    const steady = SHAPE_BY_ID.steady;
    expect(peakMult(steady)).toBe(1);
    expect(steady.cycle).toBeUndefined();
    expect(shapePatch(steady).profileCycle).toBe(0); // explicit, so it clears an earlier shape's cycle
  });

  it('the daily curve is quietest in the small hours and busiest in the evening', () => {
    const daily = SHAPE_BY_ID.daily;
    const rps = (h: number) => rpsAt({ baseRps: 100, profile: daily.profile, profileCycle: daily.cycle } as never, h * 60);
    expect(rps(4)).toBeLessThan(rps(12));
    expect(rps(20)).toBeGreaterThan(rps(12));
    expect(rps(20)).toBe(100);
    expect(rps(4 + 24)).toBe(rps(4)); // the next day
  });

  it.each([
    ['flash-sale', 6],
    ['thundering-herd', 8],
    ['batch', 3],
    ['viral', 6],
  ])('%s peaks at %sx the base level', (id, peak) => {
    expect(peakMult(SHAPE_BY_ID[id])).toBe(peak);
  });

  it('does not mistake a custom profile for a shape', () => {
    expect(
      matchShape({
        profile: [
          { t: 0, mult: 1 },
          { t: 5, mult: 2 },
        ],
        profileCycle: 0,
      }),
    ).toBeUndefined();
    // same points but a different cycle is a different shape
    expect(matchShape({ profile: SHAPE_BY_ID.batch.profile, profileCycle: 99 })).toBeUndefined();
  });

  it('treats a missing cycle and a zero cycle the same', () => {
    expect(matchShape({ profile: SHAPE_BY_ID.steady.profile })?.id).toBe('steady');
    expect(matchShape({ profile: SHAPE_BY_ID.steady.profile, profileCycle: 0 })?.id).toBe('steady');
  });

  it('samples a preview across one cycle', () => {
    const s = sampleShape(SHAPE_BY_ID.batch, 16);
    expect(s).toHaveLength(16);
    expect(Math.max(...s)).toBeCloseTo(3, 1);
    expect(Math.min(...s)).toBeCloseTo(1, 5);
    for (const v of sampleShape(SHAPE_BY_ID.steady)) expect(v).toBe(1);
  });
});
