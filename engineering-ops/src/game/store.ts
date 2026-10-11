import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { clone, type ArchDiffItem } from '@/engine/arch';
import type { Report } from '@/engine/analysis';
import type { Chaos } from '@/engine/engine';
import type { Arch, Workload } from '@/engine/types';
import { MISSIONS, MISSION_BY_ID } from '@/content/missions';
import type { ADR, PanelId, Postmortem, SkillId } from '@/content/missions/types';
import { ACHIEVEMENTS, levelFromXp, type Evidence, type Stats } from '@/game/progression';
import type { Outcome } from '@/game/scoring';
import {
  advance,
  applyAction,
  createSession,
  deployDraft,
  LAB_ID,
  LAB_WORKLOAD,
  missionOf,
  replay,
  revertLast,
  setChaos,
  patchWorkload,
  verify,
  describeChaos,
  type Mode,
  type Op,
  type Session,
} from '@/game/session';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { tagsFor } from '@/game/decisions';
import { SAVE_SCHEMA_VERSION, migrateSave } from '@/game/migrate';
import { isReplayCompatible, SIM_VERSION } from '@/game/simVersion';
import { indexAt, stepView } from '@/game/timeline';
import { emptyUndo, record, redo, undo, type UndoStack } from '@/game/undo';

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

const emptyProgress = (): Progress => ({
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

interface Store {
  progress: Progress;
  settings: Settings;
  saved: Record<string, SavedSession>;

  // runtime (not persisted)
  session: Session | null;
  tick: number;
  running: boolean;
  speed: 1 | 4 | 16;
  selection: { type: 'node' | 'edge' | null; id?: string };
  introOpen: boolean;
  debrief: { outcome: Outcome; report: Report; firstTime: boolean } | null;
  toasts: Toast[];
  dock: PanelId;
  dockOpen: boolean;
  rightTab: 'inspect' | 'plan';
  mobilePane: 'mission' | 'canvas' | 'build' | 'evidence';
  labTemplate: string;
  /** Which past minute the canvas is showing (null = live). Tied to the session it was set for, so another mission starts live. */
  view: { owner: Session | null; minute: number | null };
  /** Undo history for the draft. Tied to the session object it was recorded for, so opening another mission starts clean. */
  undoState: { owner: Session | null; stack: UndoStack };
  drill?: { title: string; goal: string };

  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  setMode: (m: Mode) => void;
  finishOnboarding: () => void;
  setShowAll: (v: boolean) => void;

  openMission: (id: string, opts?: { fresh?: boolean; template?: string }) => void;
  closeSession: () => void;
  retryMission: (id: string) => void;
  startIncident: () => void;

  setRunning: (v: boolean) => void;
  /** Look back at a past minute (pauses the simulation), or null to return to live. Nothing in the run changes. */
  viewAt: (minute: number | null) => void;
  /** Move the view by n minutes; stepping past the newest minute returns to live. */
  scrub: (delta: number) => void;
  setSpeed: (s: 1 | 4 | 16) => void;
  step: (n: number) => void;
  editDraft: (fn: (a: Arch) => void) => void;
  /** Remember the draft as it is now, so a continuous edit such as dragging a node can be undone as one step. */
  recordDraft: () => void;
  undoEdit: () => void;
  redoEdit: () => void;
  resetDraft: () => void;
  moveNode: (id: string, pos: { x: number; y: number }) => void;
  select: (type: 'node' | 'edge' | null, id?: string) => void;
  deploy: () => void;
  revert: () => void;
  act: (id: string) => void;
  visitPanel: (p: PanelId) => void;
  setDock: (p: PanelId) => void;
  setDockOpen: (v: boolean) => void;
  setRightTab: (t: Store['rightTab']) => void;
  setMobilePane: (p: Store['mobilePane']) => void;
  nextHint: () => void;
  setHypothesis: (ids: string[]) => void;
  saveADR: (a: Omit<ADR, 'id' | 'minute'>) => void;
  savePostmortem: (p: Postmortem) => void;
  submit: () => void;
  closeDebrief: () => void;
  setIntroOpen: (v: boolean) => void;

  // lab
  setChaosList: (c: Chaos[]) => void;
  setWorkload: (patch: Partial<Workload>) => void;
  saveDesign: (name: string) => void;
  deleteDesign: (id: string) => void;
  loadDesign: (id: string) => void;
  recordExperiment: (name: string, note: string, metrics: Record<string, number>) => void;

  resetAll: () => void;
  exportSave: () => string;
  importSave: (json: string) => boolean;
}

/** localStorage writes are debounced: the store updates on every simulated minute. */
const debouncedStorage = (() => {
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

let toastId = 1;
let persistTimer: ReturnType<typeof setTimeout> | undefined;

export const useGame = create<Store>()(
  persist(
    (set, get) => {
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

      /** Record the draft as it is now into the undo history of the current session. */
      const remember = (session: Session) => {
        const cur = get().undoState;
        const stack = cur.owner === session ? cur.stack : emptyUndo();
        set({ undoState: { owner: session, stack: record(stack, session.draft, Date.now()) } });
      };
      /** After undo/redo the selected component may no longer exist. */
      const dropStaleSelection = (session: Session) => {
        const sel = get().selection;
        if (sel.type === 'node' && !session.draft.nodes.some((n) => n.id === sel.id)) set({ selection: { type: null } });
        if (sel.type === 'edge' && !session.draft.edges.some((e) => e.id === sel.id)) set({ selection: { type: null } });
      };

      return {
        progress: emptyProgress(),
        settings: { mode: 'beginner', onboarded: false, showAllComponents: false },
        saved: {},
        session: null,
        tick: 0,
        running: false,
        speed: 1,
        selection: { type: null },
        introOpen: false,
        debrief: null,
        toasts: [],
        dock: 'overview',
        dockOpen: true,
        rightTab: 'inspect',
        mobilePane: 'canvas',
        labTemplate: 'three-tier',
        view: { owner: null, minute: null },
        undoState: { owner: null, stack: emptyUndo() },

        toast: (text, kind = 'info') => {
          const id = toastId++;
          set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
          setTimeout(() => get().dismissToast(id), kind === 'bad' ? 9000 : 6000);
        },
        dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
        setMode: (m) => {
          const { session } = get();
          if (session) session.mode = m;
          set((s) => ({ settings: { ...s.settings, mode: m } }));
        },
        finishOnboarding: () => set((s) => ({ settings: { ...s.settings, onboarded: true } })),
        setShowAll: (v) => set((s) => ({ settings: { ...s.settings, showAllComponents: v } })),

        openMission: (id, opts = {}) => {
          const { saved, progress, settings } = get();
          const existing = saved[id];
          const stale = !!existing && !isReplayCompatible(existing.simVersion);
          let session: Session;
          let drill: Store['drill'];
          let staleNote = false;
          if (id === LAB_ID) {
            const tpl = TEMPLATES.find((t) => t.id === (opts.template ?? get().labTemplate)) ?? TEMPLATES[1];
            if (opts.template || !existing || opts.fresh || stale) {
              session = createSession(LAB_ID, settings.mode, 1, stale && !opts.template ? (existing.initialArch ?? tpl.arch) : tpl.arch);
              session.workload = templateWorkload(tpl);
              session.ops.push({ op: 'workload', patch: { ...session.workload } });
              if (tpl.chaos) setChaos(session, tpl.chaos, true);
              if (stale && !opts.template && !opts.fresh) {
                session.draft = clone(existing.draft);
                staleNote = true;
              }
              drill = tpl.drill;
              set({
                saved: {
                  ...saved,
                  [LAB_ID]: {
                    mode: settings.mode,
                    attempt: 1,
                    ops: session.ops,
                    draft: session.draft,
                    initialArch: clone(tpl.arch),
                    panelsSeen: [],
                    chosenCauses: [],
                    hintsUsed: 0,
                    adrs: [],
                    simVersion: SIM_VERSION,
                    updatedAt: Date.now(),
                  },
                },
                labTemplate: tpl.id,
              });
            } else {
              session = replay(LAB_ID, existing.mode, existing.attempt, existing.ops, existing.initialArch);
              session.draft = clone(existing.draft);
              drill = TEMPLATES.find((t) => t.id === get().labTemplate)?.drill;
            }
          } else if (existing && !opts.fresh && stale) {
            // The simulation changed since this run was recorded, so replaying it would give different results.
            // Keep the player's design, notes and hints; restart the clock.
            session = createSession(id, settings.mode, existing.attempt, undefined, existing.inherited ?? []);
            session.draft = clone(existing.draft);
            session.panelsSeen = [...existing.panelsSeen];
            session.chosenCauses = [...existing.chosenCauses];
            session.hintsUsed = existing.hintsUsed;
            session.adrs = [...existing.adrs];
            session.postmortem = existing.postmortem;
            staleNote = true;
            set({
              saved: {
                ...get().saved,
                [id]: { ...existing, ops: [], draft: session.draft, simVersion: SIM_VERSION, updatedAt: Date.now() },
              },
            });
          } else if (existing && !opts.fresh) {
            session = replay(id, existing.mode, existing.attempt, existing.ops, undefined, existing.inherited ?? []);
            session.draft = clone(existing.draft);
            session.panelsSeen = [...existing.panelsSeen];
            session.chosenCauses = [...existing.chosenCauses];
            session.hintsUsed = existing.hintsUsed;
            session.adrs = [...existing.adrs];
            session.postmortem = existing.postmortem;
            session.mode = settings.mode;
          } else {
            const attempt = (progress.attempts[id] ?? 0) + 1;
            session = createSession(id, settings.mode, attempt, undefined, inheritedFrom(progress.completed));
            set({
              saved: {
                ...get().saved,
                [id]: {
                  mode: settings.mode,
                  attempt,
                  ops: [],
                  draft: session.draft,
                  panelsSeen: [],
                  chosenCauses: [],
                  hintsUsed: 0,
                  adrs: [],
                  simVersion: SIM_VERSION,
                  inherited: session.inherited,
                  updatedAt: Date.now(),
                },
              },
            });
          }
          set({
            session,
            running: false,
            selection: { type: null },
            debrief: null,
            tick: get().tick + 1,
            drill,
            introOpen: id !== LAB_ID && (!existing || !!opts.fresh) && !(existing && existing.ops.length > 0),
            dock: 'overview',
            dockOpen: true,
            rightTab: 'inspect',
            mobilePane: 'canvas',
          });
          if (staleNote) {
            get().toast(
              'The simulation was updated since you last played, so the run restarted. Your design, notes and hints were kept.',
              'info',
            );
          }
        },
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
        editDraft: (fn) => {
          const { session } = get();
          if (!session) return;
          remember(session);
          const next = clone(session.draft);
          fn(next);
          session.draft = next;
          set((s) => ({ tick: s.tick + 1 }));
          persistSoon();
        },
        recordDraft: () => {
          const { session } = get();
          if (session) remember(session);
        },
        undoEdit: () => {
          const { session, undoState } = get();
          if (!session || undoState.owner !== session) return;
          const r = undo(undoState.stack, session.draft);
          if (!r) return;
          session.draft = r.arch;
          set((s) => ({ undoState: { owner: session, stack: r.stack }, tick: s.tick + 1 }));
          dropStaleSelection(session);
          persistSoon();
        },
        redoEdit: () => {
          const { session, undoState } = get();
          if (!session || undoState.owner !== session) return;
          const r = redo(undoState.stack, session.draft);
          if (!r) return;
          session.draft = r.arch;
          set((s) => ({ undoState: { owner: session, stack: r.stack }, tick: s.tick + 1 }));
          dropStaleSelection(session);
          persistSoon();
        },
        moveNode: (id, pos) => {
          const { session } = get();
          const n = session?.draft.nodes.find((x) => x.id === id);
          if (!session || !n) return;
          n.position = pos;
          set((s) => ({ tick: s.tick + 1 }));
          persistSoon();
        },
        resetDraft: () => {
          const { session } = get();
          if (!session) return;
          remember(session);
          session.draft = clone(session.live);
          set((s) => ({ tick: s.tick + 1, selection: { type: null } }));
          persistSoon();
        },
        select: (type, id) => set({ selection: { type, id }, rightTab: type ? 'inspect' : get().rightTab }),
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
        setDock: (p) => {
          set({ dock: p, dockOpen: true });
          get().visitPanel(p);
        },
        setDockOpen: (v) => set({ dockOpen: v }),
        setRightTab: (t) => set({ rightTab: t }),
        setMobilePane: (p) => set({ mobilePane: p }),
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
        submit: () => {
          const { session, progress } = get();
          if (!session || session.missionId === LAB_ID) return;
          const m = MISSION_BY_ID[session.missionId];
          const firstTime = !progress.completed[m.id]?.passed;
          set({ view: { owner: null, minute: null } });
          const { outcome, report } = verify(session, firstTime);
          const prevLevel = levelFromXp(progress.xp);
          const next: Progress = {
            ...progress,
            outcomes: [...progress.outcomes, outcome],
            attempts: { ...progress.attempts, [m.id]: session.attempt },
            skillXp: { ...progress.skillXp },
            evidence: { ...progress.evidence },
            achievements: { ...progress.achievements },
          };
          if (outcome.passed) {
            const best = progress.completed[m.id];
            if (!best || outcome.overall > best.overall) next.completed = { ...progress.completed, [m.id]: outcome };
            else next.completed = progress.completed;
            next.xp = progress.xp + outcome.xp;
            for (const [k, v] of Object.entries(outcome.skillXp)) {
              const sk = k as SkillId;
              next.skillXp[sk] = (progress.skillXp[sk] ?? 0) + (v ?? 0);
              next.evidence[sk] = [
                ...(progress.evidence[sk] ?? []),
                {
                  missionId: m.id,
                  title: m.title,
                  overall: outcome.overall,
                  at: Date.now(),
                  note: `${outcome.grade} (${outcome.overall}/100) — ${outcome.reqs.filter((r) => r.pass).length}/${outcome.reqs.length} requirements met`,
                },
              ];
            }
          } else {
            next.stats = { ...progress.stats, failedAttempts: progress.stats.failedAttempts + 1 };
            next.xp = progress.xp + outcome.xp;
          }
          for (const a of session.adrs)
            if (!next.adrs.some((x) => x.id === a.id)) next.adrs = [...next.adrs, { ...a, missionId: m.id, at: Date.now() }];
          if (session.postmortem)
            next.postmortems = [
              ...next.postmortems.filter(
                (p) => !(p.missionId === m.id && p.at === (progress.postmortems.find((q) => q.missionId === m.id)?.at ?? -1)),
              ),
              { missionId: m.id, at: Date.now(), pm: session.postmortem },
            ];
          next.lessons = [...next.lessons, { missionId: m.id, at: Date.now(), text: m.debrief.rootCause }];
          if (session.postmortem?.worsened.trim())
            next.lessons = [
              ...next.lessons,
              { missionId: m.id, at: Date.now(), text: `Made it worse: ${session.postmortem.worsened.trim()}` },
            ];
          const adrCount = next.adrs.length;
          for (const a of ACHIEVEMENTS) {
            if (!next.achievements[a.id] && a.test(outcome, { completed: next.completed, adrCount, stats: next.stats })) {
              next.achievements[a.id] = Date.now();
              get().toast(`Achievement unlocked: ${a.title}`, 'good');
            }
          }
          const newLevel = levelFromXp(next.xp);
          if (newLevel > prevLevel) get().toast(`Level up! You are now level ${newLevel}.`, 'good');
          set({ progress: next, debrief: { outcome, report, firstTime }, running: false });
          persistSession();
        },
        closeDebrief: () => set({ debrief: null }),
        setIntroOpen: (v) => set({ introOpen: v }),

        setChaosList: (c) => {
          const { session } = get();
          if (!session) return;
          setChaos(session, c);
          get().toast(c.length ? `Injected: ${c.map(describeChaos).join(', ')}` : 'Chaos cleared.', c.length ? 'warn' : 'info');
          set((s) => ({ tick: s.tick + 1 }));
          persistSession();
        },
        setWorkload: (patch) => {
          const { session } = get();
          if (!session) return;
          patchWorkload(session, patch);
          set((s) => ({ tick: s.tick + 1 }));
          persistSoon();
        },
        saveDesign: (name) => {
          const { session, progress } = get();
          if (!session) return;
          const d = {
            id: `design-${Date.now().toString(36)}`,
            name: name || `Design ${progress.designs.length + 1}`,
            arch: clone({ ...session.draft, nodes: session.draft.nodes.map((n) => ({ ...n, faults: undefined })) }),
            savedAt: Date.now(),
          };
          set({ progress: { ...progress, designs: [...progress.designs, d] } });
          get().toast(`Saved “${d.name}” to your designs.`, 'good');
        },
        deleteDesign: (id) => set((s) => ({ progress: { ...s.progress, designs: s.progress.designs.filter((d) => d.id !== id) } })),
        loadDesign: (id) => {
          const { session, progress } = get();
          const d = progress.designs.find((x) => x.id === id);
          if (!session || !d) return;
          session.draft = clone(d.arch);
          set((s) => ({ tick: s.tick + 1, selection: { type: null }, rightTab: 'plan' }));
          get().toast(`Loaded “${d.name}” into the draft. Press Deploy to run it.`, 'info');
        },
        recordExperiment: (name, note, metrics) =>
          set((s) => ({
            progress: {
              ...s.progress,
              experiments: [...s.progress.experiments, { id: `exp-${Date.now().toString(36)}`, at: Date.now(), name, note, metrics }],
            },
          })),

        resetAll: () => {
          set({ progress: emptyProgress(), saved: {}, session: null, running: false, debrief: null });
        },
        exportSave: () =>
          JSON.stringify({ v: 1, sim: SIM_VERSION, progress: get().progress, saved: get().saved, settings: get().settings }),
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
    },
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

/** Every decision tag recorded by the missions the player has passed. */
export function inheritedFrom(completed: Record<string, Outcome>): string[] {
  return [...new Set(Object.values(completed).flatMap((o) => tagsFor(o.decisions ?? [])))].sort();
}

export function unlockedTier(level: number, showAll: boolean): 1 | 2 | 3 {
  if (showAll) return 3;
  return level >= 4 ? 3 : level >= 2 ? 2 : 1;
}

export const ALL_MISSIONS = MISSIONS;
export type { ArchDiffItem };
void LAB_WORKLOAD;
