import type { Session } from '@/game/session';
import { indexAt, stepView } from '@/game/timeline';
import type { Slice } from './types';

export interface ViewSlice {
  /** Which past minute the canvas is showing (null = live). Tied to the session it was set for, so another mission starts live. */
  view: { owner: Session | null; minute: number | null };
  /** Look back at a past minute (pauses the simulation), or null to return to live. Nothing in the run changes. */
  viewAt: (minute: number | null) => void;
  /** Move the view by n minutes; stepping past the newest minute returns to live. */
  scrub: (delta: number) => void;
}

export const createViewSlice: Slice<ViewSlice> = (set, get) => {
  return {
    view: { owner: null, minute: null },

    viewAt: (minute) => {
      const { session } = get();
      if (!session) return;
      if (minute === null || session.history.length === 0) return set({ view: { owner: null, minute: null } });
      // snap to a minute that has a snapshot, and never to the newest one: that is just "live"
      const i = indexAt(session.history, minute);
      set({ running: false, view: { owner: session, minute: i === session.history.length - 1 ? null : session.history[i].minute } });
    },
    scrub: (delta) => {
      const { session, view } = get();
      if (!session || session.history.length === 0) return;
      const cur = view.owner === session ? view.minute : null;
      const next = stepView(session.history, cur, delta);
      set({ running: next === null ? get().running : false, view: { owner: next === null ? null : session, minute: next } });
    },
  };
};
