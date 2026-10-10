import type { DimensionId, Mission } from '@/content/missions/types';
import { DIMENSIONS, type Outcome } from '@/game/scoring';

export interface Recommendation {
  mission: Mission;
  /** journey: the next step; strengthen: a weak area; retry: the same mistake keeps happening. */
  kind: 'journey' | 'strengthen' | 'retry';
  reason: string;
  focus?: DimensionId;
}

const label = (id: DimensionId) => DIMENSIONS.find((d) => d.id === id)?.label ?? id;

/** Latest outcome per mission: what the player currently demonstrates, not what they once scored. */
function latestPerMission(outcomes: Outcome[]): Outcome[] {
  const by = new Map<string, Outcome>();
  for (const o of outcomes) by.set(o.missionId, o);
  return [...by.values()];
}

/**
 * Recommend the next mission from what the player has shown, not from completion alone: a requirement missed again and
 * again, then a weak scoring dimension, then the next step of the journey. `ordered` is the missions in journey order.
 * Pure.
 */
export function recommend(ordered: Mission[], outcomes: Outcome[], passed: (missionId: string) => boolean): Recommendation | undefined {
  const open = ordered.filter((m) => !passed(m.id));
  const available = open.filter((m) => m.prerequisites.every(passed));
  const byId = new Map(ordered.map((m) => [m.id, m]));

  // 1. The same hard requirement missed in several attempts of a mission that is still not passed.
  let worst: { mission: Mission; req: string; n: number } | undefined;
  for (const m of open) {
    const tries = outcomes.filter((o) => o.missionId === m.id);
    const misses = new Map<string, { label: string; n: number }>();
    for (const o of tries)
      for (const r of o.reqs) if (r.hard && !r.pass) misses.set(r.id, { label: r.label, n: (misses.get(r.id)?.n ?? 0) + 1 });
    for (const x of misses.values()) if (x.n >= 2 && (!worst || x.n > worst.n)) worst = { mission: m, req: x.label, n: x.n };
  }
  if (worst)
    return {
      mission: worst.mission,
      kind: 'retry',
      reason: `You have missed “${worst.req}” in ${worst.n} attempts at this mission. Go back to the evidence first, then change a different lever.`,
    };

  // 2. A scoring dimension that stays weak across the missions the player has passed.
  const samples = new Map<DimensionId, number[]>();
  for (const o of latestPerMission(outcomes).filter((x) => x.passed))
    for (const d of o.dims) if (d.weight > 0 && d.score != null) samples.set(d.id, [...(samples.get(d.id) ?? []), d.score]);
  const weak = [...samples.entries()]
    .map(([id, xs]) => ({ id, n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length }))
    .filter((w) => (w.n >= 2 && w.mean < 70) || w.mean < 50)
    .sort((a, b) => a.mean - b.mean)[0];
  if (weak) {
    const target = [...available].sort((a, b) => (b.weights[weak.id] ?? 0) - (a.weights[weak.id] ?? 0))[0];
    if (target && (target.weights[weak.id] ?? 0) > 0)
      return {
        mission: target,
        kind: 'strengthen',
        focus: weak.id,
        reason: `Your ${label(weak.id)} has averaged ${Math.round(weak.mean)} across ${weak.n} passed mission${weak.n > 1 ? 's' : ''}. This one weights it ×${target.weights[weak.id]}, so it is the best place to improve.`,
      };
    const replay = latestPerMission(outcomes)
      .filter((o) => o.passed)
      .map((o) => ({ o, w: byId.get(o.missionId)?.weights[weak.id] ?? 0, s: o.dims.find((d) => d.id === weak.id)?.score ?? 100 }))
      .filter((x) => x.w > 0 && x.s < 70)
      .sort((a, b) => a.s - b.s)[0];
    if (replay && byId.get(replay.o.missionId))
      return {
        mission: byId.get(replay.o.missionId)!,
        kind: 'strengthen',
        focus: weak.id,
        reason: `Your ${label(weak.id)} was ${replay.s} here and averages ${Math.round(weak.mean)} overall. Replaying it with a different approach is the quickest way to raise it.`,
      };
  }

  // 3. The next step of the journey.
  const next = available[0] ?? open[0];
  if (!next) return undefined;
  return {
    mission: next,
    kind: 'journey',
    reason: outcomes.length ? 'Next step on your journey.' : 'Start here: it introduces the ideas the later missions build on.',
  };
}
