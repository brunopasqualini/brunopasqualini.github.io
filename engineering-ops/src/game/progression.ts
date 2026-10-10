import { MISSIONS } from '@/content/missions';
import type { SkillId } from '@/content/missions/types';
import type { Outcome } from '@/game/scoring';

export const SKILLS: { id: SkillId; label: string; blurb: string }[] = [
  { id: 'se', label: 'Software Engineering', blurb: 'Writing, testing and shipping maintainable code.' },
  { id: 'sa', label: 'Software Architecture', blurb: 'Boundaries, coupling, cohesion and evolution.' },
  { id: 'sd', label: 'System Design & Distributed Systems', blurb: 'Capacity, consistency, queues and failure modes.' },
  { id: 'aws', label: 'AWS & Cloud Architecture', blurb: 'Choosing and combining managed building blocks.' },
  { id: 'net', label: 'Networking & Security', blurb: 'Routes, boundaries, least privilege.' },
  { id: 'devops', label: 'DevOps & CI/CD', blurb: 'Safe, repeatable delivery.' },
  { id: 'plat', label: 'Platform Engineering', blurb: 'Golden paths and self-service.' },
  { id: 'sre', label: 'SRE & Observability', blurb: 'SLOs, detection, diagnosis, recovery.' },
  { id: 'data', label: 'Data Engineering Fundamentals', blurb: 'Stores, pipelines, correctness of data.' },
  { id: 'finops', label: 'Cost Optimization & FinOps', blurb: 'Right-sizing and cost attribution.' },
];

export const SKILL_THRESHOLDS = [0, 30, 80, 150, 250, 400];
export const SKILL_TITLES = ['Unranked', 'Apprentice', 'Practitioner', 'Proficient', 'Expert', 'Principal'];

export function skillLevel(xp: number): number {
  let lv = 0;
  SKILL_THRESHOLDS.forEach((t, i) => {
    if (xp >= t && i > 0) lv = i;
  });
  return lv;
}

export function levelFromXp(xp: number): number {
  return 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 60));
}
export function xpForLevel(level: number): number {
  return 60 * (level - 1) ** 2;
}

export interface Evidence {
  missionId: string;
  title: string;
  overall: number;
  note: string;
  at: number;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  test: (o: Outcome, p: { completed: Record<string, Outcome>; adrCount: number; stats: Stats }) => boolean;
}

export interface Stats {
  deploys: number;
  reverts: number;
  simMinutes: number;
  failedAttempts: number;
  retryAmplification: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first-blood', title: 'First Resolution', desc: 'Complete your first mission.', test: (o) => o.passed },
  { id: 'perfectionist', title: 'Principal Material', desc: 'Score 90+ overall on a mission.', test: (o) => o.passed && o.overall >= 90 },
  { id: 'unaided', title: 'Unaided', desc: 'Pass a mission without using any hints.', test: (o) => o.passed && o.hintsUsed === 0 },
  {
    id: 'budget-hawk',
    title: 'Budget Hawk',
    desc: 'Pass Cloud Bill Shock under 85% of its budget.',
    test: (o) => o.missionId === 'm6-bill-shock' && o.passed && o.metrics.cost <= 0.85 * 2500,
  },
  {
    id: 'least-privilege',
    title: 'Least Privilege',
    desc: 'Pass the networking mission with a perfect security score.',
    test: (o) => o.missionId === 'm4-network' && o.passed && o.metrics.securityScore >= 98,
  },
  {
    id: 'postmortem-pro',
    title: 'Blameless & Thorough',
    desc: 'Write a postmortem scoring 80+ for rationale.',
    test: (o) => (o.dims.find((d) => d.id === 'rationale')?.score ?? 0) >= 80,
  },
  {
    id: 'learn-from-failure',
    title: 'Learned the Hard Way',
    desc: 'Pass a mission on a retry after a failed attempt.',
    test: (o) => o.passed && o.attempt > 1,
  },
  { id: 'architect', title: 'Decision Maker', desc: 'Record three Architecture Decision Records.', test: (_o, p) => p.adrCount >= 3 },
  {
    id: 'sre',
    title: 'On-Call Hero',
    desc: 'Pass all three incident missions.',
    test: (_o, p) => ['m2-db-meltdown', 'm3-deployment', 'm5-queue'].every((id) => p.completed[id]?.passed),
  },
  {
    id: 'campaign',
    title: 'Campaign Complete',
    desc: 'Pass every campaign mission.',
    test: (_o, p) => MISSIONS.every((m) => p.completed[m.id]?.passed),
  },
  {
    id: 'root-cause',
    title: 'Fix the Cause',
    desc: 'Remove the N+1 pattern in code without buying a bigger database.',
    test: (o) =>
      o.missionId === 'm7-n-plus-one' &&
      o.passed &&
      (o.decisions ?? []).some((d) => d.tag === 'm7-n-plus-one:fixed-in-code') &&
      !(o.decisions ?? []).some((d) => d.tag === 'm7-n-plus-one:bought-a-bigger-database'),
  },
  {
    id: 'principal',
    title: 'Principal Engineer',
    desc: 'Pass the capstone: The Merger.',
    test: (o) => o.missionId === 'm9-merger' && o.passed,
  },
];

export const LEVEL_UNLOCKS: Record<number, string> = {
  2: 'Sandbox unlocks caching, queues and CDN (tier 2 components).',
  4: 'Sandbox unlocks event buses, search, EKS and platform tooling (tier 3 components).',
};
