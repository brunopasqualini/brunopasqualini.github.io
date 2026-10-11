import { clone } from '@/engine/arch';
import { tagsFor } from '@/game/decisions';
import type { Outcome } from '@/game/scoring';
import { createSession, LAB_ID, replay, setChaos, type Session } from '@/game/session';
import { isReplayCompatible, SIM_VERSION } from '@/game/simVersion';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import type { Store } from './types';

type Set = (partial: Partial<Store>) => void;
type Get = () => Store;

/** Every decision tag recorded by the missions the player has passed. */
export function inheritedFrom(completed: Record<string, Outcome>): string[] {
  return [...new Set(Object.values(completed).flatMap((o) => tagsFor(o.decisions ?? [])))].sort();
}

/** Start or resume a mission (or the Lab): replay a saved run, restart a stale one, or begin a fresh attempt. */
export function openMission(set: Set, get: Get, id: string, opts: { fresh?: boolean; template?: string } = {}) {
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
    get().toast('The simulation was updated since you last played, so the run restarted. Your design, notes and hints were kept.', 'info');
  }
}
