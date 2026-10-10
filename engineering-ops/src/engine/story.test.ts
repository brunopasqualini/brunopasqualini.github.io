import { describe, expect, it } from 'vitest';
import { SECURITY_PENALTY, securityBreakdown } from '@/engine/analysis';
import { securityFindings } from '@/engine/net';
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

describe('security score explanation', () => {
  it('accounts for every point the score lost', () => {
    const s = createSession('m4-network', 'beginner');
    advance(s, 3, false);
    const b = securityBreakdown(securityFindings(s.live));
    const lost = b.items.reduce((t, i) => t + SECURITY_PENALTY[i.finding.severity], 0);
    expect(b.score).toBe(Math.max(0, 100 - lost));
    expect(b.items.length).toBeGreaterThan(0);
    expect(b.items[0].points).toBeGreaterThanOrEqual(b.items[b.items.length - 1].points);
    for (const i of b.items) expect(i.finding.fix.length).toBeGreaterThan(0);
  });
});
