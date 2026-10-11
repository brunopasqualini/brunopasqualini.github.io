import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { MISSIONS } from '@/content/missions';
import { SAVE_SCHEMA_VERSION, migrateSave } from '@/game/migrate';
import { createDraftSlice } from './draftSlice';
import { createLabSlice } from './labSlice';
import { createOutcomeSlice } from './outcomeSlice';
import { debouncedStorage, emptyProgress } from './persistence';
import { createSaveSlice } from './saveSlice';
import { createSessionSlice } from './sessionSlice';
import type { Store } from './types';
import { createUiSlice } from './uiSlice';
import { createViewSlice } from './viewSlice';

export const useGame = create<Store>()(
  persist(
    (...a) => ({
      ...createSaveSlice(...a),
      ...createSessionSlice(...a),
      ...createUiSlice(...a),
      ...createDraftSlice(...a),
      ...createViewSlice(...a),
      ...createOutcomeSlice(...a),
      ...createLabSlice(...a),
    }),
    {
      name: 'engineering-ops-save-v1',
      version: SAVE_SCHEMA_VERSION,
      migrate: (persisted, from) => migrateSave(persisted, from) as never,
      storage: createJSONStorage(() => debouncedStorage),
      partialize: (s) => ({ progress: s.progress, settings: s.settings, saved: s.saved }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>;
        return { ...current, ...p, progress: { ...emptyProgress(), ...(p.progress ?? {}) } };
      },
    },
  ),
);

export { inheritedFrom } from './openMission';
export type { Progress, SavedSession, Settings, Store, Toast } from './types';

export function unlockedTier(level: number, showAll: boolean): 1 | 2 | 3 {
  if (showAll) return 3;
  return level >= 4 ? 3 : level >= 2 ? 2 : 1;
}

export const ALL_MISSIONS = MISSIONS;
