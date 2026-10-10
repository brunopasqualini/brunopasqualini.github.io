/**
 * The engineering journey: five stages of problem complexity, not job titles to earn in sequence.
 * Missions are mapped to the stage whose skills they exercise. A stage with no missions yet is
 * shown honestly as "coming soon" rather than padded with placeholders.
 */
export interface JourneyStage {
  level: 1 | 2 | 3 | 4 | 5;
  title: string;
  tagline: string;
  focus: string[];
  missionIds: string[];
}

export const JOURNEY: JourneyStage[] = [
  {
    level: 1,
    title: 'Software Engineer',
    tagline: 'Fix bugs, design APIs, improve code structure, and understand how applications behave.',
    focus: ['Code structure and modularity', 'How an application behaves under load', 'Reading evidence'],
    missionIds: ['m1-monolith'],
  },
  {
    level: 2,
    title: 'System Designer',
    tagline: 'Design databases, caches, queues, service boundaries, and architectures that handle growth.',
    focus: ['Data stores and indexes', 'Caching and freshness', 'Queues, retries and idempotency'],
    missionIds: ['m2-db-meltdown', 'm5-queue'],
  },
  {
    level: 3,
    title: 'Cloud Engineer',
    tagline: 'Build networks, configure AWS services, manage permissions, and design for availability, security and cost.',
    focus: ['VPC, routing and security groups', 'Least privilege', 'Cost attribution and right-sizing'],
    missionIds: ['m4-network', 'm6-bill-shock'],
  },
  {
    level: 4,
    title: 'Platform Engineer / SRE',
    tagline: 'Automate delivery, build reusable platforms, improve observability, and engineer resilience.',
    focus: ['Safe deployment strategies', 'Observability and SLOs', 'Rollback and recovery'],
    missionIds: ['m3-deployment'],
  },
  {
    level: 5,
    title: 'Principal Engineer / Architect',
    tagline: 'Decide across whole systems, balance competing requirements, manage organisational complexity, design for failure at scale.',
    focus: ['Cross-system trade-offs', 'Organisational complexity', 'Designing for failure at scale'],
    missionIds: [],
  },
];

type Done = Record<string, { passed: boolean } | undefined>;

export interface StageProgress {
  stage: JourneyStage;
  done: number;
  total: number;
  complete: boolean;
  comingSoon: boolean;
}

export function stageProgress(completed: Done): StageProgress[] {
  return JOURNEY.map((stage) => {
    const done = stage.missionIds.filter((id) => completed[id]?.passed).length;
    return {
      stage,
      done,
      total: stage.missionIds.length,
      complete: stage.missionIds.length > 0 && done === stage.missionIds.length,
      comingSoon: stage.missionIds.length === 0,
    };
  });
}

/** The stage the player is working in: the first with unfinished missions; the last playable stage once everything is done. */
export function currentStage(completed: Done): JourneyStage {
  const sp = stageProgress(completed);
  const open = sp.find((s) => !s.comingSoon && !s.complete);
  if (open) return open.stage;
  const last = [...sp].reverse().find((s) => !s.comingSoon);
  return (last ?? sp[0]).stage;
}
