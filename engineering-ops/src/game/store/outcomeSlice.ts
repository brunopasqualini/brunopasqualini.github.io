import type { Report } from '@/engine/analysis';
import { MISSION_BY_ID } from '@/content/missions';
import type { SkillId } from '@/content/missions/types';
import { ACHIEVEMENTS, levelFromXp } from '@/game/progression';
import type { Outcome } from '@/game/scoring';
import { LAB_ID, verify } from '@/game/session';
import { persistence } from './persistence';
import type { Progress, Slice } from './types';

export interface OutcomeSlice {
  debrief: { outcome: Outcome; report: Report; firstTime: boolean } | null;
  submit: () => void;
  closeDebrief: () => void;
}

export const createOutcomeSlice: Slice<OutcomeSlice> = (set, get) => {
  const { persistSession } = persistence(set, get);
  return {
    debrief: null,

    submit: () => {
      const { session, progress } = get();
      if (!session || session.missionId === LAB_ID) return;
      const m = MISSION_BY_ID[session.missionId];
      const firstTime = !progress.completed[m.id]?.passed;
      set({ view: { owner: null, minute: null } });
      const { outcome, report } = verify(session, firstTime);
      const prevLevel = levelFromXp(progress.xp);
      const next: Progress = {
        ...progress,
        outcomes: [...progress.outcomes, outcome],
        attempts: { ...progress.attempts, [m.id]: session.attempt },
        skillXp: { ...progress.skillXp },
        evidence: { ...progress.evidence },
        achievements: { ...progress.achievements },
      };
      if (outcome.passed) {
        const best = progress.completed[m.id];
        if (!best || outcome.overall > best.overall) next.completed = { ...progress.completed, [m.id]: outcome };
        else next.completed = progress.completed;
        next.xp = progress.xp + outcome.xp;
        for (const [k, v] of Object.entries(outcome.skillXp)) {
          const sk = k as SkillId;
          next.skillXp[sk] = (progress.skillXp[sk] ?? 0) + (v ?? 0);
          next.evidence[sk] = [
            ...(progress.evidence[sk] ?? []),
            {
              missionId: m.id,
              title: m.title,
              overall: outcome.overall,
              at: Date.now(),
              note: `${outcome.grade} (${outcome.overall}/100) — ${outcome.reqs.filter((r) => r.pass).length}/${outcome.reqs.length} requirements met`,
            },
          ];
        }
      } else {
        next.stats = { ...progress.stats, failedAttempts: progress.stats.failedAttempts + 1 };
        next.xp = progress.xp + outcome.xp;
      }
      for (const a of session.adrs)
        if (!next.adrs.some((x) => x.id === a.id)) next.adrs = [...next.adrs, { ...a, missionId: m.id, at: Date.now() }];
      if (session.postmortem)
        next.postmortems = [
          ...next.postmortems.filter(
            (p) => !(p.missionId === m.id && p.at === (progress.postmortems.find((q) => q.missionId === m.id)?.at ?? -1)),
          ),
          { missionId: m.id, at: Date.now(), pm: session.postmortem },
        ];
      next.lessons = [...next.lessons, { missionId: m.id, at: Date.now(), text: m.debrief.rootCause }];
      if (session.postmortem?.worsened.trim())
        next.lessons = [...next.lessons, { missionId: m.id, at: Date.now(), text: `Made it worse: ${session.postmortem.worsened.trim()}` }];
      const adrCount = next.adrs.length;
      for (const a of ACHIEVEMENTS) {
        if (!next.achievements[a.id] && a.test(outcome, { completed: next.completed, adrCount, stats: next.stats })) {
          next.achievements[a.id] = Date.now();
          get().toast(`Achievement unlocked: ${a.title}`, 'good');
        }
      }
      const newLevel = levelFromXp(next.xp);
      if (newLevel > prevLevel) get().toast(`Level up! You are now level ${newLevel}.`, 'good');
      set({ progress: next, debrief: { outcome, report, firstTime }, running: false });
      persistSession();
    },
    closeDebrief: () => set({ debrief: null }),
  };
};
