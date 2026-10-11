import { describe, expect, it } from 'vitest';
import { GAME_DAYS, GAME_DAY_BY_ID } from '@/content/gamedays';
import { TEMPLATES } from '@/content/templates';
import { makeNode } from '@/engine/arch';
import { alreadyFailing, isFinished, resolveFaults, scoreGameDay } from '@/game/gameday';
import { LAB_ID, advance, createSession, patchWorkload, replay, startGameDay } from '@/game/session';
import { clone } from '@/engine/arch';

const threeTier = () => clone(TEMPLATES.find((t) => t.id === 'three-tier')!.arch);
const lab = () => {
  const s = createSession(LAB_ID, 'beginner', 1, threeTier());
  patchWorkload(s, { baseRps: 15 });
  return s;
};

function run(id: string, extra = 0) {
  const s = lab();
  advance(s, 5);
  startGameDay(s, id);
  advance(s, GAME_DAY_BY_ID[id].minutes + extra);
  return s;
}
const window = (s: ReturnType<typeof lab>) => s.history.filter((h) => h.minute >= s.gameday!.start);

describe('game day scripts', () => {
  it('are well formed: ordered steps inside the exercise, ending calm', () => {
    for (const d of GAME_DAYS) {
      const ats = d.steps.map((x) => x.at);
      expect([...ats].sort((a, b) => a - b)).toEqual(ats);
      expect(Math.max(...ats)).toBeLessThan(d.minutes);
      expect(d.steps[d.steps.length - 1].faults).toEqual([]);
    }
  });
});

describe('resolveFaults', () => {
  it('maps roles to real nodes and drops faults with no matching component', () => {
    const a = threeTier();
    const { chaos, skipped } = resolveFaults(
      [
        { type: 'slow', target: { roles: ['db'] }, mult: 5 },
        { type: 'spike', mult: 2 },
      ],
      a,
    );
    expect(skipped).toBe(0);
    expect(chaos).toHaveLength(2);
    const none = resolveFaults([{ type: 'node-down', target: { roles: ['db'] } }], { nodes: [makeNode('alb', { x: 0, y: 0 })], edges: [] });
    expect(none.chaos).toEqual([]);
    expect(none.skipped).toBe(1);
  });
});

describe('baseline check', () => {
  it('flags a design that is failing before any fault', () => {
    const s = createSession(LAB_ID, 'beginner', 1, threeTier());
    advance(s, 3);
    expect(alreadyFailing(s.history[s.history.length - 1])).toBe(true);
    const ok = lab();
    advance(ok, 3);
    expect(alreadyFailing(ok.history[ok.history.length - 1])).toBe(false);
    expect(alreadyFailing(undefined)).toBe(false);
  });
});

describe('running a game day', () => {
  it('fires faults on schedule and clears them at the end', () => {
    const s = lab();
    startGameDay(s, 'az-loss');
    const start = s.gameday!.start;
    advance(s, 3);
    expect(s.chaos).toEqual([]);
    advance(s, 2); // minute start+5 has fired the spike
    expect(s.chaos.map((c) => c.type)).toEqual(['spike']);
    advance(s, 8);
    expect(s.chaos.map((c) => c.type).sort()).toEqual(['az-outage', 'spike']);
    advance(s, 25);
    expect(s.chaos).toEqual([]);
    expect(isFinished(s.gameday!, s.minute)).toBe(true);
    expect(start).toBe(0);
  });

  it('is deterministic: replaying the logged ops reproduces the run exactly', () => {
    const s = run('cascade', 3);
    const r = replay(LAB_ID, 'beginner', 1, s.ops, threeTier());
    expect(r.minute).toBe(s.minute);
    expect(r.history.map((h) => h.system.successRate)).toEqual(s.history.map((h) => h.system.successRate));
    expect(r.events.map((e) => e.text)).toEqual(s.events.map((e) => e.text));
  });

  it('hurts a fragile single-AZ design and the score reflects it', () => {
    const s = run('az-loss', 3);
    const sc = scoreGameDay(GAME_DAY_BY_ID['az-loss'], window(s), s.live, true);
    expect(sc.impactMinutes).toBeGreaterThan(0);
    expect(sc.total).toBeLessThan(80);
    expect(sc.detectionMinutes).toBe(15); // no alerting at all
  });

  it('scores a calm run perfectly on impact and recovery', () => {
    const s = lab();
    advance(s, 10);
    const sc = scoreGameDay(GAME_DAY_BY_ID['az-loss'], s.history.slice(-10), s.live, true);
    expect(sc.impactMinutes).toBe(0);
    expect(sc.recoveryPoints).toBe(30);
    expect(sc.impactPoints).toBe(50);
  });

  it('better observability earns more detection points', () => {
    const s = run('az-loss', 3);
    const w = window(s);
    const base = scoreGameDay(GAME_DAY_BY_ID['az-loss'], w, s.live, true);
    const watched = clone(s.live);
    watched.nodes.push(makeNode('alert-rule', { x: 0, y: 0 }, { config: { forMinutes: 2, actionable: true } }));
    expect(scoreGameDay(GAME_DAY_BY_ID['az-loss'], w, watched, true).detectionPoints).toBeGreaterThan(base.detectionPoints);
  });
});
