import { MISSION_BY_ID } from '@/content/missions';
import type { Mission } from '@/content/missions/types';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Workload } from '@/engine/types';

export const LAB_ID = 'lab';
export const LAB_WORKLOAD: Workload = { ...DEFAULT_WORKLOAD, baseRps: 120, profile: [{ t: 0, mult: 1 }] };

export function labMission(): Mission {
  return {
    id: LAB_ID,
    number: 0,
    title: 'Architecture Lab',
    tagline: 'Sandbox',
    difficulty: 'Beginner',
    kind: 'project',
    estMinutes: 0,
    prerequisites: [],
    skills: {},
    learning: [],
    story: '',
    business: { context: '', impact: '' },
    constraints: { notes: [] },
    workload: LAB_WORKLOAD,
    initial: { nodes: [], edges: [] },
    components: [],
    startMinute: 0,
    verifyMinutes: 5,
    verifyAt: 0,
    deployments: [],
    notes: [],
    rootCauses: [],
    actions: [],
    requirements: [],
    weights: {},
    hints: [],
    debrief: { concepts: [], rootCause: '', alternatives: [], mistakes: [], aws: [], experiments: [] },
    seed: 7,
    guidance: [],
    needsPostmortem: false,
    needsADR: false,
  };
}

export function missionOf(id: string): Mission {
  return id === LAB_ID ? labMission() : MISSION_BY_ID[id];
}
