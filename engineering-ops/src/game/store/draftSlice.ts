import { clone } from '@/engine/arch';
import type { Arch } from '@/engine/types';
import type { Session } from '@/game/session';
import { emptyUndo, record, redo, undo, type UndoStack } from '@/game/undo';
import { persistence } from './persistence';
import type { Slice } from './types';

export interface DraftSlice {
  /** Undo history for the draft. Tied to the session object it was recorded for, so opening another mission starts clean. */
  undoState: { owner: Session | null; stack: UndoStack };
  editDraft: (fn: (a: Arch) => void) => void;
  /** Remember the draft as it is now, so a continuous edit such as dragging a node can be undone as one step. */
  recordDraft: () => void;
  undoEdit: () => void;
  redoEdit: () => void;
  resetDraft: () => void;
  moveNode: (id: string, pos: { x: number; y: number }) => void;
}

export const createDraftSlice: Slice<DraftSlice> = (set, get) => {
  const { persistSoon } = persistence(set, get);
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
    undoState: { owner: null, stack: emptyUndo() },

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
  };
};
