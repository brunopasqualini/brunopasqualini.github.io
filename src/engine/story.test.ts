import { describe, expect, it } from 'vitest';
import { advance, createSession, deployDraft } from '@/game/session';

describe('change story', () => {
  it('explains a fix as action, effect, trade-off, evidence and a next step', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    advance(s, 8, false);
    s.draft.nodes.find((n) => n.id === 'db')!.config.indexed = true;
    expect(deployDraft(s).ok).toBe(true);
    advance(s, 6, false);
    const story = s.explain!.story;
    expect(story.action.some((a) => /indexed/.test(a))).toBe(true);
    expect(story.immediate.length + story.propagation.length).toBe(s.explain!.changes.length);
    expect(story.tradeoff.gained.length).toBeGreaterThan(0);
    expect(story.evidence.length).toBeGreaterThan(0);
    expect(story.next.text.length).toBeGreaterThan(10);
  });

  it('flags a harmful change as a trade-off and points at where to look', () => {
    const s = createSession('m2-db-meltdown', 'beginner');
    advance(s, 8, false);
    s.draft.nodes.find((n) => n.id === 'api')!.config.replicas = 12;
    expect(deployDraft(s).ok).toBe(true);
    advance(s, 6, false);
    const story = s.explain!.story;
    expect(story.tradeoff.lost.length).toBeGreaterThan(0);
    expect(story.next.panel).toBeDefined();
  });
});
