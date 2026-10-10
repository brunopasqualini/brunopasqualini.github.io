import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { CLARITY_LABEL, DIFFICULTY_LABEL, find, type Clarity, type Difficulty, type Feedback } from '@/game/feedback';
import { useFeedback } from '@/game/feedbackStore';
import type { Mode } from '@/game/session';
import { SIM_VERSION } from '@/game/simVersion';

/** The slice of a mission result the feedback is recorded against. */
export interface FeedbackContext {
  missionId: string;
  attempt: number;
  mode: Mode;
  passed: boolean;
  overall: number;
  hintsUsed: number;
  minutes: number;
}

/**
 * Two quick questions after a mission, and an optional note. Each answer saves straight away, on this device only.
 * This is the evidence for deciding which missions to rework, so it asks for the least effort that is still useful.
 */
export function FeedbackCard({ ctx }: { ctx: FeedbackContext }) {
  const entries = useFeedback((s) => s.entries);
  const save = useFeedback((s) => s.save);
  const current = find(entries, ctx.missionId, ctx.attempt);
  const [note, setNote] = useState(current?.note ?? '');

  const write = (patch: Partial<Feedback>) => save({ ...ctx, simVersion: SIM_VERSION, ...current, ...patch });
  const answered = !!(current?.difficulty || current?.clarity);

  return (
    <section className="feedback-card" aria-label="Feedback on this mission">
      <h4>
        <MessageSquare size={14} /> How was this mission?
      </h4>
      <div className="fb-row" role="group" aria-label="How hard was it?">
        <span className="fb-q">Difficulty</span>
        {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
          <button
            key={d}
            className={`chip-btn ${current?.difficulty === d ? 'on' : ''}`}
            aria-pressed={current?.difficulty === d}
            onClick={() => write({ difficulty: d })}
          >
            {DIFFICULTY_LABEL[d]}
          </button>
        ))}
      </div>
      <div className="fb-row" role="group" aria-label="Was the brief clear?">
        <span className="fb-q">The brief</span>
        {(Object.keys(CLARITY_LABEL) as Clarity[]).map((c) => (
          <button
            key={c}
            className={`chip-btn ${current?.clarity === c ? 'on' : ''}`}
            aria-pressed={current?.clarity === c}
            onClick={() => write({ clarity: c })}
          >
            {CLARITY_LABEL[c]}
          </button>
        ))}
      </div>
      {answered && (
        <label className="fb-note">
          <span className="sr-only">Anything we should change? (optional)</span>
          <textarea
            value={note}
            maxLength={500}
            rows={2}
            placeholder="Anything unclear or too hard? (optional)"
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => note !== (current?.note ?? '') && write({ note })}
          />
        </label>
      )}
      <p className="muted tiny" role="status">
        {answered
          ? 'Saved on this device. Find your feedback in Settings.'
          : 'Optional. Stays on this device unless you choose to share it.'}
      </p>
    </section>
  );
}
