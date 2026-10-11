import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import { rpsAt } from '@/engine/engine';
import type { Workload } from '@/engine/types';

const w = (o: Partial<Workload> = {}): Workload => ({
  ...DEFAULT_WORKLOAD,
  baseRps: 100,
  profile: [
    { t: 0, mult: 1 },
    { t: 10, mult: 3 },
    { t: 20, mult: 1 },
  ],
  ...o,
});

describe('rpsAt with and without a repeating profile', () => {
  it('plays the profile once and holds the last value when no cycle is set (unchanged behaviour)', () => {
    expect(rpsAt(w(), 0)).toBe(100);
    expect(rpsAt(w(), 5)).toBe(200); // halfway up the ramp
    expect(rpsAt(w(), 10)).toBe(300);
    expect(rpsAt(w(), 20)).toBe(100);
    expect(rpsAt(w(), 500)).toBe(100); // held
  });

  it('repeats the profile every cycle', () => {
    const c = w({ profileCycle: 20 });
    expect(rpsAt(c, 5)).toBe(rpsAt(c, 25));
    expect(rpsAt(c, 10)).toBe(300);
    expect(rpsAt(c, 30)).toBe(300);
    expect(rpsAt(c, 1000 + 5)).toBe(200);
  });

  it('a cycle longer than the profile holds the last value until the cycle ends, then restarts', () => {
    const c = w({ profileCycle: 30 });
    expect(rpsAt(c, 25)).toBe(100); // held after t=20
    expect(rpsAt(c, 30)).toBe(100); // restart at multiplier 1
    expect(rpsAt(c, 35)).toBe(200);
  });

  it('ignores a missing, zero or negative cycle', () => {
    for (const profileCycle of [undefined, 0, -5]) expect(rpsAt(w({ profileCycle }), 25)).toBe(100);
  });

  it('is finite and non-negative for any minute, including negative ones', () => {
    const c = w({ profileCycle: 20 });
    for (const m of [-37, -1, 0, 0.5, 19.999, 20, 12345.678]) {
      const v = rpsAt(c, m);
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves an empty profile alone', () => {
    expect(rpsAt(w({ profile: [], profileCycle: 20 }), 7)).toBe(100);
  });
});
