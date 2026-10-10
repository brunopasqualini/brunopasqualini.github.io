import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { advance, createSession } from '@/game/session';
import { migrateSave, SAVE_SCHEMA_VERSION } from '@/game/migrate';
import { isReplayCompatible, SIM_VERSION } from '@/game/simVersion';
import { useGame } from '@/game/store';

/** FNV-1a over a string: a stable fingerprint, not a security hash. */
const fnv = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
};

/** Behaviour of one mission's simulation over its first 30 minutes, rounded so float noise cannot flip it. */
function fingerprint(missionId: string): string {
  const s = createSession(missionId, 'beginner');
  advance(s, 30, false);
  const rows = s.history.map((h) => {
    const y = h.system;
    return [
      h.minute,
      y.successRate.toFixed(5),
      y.p95.toFixed(1),
      y.costMonthly.toFixed(1),
      y.queueBacklog.toFixed(0),
      y.dbConnPct.toFixed(2),
    ].join(':');
  });
  return fnv(rows.join('|'));
}

/**
 * One table per SIM_VERSION. If a recorded fingerprint no longer matches, simulation behaviour changed. Saved games
 * replay through the simulation, so: bump SIM_VERSION in game/simVersion.ts and record fresh fingerprints in a new table.
 * (Players with older saves keep their design and notes; only the recorded run restarts.)
 * Adding a new mission only needs a new row in the current table, not a version bump.
 */
const KNOWN: Record<number, Record<string, string>> = {
  1: {
    'm14-blank-page': '1a0d62ec',
    'm13-regional-outage': '7476ccfd',
    'm12-noisy-neighbour': '30ae5a4',
    'm11-hot-key': 'a18ac573',
    'm10-stale-receipt': '17cc0347',
    'm9-merger': '93708274',
    'm8-impatient-client': '37e67175',
    'm7-n-plus-one': '671dced4',
    'm1-monolith': 'ef7ca4b7',
    'm2-db-meltdown': '7748eb28',
    'm3-deployment': '803ad811',
    'm4-network': 'd7fc3e3f',
    'm5-queue': 'c14f2866',
    'm6-bill-shock': 'aad0d145',
  },
};

describe('simulation version', () => {
  it('has a table for the current SIM_VERSION', () => {
    expect(KNOWN[SIM_VERSION], `no fingerprints recorded for SIM_VERSION ${SIM_VERSION}`).toBeDefined();
  });

  for (const m of MISSIONS) {
    it(`${m.id} still behaves as recorded`, () => {
      const want = KNOWN[SIM_VERSION]?.[m.id];
      expect(want, `record a fingerprint for ${m.id}: '${fingerprint(m.id)}'`).toBeDefined();
      expect(fingerprint(m.id), `Simulation behaviour of ${m.id} changed: bump SIM_VERSION and record new fingerprints`).toBe(want);
    });
  }

  it('treats unversioned legacy saves as compatible and other versions as stale', () => {
    expect(isReplayCompatible(undefined)).toBe(true);
    expect(isReplayCompatible(SIM_VERSION)).toBe(true);
    expect(isReplayCompatible(SIM_VERSION + 1)).toBe(false);
    expect(isReplayCompatible(0)).toBe(false);
  });
});

describe('save migration', () => {
  it('tags v1 sessions with the baseline simulation version and leaves everything else alone', () => {
    const v1: { progress: unknown; settings: unknown; saved: Record<string, { ops: never[]; draft: object; simVersion?: number }> } = {
      progress: { xp: 5 },
      settings: { mode: 'beginner' },
      saved: { m1: { ops: [], draft: {} }, m2: { ops: [], draft: {}, simVersion: 3 } },
    };
    const out = migrateSave(v1, 1) as { progress: unknown; saved: Record<string, { simVersion: number }> };
    expect(out.saved.m1.simVersion).toBe(1);
    expect(out.saved.m2.simVersion).toBe(3);
    expect(out.progress).toEqual({ xp: 5 });
    expect(v1.saved.m1.simVersion).toBeUndefined(); // input not mutated
  });

  it('never throws on malformed input', () => {
    for (const bad of [null, undefined, 42, 'x', [], { saved: 'nope' }, { saved: { a: null } }]) {
      expect(() => migrateSave(bad, 1)).not.toThrow();
    }
  });

  it('is a no-op for current-schema data', () => {
    const cur = { saved: { m1: { simVersion: 1 } } };
    expect(migrateSave(cur, SAVE_SCHEMA_VERSION)).toEqual(cur);
  });
});

describe('opening a stale save', () => {
  it('keeps the design and notes but restarts the recorded run, and says so', () => {
    useGame.getState().resetAll();
    useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false }, toasts: [] });
    const g = () => useGame.getState();
    g().openMission('m2-db-meltdown', { fresh: true });
    g().startIncident();
    g().editDraft((a) => {
      a.nodes.find((n) => n.id === 'db')!.config.indexed = true;
    });
    g().step(5);
    g().setHypothesis(['unindexed']);
    g().closeSession();
    // simulate a save recorded by a different simulation version
    useGame.setState((s) => ({ saved: { ...s.saved, 'm2-db-meltdown': { ...s.saved['m2-db-meltdown'], simVersion: SIM_VERSION + 1 } } }));
    g().openMission('m2-db-meltdown');
    const s = g().session!;
    expect(s.ops).toHaveLength(0);
    expect(s.minute).toBeLessThan(25);
    expect(s.draft.nodes.find((n) => n.id === 'db')!.config.indexed).toBe(true);
    expect(s.chosenCauses).toEqual(['unindexed']);
    expect(g().saved['m2-db-meltdown'].simVersion).toBe(SIM_VERSION);
    expect(g().toasts.some((t) => /simulation was updated/i.test(t.text))).toBe(true);
  });
});
