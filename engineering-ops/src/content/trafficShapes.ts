import { rpsAt } from '@/engine/engine';
import type { Workload } from '@/engine/types';

/**
 * Traffic shapes for the Lab. Real incidents rarely start from a flat line: load follows the day, a sale, a cron job,
 * a retry storm. Each shape is a piecewise-linear multiplier over virtual minutes (the engine already interpolates
 * Workload.profile), optionally repeating (Workload.profileCycle). "Base traffic" is the normal level the shape
 * multiplies; the peak is base × the shape's highest multiplier.
 *
 * Shapes only change the workload, so they are recorded as ordinary workload operations and replay like any other change.
 */
export interface TrafficShape {
  id: string;
  name: string;
  blurb: string;
  /** Repeat every this many virtual minutes. Omitted: plays once and holds the last value. */
  cycle?: number;
  profile: { t: number; mult: number }[];
}

const hours = (pts: [number, number][]) => pts.map(([h, mult]) => ({ t: h * 60, mult }));

export const TRAFFIC_SHAPES: TrafficShape[] = [
  {
    id: 'steady',
    name: 'Steady',
    blurb: 'Constant load. The baseline to compare everything else against.',
    profile: [{ t: 0, mult: 1 }],
  },
  {
    id: 'daily',
    name: 'Daily cycle',
    blurb:
      'A consumer app over 24 hours: a quiet night, a morning ramp, a lunchtime plateau and an evening peak. One day is 1,440 simulated minutes.',
    cycle: 1440,
    profile: hours([
      [0, 0.35],
      [4, 0.2],
      [8, 0.6],
      [12, 0.85],
      [15, 0.8],
      [20, 1],
      [22, 0.8],
      [24, 0.35],
    ]),
  },
  {
    id: 'flash-sale',
    name: 'Flash sale',
    blurb:
      'Calm, then a campaign email lands: 6× in three minutes, a plateau while the offer lasts, then a slow tail. Repeats every 90 minutes.',
    cycle: 90,
    profile: [
      { t: 0, mult: 1 },
      { t: 15, mult: 1 },
      { t: 18, mult: 6 },
      { t: 33, mult: 6 },
      { t: 45, mult: 2 },
      { t: 60, mult: 1 },
      { t: 90, mult: 1 },
    ],
  },
  {
    id: 'thundering-herd',
    name: 'Thundering herd',
    blurb:
      'A cache expires or a service comes back and every waiting client retries at once: 8× for about two minutes. Repeats every 45 minutes.',
    cycle: 45,
    profile: [
      { t: 0, mult: 1 },
      { t: 15, mult: 1 },
      { t: 15.5, mult: 8 },
      { t: 17.5, mult: 8 },
      { t: 18, mult: 1.5 },
      { t: 30, mult: 1 },
      { t: 45, mult: 1 },
    ],
  },
  {
    id: 'batch',
    name: 'Batch job sawtooth',
    blurb:
      'A cron job or report that ramps up for ten minutes, finishes, and starts again: a steady 3× climb that drops away. Repeats every 15 minutes.',
    cycle: 15,
    profile: [
      { t: 0, mult: 1 },
      { t: 10, mult: 3 },
      { t: 11, mult: 1 },
      { t: 15, mult: 1 },
    ],
  },
  {
    id: 'viral',
    name: 'Going viral',
    blurb: 'A post takes off: slow at first, then a steep climb to 6× over about an hour, and a long fade. Repeats every 3 hours.',
    cycle: 180,
    profile: [
      { t: 0, mult: 1 },
      { t: 20, mult: 1.2 },
      { t: 40, mult: 2 },
      { t: 60, mult: 4 },
      { t: 75, mult: 6 },
      { t: 90, mult: 5 },
      { t: 120, mult: 2.5 },
      { t: 150, mult: 1.3 },
      { t: 180, mult: 1 },
    ],
  },
];

export const SHAPE_BY_ID: Record<string, TrafficShape> = Object.fromEntries(TRAFFIC_SHAPES.map((s) => [s.id, s]));

/**
 * The workload fields that set a shape. profileCycle is always written (0 = "does not repeat") rather than left out,
 * because a replayed patch only overwrites keys it contains: omitting it would leave an earlier shape's cycle behind.
 */
export function shapePatch(shape: TrafficShape): Pick<Workload, 'profile' | 'profileCycle'> {
  return { profile: shape.profile.map((p) => ({ ...p })), profileCycle: shape.cycle ?? 0 };
}

/** Which shape the workload currently follows, or undefined for a custom profile (a mission or template's own). */
export function matchShape(w: Pick<Workload, 'profile' | 'profileCycle'>): TrafficShape | undefined {
  return TRAFFIC_SHAPES.find((s) => (w.profileCycle ?? 0) === (s.cycle ?? 0) && JSON.stringify(w.profile) === JSON.stringify(s.profile));
}

export const peakMult = (shape: TrafficShape): number => Math.max(...shape.profile.map((p) => p.mult));

/** The multipliers of any workload profile (a shape's, or a scenario's own), `n` evenly spaced across one cycle or the profile's length. */
export function sampleProfile(profile: Workload['profile'], cycle: number | undefined, n = 48): number[] {
  if (!profile.length) return Array.from({ length: n }, () => 1);
  const span = cycle && cycle > 0 ? cycle : Math.max(1, profile[profile.length - 1].t);
  const w = { baseRps: 1, profile, profileCycle: cycle } as Workload;
  return Array.from({ length: n }, (_, i) => rpsAt(w, (i / (n - 1)) * span));
}

export const sampleShape = (shape: TrafficShape, n = 48): number[] => sampleProfile(shape.profile, shape.cycle, n);

/** The highest multiplier a workload's profile reaches (1 for an empty profile). */
export const profilePeak = (w: Pick<Workload, 'profile'>): number => (w.profile.length ? Math.max(...w.profile.map((p) => p.mult)) : 1);

/**
 * The same workload held at its busiest level. Comparing designs by running the first few minutes would, under a daily
 * curve, measure the quiet night and call every design fine; the question is how each one copes at the peak.
 * For a flat workload this is the workload itself.
 */
export function atPeak(w: Workload): Workload {
  const peak = profilePeak(w);
  return peak > 0 && w.profile.length ? { ...w, profile: [{ t: 0, mult: peak }], profileCycle: 0 } : w;
}
