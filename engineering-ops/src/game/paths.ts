import { LESSONS } from '@/content/academy';
import { MISSION_BY_ID } from '@/content/missions';
import type { LearningPath } from '@/content/paths';

type Done = Record<string, { passed: boolean } | undefined>;

export type StepState = 'done' | 'next' | 'open' | 'blocked';

export interface PathStep {
  missionId: string;
  title: string;
  state: StepState;
  /** Prerequisite missions outside the path that are still unmet. */
  unmet: string[];
  /** Lessons that point at this mission, worth reading before or after it. */
  lessons: { id: string; title: string }[];
}

export interface PathProgress {
  steps: PathStep[];
  done: number;
  total: number;
  pct: number;
  complete: boolean;
  /** The first unfinished mission you can start now. */
  next?: PathStep;
}

export function lessonsFor(missionId: string): { id: string; title: string }[] {
  return Object.values(LESSONS)
    .flat()
    .filter((l) => l.mission === missionId)
    .map((l) => ({ id: l.id, title: l.title }));
}

export function pathProgress(path: LearningPath, completed: Done): PathProgress {
  const passed = (id: string) => !!completed[id]?.passed;
  let nextTaken = false;
  const steps = path.missions.map((id): PathStep => {
    const m = MISSION_BY_ID[id];
    const unmet = m.prerequisites.filter((p) => !passed(p));
    let state: StepState;
    if (passed(id)) state = 'done';
    else if (unmet.length) state = 'blocked';
    else if (!nextTaken) {
      state = 'next';
      nextTaken = true;
    } else state = 'open';
    return { missionId: id, title: m.title, state, unmet, lessons: lessonsFor(id) };
  });
  const done = steps.filter((s) => s.state === 'done').length;
  return {
    steps,
    done,
    total: steps.length,
    pct: steps.length ? Math.round((done / steps.length) * 100) : 0,
    complete: steps.length > 0 && done === steps.length,
    next: steps.find((s) => s.state === 'next'),
  };
}
