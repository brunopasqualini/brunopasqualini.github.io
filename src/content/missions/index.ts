import { m10 } from '@/content/missions/m10-stale-receipt';
import { m11 } from '@/content/missions/m11-hot-key';
import { m1 } from '@/content/missions/m1-monolith';
import { m2 } from '@/content/missions/m2-db-meltdown';
import { m3 } from '@/content/missions/m3-deployment';
import { m4 } from '@/content/missions/m4-network';
import { m5 } from '@/content/missions/m5-queue';
import { m6 } from '@/content/missions/m6-bill-shock';
import { m7 } from '@/content/missions/m7-n-plus-one';
import { m8 } from '@/content/missions/m8-impatient-client';
import { m9 } from '@/content/missions/m9-merger';
import type { Mission } from '@/content/missions/types';

export const MISSIONS: Mission[] = [m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11];
export const MISSION_BY_ID: Record<string, Mission> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
export type { Mission } from '@/content/missions/types';
