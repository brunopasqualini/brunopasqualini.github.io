import type { Role } from '@/engine/types';

/** Which component a scripted fault lands on, resolved against the live architecture when it fires. */
export type FaultTarget = { roles: Role[] };

export type GameDayFault =
  | { type: 'slow'; target: FaultTarget; mult: number }
  | { type: 'node-down'; target: FaultTarget }
  | { type: 'az-outage'; az: string }
  | { type: 'spike'; mult: number };

export interface GameDayStep {
  /** Minutes after the game day starts. */
  at: number;
  /** What the on-call engineer is told (the fault itself is not named). */
  announce: string;
  /** The complete set of faults active from this minute on (replaces the previous set). */
  faults: GameDayFault[];
}

export interface GameDay {
  id: string;
  title: string;
  blurb: string;
  /** What the exercise is meant to teach. */
  teaches: string;
  /** Total length, including a calm tail so recovery can be measured. */
  minutes: number;
  steps: GameDayStep[];
}

export const GAME_DAYS: GameDay[] = [
  {
    id: 'bad-deploy',
    title: 'Bad deploy, then a slow database',
    blurb: 'A release makes the application tier slow. While you react, the database starts struggling too.',
    teaches: 'Compounding failures, rollback speed, and why timeouts and capacity headroom matter.',
    minutes: 40,
    steps: [
      {
        at: 5,
        announce: 'Release 214 rolled out. Latency is creeping up.',
        faults: [{ type: 'slow', target: { roles: ['compute'] }, mult: 4 }],
      },
      {
        at: 14,
        announce: 'The database is now slow on top of the release regression.',
        faults: [
          { type: 'slow', target: { roles: ['compute'] }, mult: 4 },
          { type: 'slow', target: { roles: ['db'] }, mult: 5 },
        ],
      },
      {
        at: 24,
        announce: 'The release has been rolled back. The database is still recovering.',
        faults: [{ type: 'slow', target: { roles: ['db'] }, mult: 2 }],
      },
      { at: 30, announce: 'Everything is back to normal.', faults: [] },
    ],
  },
  {
    id: 'az-loss',
    title: 'Availability zone loss during peak',
    blurb: 'Zone A goes dark while traffic is climbing.',
    teaches: 'Multi-AZ placement, spare capacity for failover, and autoscaling lag.',
    minutes: 35,
    steps: [
      { at: 4, announce: 'Traffic is climbing faster than forecast.', faults: [{ type: 'spike', mult: 2 }] },
      {
        at: 10,
        announce: 'Zone A reports a power event.',
        faults: [
          { type: 'spike', mult: 2 },
          { type: 'az-outage', az: 'a' },
        ],
      },
      { at: 22, announce: 'Zone A is back; traffic is easing.', faults: [] },
    ],
  },
  {
    id: 'cascade',
    title: 'Cascade: node loss, spike and slow dependency',
    blurb: 'A compute node dies, a marketing email sends traffic up, and the datastore slows under the load.',
    teaches: 'Retry storms, backpressure, load shedding, and degrading gracefully instead of falling over.',
    minutes: 45,
    steps: [
      { at: 5, announce: 'A compute instance stopped responding.', faults: [{ type: 'node-down', target: { roles: ['compute'] } }] },
      {
        at: 12,
        announce: 'A campaign email just landed. Traffic is surging.',
        faults: [
          { type: 'node-down', target: { roles: ['compute'] } },
          { type: 'spike', mult: 3 },
        ],
      },
      {
        at: 20,
        announce: 'The datastore is struggling with the load.',
        faults: [
          { type: 'spike', mult: 3 },
          { type: 'slow', target: { roles: ['db', 'kv'] }, mult: 4 },
        ],
      },
      { at: 32, announce: 'The campaign is over and the node is replaced.', faults: [] },
    ],
  },
];

export const GAME_DAY_BY_ID: Record<string, GameDay> = Object.fromEntries(GAME_DAYS.map((g) => [g.id, g]));
