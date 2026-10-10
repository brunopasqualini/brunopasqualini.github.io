import type { ADR, Decision, Postmortem } from '@/content/missions/types';

export interface DecisionContext {
  adrs: ADR[];
  postmortem?: Postmortem;
  /** The player opened the evidence that showed the problem before choosing. */
  informed: boolean;
}

/** Suffix added to an inherited tag when a shortcut was taken knowingly and written down. */
export const DOCUMENTED = '#documented';

const substantial = (s: string | undefined) => (s ?? '').trim().length >= 40;

/** A reason was written down: an ADR that states its trade-offs, or a postmortem that says what to prevent. */
export function isDocumented(ctx: Pick<DecisionContext, 'adrs' | 'postmortem'>): boolean {
  return ctx.adrs.some((a) => substantial(a.cons) && substantial(a.decision)) || substantial(ctx.postmortem?.prevent);
}

/**
 * The same shortcut can be a sensible bet or plain debt, depending on what the player knew and whether they said so.
 * A shortcut taken with the evidence in hand and the reason written down is a justified trade-off: a known cost with an
 * owner. Taken blind, or with nothing written down, it is debt. Non-shortcut decisions keep the kind their author gave.
 */
export function resolveDecisions(raw: Decision[], ctx: DecisionContext): Decision[] {
  const documented = isDocumented(ctx);
  return raw.map((d) => {
    if (!d.shortcut) {
      const kind = d.kind ?? 'investment';
      return {
        ...d,
        kind,
        judgement:
          d.judgement ??
          (kind === 'investment'
            ? 'A sound investment: it removes the cause and keeps paying off.'
            : 'A reasonable trade-off: it has a real cost, but the choice is valid. Revisit it when the situation changes.'),
      };
    }
    if (documented && ctx.informed)
      return {
        ...d,
        kind: 'tradeoff',
        judgement:
          'A justified trade-off: you looked at the evidence and wrote the cost down, so this is a known cost with a reason, not a surprise. Choosing a shortcut deliberately is a legitimate engineering call.',
      };
    const missing = [!ctx.informed && 'you did not check the evidence first', !documented && 'no reason was written down'].filter(Boolean);
    return {
      ...d,
      kind: 'debt',
      judgement: `Technical debt: ${missing.join(' and ')}. The same choice, made knowingly and recorded in an ADR or postmortem, would count as a trade-off instead.`,
    };
  });
}

/** Tags a run hands to later missions: each decision, plus a marker when a shortcut was a documented trade-off. */
export function tagsFor(decisions: Decision[]): string[] {
  return decisions.flatMap((d) => (d.shortcut && d.kind === 'tradeoff' ? [d.tag, d.tag + DOCUMENTED] : [d.tag]));
}
