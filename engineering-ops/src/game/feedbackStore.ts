import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { upsert, type Feedback } from '@/game/feedback';

/**
 * Feedback lives in its own small store with its own storage key, deliberately outside the game save:
 * it does not change the save schema, is not wiped by "Reset all progress", and can be cleared on its own.
 * Storage access is guarded (a sandboxed iframe can refuse it), in which case feedback simply lasts for the visit.
 */
interface FeedbackStore {
  entries: Feedback[];
  save: (entry: Feedback) => void;
  clear: () => void;
}

export const useFeedback = create<FeedbackStore>()(
  persist(
    (set) => ({
      entries: [],
      save: (entry) => set((s) => ({ entries: upsert(s.entries, entry) })),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'engineering-ops-feedback-v1',
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ entries: s.entries }),
    },
  ),
);
