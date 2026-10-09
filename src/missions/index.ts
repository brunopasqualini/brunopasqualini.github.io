import { m1 } from './m1-monolith';
import { m2 } from './m2-db-meltdown';
import { m3 } from './m3-deployment';
import { m4 } from './m4-network';
import { m5 } from './m5-queue';
import { m6 } from './m6-bill-shock';
import type { Mission } from './types';

export const MISSIONS: Mission[] = [m1, m2, m3, m4, m5, m6];
export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export type { Mission } from './types';
