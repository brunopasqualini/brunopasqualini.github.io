import { describe, expect, it } from 'vitest';
import { LESSONS } from '@/content/academy';
import { MISSION_BY_ID } from '@/content/missions';
import { PATHS } from '@/content/paths';
import { TEMPLATES } from '@/content/templates';
import { SKILLS } from '@/game/progression';
import { lessonsFor, pathProgress } from '@/game/paths';

const passed = (...ids: string[]) => Object.fromEntries(ids.map((i) => [i, { passed: true }]));

describe('path definitions', () => {
  it('only reference real missions, templates and skills', () => {
    const skills = SKILLS.map((s) => s.id);
    for (const p of PATHS) {
      for (const m of p.missions) expect(MISSION_BY_ID[m], `${p.id}: ${m}`).toBeTruthy();
      for (const d of p.drills) expect(TEMPLATES.some((t) => t.id === d), `${p.id}: ${d}`).toBe(true);
      for (const s of p.skills) expect(skills).toContain(s);
      expect(new Set(p.missions).size).toBe(p.missions.length);
    }
  });

  it('list every prerequisite before the mission that needs it', () => {
    for (const p of PATHS) {
      p.missions.forEach((id, i) => {
        for (const pre of MISSION_BY_ID[id].prerequisites) {
          expect(p.missions.indexOf(pre), `${p.id}: ${id} needs ${pre} first`).toBeGreaterThanOrEqual(0);
          expect(p.missions.indexOf(pre)).toBeLessThan(i);
        }
      });
    }
  });

  it('are distinct routes with a clear audience', () => {
    expect(new Set(PATHS.map((p) => p.id)).size).toBe(PATHS.length);
    for (const p of PATHS) {
      expect(p.who.length).toBeGreaterThan(20);
      expect(p.outcome.length).toBeGreaterThan(20);
    }
  });
});

describe('pathProgress', () => {
  const sre = PATHS.find((p) => p.id === 'sre')!;

  it('starts at the first mission', () => {
    const r = pathProgress(sre, {});
    expect(r.done).toBe(0);
    expect(r.pct).toBe(0);
    expect(r.next?.missionId).toBe(sre.missions[0]);
    expect(r.steps.filter((s) => s.state === 'next')).toHaveLength(1);
  });

  it('moves the next step forward as missions are passed', () => {
    const r = pathProgress(sre, passed('m2-db-meltdown'));
    expect(r.done).toBe(1);
    expect(r.next?.missionId).toBe('m8-impatient-client');
    expect(r.pct).toBe(Math.round((1 / sre.missions.length) * 100));
  });

  it('marks steps blocked until their prerequisites are passed, and skips them for next', () => {
    const r = pathProgress(sre, passed('m2-db-meltdown', 'm8-impatient-client'));
    // m1 has no prerequisites and is next; m3 needs m1
    expect(r.next?.missionId).toBe('m1-monolith');
    const m3 = r.steps.find((s) => s.missionId === 'm3-deployment')!;
    expect(m3.state).toBe('blocked');
    expect(m3.unmet).toEqual(['m1-monolith']);
  });

  it('an attempted but failed mission is not done', () => {
    const r = pathProgress(sre, { 'm2-db-meltdown': { passed: false } });
    expect(r.done).toBe(0);
    expect(r.next?.missionId).toBe('m2-db-meltdown');
  });

  it('reports completion', () => {
    const r = pathProgress(sre, passed(...sre.missions));
    expect(r.complete).toBe(true);
    expect(r.pct).toBe(100);
    expect(r.next).toBeUndefined();
  });
});

describe('lessonsFor', () => {
  it('finds lessons that point at a mission', () => {
    const all = Object.values(LESSONS).flat();
    const target = all.find((l) => l.mission)!;
    expect(lessonsFor(target.mission!).some((l) => l.id === target.id)).toBe(true);
    expect(lessonsFor('no-such-mission')).toEqual([]);
  });
});
