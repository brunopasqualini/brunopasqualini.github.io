import { describe, expect, it } from 'vitest';
import { analyzeDesign, analyzeObservability, analyzePipeline, analyzeRecovery, buildReport, explainChanges } from '@/engine/analysis';
import { makeEdge, makeNode } from '@/engine/arch';
import { emptyState, solve } from '@/engine/engine';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch } from '@/engine/types';

const N = (kind: string, id: string, config: Record<string, any> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });
const W = { ...DEFAULT_WORKLOAD, baseRps: 100 };

describe('pipeline analysis', () => {
  it('rates canary + integration tests + auto abort far safer than all-at-once without tests', () => {
    const weak = analyzePipeline({ nodes: [N('ci-pipeline', 'ci'), N('cd-pipeline', 'cd')], edges: [] });
    const strong = analyzePipeline({
      nodes: [
        N('ci-pipeline', 'ci'),
        N('test-suite', 't', { unitCoverage: 70, integrationCoverage: 60, e2e: true }),
        N('cd-pipeline', 'cd', { strategy: 'canary' }),
        N('canary', 'c', { autoAbort: true }),
        N('rollback', 'r', { automated: true }),
        N('feature-flag', 'f'),
      ],
      edges: [],
    });
    expect(weak.safeRollout).toBe(false);
    expect(strong.safeRollout).toBe(true);
    expect(strong.releaseSafety).toBeGreaterThan(weak.releaseSafety + 40);
    expect(weak.notes.join(' ')).toMatch(/All-at-once/);
  });
});

describe('design analysis', () => {
  const noPipe = analyzePipeline({ nodes: [], edges: [] });
  const noObs = analyzeObservability({ nodes: [], edges: [] });
  it('an unbounded monolith has low maintainability; enforcing boundaries fixes it without adding complexity', () => {
    const mk = (b: string): Arch => ({ nodes: [N('monolith', 'm', { modules: 5, moduleBoundaries: b })], edges: [] });
    const bad = analyzeDesign(mk('none'), noPipe, noObs, 3);
    const good = analyzeDesign(mk('enforced'), noPipe, noObs, 3);
    expect(bad.maintainability).toBeLessThan(25);
    expect(good.maintainability).toBeGreaterThan(80);
    expect(good.opComplexity).toBe(bad.opComplexity);
  });
  it('services sharing a database are coupled; many services raise operational complexity', () => {
    const svc = (n: number, own: boolean): Arch => {
      const nodes = [N('relational-db', 'db')];
      const edges = [];
      for (let i = 0; i < n; i++) {
        nodes.push(N('microservice', `s${i}`, { domain: `d${i}`, ownsData: own }));
        edges.push(makeEdge(`s${i}`, 'db'));
      }
      return { nodes, edges };
    };
    const shared = analyzeDesign(svc(4, false), noPipe, noObs, 3);
    expect(shared.sharedDbs).toHaveLength(1);
    expect(shared.notes.join(' ')).toMatch(/coupled/);
    expect(analyzeDesign(svc(8, true), noPipe, noObs, 3).opComplexity).toBeGreaterThan(
      analyzeDesign(svc(2, true), noPipe, noObs, 3).opComplexity + 30,
    );
  });
});

describe('observability and recovery', () => {
  it('actionable alerts and synthetic monitoring shorten time-to-detect', () => {
    expect(analyzeObservability({ nodes: [], edges: [] }).mttdMinutes).toBe(15);
    expect(analyzeObservability({ nodes: [N('synthetic-monitoring', 's')], edges: [] }).mttdMinutes).toBeLessThan(15);
    const withAlert = analyzeObservability({
      nodes: [N('alert-rule', 'a', { forMinutes: 2, actionable: true }), N('cloudwatch', 'cw'), N('tracing', 't')],
      edges: [],
    });
    expect(withAlert.mttdMinutes).toBeLessThanOrEqual(3);
    expect(withAlert.coverage).toBeGreaterThanOrEqual(60);
  });
  it('multi-region DR with tested restores recovers faster than none', () => {
    const none = analyzeRecovery({ nodes: [N('rds', 'db', { backupRetentionDays: 0 })], edges: [] });
    const good = analyzeRecovery({
      nodes: [
        N('rds', 'db', { multiAZ: true, backupRetentionDays: 7 }),
        N('backup', 'b', { restoreTested: true, crossRegion: true }),
        N('dr-config', 'dr', { strategy: 'warm-standby' }),
      ],
      edges: [makeEdge('b', 'db')],
    });
    expect(good.rtoMinutes).toBeLessThan(none.rtoMinutes);
    expect(good.rpoMinutes).toBeLessThan(none.rpoMinutes);
    expect(good.score).toBeGreaterThan(none.score);
  });
});

describe('causal explanations', () => {
  it('explains a metric change by naming the component and the mechanism', () => {
    const arch = (replicas: number): Arch => ({
      nodes: [N('users', 'u'), N('backend-service', 'app', { replicas, dbPoolSize: 20 }), N('relational-db', 'db', { size: 'small' })],
      edges: [makeEdge('u', 'app'), makeEdge('app', 'db', { weight: 2 })],
    });
    const before = solve(arch(4), W, 0, emptyState()).snapshot;
    const a2 = arch(8);
    const after = solve(a2, W, 0, emptyState()).snapshot;
    const ch = explainChanges(before, after, a2);
    const success = ch.find((c) => c.key === 'success')!;
    expect(success.better).toBe(false);
    expect(success.because).toMatch(/connection/i);
    const conn = ch.find((c) => c.key === 'dbconn')!;
    expect(conn.because).toMatch(/clients × pool size/);
  });
  it('builds a full report with metrics and node overlay flags', () => {
    const a: Arch = {
      nodes: [N('users', 'u'), N('backend-service', 'app'), N('s3', 'b', { publicAccess: true })],
      edges: [makeEdge('u', 'app'), makeEdge('app', 'b')],
    };
    const snap = solve(a, W, 0, emptyState()).snapshot;
    const r = buildReport(a, [snap], W);
    expect(r.metrics.criticalFindings).toBe(1);
    expect(r.flags.b.insecure).toBeTruthy();
    expect(r.metrics.availability).toBeGreaterThan(99);
  });
});
