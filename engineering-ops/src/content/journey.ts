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

/** Where a new player starts: something is visibly failing, which teaches the whole loop fastest. */
export const FIRST_MISSION = 'm2-db-meltdown';

export const JOURNEY: JourneyStage[] = [
  {
    level: 1,
    title: 'Software Engineer',
    tagline: 'Fix bugs, design APIs, improve code structure, and understand how applications behave.',
    focus: ['Reading evidence before acting', 'Slow queries, indexes and N+1', 'Timeouts and retries'],
    missionIds: ['m2-db-meltdown', 'm7-n-plus-one', 'm8-impatient-client'],
  },
  {
    level: 2,
    title: 'System Designer',
    tagline: 'Design databases, caches, queues, service boundaries, and architectures that handle growth.',
    focus: ['Modularity and service boundaries', 'Queues and idempotency', 'Replication, lag and freshness'],
    missionIds: ['m1-monolith', 'm5-queue', 'm10-stale-receipt'],
  },
  {
    level: 3,
    title: 'Cloud Engineer',
    tagline: 'Build networks, configure AWS services, manage permissions, and design for availability, security and cost.',
    focus: ['VPC, routing and security groups', 'Least privilege', 'Cost attribution and right-sizing', 'Service limits and hot keys'],
    missionIds: ['m4-network', 'm6-bill-shock', 'm11-hot-key'],
  },
  {
    level: 4,
    title: 'Platform Engineer / SRE',
    tagline: 'Automate delivery, build reusable platforms, improve observability, and engineer resilience.',
    focus: ['Safe deployment strategies', 'Rate limiting and load shedding', 'Region-level disaster recovery'],
    missionIds: ['m3-deployment', 'm12-noisy-neighbour', 'm13-regional-outage'],
  },
  {
    level: 5,
    title: 'Principal Engineer / Architect',
    tagline: 'Decide across whole systems, balance competing requirements, manage organisational complexity, design for failure at scale.',
    focus: ['Designing from requirements', 'Cross-system trade-offs', 'Organisational complexity'],
    missionIds: ['m14-blank-page', 'm9-merger'],
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

export function stageProgress(completed: Done, stages: JourneyStage[] = JOURNEY): StageProgress[] {
  return stages.map((stage) => {
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

/** The stage a mission belongs to, if it is mapped. */
export function stageOfMission(id: string): JourneyStage | undefined {
  return JOURNEY.find((s) => s.missionIds.includes(id));
}

/** Mission ids in journey order (stage by stage), then any unmapped ones by number. */
export function journeyOrder<T extends { id: string; number: number }>(missions: T[]): T[] {
  const rank = (m: T) => {
    const st = stageOfMission(m.id);
    return st ? st.level * 100 + st.missionIds.indexOf(m.id) : 1000 + m.number;
  };
  return [...missions].sort((a, b) => rank(a) - rank(b));
}
