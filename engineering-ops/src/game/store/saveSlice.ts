import type { Mode } from '@/game/session';
import { SIM_VERSION } from '@/game/simVersion';
import { emptyProgress } from './persistence';
import type { Progress, SavedSession, Settings, Slice } from './types';

export interface SaveSlice {
  progress: Progress;
  settings: Settings;
  saved: Record<string, SavedSession>;
  setMode: (m: Mode) => void;
  finishOnboarding: () => void;
  setShowAll: (v: boolean) => void;
  resetAll: () => void;
  exportSave: () => string;
  importSave: (json: string) => boolean;
}

export const createSaveSlice: Slice<SaveSlice> = (set, get) => {
  return {
    progress: emptyProgress(),
    settings: { mode: 'beginner', onboarded: false, showAllComponents: false },
    saved: {},

    setMode: (m) => {
      const { session } = get();
      if (session) session.mode = m;
      set((s) => ({ settings: { ...s.settings, mode: m } }));
    },
    finishOnboarding: () => set((s) => ({ settings: { ...s.settings, onboarded: true } })),
    setShowAll: (v) => set((s) => ({ settings: { ...s.settings, showAllComponents: v } })),
    resetAll: () => {
      set({ progress: emptyProgress(), saved: {}, session: null, running: false, debrief: null });
    },
    exportSave: () => JSON.stringify({ v: 1, sim: SIM_VERSION, progress: get().progress, saved: get().saved, settings: get().settings }),
    importSave: (json) => {
      try {
        const d = JSON.parse(json);
        if (!d || d.v !== 1 || !d.progress) return false;
        set({
          progress: { ...emptyProgress(), ...d.progress },
          saved: d.saved ?? {},
          settings: { ...get().settings, ...(d.settings ?? {}) },
          session: null,
        });
        return true;
      } catch {
        return false;
      }
    },
  };
};
