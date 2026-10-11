import type { Mode } from '@/game/session';

/**
 * Local feedback about missions: how hard it felt, whether the brief was clear, a free-text note.
 * It is the evidence for deciding what to change next, so it stays on this device: nothing is sent anywhere.
 * To share it, the person exports it or opens a pre-filled GitHub issue and chooses what to send.
 * Pure functions only; persistence lives in game/feedbackStore.
 */
export type Difficulty = 'too-easy' | 'about-right' | 'too-hard';
export type Clarity = 'clear' | 'unclear';

export interface Feedback {
  missionId: string;
  attempt: number;
  at: number;
  mode: Mode;
  /** What happened on this attempt, so a "too hard" can be read next to the result that produced it. */
  passed: boolean;
  overall: number;
  hintsUsed: number;
  minutes: number;
  difficulty?: Difficulty;
  clarity?: Clarity;
  note?: string;
  /** Simulation version in force, so old responses are not mistaken for ones about today's model. */
  simVersion: number;
}

export const FEEDBACK_CAP = 200;
export const NOTE_MAX = 500;
export const FEEDBACK_REPO = 'https://github.com/brunopasqualini/brunopasqualini.github.io';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  'too-easy': 'Too easy',
  'about-right': 'About right',
  'too-hard': 'Too hard',
};
export const CLARITY_LABEL: Record<Clarity, string> = { clear: 'Clear', unclear: 'Confusing' };

const sameAttempt = (a: Feedback, b: Feedback) => a.missionId === b.missionId && a.attempt === b.attempt;

export const cleanNote = (n: string | undefined): string | undefined => {
  const t = (n ?? '').replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX);
  return t || undefined;
};

/** One response per mission attempt: answering again updates it. Oldest entries fall off past the cap. */
export function upsert(list: readonly Feedback[], entry: Feedback): Feedback[] {
  const next = { ...entry, note: cleanNote(entry.note) };
  const i = list.findIndex((x) => sameAttempt(x, next));
  const out = i >= 0 ? list.map((x, j) => (j === i ? next : x)) : [...list, next];
  return out.slice(-FEEDBACK_CAP);
}

export function find(list: readonly Feedback[], missionId: string, attempt: number): Feedback | undefined {
  return list.find((x) => x.missionId === missionId && x.attempt === attempt);
}

export interface MissionSummary {
  missionId: string;
  responses: number;
  tooEasy: number;
  aboutRight: number;
  tooHard: number;
  unclear: number;
  passed: number;
}

/** Per-mission tallies, most "too hard" and "confusing" first: where the app most needs attention. */
export function summarize(list: readonly Feedback[]): MissionSummary[] {
  const by = new Map<string, MissionSummary>();
  for (const f of list) {
    const s = by.get(f.missionId) ?? { missionId: f.missionId, responses: 0, tooEasy: 0, aboutRight: 0, tooHard: 0, unclear: 0, passed: 0 };
    s.responses += 1;
    if (f.difficulty === 'too-easy') s.tooEasy += 1;
    if (f.difficulty === 'about-right') s.aboutRight += 1;
    if (f.difficulty === 'too-hard') s.tooHard += 1;
    if (f.clarity === 'unclear') s.unclear += 1;
    if (f.passed) s.passed += 1;
    by.set(f.missionId, s);
  }
  return [...by.values()].sort((a, b) => b.tooHard + b.unclear - (a.tooHard + a.unclear) || a.missionId.localeCompare(b.missionId));
}

export const exportJson = (list: readonly Feedback[]): string => JSON.stringify({ v: 1, exportedAt: Date.now(), feedback: list }, null, 2);

/** Compact text for pasting into an issue or a message. */
export function toText(list: readonly Feedback[], limit = 20): string {
  const rows = list.slice(-limit).map((f) => {
    const bits = [
      f.difficulty ? DIFFICULTY_LABEL[f.difficulty] : undefined,
      f.clarity ? CLARITY_LABEL[f.clarity] : undefined,
      f.passed ? 'passed' : 'not passed',
      `score ${f.overall}`,
      `${f.hintsUsed} hint${f.hintsUsed === 1 ? '' : 's'}`,
      `${f.minutes} min`,
    ].filter(Boolean);
    return `- ${f.missionId} (attempt ${f.attempt}, ${f.mode}): ${bits.join(', ')}${f.note ? `\n  "${f.note}"` : ''}`;
  });
  return rows.length ? `Mission feedback (${rows.length} of ${list.length}):\n\n${rows.join('\n')}` : 'No feedback recorded yet.';
}

/** A GitHub "new issue" link with the summary filled in. The person reviews and submits it; nothing is sent automatically. */
export function issueUrl(list: readonly Feedback[], repo = FEEDBACK_REPO): string {
  const body = `${toText(list)}\n\n_Sent from Engineering Ops. Edit or delete anything above before submitting._`;
  // browsers and GitHub both cap URL length; keep well inside it
  const trimmed = body.length > 5000 ? `${body.slice(0, 5000)}\n…` : body;
  return `${repo}/issues/new?title=${encodeURIComponent('Engineering Ops feedback')}&body=${encodeURIComponent(trimmed)}`;
}
