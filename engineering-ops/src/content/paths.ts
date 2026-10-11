import type { SkillId } from '@/content/missions/types';

export interface LearningPath {
  id: string;
  title: string;
  who: string;
  /** What someone finishing the path can do. */
  outcome: string;
  /** Missions in the order to take them; every prerequisite is earlier in the list. */
  missions: string[];
  /** Lab practice (a template id from content/templates.ts); optional, not tracked. */
  drills: string[];
  /** The skill branches this path builds most. */
  skills: SkillId[];
}

export const PATHS: LearningPath[] = [
  {
    id: 'backend',
    title: 'Backend developer',
    who: 'You write services and want to know why they fall over in production.',
    outcome: 'Read evidence before changing code, and design for retries, queues and safe releases.',
    missions: ['m7-n-plus-one', 'm2-db-meltdown', 'm8-impatient-client', 'm5-queue', 'm1-monolith', 'm3-deployment'],
    drills: ['drill-retry'],
    skills: ['se', 'sd', 'data'],
  },
  {
    id: 'architect',
    title: 'Cloud architect',
    who: 'You choose the shape of systems: networks, data stores, regions and trade-offs.',
    outcome: 'Defend an architecture against traffic, failure and cost, and design one from a blank page.',
    missions: ['m1-monolith', 'm2-db-meltdown', 'm3-deployment', 'm4-network', 'm10-stale-receipt', 'm9-merger', 'm14-blank-page'],
    drills: ['drill-az'],
    skills: ['sa', 'aws', 'net'],
  },
  {
    id: 'sre',
    title: 'Site reliability engineer',
    who: 'You are on call, or want to be, and care about detection, recovery and limits.',
    outcome: 'Diagnose incidents quickly, contain blast radius, and survive losing a zone or a Region.',
    missions: ['m2-db-meltdown', 'm8-impatient-client', 'm1-monolith', 'm3-deployment', 'm12-noisy-neighbour', 'm13-regional-outage'],
    drills: ['drill-az', 'drill-spike'],
    skills: ['sre', 'devops', 'plat'],
  },
  {
    id: 'finops',
    title: 'FinOps engineer',
    who: 'You own the cloud bill and need to cut cost without cutting reliability.',
    outcome: 'Find what drives spend, and trade money for resilience on purpose.',
    missions: ['m2-db-meltdown', 'm5-queue', 'm1-monolith', 'm3-deployment', 'm4-network', 'm6-bill-shock', 'm11-hot-key'],
    drills: ['drill-spike'],
    skills: ['finops', 'aws', 'data'],
  },
];

export const PATH_BY_ID: Record<string, LearningPath> = Object.fromEntries(PATHS.map((p) => [p.id, p]));
