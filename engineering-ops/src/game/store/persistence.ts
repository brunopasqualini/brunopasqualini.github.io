import { SIM_VERSION } from '@/game/simVersion';
import type { Progress, SavedSession, Store } from './types';

export const emptyProgress = (): Progress => ({
  xp: 0,
  completed: {},
  attempts: {},
  outcomes: [],
  skillXp: { se: 0, sa: 0, sd: 0, aws: 0, net: 0, devops: 0, plat: 0, sre: 0, data: 0, finops: 0 },
  evidence: { se: [], sa: [], sd: [], aws: [], net: [], devops: [], plat: [], sre: [], data: [], finops: [] },
  achievements: {},
  adrs: [],
  postmortems: [],
  lessons: [],
  experiments: [],
  designs: [],
  stats: { deploys: 0, reverts: 0, simMinutes: 0, failedAttempts: 0, retryAmplification: 0 },
});

/** localStorage writes are debounced: the store updates on every simulated minute. */
export const debouncedStorage = (() => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: { name: string; value: string } | undefined;
  const flush = () => {
    if (!pending) return;
    try {
      window.localStorage.setItem(pending.name, pending.value);
    } catch {
      /* storage may be full or blocked */
    }
    pending = undefined;
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);
  return {
    getItem: (name: string) => {
      try {
        return window.localStorage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name: string, value: string) => {
      pending = { name, value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 350);
    },
    removeItem: (name: string) => {
      try {
        window.localStorage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
})();

let persistTimer: ReturnType<typeof setTimeout> | undefined;

type Set = (partial: Partial<Store>) => void;
type Get = () => Store;

/** Saving the current run into `saved`: now, or shortly after the last edit. */
export function persistence(set: Set, get: Get) {
  const persistSession = () => {
    const { session, saved } = get();
    if (!session) return;
    const prev = saved[session.missionId];
    const entry: SavedSession = {
      mode: session.mode,
      attempt: session.attempt,
      ops: session.ops,
      draft: session.draft,
      initialArch: prev?.initialArch,
      panelsSeen: session.panelsSeen,
      chosenCauses: session.chosenCauses,
      hintsUsed: session.hintsUsed,
      adrs: session.adrs,
      postmortem: session.postmortem,
      simVersion: SIM_VERSION,
      inherited: session.inherited,
      updatedAt: Date.now(),
    };
    set({ saved: { ...saved, [session.missionId]: entry } });
  };
  const persistSoon = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistSession, 400);
  };
  return { persistSession, persistSoon };
}
