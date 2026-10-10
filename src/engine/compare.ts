import { buildReport } from './analysis';
import { emptyState, solve, type Chaos } from './engine';
import type { Arch, Snapshot, Workload } from './types';

export interface ScenarioResult {
  id: 'normal' | 'peak' | 'zone-loss';
  label: string;
  successRate: number;
  p95: number;
  maxUtil: number;
}

export interface DesignProfile {
  scenarios: ScenarioResult[];
  costMonthly: number;
  securityScore: number;
  /** critical + high findings */
  seriousFindings: number;
  /** Share of traffic still served if one availability zone is lost. */
  resilience: number;
  recoveryScore: number;
  rtoMinutes: number;
  rpoMinutes: number;
}

export interface Comparison {
  before: DesignProfile;
  after: DesignProfile;
}

export interface CompareOptions {
  squads?: number;
  /** First minute of the measurement window and its length. */
  from: number;
  minutes: number;
}

function run(arch: Arch, workload: Workload, from: number, minutes: number, chaos: Chaos[] = []): Snapshot[] {
  let state = emptyState();
  const out: Snapshot[] = [];
  // Warm up one window so queues and autoscaling reach their steady behaviour before we measure.
  for (let i = -minutes; i < minutes; i++) {
    const r = solve(arch, workload, Math.max(0, from + i), state, chaos);
    state = r.next;
    if (i >= 0) out.push(r.snapshot);
  }
  return out;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

function profile(arch: Arch, workload: Workload, o: CompareOptions): DesignProfile {
  const scenario = (id: ScenarioResult['id'], label: string, w: Workload, from: number, chaos: Chaos[] = []): ScenarioResult => {
    const win = run(arch, w, from, o.minutes, chaos);
    return {
      id,
      label,
      successRate: mean(win.map((s) => s.system.successRate)),
      p95: mean(win.map((s) => s.system.p95)),
      maxUtil: Math.max(...win.map((s) => s.system.maxUtil)),
    };
  };
  const quiet: Workload = { ...workload, profile: [] };
  const scenarios = [
    scenario('normal', 'Normal load', quiet, 0),
    scenario('peak', 'Mission peak', workload, o.from),
    scenario('zone-loss', 'Lose one availability zone', workload, o.from, [{ type: 'az-outage', az: 'a' }]),
  ];
  const win = run(arch, workload, o.from, o.minutes);
  const report = buildReport(arch, win, workload, { squads: o.squads, skipAz: false });
  return {
    scenarios,
    costMonthly: win[win.length - 1].system.costMonthly,
    securityScore: report.securityScore,
    seriousFindings: report.counts.critical + report.counts.high,
    resilience: report.azSurvival,
    recoveryScore: report.recovery.score,
    rtoMinutes: report.recovery.regionRtoMinutes,
    rpoMinutes: report.recovery.regionRpoMinutes,
  };
}

/**
 * Replay one workload, the same measurement window and the same failure against two designs, so the only difference
 * between the columns is the architecture. Pure and deterministic.
 */
export function compareDesigns(before: Arch, after: Arch, workload: Workload, o: CompareOptions): Comparison {
  return { before: profile(before, workload, o), after: profile(after, workload, o) };
}
