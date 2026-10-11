import type { ADR, PanelId, Postmortem } from '@/content/missions/types';
import { advance, applyAction, deployDraft, missionOf, revertLast, type Session } from '@/game/session';
import { emptyUndo } from '@/game/undo';
import { openMission } from './openMission';
import { persistence } from './persistence';
import type { Slice } from './types';

export interface SessionSlice {
  session: Session | null;
  tick: number;
  running: boolean;
  speed: 1 | 4 | 16;
  labTemplate: string;
  drill?: { title: string; goal: string };
  openMission: (id: string, opts?: { fresh?: boolean; template?: string }) => void;
  closeSession: () => void;
  retryMission: (id: string) => void;
  startIncident: () => void;
  setRunning: (v: boolean) => void;
  setSpeed: (s: 1 | 4 | 16) => void;
  step: (n: number) => void;
  deploy: () => void;
  revert: () => void;
  act: (id: string) => void;
  visitPanel: (p: PanelId) => void;
  nextHint: () => void;
  setHypothesis: (ids: string[]) => void;
  saveADR: (a: Omit<ADR, 'id' | 'minute'>) => void;
  savePostmortem: (p: Postmortem) => void;
}

export const createSessionSlice: Slice<SessionSlice> = (set, get) => {
  const { persistSession, persistSoon } = persistence(set, get);
  return {
    session: null,
    tick: 0,
    running: false,
    speed: 1,
    labTemplate: 'three-tier',

    openMission: (id, opts = {}) => openMission(set, get, id, opts),
    closeSession: () => {
      persistSession();
      set({ session: null, running: false, debrief: null });
    },
    retryMission: (id) => {
      const saved = { ...get().saved };
      delete saved[id];
      set({ saved, debrief: null });
      get().openMission(id, { fresh: true });
    },
    startIncident: () => {
      set({ introOpen: false, running: missionOf(get().session?.missionId ?? '').kind === 'incident' });
    },

    setRunning: (v) => set((s) => ({ running: v, view: v ? { owner: null, minute: null } : s.view })),
    setSpeed: (s) => set({ speed: s }),
    step: (n) => {
      const { session, progress } = get();
      if (get().view.minute !== null) set({ view: { owner: null, minute: null } });
      if (!session) return;
      const wasFailed = session.failed;
      advance(session, n);
      if (!wasFailed && session.failed) {
        get().toast(missionOf(session.missionId).failure?.text ?? 'Customer impact budget exceeded.', 'bad');
        set({ running: false });
      }
      if (session.minute % 10 < n)
        set({ progress: { ...progress, stats: { ...progress.stats, simMinutes: progress.stats.simMinutes + 10 } } });
      set((s) => ({ tick: s.tick + 1 }));
      if (session.minute % 6 < n) persistSession();
    },
    deploy: () => {
      const { session, progress } = get();
      if (!session) return;
      set({ view: { owner: null, minute: null } });
      const r = deployDraft(session);
      if (!r.ok) {
        get().toast((r.blocked ?? ['Deploy failed']).slice(0, 3).join(' • '), 'warn');
      } else {
        get().toast('Change deployed. Watch the metrics settle — then read “what changed and why”.', 'good');
        set({ progress: { ...progress, stats: { ...progress.stats, deploys: progress.stats.deploys + 1 } }, rightTab: 'plan' });
      }
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    revert: () => {
      const { session, progress } = get();
      if (!session) return;
      set({ view: { owner: null, minute: null } });
      if (revertLast(session)) {
        get().toast('Reverted to the previous deployed architecture.', 'info');
        set({ progress: { ...progress, stats: { ...progress.stats, reverts: progress.stats.reverts + 1 } } });
      } else get().toast('Nothing to revert.', 'warn');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    act: (id) => {
      const { session } = get();
      if (!session) return;
      set({ view: { owner: null, minute: null } });
      const r = applyAction(session, id);
      // a mission action rewrites the draft as well as the live system, so earlier snapshots no longer apply
      set({ undoState: { owner: session, stack: emptyUndo() } });
      get().toast(r.message, r.ok ? 'good' : 'warn');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    visitPanel: (p) => {
      const { session, settings } = get();
      if (!session || p === 'overview') return; // the overview is a summary, not an investigation step
      if (!session.panelsSeen.includes(p)) {
        session.panelsSeen.push(p);
        const m = missionOf(session.missionId);
        if (m.kind === 'incident' && settings.mode !== 'beginner' && !session.failed) {
          advance(session, 1);
          get().toast(`Investigating “${p}” took 1 simulated minute — the incident keeps running.`, 'info');
        }
        persistSoon();
        set((s) => ({ tick: s.tick + 1 }));
      }
    },
    nextHint: () => {
      const { session } = get();
      if (!session) return;
      const m = missionOf(session.missionId);
      if (session.hintsUsed < m.hints.length) {
        session.hintsUsed += 1;
        set((s) => ({ tick: s.tick + 1 }));
        persistSoon();
      }
    },
    setHypothesis: (ids) => {
      const { session } = get();
      if (!session) return;
      session.chosenCauses = ids;
      set((s) => ({ tick: s.tick + 1 }));
      persistSoon();
    },
    saveADR: (a) => {
      const { session } = get();
      if (!session) return;
      session.adrs.push({ ...a, id: `adr-${Date.now().toString(36)}`, minute: session.minute });
      get().toast('Architecture Decision Record saved to your journal.', 'good');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    savePostmortem: (p) => {
      const { session } = get();
      if (!session) return;
      session.postmortem = p;
      get().toast('Postmortem saved.', 'good');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
  };
};
