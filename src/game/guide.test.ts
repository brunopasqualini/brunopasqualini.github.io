import { describe, expect, it } from 'vitest';
import { MISSION_BY_ID } from '@/content/missions';
import { guideSteps, isFirstRun } from '@/game/guide';
import { advance, applyAction, createSession, deployDraft } from '@/game/session';

const m2 = MISSION_BY_ID['m2-db-meltdown'];
const current = (steps: ReturnType<typeof guideSteps>) => steps.find((s) => !s.done)?.id;

describe('first-run guide', () => {
  it('walks the loop in order and ticks itself from what the player does', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    expect(current(guideSteps(s, m2))).toBe('investigate');
    s.panelsSeen = ['database', 'metrics'];
    expect(current(guideSteps(s, m2))).toBe('hypothesis');
    s.chosenCauses = ['unindexed'];
    expect(current(guideSteps(s, m2))).toBe('change');
    applyAction(s, 'add-index');
    s.draft.nodes.find((n) => n.id === 'db')!.config.connectionPooler = true;
    deployDraft(s);
    expect(current(guideSteps(s, m2))).toBe('observe');
    advance(s, 6);
    expect(current(guideSteps(s, m2))).toBe('verify');
  });

  it('points at the first evidence panel the player has not opened', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    const step = guideSteps(s, m2)[0];
    expect(step.panel).toBe(m2.rootCauses.find((c) => c.correct)!.evidencePanels[0]);
  });

  it('gives every first-journey mission a concrete first move that names a real action', () => {
    for (const id of ['m2-db-meltdown', 'm7-n-plus-one', 'm8-impatient-client']) {
      const m = MISSION_BY_ID[id];
      expect(m.firstMove, id).toBeTruthy();
      const labels = m.actions.map((a) => a.label.split(' ').slice(0, 2).join(' ').toLowerCase());
      expect(
        labels.some((l) => m.firstMove!.toLowerCase().includes(l.replace(/[^a-z ]/g, ''))),
        id,
      ).toBe(true);
    }
  });

  it('only guides a brand-new beginner', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    expect(isFirstRun(s, 0, 0)).toBe(true);
    expect(isFirstRun(s, 1, 1)).toBe(false);
    expect(isFirstRun({ mode: 'advanced' }, 0, 0)).toBe(false);
  });
});
