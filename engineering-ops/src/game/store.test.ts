import { beforeEach, describe, expect, it } from 'vitest';
import { useGame } from '@/game/store';

const g = () => useGame.getState();

beforeEach(() => {
  g().resetAll();
  useGame.setState({ settings: { mode: 'intermediate', onboarded: true, showAllComponents: false }, toasts: [] });
});

describe('gameplay flow through the store', () => {
  it('opens a mission, edits the draft, deploys, observes, submits and records progress', () => {
    g().openMission('m2-db-meltdown', { fresh: true });
    expect(g().session!.history.length).toBeGreaterThan(10);
    expect(g().introOpen).toBe(true);
    g().startIncident();
    // an invalid draft is blocked, a valid one deploys
    g().editDraft((a) => {
      a.nodes.find((n) => n.id === 'api')!.config.replicas = 0;
      a.nodes.find((n) => n.id === 'api')!.config.autoscale = true;
      a.nodes.find((n) => n.id === 'api')!.config.maxReplicas = 0;
    });
    g().deploy();
    expect(g().toasts.some((t) => /replicas/i.test(t.text))).toBe(true);
    g().resetDraft();
    g().editDraft((a) => {
      const db = a.nodes.find((n) => n.id === 'db')!;
      db.config.indexed = true;
      db.config.connectionPooler = true;
    });
    g().deploy();
    expect(g().session!.explain?.changes.length).toBeGreaterThan(0);
    g().step(6);
    expect(g().session!.explain?.settled).toBe(true);
    expect(g().session!.history[g().session!.history.length - 1].system.successRate).toBeGreaterThan(0.99);
    g().setHypothesis(['unindexed']);
    g().visitPanel('database');
    g().visitPanel('metrics');
    g().visitPanel('deployments');
    g().savePostmortem({
      what: 'An unindexed query saturated the database because the release shipped without a plan review.',
      impact: 'Checkouts failed for about twenty minutes during the sale.',
      evidence: 'Query statistics showed a sequential scan; the deploy timeline named the release.',
      restored: 'Added the index and a connection pooler to reduce risk.',
      worsened: 'Scaling application replicas would have exhausted connections.',
      prevent: 'Alert on database CPU and test query plans before release to reduce risk.',
    });
    g().submit();
    const d = g().debrief!;
    expect(d.outcome.reqs.filter((r) => r.hard && !r.pass).map((r) => `${r.id}: ${r.detail}`)).toEqual([]);
    expect(d.outcome.passed).toBe(true);
    expect(g().progress.xp).toBe(d.outcome.xp);
    expect(g().progress.completed['m2-db-meltdown']).toBeDefined();
    expect(g().progress.skillXp.sd).toBeGreaterThan(0);
    expect(g().progress.evidence.sd.length).toBe(1);
    expect(g().progress.postmortems).toHaveLength(1);
    expect(Object.keys(g().progress.achievements)).toContain('first-blood');
  });

  it('investigation costs simulated time in incidents (except beginner mode)', () => {
    g().openMission('m2-db-meltdown', { fresh: true });
    const m0 = g().session!.minute;
    g().visitPanel('logs');
    expect(g().session!.minute).toBe(m0 + 1);
    g().visitPanel('logs');
    expect(g().session!.minute).toBe(m0 + 1);
    g().setMode('beginner');
    g().visitPanel('traces');
    expect(g().session!.minute).toBe(m0 + 1);
  });

  it('revert restores the previous architecture, retry starts a fresh attempt', () => {
    g().openMission('m1-monolith', { fresh: true });
    g().editDraft((a) => {
      a.nodes.find((n) => n.id === 'mono')!.config.moduleBoundaries = 'enforced';
    });
    g().deploy();
    expect(g().session!.live.nodes.find((n) => n.id === 'mono')!.config.moduleBoundaries).toBe('enforced');
    g().revert();
    expect(g().session!.live.nodes.find((n) => n.id === 'mono')!.config.moduleBoundaries).toBe('none');
    g().retryMission('m1-monolith');
    expect(g().session!.attempt).toBe(1);
    expect(g().session!.ops).toHaveLength(0);
  });

  it('saves and restores a session by deterministic replay', () => {
    g().openMission('m3-deployment', { fresh: true });
    g().startIncident();
    g().act('rollback');
    g().editDraft((a) => {
      a.nodes.find((n) => n.id === 'tests')!.config.integrationCoverage = 60;
    });
    g().deploy();
    g().step(3);
    g().setHypothesis(['bad-release']);
    const minute = g().session!.minute;
    const sig = JSON.stringify(g().session!.history[g().session!.history.length - 1].system);
    g().closeSession();
    expect(g().session).toBeNull();
    g().openMission('m3-deployment');
    const s = g().session!;
    expect(s.minute).toBe(minute);
    expect(JSON.stringify(s.history[s.history.length - 1].system)).toBe(sig);
    expect(s.chosenCauses).toEqual(['bad-release']);
    expect(s.live.nodes.find((n) => n.id === 'tests')!.config.integrationCoverage).toBe(60);
    expect(g().introOpen).toBe(false);
  });

  it('exports and imports save data', () => {
    g().openMission('m1-monolith', { fresh: true });
    g().closeSession();
    const json = g().exportSave();
    g().resetAll();
    expect(Object.keys(g().saved)).toHaveLength(0);
    expect(g().importSave(json)).toBe(true);
    expect(Object.keys(g().saved)).toContain('m1-monolith');
    expect(g().importSave('not json')).toBe(false);
  });

  it('lab: templates, chaos, workload and saved designs', () => {
    g().openMission('lab', { template: 'three-tier', fresh: true });
    const s = g().session!;
    expect(s.live.nodes.some((n) => n.kind === 'rds')).toBe(true);
    g().setChaosList([{ type: 'az-outage', az: 'a' }]);
    g().step(2);
    expect(g().session!.history[g().session!.history.length - 1].system.successRate).toBeLessThan(0.5);
    g().setWorkload({ baseRps: 40 });
    g().saveDesign('baseline');
    expect(g().progress.designs).toHaveLength(1);
    g().openMission('lab', { template: 'drill-spike', fresh: true });
    expect(g().drill?.title).toMatch(/spike/);
  });
});

describe('decisions carry into later missions through the store', () => {
  it('passing a mission records its decisions, and the next mission starts with the matching consequences', () => {
    g().openMission('m7-n-plus-one', { fresh: true });
    g().startIncident();
    // the tempting-but-costly route: also buy a bigger database instead of fixing the pattern
    g().editDraft((a) => {
      a.nodes.find((n) => n.id === 'db')!.config.size = 'medium';
      a.edges.find((e) => e.id === 'e-api-db')!.config.weight = 2; // and also batch, so the mission passes
    });
    g().deploy();
    g().step(6);
    g().submit();
    const d = g().progress.completed['m7-n-plus-one']?.decisions ?? [];
    expect(d.map((x) => x.tag)).toEqual(expect.arrayContaining(['m7-n-plus-one:fixed-in-code', 'm7-n-plus-one:bought-a-bigger-database']));

    g().closeSession();
    g().openMission('m9-merger', { fresh: true });
    const s = g().session!;
    expect(s.inherited).toContain('m7-n-plus-one:bought-a-bigger-database');
    expect(s.consequences.map((c) => c.id)).toContain('inherited-bigger-db');
    expect(s.draft.nodes.find((n) => n.id === 'shop-db')!.config.size).toBe('large');
    expect(g().saved['m9-merger'].inherited).toEqual(s.inherited);

    // reopening restores the same starting state from the saved tags (no progress lookup needed)
    g().closeSession();
    useGame.setState((st) => ({ progress: { ...st.progress, completed: {} } }));
    g().openMission('m9-merger');
    expect(g().session!.consequences.map((c) => c.id)).toContain('inherited-bigger-db');
  });

  it('a fresh attempt re-reads your current history, so improving an earlier mission changes the next one', () => {
    g().openMission('m9-merger', { fresh: true });
    expect(g().session!.consequences).toEqual([]);
  });
});
