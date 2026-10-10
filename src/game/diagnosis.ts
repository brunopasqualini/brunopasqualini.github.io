import type { RootCause } from '@/content/missions/types';

export type Verdict = 'supported' | 'unverified' | 'refuted' | 'missed';

export interface HypothesisReview {
  id: string;
  label: string;
  verdict: Verdict;
  /** Evidence panels the player opened / never opened for this cause. */
  consulted: string[];
  missing: string[];
  /** One sentence the player reads: what their reasoning did or did not establish. */
  message: string;
}

/** Evidence progress for a hypothesis the player has chosen, without revealing whether it is right. */
export function evidenceProgress(cause: RootCause, panelsSeen: string[]): { seen: number; total: number } {
  return { seen: cause.evidencePanels.filter((p) => panelsSeen.includes(p)).length, total: cause.evidencePanels.length };
}

/**
 * Judge the player's reasoning, not only their answer: a correct conclusion reached without looking at the evidence is
 * a guess that landed, and a wrong one is only a mistake if the evidence was available and ignored.
 * Pure: depends on the mission's causes, what was chosen and which panels were opened.
 */
export function assessHypothesis(causes: RootCause[], chosen: string[], panelsSeen: string[]): HypothesisReview[] {
  const out: HypothesisReview[] = [];
  for (const c of causes) {
    const picked = chosen.includes(c.id);
    const consulted = c.evidencePanels.filter((p) => panelsSeen.includes(p));
    const missing = c.evidencePanels.filter((p) => !panelsSeen.includes(p));
    if (picked && c.correct) {
      out.push(
        missing.length === 0
          ? {
              id: c.id,
              label: c.label,
              verdict: 'supported',
              consulted,
              missing,
              message: 'Correct, and you checked the evidence that shows it.',
            }
          : {
              id: c.id,
              label: c.label,
              verdict: 'unverified',
              consulted,
              missing,
              message: `Correct, but you never opened ${list(missing)}. In production that is a guess that happened to land; the evidence would have confirmed it.`,
            },
      );
    } else if (picked && !c.correct) {
      out.push({
        id: c.id,
        label: c.label,
        verdict: 'refuted',
        consulted,
        missing,
        message: missing.length
          ? `Not the cause. ${list(missing)} would have ruled it out. ${c.why}`
          : `Not the cause, even though you looked at the evidence. Re-read it with this in mind: ${c.why}`,
      });
    } else if (!picked && c.correct) {
      out.push({
        id: c.id,
        label: c.label,
        verdict: 'missed',
        consulted,
        missing,
        message: missing.length
          ? `The actual cause, and you did not open ${list(missing)}, where it is visible.`
          : 'The actual cause. You had seen the evidence but did not conclude it; compare what you read with what it implies.',
      });
    }
  }
  return out;
}

const list = (xs: string[]) => xs.join(', ');
