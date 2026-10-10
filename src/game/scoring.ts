import type { Report } from '@/engine/analysis';
import type { Arch, Snapshot, Workload } from '@/engine/types';
import type { ADR, Decision, DimensionId, EvalCtx, Mission, Postmortem, Requirement, SkillId } from '@/content/missions/types';

export const DIMENSIONS: { id: DimensionId; label: string; blurb: string }[] = [
  { id: 'reliability', label: 'Reliability', blurb: 'Availability against the target, resilience to AZ loss, recoverability.' },
  { id: 'performance', label: 'Performance', blurb: 'Tail latency against the mission target.' },
  { id: 'cost', label: 'Cost efficiency', blurb: 'Simulated monthly cost against the budget.' },
  { id: 'security', label: 'Security', blurb: 'Open findings weighted by severity.' },
  { id: 'maintainability', label: 'Maintainability', blurb: 'Cohesion of modules, coupling through shared data.' },
  { id: 'opSimplicity', label: 'Operational simplicity', blurb: 'Fewer moving parts to deploy, monitor and page on.' },
  { id: 'devProductivity', label: 'Developer productivity', blurb: 'Independent deployability and delivery automation.' },
  { id: 'diagnosis', label: 'Quality of diagnosis', blurb: 'Evidence gathered and root-cause hypothesis accuracy.' },
  {
    id: 'correctness',
    label: 'Correctness of implementation',
    blurb: 'Share of mission requirements satisfied (hard requirements count double).',
  },
  { id: 'rationale', label: 'Engineering rationale', blurb: 'Depth of the ADR / postmortem: trade-offs, evidence, prevention.' },
];

export interface RequirementResult {
  id: string;
  label: string;
  hard: boolean;
  pass: boolean;
  detail: string;
  why: string;
}

export interface DimensionScore {
  id: DimensionId;
  label: string;
  score: number | null;
  weight: number;
  note: string;
}

export interface Outcome {
  missionId: string;
  passed: boolean;
  failedIncident: boolean;
  overall: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D';
  dims: DimensionScore[];
  reqs: RequirementResult[];
  xp: number;
  skillXp: Partial<Record<SkillId, number>>;
  hintsUsed: number;
  minutes: number;
  attempt: number;
  diagnosis?: { chosen: string[]; correct: string[]; panelsSeen: number; panelsNeeded: number };
  metrics: Record<string, number>;
  /** Choices recorded for later missions to react to (see Mission.decisions). */
  decisions?: Decision[];
  finishedAt: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const KEYWORDS = [
  'trade',
  'because',
  'alternativ',
  'risk',
  'cost',
  'complex',
  'secur',
  'reliab',
  'rollback',
  'monitor',
  'test',
  'operat',
  'latency',
  'scale',
  'evidence',
  'prevent',
];

export function textDepth(text: string): number {
  const t = text.trim().toLowerCase();
  if (!t) return 0;
  const words = t.split(/\s+/).length;
  const hits = KEYWORDS.filter((k) => t.includes(k)).length;
  return clamp(Math.min(1, words / 18) * 0.55 + Math.min(1, hits / 2) * 0.45, 0, 1);
}

export function adrQuality(a: ADR): number {
  const fields = [a.context, a.problem, a.options, a.decision, a.pros, a.cons, a.implications];
  const complete = fields.filter((f) => f.trim().length >= 12).length / fields.length;
  const depth = fields.reduce((s, f) => s + textDepth(f), 0) / fields.length;
  return clamp(100 * (0.6 * complete + 0.4 * depth), 0, 100);
}

export function postmortemQuality(p: Postmortem): number {
  const fields = [p.what, p.impact, p.evidence, p.restored, p.worsened, p.prevent];
  const complete = fields.filter((f) => f.trim().length >= 12).length / fields.length;
  const depth = fields.reduce((s, f) => s + textDepth(f), 0) / fields.length;
  return clamp(100 * (0.6 * complete + 0.4 * depth), 0, 100);
}

export function evalRequirement(r: Requirement, c: EvalCtx): RequirementResult {
  if (r.check) {
    const res = r.check(c);
    return { id: r.id, label: r.label, hard: r.hard, pass: res.pass, detail: res.detail, why: r.why };
  }
  const v = c.report.metrics[r.metric!] ?? 0;
  const value = r.value ?? 0;
  const pass =
    r.op === '>='
      ? v >= value
      : r.op === '<='
        ? v <= value
        : r.op === '>'
          ? v > value
          : r.op === '<'
            ? v < value
            : Math.abs(v - value) < 1e-9;
  const f = (x: number) => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(2));
  return { id: r.id, label: r.label, hard: r.hard, pass, detail: `${r.metric} = ${f(v)} (needs ${r.op} ${f(value)})`, why: r.why };
}

export interface ScoreInput {
  mission: Mission;
  arch: Arch;
  window: Snapshot[];
  report: Report;
  workload: Workload;
  flags: Record<string, any>;
  actionsTaken: string[];
  adrs: ADR[];
  postmortem?: Postmortem;
  chosenCauses: string[];
  panelsSeen: string[];
  hintsUsed: number;
  minutes: number;
  attempt: number;
  failedIncident: boolean;
  firstCompletion: boolean;
}

const BASE_XP = { Beginner: 100, Intermediate: 180, Advanced: 280 } as const;

export function scoreMission(inp: ScoreInput): Outcome {
  const { mission: m, report, window } = inp;
  const snap = window[window.length - 1];
  const ctx: EvalCtx = {
    arch: inp.arch,
    report,
    snap,
    workload: inp.workload,
    flags: inp.flags,
    actionsTaken: inp.actionsTaken,
    adrs: inp.adrs,
    postmortem: inp.postmortem,
  };
  const reqs = m.requirements.map((r) => evalRequirement(r, ctx));
  const x = report.metrics;

  const availTarget = m.constraints.availability ?? 99.5;
  const reliability = clamp(
    clamp((x.availability - 90) / Math.max(0.1, availTarget - 90), 0, 1) * 68 + (x.azSurvival / 100) * 14 + (x.recoverability / 100) * 18,
    0,
    100,
  );
  const p95T = m.constraints.p95 ?? 500;
  const performance = x.p95 <= p95T ? 100 : clamp(100 - (100 * (x.p95 - p95T)) / p95T, 0, 100);
  const budget = m.constraints.budget ?? (m.baselineCost ? m.baselineCost * 1.1 : undefined);
  const cost =
    budget == null
      ? 70
      : x.cost <= budget
        ? clamp(70 + 30 * (1 - x.cost / budget) * 1.6, 70, 100)
        : clamp(70 - (100 * (x.cost - budget)) / budget, 0, 70);
  const security = x.securityScore;
  const maintainability = x.maintainability;
  const opSimplicity = 100 - x.opComplexity;
  const devProductivity = x.devProductivity;
  const correctness = (() => {
    const tot = reqs.reduce((s, r) => s + (r.hard ? 2 : 1), 0);
    const ok = reqs.reduce((s, r) => s + (r.pass ? (r.hard ? 2 : 1) : 0), 0);
    return tot ? (100 * ok) / tot : 100;
  })();

  let diagnosis: number | null = null;
  let diagnosisInfo: Outcome['diagnosis'];
  if (m.rootCauses.length) {
    const correct = m.rootCauses.filter((c) => c.correct).map((c) => c.id);
    const chosen = inp.chosenCauses;
    const tp = chosen.filter((c) => correct.includes(c)).length;
    const fp = chosen.length - tp;
    const precision = chosen.length ? tp / chosen.length : 0;
    const recall = correct.length ? tp / correct.length : 1;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const needed = Array.from(new Set(m.rootCauses.filter((c) => c.correct).flatMap((c) => c.evidencePanels)));
    const seen = needed.filter((p) => inp.panelsSeen.includes(p)).length;
    const seenFrac = needed.length ? seen / needed.length : 1;
    const hintFactor = Math.max(0, 1 - 0.25 * inp.hintsUsed);
    diagnosis = clamp(100 * (0.55 * f1 + 0.33 * seenFrac + 0.12 * hintFactor) - fp * 5, 0, 100);
    diagnosisInfo = { chosen, correct, panelsSeen: seen, panelsNeeded: needed.length };
  }

  const rationaleParts: number[] = [];
  if (m.needsADR) rationaleParts.push(inp.adrs.length ? Math.max(...inp.adrs.map(adrQuality)) : 0);
  if (m.needsPostmortem) rationaleParts.push(inp.postmortem ? postmortemQuality(inp.postmortem) : 0);
  const rationale = rationaleParts.length ? rationaleParts.reduce((a, b) => a + b, 0) / rationaleParts.length : null;

  const scores: Record<DimensionId, [number | null, string]> = {
    reliability: [
      reliability,
      `Availability ${x.availability.toFixed(2)}% vs target ${availTarget}%; survives AZ loss at ${x.azSurvival.toFixed(0)}%; recoverability ${x.recoverability.toFixed(0)}/100.`,
    ],
    performance: [performance, `p95 ${x.p95.toFixed(0)} ms vs target ${p95T} ms.`],
    cost: [
      cost,
      budget == null
        ? `Estimated $${x.cost.toFixed(0)}/mo (no hard budget set).`
        : `$${x.cost.toFixed(0)}/mo against a $${budget.toFixed(0)} budget (simulated estimate).`,
    ],
    security: [security, `${x.criticalFindings} critical and ${x.highFindings} high finding(s) open.`],
    maintainability: [maintainability, `Cohesion/coupling analysis of the deployable units.`],
    opSimplicity: [opSimplicity, `${x.units} deployable unit(s); complexity ${x.opComplexity.toFixed(0)}/100.`],
    devProductivity: [devProductivity, `Independent deployability and automation.`],
    diagnosis: [
      diagnosis,
      diagnosisInfo
        ? `${diagnosisInfo.panelsSeen}/${diagnosisInfo.panelsNeeded} key evidence panels consulted; hypothesis ${diagnosisInfo.chosen.length ? 'recorded' : 'missing'}.`
        : 'n/a',
    ],
    correctness: [correctness, `${reqs.filter((r) => r.pass).length}/${reqs.length} requirements met.`],
    rationale: [rationale, rationale == null ? 'n/a' : `Quality of recorded reasoning (trade-offs, evidence, prevention).`],
  };

  const dims: DimensionScore[] = DIMENSIONS.map((d) => ({
    id: d.id,
    label: d.label,
    score: scores[d.id][0] == null ? null : Math.round(scores[d.id][0]!),
    weight: m.weights[d.id] ?? 0,
    note: scores[d.id][1],
  }));
  const used = dims.filter((d) => d.weight > 0 && d.score != null);
  const wsum = used.reduce((s, d) => s + d.weight, 0) || 1;
  const overall = Math.round(used.reduce((s, d) => s + d.score! * d.weight, 0) / wsum);
  const allHard = reqs.filter((r) => r.hard).every((r) => r.pass);
  const passed = allHard && !inp.failedIncident;
  const grade: Outcome['grade'] = overall >= 90 ? 'S' : overall >= 80 ? 'A' : overall >= 65 ? 'B' : overall >= 50 ? 'C' : 'D';

  const factor = (overall / 100) * (passed ? 1 : 0.3) * (inp.firstCompletion || !passed ? 1 : 0.4);
  const xp = Math.round(BASE_XP[m.difficulty] * factor);
  const skillXp: Outcome['skillXp'] = {};
  for (const [k, v] of Object.entries(m.skills))
    skillXp[k as SkillId] = Math.round((v ?? 0) * (overall / 100) * (passed ? 1 : 0.3) * (inp.firstCompletion || !passed ? 1 : 0.4));

  return {
    missionId: m.id,
    passed,
    failedIncident: inp.failedIncident,
    overall,
    grade,
    dims,
    reqs,
    xp,
    skillXp,
    hintsUsed: inp.hintsUsed,
    minutes: inp.minutes,
    attempt: inp.attempt,
    diagnosis: diagnosisInfo,
    metrics: x,
    finishedAt: Date.now(),
  };
}
