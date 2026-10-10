import { describe, expect, it } from 'vitest';
import { MISSION_BY_ID } from '@/content/missions';
import { assessHypothesis, evidenceProgress } from '@/game/diagnosis';

const causes = MISSION_BY_ID['m2-db-meltdown'].rootCauses;
const real = causes.find((c) => c.correct)!;
const herring = causes.find((c) => !c.correct)!;

describe('hypothesis review', () => {
  it('separates a supported conclusion from a lucky guess', () => {
    const informed = assessHypothesis(causes, [real.id], real.evidencePanels)[0];
    expect(informed.verdict).toBe('supported');
    const guess = assessHypothesis(causes, [real.id], [])[0];
    expect(guess.verdict).toBe('unverified');
    expect(guess.missing).toEqual(real.evidencePanels);
    expect(guess.message).toMatch(/guess/);
  });

  it('names the evidence that would have ruled out a wrong hypothesis', () => {
    const r = assessHypothesis(causes, [herring.id], []).find((x) => x.id === herring.id)!;
    expect(r.verdict).toBe('refuted');
    expect(r.message).toContain(herring.evidencePanels[0]);
  });

  it('reports the real cause as missed when it was not chosen, and stays silent on unchosen red herrings', () => {
    const r = assessHypothesis(causes, [], []);
    expect(r.map((x) => x.verdict)).toEqual(['missed']);
  });

  it('shows evidence progress without revealing correctness', () => {
    expect(evidenceProgress(herring, [])).toEqual({ seen: 0, total: herring.evidencePanels.length });
    expect(evidenceProgress(real, real.evidencePanels).seen).toBe(real.evidencePanels.length);
  });
});
