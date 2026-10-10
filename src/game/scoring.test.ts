import { describe, expect, it } from 'vitest';
import { m2 } from '@/content/missions/m2-db-meltdown';
import { m1 } from '@/content/missions/m1-monolith';
import { adrQuality, postmortemQuality, textDepth } from '@/game/scoring';
import { ACHIEVEMENTS, levelFromXp, skillLevel, xpForLevel } from '@/game/progression';
import { advance, applyAction, createSession, deployDraft, verify } from '@/game/session';

describe('rationale scoring rewards reasoning, not length', () => {
  it('scores empty text as zero and trade-off reasoning higher than filler', () => {
    expect(textDepth('')).toBe(0);
    const filler = 'a '.repeat(80);
    const reasoned =
      'We chose option B because the alternative adds operational complexity and risk; the trade-off is higher cost but better reliability.';
    expect(textDepth(reasoned)).toBeGreaterThan(textDepth(filler));
  });
  it('scores a complete ADR above a sparse one', () => {
    const full = {
      id: '1',
      title: 't',
      minute: 0,
      context: 'Three squads share one deployable and collide on every release because of weak boundaries.',
      problem: 'Change failure rate is high and review queues are slow, creating risk.',
      options: 'Modular monolith, extract a service, or full microservices as alternatives.',
      decision: 'Enforce module boundaries because it reduces coupling at low operational cost.',
      pros: 'Lower coupling and faster tests because modules only use public interfaces.',
      cons: 'One deployable remains a shared failure domain; we accept the trade-off.',
      implications: 'Security unchanged, reliability stable, cost flat, operational complexity low.',
    };
    const sparse = { ...full, context: 'x', problem: '', options: '', pros: '', cons: '', implications: '' };
    expect(adrQuality(full)).toBeGreaterThan(70);
    expect(adrQuality(sparse)).toBeLessThan(35);
    expect(postmortemQuality({ what: '', impact: '', evidence: '', restored: '', worsened: '', prevent: '' })).toBe(0);
  });
});

describe('mission scoring', () => {
  const solve = (hints = 0, causes = ['unindexed'], panels = ['database', 'metrics', 'deployments']) => {
    const s = createSession('m2-db-meltdown', 'intermediate');
    applyAction(s, 'add-index');
    s.draft.nodes.find((n) => n.id === 'db')!.config.connectionPooler = true;
    deployDraft(s);
    advance(s, 4);
    s.postmortem = {
      what: 'An unindexed query saturated the database because the release shipped untested.',
      impact: 'Most checkouts failed for about twenty minutes during the sale.',
      evidence: 'Query statistics showed Seq Scan and the deploy timeline named v3.8.0.',
      restored: 'Created the index and added a connection pooler to reduce risk.',
      worsened: 'Scaling the application tier would have exhausted connections.',
      prevent: 'Alert on database CPU, test query plans in review, and load test before sales.',
    };
    s.hintsUsed = hints;
    s.chosenCauses = causes;
    s.panelsSeen = panels;
    return s;
  };
  it('passes with all hard requirements met and reports per-dimension scores', () => {
    const v = verify(solve(), true);
    expect(v.outcome.passed).toBe(true);
    expect(v.outcome.grade).toMatch(/[SAB]/);
    for (const d of v.outcome.dims.filter((x) => m2.weights[x.id])) expect(d.score).not.toBeNull();
    expect(v.outcome.xp).toBeGreaterThan(100);
  });
  it('diagnosis quality reflects hypothesis accuracy, evidence consulted and hints', () => {
    const good = verify(solve(), true).outcome.dims.find((d) => d.id === 'diagnosis')!.score!;
    const wrong = verify(solve(0, ['network', 'attack'], []), true).outcome.dims.find((d) => d.id === 'diagnosis')!.score!;
    const hinted = verify(solve(3), true).outcome.dims.find((d) => d.id === 'diagnosis')!.score!;
    expect(good).toBeGreaterThan(85);
    expect(wrong).toBeLessThan(25);
    expect(hinted).toBeLessThan(good);
  });
  it('repeat completions earn reduced XP', () => {
    const first = verify(solve(), true).outcome.xp;
    const repeat = verify(solve(), false).outcome.xp;
    expect(repeat).toBeLessThan(first * 0.5);
  });
  it('a missing postmortem fails a hard requirement even when service is restored', () => {
    const s = solve();
    s.postmortem = undefined;
    const v = verify(s, true);
    expect(v.outcome.passed).toBe(false);
    expect(v.outcome.reqs.find((r) => r.id === 'pm')!.pass).toBe(false);
  });
  it('a failed incident cannot pass, regardless of the final design', () => {
    const s = solve();
    s.failed = true;
    expect(verify(s, true).outcome.passed).toBe(false);
  });
  it('mission data is self-consistent', () => {
    for (const m of [m1, m2]) {
      expect(Object.values(m.weights).reduce((a, b) => a + (b ?? 0), 0)).toBeGreaterThan(0);
      for (const r of m.requirements) expect(r.metric || r.check).toBeTruthy();
    }
  });
});

describe('progression', () => {
  it('levels and skill ranks rise monotonically with XP', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(3))).toBe(3);
    expect(levelFromXp(xpForLevel(3) - 1)).toBe(2);
    expect([0, 30, 80, 150, 250, 400].map(skillLevel)).toEqual([0, 1, 2, 3, 4, 5]);
  });
  it('achievements are defined with unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
