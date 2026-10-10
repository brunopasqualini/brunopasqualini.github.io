import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { currentStage, JOURNEY, stageProgress } from '@/content/journey';

describe('journey', () => {
  it('maps every campaign mission to exactly one stage', () => {
    const mapped = JOURNEY.flatMap((s) => s.missionIds);
    expect(new Set(mapped).size).toBe(mapped.length);
    for (const m of MISSIONS) expect(mapped, m.id).toContain(m.id);
    for (const id of mapped)
      expect(
        MISSIONS.some((m) => m.id === id),
        id,
      ).toBe(true);
  });

  it('starts at level 1 and advances only when every mission of a stage is passed', () => {
    expect(currentStage({}).level).toBe(1);
    expect(currentStage({ 'm1-monolith': { passed: true } }).level).toBe(1);
    const stage1 = Object.fromEntries(JOURNEY[0].missionIds.map((id) => [id, { passed: true }]));
    expect(currentStage(stage1).level).toBe(2);
    const all = Object.fromEntries(MISSIONS.map((m) => [m.id, { passed: true }]));
    // everything playable is done: the player stays at the last stage that has missions
    const lastPlayable = [...JOURNEY].reverse().find((s) => s.missionIds.length > 0)!;
    expect(currentStage(all).level).toBe(lastPlayable.level);
  });

  it('reports stages without scenarios as coming soon rather than empty progress', () => {
    const sp = stageProgress({});
    expect(sp.find((s) => s.stage.level === 5)?.comingSoon).toBe(true);
    expect(sp.find((s) => s.stage.level === 2)).toMatchObject({ done: 0, total: 2, complete: false });
  });
});
