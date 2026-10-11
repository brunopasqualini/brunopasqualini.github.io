import type { StateCreator } from 'zustand';
import type { ADR, Postmortem, SkillId } from '@/content/missions/types';
import type { Arch } from '@/engine/types';
import type { Evidence, Stats } from '@/game/progression';
import type { Outcome } from '@/game/scoring';
import type { Mode, Op } from '@/game/session';
import type { UiSlice } from './uiSlice';
import type { SaveSlice } from './saveSlice';
import type { SessionSlice } from './sessionSlice';
import type { DraftSlice } from './draftSlice';
import type { ViewSlice } from './viewSlice';
import type { OutcomeSlice } from './outcomeSlice';
import type { LabSlice } from './labSlice';

export interface SavedSession {
  mode: Mode;
  attempt: number;
  ops: Op[];
  draft: Arch;
  initialArch?: Arch;
  panelsSeen: string[];
  chosenCauses: string[];
  hintsUsed: number;
  adrs: ADR[];
  postmortem?: Postmortem;
  /** Simulation behaviour this log was recorded under (see game/simVersion). */
  simVersion?: number;
  /** Decision tags inherited when this run started; replay needs them to rebuild the same start state. */
  inherited?: string[];
  updatedAt: number;
}

export interface Progress {
  xp: number;
  completed: Record<string, Outcome>;
  attempts: Record<string, number>;
  outcomes: Outcome[];
  skillXp: Record<SkillId, number>;
  evidence: Record<SkillId, Evidence[]>;
  achievements: Record<string, number>;
  adrs: (ADR & { missionId: string; at: number })[];
  postmortems: { missionId: string; at: number; pm: Postmortem }[];
  lessons: { missionId: string; at: number; text: string }[];
  experiments: { id: string; at: number; name: string; note: string; metrics: Record<string, number> }[];
  designs: { id: string; name: string; arch: Arch; savedAt: number }[];
  stats: Stats;
}

export interface Settings {
  mode: Mode;
  onboarded: boolean;
  showAllComponents: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
}

/** The whole store is the sum of its slices; each slice file owns one concern. */
export type Store = UiSlice & SaveSlice & SessionSlice & DraftSlice & ViewSlice & OutcomeSlice & LabSlice;

export type Slice<T> = StateCreator<Store, [['zustand/persist', unknown]], [], T>;
