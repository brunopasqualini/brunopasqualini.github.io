import { roleOf } from '@/engine/arch';
import { analyzeObservability } from '@/engine/analysis';
import type { Chaos } from '@/engine/engine';
import type { Arch, Snapshot } from '@/engine/types';
import { GAME_DAY_BY_ID, type GameDay, type GameDayFault, type GameDayStep } from '@/content/gamedays';

/** Success rate below this counts as customers being hurt. */
export const IMPACT_THRESHOLD = 0.99;

export interface GameDayRun {
  id: string;
  /** Session minute the exercise started at. */
  start: number;
}

/** Turn scripted faults into engine chaos against the current architecture; faults with no matching component are dropped. */
export function resolveFaults(faults: GameDayFault[], arch: Arch): { chaos: Chaos[]; skipped: number } {
  const chaos: Chaos[] = [];
  let skipped = 0;
  for (const f of faults) {
    if (f.type === 'az-outage') chaos.push({ type: 'az-outage', az: f.az });
    else if (f.type === 'spike') chaos.push({ type: 'spike', mult: f.mult });
    else {
      const node = arch.nodes.find((n) => f.target.roles.includes(roleOf(n)));
      if (!node) skipped++;
      else if (f.type === 'slow') chaos.push({ type: 'slow', nodeId: node.id, mult: f.mult });
      else chaos.push({ type: 'node-down', nodeId: node.id });
    }
  }
  return { chaos, skipped };
}

export function stepAt(day: GameDay, run: GameDayRun, minute: number): GameDayStep | undefined {
  return day.steps.find((s) => run.start + s.at === minute);
}

export function isFinished(run: GameDayRun, minute: number): boolean {
  const day = GAME_DAY_BY_ID[run.id];
  return !day || minute >= run.start + day.minutes;
}

export interface GameDayScore {
  /** Minutes of the exercise in which customers were hurt. */
  impactMinutes: number;
  failedRequests: number;
  /** Minutes from the first hurt minute until your monitoring would have told you (your design's detection time). */
  detectionMinutes: number | null;
  /** Minutes from the first hurt minute until service was healthy again (null: not yet / never). */
  recoveryMinutes: number | null;
  impactPoints: number;
  detectionPoints: number;
  recoveryPoints: number;
  total: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  finished: boolean;
  notes: string[];
}

/** True when the design is already hurting customers before any fault: the exercise would only measure that. */
export function alreadyFailing(latest: Snapshot | undefined): boolean {
  return !!latest && latest.system.successRate < IMPACT_THRESHOLD;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Score a run from the telemetry recorded since it started. `window` is every snapshot from the start minute on. */
export function scoreGameDay(day: GameDay, window: Snapshot[], arch: Arch, finished: boolean): GameDayScore {
  const hurt = window.map((s) => s.system.successRate < IMPACT_THRESHOLD);
  const first = hurt.indexOf(true);
  const impactMinutes = hurt.filter(Boolean).length;
  const failedRequests = Math.round(window.reduce((a, s) => a + s.system.failedRequests, 0));
  const obs = analyzeObservability(arch);
  const notes: string[] = [];

  const detectionMinutes = first === -1 ? null : obs.mttdMinutes;
  let recoveryMinutes: number | null = null;
  if (first !== -1) {
    const lastHurt = hurt.lastIndexOf(true);
    if (lastHurt < window.length - 1) recoveryMinutes = lastHurt + 1 - first;
  }

  // Customer impact: 50 points, spent in proportion to how much of the exercise hurt customers.
  const impactPoints = Math.round(50 * (1 - clamp(impactMinutes / Math.max(1, day.minutes * 0.6), 0, 1)));
  // Detection: 20 points; a fifteen-minute blind spot (no alerting at all) earns nothing.
  const detectionPoints = detectionMinutes === null ? 20 : Math.round(20 * (1 - clamp(detectionMinutes / 15, 0, 1)));
  // Recovery: 30 points; never recovering earns nothing, a quick recovery earns most of it.
  const recoveryPoints =
    first === -1 ? 30 : recoveryMinutes === null ? 0 : Math.round(30 * (1 - clamp((recoveryMinutes - 1) / 20, 0, 1)));
  const total = impactPoints + detectionPoints + recoveryPoints;

  if (first === -1) notes.push('Customers never noticed: the design absorbed every fault.');
  else {
    notes.push(`Customers were hurt for ${impactMinutes} of ${window.length} minutes.`);
    if (obs.alerts === 0) notes.push('No alert rules: you would have learned about this from customers.');
    else if (!obs.actionableAlerts) notes.push('Alerts fire but link to no runbook, which slows the response.');
    if (recoveryMinutes === null && finished) notes.push('Service had not recovered when the exercise ended.');
  }
  const grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 55 ? 'C' : total >= 35 ? 'D' : 'F';
  return { impactMinutes, failedRequests, detectionMinutes, recoveryMinutes, impactPoints, detectionPoints, recoveryPoints, total, grade, finished, notes };
}
