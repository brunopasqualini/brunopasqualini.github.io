import {
  attachedTo,
  deliveryOf,
  edgeClass,
  flowEdges,
  nodeById,
  ofKind,
  ofRole,
  roleOf,
  validateArch,
  type ValidationIssue,
} from '@/engine/arch';
import { emptyState, solve, type Chaos } from '@/engine/engine';
import { securityFindings, type Finding } from '@/engine/net';
import type { Arch, ArchNode, MetricChange, NodeStatus, Snapshot, Workload } from '@/engine/types';

// ---------------------------------------------------------------------------
// Design quality (maintainability / operational complexity / developer productivity)
// ---------------------------------------------------------------------------
export interface DesignReport {
  units: number;
  microservices: number;
  sharedDbs: { dbId: string; callers: string[] }[];
  cohesion: number;
  maintainability: number;
  opComplexity: number;
  devProductivity: number;
  notes: string[];
}

const BOUNDARY_Q: Record<string, number> = { none: 0.15, packages: 0.55, enforced: 0.9 };

export function analyzeDesign(arch: Arch, pipeline: PipelineReport, obs: ObsReport, squads = 1): DesignReport {
  const notes: string[] = [];
  const units = arch.nodes.filter((n) => ['compute', 'worker'].includes(roleOf(n)) && n.kind !== 'web-frontend');
  const micro = arch.nodes.filter((n) => n.kind === 'microservice');
  const monos = arch.nodes.filter((n) => n.kind === 'monolith');

  // Cohesion: how well each deployable unit contains one domain behind a clear boundary.
  let wSum = 0;
  let qSum = 0;
  let domainsTotal = 0;
  for (const m of monos) {
    const mods = Math.max(1, m.config.modules ?? 1);
    wSum += mods;
    qSum += mods * (BOUNDARY_Q[m.config.moduleBoundaries] ?? 0.15);
    domainsTotal += mods;
    if (mods > 1 && m.config.moduleBoundaries === 'none')
      notes.push(
        `${m.label}: ${mods} domains share one code base with no enforced boundaries — any change can break anything (low cohesion, high coupling).`,
      );
    if (mods > 1 && m.config.moduleBoundaries === 'enforced')
      notes.push(
        `${m.label}: modules interact only through public interfaces — a modular monolith keeps coupling low without network overhead.`,
      );
  }
  for (const s of micro) {
    wSum += 1;
    domainsTotal += 1;
    const q = s.config.domain ? (s.config.ownsData ? 0.9 : 0.5) : 0.4;
    qSum += q;
    if (!s.config.domain)
      notes.push(`${s.label}: no domain assigned — splitting without a domain boundary creates a distributed monolith.`);
  }
  for (const _u of units.filter((u) => !['monolith', 'microservice'].includes(u.kind))) {
    wSum += 1;
    qSum += 0.6;
    domainsTotal += 1;
  }
  const cohesion = wSum ? qSum / wSum : 0.8;

  // Coupling through shared data stores owned by different services.
  const sharedDbs: DesignReport['sharedDbs'] = [];
  for (const db of arch.nodes.filter((n) => ['db', 'kv'].includes(roleOf(n)))) {
    const callers = flowEdges(arch)
      .filter((e) => e.target === db.id)
      .map((e) => nodeById(arch, e.source)!)
      .filter((s) => s && ['microservice', 'backend-service', 'monolith'].includes(s.kind));
    if (callers.length >= 2) {
      sharedDbs.push({ dbId: db.id, callers: callers.map((c) => c.label) });
      notes.push(
        `${db.label} is shared by ${callers.map((c) => c.label).join(', ')} — they are coupled through its schema, so they cannot evolve or deploy independently.`,
      );
    }
  }
  const couplingPenalty = Math.min(
    45,
    sharedDbs.reduce((s, d) => s + 15 * (d.callers.length - 1), 0),
  );
  const singleDomain = domainsTotal <= 1;
  const maintainability = singleDomain ? 85 : clamp(100 * cohesion - couplingPenalty - (units.length > domainsTotal + 1 ? 8 : 0), 0, 100);

  // Operational complexity: every deployable unit adds pipelines, dashboards, failure modes.
  const k8s = arch.nodes.filter((n) => ['eks', 'k8s-cluster'].includes(n.kind)).length;
  let op = 10 + 7 * Math.max(0, units.length - 1) + 5 * micro.length + 10 * k8s;
  if (units.length > 2 && !obs.traces) {
    op += 10;
    notes.push('Several services but no distributed tracing — diagnosing a slow request means guessing across logs.');
  }
  if (units.length > 2 && !pipeline.cd) {
    op += 8;
    notes.push('Many deployable units without a CD pipeline multiplies manual release work.');
  }
  if (pipeline.iac) op -= 4;
  if (pipeline.template) op -= 8;
  const opComplexity = clamp(op, 0, 100);
  if (micro.length >= 6)
    notes.push(
      `${micro.length} microservices is a lot for a small team: deployment, monitoring and on-call overhead grow with every service.`,
    );

  // Developer productivity: independent deployability + automation, minus cognitive load.
  const independent = micro.length
    ? (Math.min(micro.filter((m) => m.config.domain).length, squads) / squads) * 25
    : monos.some((m) => m.config.moduleBoundaries === 'enforced')
      ? 17
      : monos.some((m) => m.config.moduleBoundaries === 'packages')
        ? 8
        : 0;
  const devProductivity = clamp(35 + independent + pipeline.productivityBonus - opComplexity * 0.25 + (maintainability - 50) * 0.2, 0, 100);

  return { units: units.length, microservices: micro.length, sharedDbs, cohesion, maintainability, opComplexity, devProductivity, notes };
}

// ---------------------------------------------------------------------------
// Delivery pipeline
// ---------------------------------------------------------------------------
export interface PipelineReport {
  ci: boolean;
  tests: boolean;
  unitCov: number;
  intCov: number;
  e2e: boolean;
  cd: boolean;
  strategy: 'none' | 'all-at-once' | 'rolling' | 'canary' | 'blue-green';
  autoRollback: boolean;
  rollback: boolean;
  featureFlag: boolean;
  approval: boolean;
  iac: boolean;
  drift: boolean;
  template: boolean;
  portal: boolean;
  safeRollout: boolean;
  /** 0..100: how likely a defective release is stopped before it hurts customers. */
  releaseSafety: number;
  productivityBonus: number;
  notes: string[];
}

export function analyzePipeline(arch: Arch): PipelineReport {
  const has = (...k: string[]) => ofKind(arch, ...k).length > 0;
  const cd = ofKind(arch, 'cd-pipeline')[0];
  const canary = ofKind(arch, 'canary')[0];
  const bg = ofKind(arch, 'blue-green')[0];
  const tests = ofKind(arch, 'test-suite')[0];
  const rb = ofKind(arch, 'rollback')[0];
  const flag = ofKind(arch, 'feature-flag')[0];
  const strategy: PipelineReport['strategy'] = !cd
    ? 'none'
    : bg
      ? 'blue-green'
      : canary
        ? 'canary'
        : ((cd.config.strategy as PipelineReport['strategy']) ?? 'all-at-once');
  const strat = canary || strategy === 'canary' ? 'canary' : strategy;
  const autoRollback = !!(cd?.config.autoRollback || rb?.config.automated || (canary && canary.config.autoAbort));
  const unitCov = tests?.config.unitCoverage ?? 0;
  const intCov = tests?.config.integrationCoverage ?? 0;
  const safeRollout = (strat === 'canary' || strat === 'blue-green' || strat === 'rolling') && (autoRollback || strat === 'blue-green');
  const notes: string[] = [];
  let safety = 5;
  if (has('ci-pipeline')) safety += 10;
  if (tests) safety += Math.min(25, unitCov * 0.15) + Math.min(30, intCov * 0.4) + (tests.config.e2e ? 8 : 0);
  if (strat === 'canary') safety += canary?.config.autoAbort ? 25 : 12;
  if (strat === 'blue-green') safety += 18;
  if (strat === 'rolling') safety += 6;
  if (autoRollback) safety += 10;
  if (rb) safety += 4;
  if (flag?.config.killSwitch) safety += 8;
  if (has('approval-gate')) safety += 3;
  if (!cd) notes.push('No CD pipeline: releases are manual and unrepeatable.');
  if (cd && strat === 'all-at-once') notes.push('All-at-once rollout exposes 100% of users to a defective release immediately.');
  if (!tests) notes.push('No automated test suite gates releases.');
  else if (intCov < 40)
    notes.push('Integration coverage is low — regressions that only appear with real dependencies will pass the pipeline.');
  if (canary && !canary.config.autoAbort) notes.push('A canary without automatic abort relies on a human noticing the error rate in time.');
  const productivityBonus =
    (has('ci-pipeline') ? 8 : 0) +
    (tests ? 6 : 0) +
    (cd ? 8 : 0) +
    (has('iac', 'terraform') ? 5 : 0) +
    (has('service-template') ? 9 : 0) +
    (has('dev-portal') ? 6 : 0) +
    (flag ? 3 : 0) -
    (has('approval-gate') && ofKind(arch, 'approval-gate')[0].config.approvers > 2 ? 6 : 0);
  return {
    ci: has('ci-pipeline'),
    tests: !!tests,
    unitCov,
    intCov,
    e2e: !!tests?.config.e2e,
    cd: !!cd,
    strategy: strat as PipelineReport['strategy'],
    autoRollback,
    rollback: !!rb || autoRollback,
    featureFlag: !!flag,
    approval: has('approval-gate'),
    iac: has('iac', 'terraform'),
    drift: !!ofKind(arch, 'iac')[0]?.config.driftDetection,
    template: has('service-template'),
    portal: has('dev-portal'),
    safeRollout,
    releaseSafety: clamp(safety, 0, 100),
    productivityBonus,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Observability
// ---------------------------------------------------------------------------
export interface ObsReport {
  metrics: boolean;
  logs: boolean;
  traces: boolean;
  alerts: number;
  actionableAlerts: number;
  synthetic: boolean;
  dashboard: boolean;
  slo: boolean;
  coverage: number;
  mttdMinutes: number;
  notes: string[];
}

export function analyzeObservability(arch: Arch): ObsReport {
  const nodes = ofRole(arch, 'observability');
  const metrics = nodes.some((n) => n.config.metrics || n.kind === 'metrics-collector');
  const logs = nodes.some((n) => n.config.logs || n.kind === 'central-logging');
  const traces = nodes.some((n) => n.kind === 'tracing' || n.config.traces);
  const alerts = ofKind(arch, 'alert-rule');
  const actionable = alerts.filter((a) => a.config.actionable);
  const synthetic = ofKind(arch, 'synthetic-monitoring').length > 0;
  const dashboard = ofKind(arch, 'dashboard', 'observability-stack').length > 0;
  const slo = ofKind(arch, 'slo').length > 0;
  const notes: string[] = [];
  if (!alerts.length) notes.push('No alert rules: you will learn about outages from customers.');
  if (alerts.length && !actionable.length)
    notes.push('Alerts exist but none link to a runbook — pages without actions create alert fatigue.');
  const coverage =
    (metrics ? 20 : 0) +
    (logs ? 20 : 0) +
    (traces ? 20 : 0) +
    (actionable.length ? 20 : alerts.length ? 8 : 0) +
    (synthetic ? 10 : 0) +
    (dashboard ? 5 : 0) +
    (slo ? 5 : 0);
  const mttd = alerts.length ? Math.min(...alerts.map((a) => a.config.forMinutes ?? 2)) + (actionable.length ? 0 : 3) : synthetic ? 4 : 15;
  return {
    metrics,
    logs,
    traces,
    alerts: alerts.length,
    actionableAlerts: actionable.length,
    synthetic,
    dashboard,
    slo,
    coverage,
    mttdMinutes: mttd,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Backup & recovery
// ---------------------------------------------------------------------------
export interface RecoveryReport {
  rpoMinutes: number;
  rtoMinutes: number;
  backups: number;
  restoreTested: boolean;
  multiAZ: boolean;
  crossRegion: boolean;
  /** If the whole Region were lost: how much data could be lost, and how long restoring service would take. */
  regionRpoMinutes: number;
  regionRtoMinutes: number;
  singlePoints: string[];
  score: number;
}

export function analyzeRecovery(arch: Arch): RecoveryReport {
  const dbs = arch.nodes.filter((n) => ['db', 'kv'].includes(roleOf(n)));
  const backupNodes = ofKind(arch, 'backup');
  let rpo = Infinity;
  for (const d of dbs) {
    const b = attachedTo(arch, d.id).find((a) => a.kind === 'backup');
    let r = Infinity;
    if (b) r = b.config.frequencyHours * 60;
    if (d.kind === 'dynamodb' || d.kind === 'document-db') r = Math.min(r, 5);
    else if ((d.config.backupRetentionDays ?? 0) > 0) r = Math.min(r, 5);
    rpo = Math.min(rpo === Infinity ? r : rpo, r === Infinity ? rpo : r);
    if (rpo === Infinity) rpo = r;
  }
  if (!dbs.length) rpo = 0;
  if (rpo === Infinity) rpo = 10080;
  const dr = ofKind(arch, 'dr-config')[0];
  const restoreTested = backupNodes.some((b) => b.config.restoreTested);
  const crossRegion =
    dbs.some((d) => d.config.crossRegionReplica) ||
    backupNodes.some((b) => b.config.crossRegion) ||
    (!!dr && dr.config.strategy !== 'backup-restore');
  const rtoByStrategy: Record<string, number> = { 'backup-restore': 240, 'pilot-light': 60, 'warm-standby': 15, 'active-active': 2 };
  let rto = dr ? (rtoByStrategy[dr.config.strategy] ?? 240) : 480;
  if (!dr || dr.config.strategy === 'backup-restore') rto += restoreTested ? -60 : 120;
  // Losing a Region takes the primary, its Multi-AZ standby and its same-Region backups with it. Only a copy of the data
  // in another Region survives: a cross-Region replica (seconds to minutes of lag) or a cross-Region backup.
  const hasRegionCopy = dbs.some((d) => d.config.crossRegionReplica) || backupNodes.some((b) => b.config.crossRegion);
  const copyRpo = dbs.some((d) => d.config.crossRegionReplica)
    ? 1
    : Math.min(...backupNodes.filter((b) => b.config.crossRegion).map((b) => b.config.frequencyHours * 60), 10080);
  const regionRpoMinutes = !dbs.length ? 0 : hasRegionCopy ? copyRpo : 10080;
  const regionRtoMinutes = hasRegionCopy ? rto : 2880; // with no copy elsewhere, the answer is "when the Region comes back"
  const multiAZ = dbs.every((d) => d.config.multiAZ || roleOf(d) === 'kv');
  const singlePoints: string[] = [];
  for (const d of dbs.filter((x) => roleOf(x) === 'db' && !x.config.multiAZ)) singlePoints.push(`${d.label} runs in a single AZ`);
  for (const c of ofRole(arch, 'cache').filter((x) => (x.config.nodes ?? 1) < 2)) singlePoints.push(`${c.label} is a single node`);
  for (const n of ofKind(arch, 'nat'))
    if (ofKind(arch, 'nat').length < 2) {
      singlePoints.push(`${n.label} is zonal and a single NAT gateway`);
      break;
    }
  const score = clamp(
    100 - Math.min(50, (rpo / 60) * 2) - Math.min(40, rto / 12) + (restoreTested ? 8 : 0) + (multiAZ ? 6 : 0) + (crossRegion ? 6 : 0),
    0,
    100,
  );
  return {
    rpoMinutes: rpo,
    rtoMinutes: rto,
    backups: backupNodes.length,
    restoreTested,
    multiAZ,
    crossRegion,
    regionRpoMinutes,
    regionRtoMinutes,
    singlePoints,
    score,
  };
}

// ---------------------------------------------------------------------------
// Whole-architecture report
// ---------------------------------------------------------------------------
export interface Report {
  findings: Finding[];
  validation: ValidationIssue[];
  design: DesignReport;
  pipeline: PipelineReport;
  obs: ObsReport;
  recovery: RecoveryReport;
  securityScore: number;
  counts: { critical: number; high: number; medium: number; low: number };
  costTagCoverage: number;
  azSurvival: number;
  /** Per-node overlay flags for the canvas. */
  flags: Record<string, { insecure?: string; misconfigured?: string }>;
  metrics: Record<string, number>;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function costTagCoverage(arch: Arch, snap: Snapshot): number {
  let total = 0;
  let tagged = 0;
  for (const n of arch.nodes) {
    const hasField = Object.prototype.hasOwnProperty.call(n.config, 'costTag');
    const cost = snap.nodes[n.id]?.costMonthly ?? 0;
    if (!hasField || cost <= 0) continue;
    total += cost;
    if (String(n.config.costTag ?? '').trim()) tagged += cost;
  }
  return total > 0 ? (tagged / total) * 100 : 100;
}

export function azSurvival(arch: Arch, workload: Workload, minute: number): number {
  const chaos: Chaos[] = [{ type: 'az-outage', az: 'a' }];
  let st = emptyState();
  let rate = 1;
  for (let i = 0; i < 3; i++) {
    const r = solve(arch, workload, minute, st, chaos);
    st = r.next;
    rate = r.snapshot.system.successRate;
  }
  return rate * 100;
}

/** Points each finding costs, by severity. Single source of truth for the score and for explaining it. */
export const SECURITY_PENALTY: Record<Finding['severity'], number> = { critical: 40, high: 20, medium: 8, low: 2 };

export interface SecurityBreakdown {
  score: number;
  /** Findings that lowered the score, biggest penalty first, each with the points it cost and the change that resolves it. */
  items: { finding: Finding; points: number }[];
}

export function securityBreakdown(findings: Finding[]): SecurityBreakdown {
  const items = findings.map((finding) => ({ finding, points: SECURITY_PENALTY[finding.severity] })).sort((a, b) => b.points - a.points);
  const lost = items.reduce((t, i) => t + i.points, 0);
  return { score: clamp(100 - lost, 0, 100), items };
}

export function buildReport(arch: Arch, window: Snapshot[], workload: Workload, opts: { squads?: number; skipAz?: boolean } = {}): Report {
  const snap = window[window.length - 1];
  const avg = (get: (s: Snapshot) => number) => window.reduce((s, x) => s + get(x), 0) / Math.max(1, window.length);
  const pipeline = analyzePipeline(arch);
  const obs = analyzeObservability(arch);
  const recovery = analyzeRecovery(arch);
  const design = analyzeDesign(arch, pipeline, obs, opts.squads ?? 1);
  const findings = securityFindings(arch);
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  findings.forEach((f) => {
    counts[f.severity] += 1;
  });
  const securityScore = securityBreakdown(findings).score;
  const validation = validateArch(arch);
  const flags: Report['flags'] = {};
  for (const f of findings)
    if (f.nodeId && (f.severity === 'critical' || f.severity === 'high')) flags[f.nodeId] = { ...flags[f.nodeId], insecure: f.title };
  for (const v of validation) if (v.nodeId && v.severity === 'error') flags[v.nodeId] = { ...flags[v.nodeId], misconfigured: v.text };
  if (snap)
    for (const n of arch.nodes) {
      const m = snap.nodes[n.id];
      const bad = m?.reasons.find((r) => r.code === 'health' || r.code === 'blocked' || r.code === 'noconsumer');
      if (bad) flags[n.id] = { ...flags[n.id], misconfigured: bad.text };
    }
  const az = opts.skipAz || !snap ? 100 : azSurvival(arch, workload, snap.minute);
  const tagCov = snap ? costTagCoverage(arch, snap) : 100;
  const stale = snap ? Object.values(snap.nodes).some((m) => m.reasons.some((r) => r.code === 'stale')) : false;
  const sys = (get: (s: Snapshot) => number) => avg(get);
  const metrics: Record<string, number> = {
    availability: sys((s) => s.system.successRate) * 100,
    errorRate: sys((s) => s.system.errorRate) * 100,
    p95: sys((s) => s.system.p95),
    p50: sys((s) => s.system.p50),
    cost: snap?.system.costMonthly ?? 0,
    securityScore,
    criticalFindings: counts.critical,
    highFindings: counts.high,
    maintainability: design.maintainability,
    opComplexity: design.opComplexity,
    devProductivity: design.devProductivity,
    queueBacklog: snap?.system.queueBacklog ?? 0,
    queueDelaySec: snap?.system.queueDelaySec ?? 0,
    dlqDepth: snap?.system.dlqDepth ?? 0,
    duplicateRate: (snap?.system.duplicateRate ?? 0) * 100,
    lostPerMin: snap?.system.lostPerMin ?? 0,
    dbConnPct: (snap?.system.dbConnPct ?? 0) * 100,
    staleReadPct: snap ? Math.max(0, ...Object.values(snap.nodes).map((n) => n.staleReadPct ?? 0)) : 0,
    hotItemWritesPerSec: snap ? Math.max(0, ...Object.values(snap.nodes).map((n) => n.hotItemWritesPerSec ?? 0)) : 0,
    replicaLagSec: snap ? Math.max(0, ...Object.values(snap.nodes).map((n) => n.replicaLagSec ?? 0)) : 0,
    maxUtil: (snap?.system.maxUtil ?? 0) * 100,
    observability: obs.coverage,
    mttd: obs.mttdMinutes,
    rpo: recovery.rpoMinutes,
    rto: recovery.rtoMinutes,
    regionRpo: recovery.regionRpoMinutes,
    regionRto: recovery.regionRtoMinutes,
    recoverability: recovery.score,
    costTagCoverage: tagCov,
    azSurvival: az,
    releaseSafety: pipeline.releaseSafety,
    staleRisk: stale ? 1 : 0,
    validationErrors: validation.filter((v) => v.severity === 'error').length,
    units: design.units,
  };
  return {
    findings,
    validation,
    design,
    pipeline,
    obs,
    recovery,
    securityScore,
    counts,
    costTagCoverage: tagCov,
    azSurvival: az,
    flags,
    metrics,
  };
}

/** Overlay insecure / misconfigured states on node status for the canvas. */
export function visualStatus(status: NodeStatus, flag?: { insecure?: string; misconfigured?: string }): NodeStatus {
  if (status === 'unavailable' || status === 'overloaded') return status;
  if (flag?.misconfigured) return 'misconfigured';
  if (flag?.insecure) return 'insecure';
  return status;
}

// ---------------------------------------------------------------------------
// Causal explanations
// ---------------------------------------------------------------------------
interface MetricSpec {
  key: string;
  label: string;
  unit: string;
  get: (s: Snapshot) => number;
  betterWhen: 'up' | 'down';
  threshold: number;
}
const SPECS: MetricSpec[] = [
  { key: 'success', label: 'Success rate', unit: '%', get: (s) => s.system.successRate * 100, betterWhen: 'up', threshold: 0.3 },
  { key: 'p95', label: 'p95 latency', unit: 'ms', get: (s) => s.system.p95, betterWhen: 'down', threshold: 0.1 },
  { key: 'cost', label: 'Monthly cost', unit: '$', get: (s) => s.system.costMonthly, betterWhen: 'down', threshold: 0.02 },
  { key: 'dbconn', label: 'DB connections', unit: '%', get: (s) => s.system.dbConnPct * 100, betterWhen: 'down', threshold: 0.1 },
  { key: 'util', label: 'Peak utilisation', unit: '%', get: (s) => s.system.maxUtil * 100, betterWhen: 'down', threshold: 0.1 },
  { key: 'backlog', label: 'Queue backlog', unit: 'msgs', get: (s) => s.system.queueBacklog, betterWhen: 'down', threshold: 0.1 },
];

function biggest<T>(items: T[], score: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bs = 0;
  for (const i of items) {
    const s = Math.abs(score(i));
    if (s > bs) {
      bs = s;
      best = i;
    }
  }
  return best;
}

export function explainChanges(before: Snapshot, after: Snapshot, arch: Arch): MetricChange[] {
  const label = (id: string) => nodeById(arch, id)?.label ?? id;
  const out: MetricChange[] = [];
  const ids = Object.keys(after.nodes);
  for (const spec of SPECS) {
    const a = spec.get(before);
    const b = spec.get(after);
    const base = Math.max(Math.abs(a), 1);
    if (Math.abs(b - a) / base < spec.threshold && Math.abs(b - a) < (spec.unit === '%' ? 0.5 : 1)) continue;
    const up = b > a;
    const better = spec.betterWhen === 'up' ? up : !up;
    let because = '';
    if (spec.key === 'success') {
      const delta = (id: string) =>
        (after.nodes[id].errorRate - (before.nodes[id]?.errorRate ?? 0)) * (after.nodes[id].role === 'source' ? 0 : 1);
      if (!better) {
        // Blame the component with a critical diagnosis (the root), not merely the one that shows the symptom.
        const roots = ids.filter((id) => after.nodes[id].reasons.some((r) => r.severity === 'crit') && after.nodes[id].role !== 'source');
        const n = biggest(roots.length ? roots : ids, (id) =>
          roots.length ? 1 + Math.abs(delta(id)) + after.nodes[id].util * 0.01 : delta(id),
        );
        const m = n ? after.nodes[n] : undefined;
        const crit = m?.reasons.find((r) => r.severity === 'crit');
        because = n
          ? crit
            ? `${label(n)}: ${crit.text}`
            : `${label(n)} error rate ${((before.nodes[n]?.errorRate ?? 0) * 100).toFixed(1)}% → ${(m!.errorRate * 100).toFixed(1)}%.`
          : 'Request path changed.';
      } else {
        const fixed = ids.find(
          (id) =>
            before.nodes[id]?.reasons.some((r) => r.severity === 'crit') && !after.nodes[id].reasons.some((r) => r.severity === 'crit'),
        );
        const n = fixed ?? biggest(ids, (id) => -delta(id));
        because = n
          ? fixed
            ? `${label(n)} is no longer failing — before: “${before.nodes[n].reasons.find((r) => r.severity === 'crit')!.text}”`
            : `${label(n)} error rate ${((before.nodes[n]?.errorRate ?? 0) * 100).toFixed(1)}% → ${(after.nodes[n].errorRate * 100).toFixed(1)}%.`
          : 'Request path changed.';
      }
    } else if (spec.key === 'p95') {
      const n = biggest(
        ids,
        (id) => (after.nodes[id].util - (before.nodes[id]?.util ?? 0)) * (['source', 'edge', 'lb'].includes(after.nodes[id].role) ? 0 : 1),
      );
      const m = n ? after.nodes[n] : undefined;
      because =
        n && m
          ? `${label(n)} utilisation ${((before.nodes[n]?.util ?? 0) * 100).toFixed(0)}% → ${(m.util * 100).toFixed(0)}% — latency scales as 1/(1-utilisation), so small utilisation changes near saturation have large effects.`
          : 'Request path length changed (more or fewer hops).';
    } else if (spec.key === 'cost') {
      const n = biggest(ids, (id) => after.nodes[id].costMonthly - (before.nodes[id]?.costMonthly ?? 0));
      because = n
        ? `${label(n)}: $${(before.nodes[n]?.costMonthly ?? 0).toFixed(0)} → $${after.nodes[n].costMonthly.toFixed(0)}/mo (simulated estimate).`
        : 'Pricing inputs changed.';
    } else if (spec.key === 'dbconn') {
      const n = biggest(ids, (id) => (after.nodes[id].connUsed ?? 0) - (before.nodes[id]?.connUsed ?? 0));
      because = n
        ? `${label(n)}: ${(before.nodes[n]?.connUsed ?? 0).toFixed(0)} → ${(after.nodes[n].connUsed ?? 0).toFixed(0)} of ${after.nodes[n].connMax} connections (clients × pool size, unless a pooler multiplexes them).`
        : 'Client replicas or pool sizes changed.';
    } else if (spec.key === 'util') {
      const n = biggest(ids, (id) => after.nodes[id].util - (before.nodes[id]?.util ?? 0));
      because = n
        ? `${label(n)} utilisation ${((before.nodes[n]?.util ?? 0) * 100).toFixed(0)}% → ${(after.nodes[n].util * 100).toFixed(0)}%.`
        : 'Load distribution changed.';
    } else if (spec.key === 'backlog') {
      const n = biggest(ids, (id) => (after.nodes[id].queueDepth ?? 0) - (before.nodes[id]?.queueDepth ?? 0));
      because = n
        ? `${label(n)}: arrivals ${(after.nodes[n].arrivalRate ?? 0).toFixed(0)}/s vs drain ${(after.nodes[n].drainRate ?? 0).toFixed(0)}/s.`
        : 'Consumption rate changed.';
    }
    out.push({ key: spec.key, label: spec.label, before: a, after: b, unit: spec.unit, better, because });
  }
  return out;
}

export function nodeLabel(n: ArchNode): string {
  return n.label;
}

export { deliveryOf, edgeClass };
