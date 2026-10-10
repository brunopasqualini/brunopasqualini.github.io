import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { journeyOrder } from '@/content/journey';
import { recommend } from '@/game/recommend';
import type { DimensionId } from '@/content/missions/types';
import type { Outcome } from '@/game/scoring';

const ordered = journeyOrder(MISSIONS);

function outcome(missionId: string, o: { passed?: boolean; dims?: Partial<Record<DimensionId, number>>; failedReq?: string }): Outcome {
  const m = MISSIONS.find((x) => x.id === missionId)!;
  return {
    missionId,
    passed: o.passed ?? true,
    dims: Object.entries(m.weights).map(([id, weight]) => ({
      id: id as DimensionId,
      label: id,
      weight: weight as number,
      score: o.dims?.[id as DimensionId] ?? 90,
      note: '',
    })),
    reqs: o.failedReq ? [{ id: o.failedReq, label: `Req ${o.failedReq}`, hard: true, pass: false, detail: '', why: '' }] : [],
  } as unknown as Outcome;
}

const passedSet = (ids: string[]) => (id: string) => ids.includes(id);

describe('recommend', () => {
  it('starts a new player at the first journey mission and says why', () => {
    const r = recommend(ordered, [], passedSet([]))!;
    expect(r.mission.id).toBe(ordered[0].id);
    expect(r.kind).toBe('journey');
  });

  it('follows the journey while the player is doing well', () => {
    const r = recommend(ordered, [outcome('m1-monolith', {})], passedSet(['m1-monolith']))!;
    expect(r.kind).toBe('journey');
    expect(r.mission.id).not.toBe('m1-monolith');
  });

  it('sends a player back to a mission whose same requirement they keep missing', () => {
    const outs = [
      outcome('m2-db-meltdown', { passed: false, failedReq: 'avail' }),
      outcome('m2-db-meltdown', { passed: false, failedReq: 'avail' }),
    ];
    const r = recommend(ordered, outs, passedSet([]))!;
    expect(r.kind).toBe('retry');
    expect(r.mission.id).toBe('m2-db-meltdown');
    expect(r.reason).toContain('Req avail');
  });

  it('steers a player with weak cost results toward a mission that weights cost', () => {
    const outs = [outcome('m1-monolith', { dims: { cost: 40 } }), outcome('m7-n-plus-one', { dims: { cost: 45 } })];
    const r = recommend(ordered, outs, passedSet(['m1-monolith', 'm7-n-plus-one']))!;
    expect(r.kind).toBe('strengthen');
    expect(r.focus).toBe('cost');
    expect(r.mission.weights.cost ?? 0).toBeGreaterThan(0);
  });

  it('ignores an old failure once the mission is passed', () => {
    const outs = [
      outcome('m1-monolith', { passed: false, failedReq: 'x' }),
      outcome('m1-monolith', { passed: false, failedReq: 'x' }),
      outcome('m1-monolith', {}),
    ];
    expect(recommend(ordered, outs, passedSet(['m1-monolith']))!.kind).not.toBe('retry');
  });

  it('returns nothing when every mission is passed and nothing is weak', () => {
    const ids = ordered.map((m) => m.id);
    expect(
      recommend(
        ordered,
        ids.map((id) => outcome(id, {})),
        passedSet(ids),
      ),
    ).toBeUndefined();
  });
});
