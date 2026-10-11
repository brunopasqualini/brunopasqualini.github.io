import { clone } from '@/engine/arch';
import type { Arch } from '@/engine/types';

/**
 * Undo history for the draft architecture (what you are editing, not what is deployed).
 * Pure functions over an immutable stack, so the rules are testable without React or the store.
 * Each entry is a full copy of the draft: an architecture is a few dozen nodes, so this is simple and cheap.
 */
export interface UndoStack {
  past: Arch[];
  future: Arch[];
  /** When the last entry was recorded; edits arriving in a quick burst share one entry. */
  at: number;
}

export const UNDO_CAP = 100;
/** A slider drag or typing fires many edits; they collapse into a single undo step if they arrive this close together. */
export const COALESCE_MS = 500;

export const emptyUndo = (): UndoStack => ({ past: [], future: [], at: 0 });
export const canUndo = (s: UndoStack): boolean => s.past.length > 0;
export const canRedo = (s: UndoStack): boolean => s.future.length > 0;

/** Remember `before` (the draft as it was ahead of an edit). A new edit always discards the redo branch. */
export function record(stack: UndoStack, before: Arch, now: number): UndoStack {
  const burst = stack.past.length > 0 && now - stack.at < COALESCE_MS;
  if (burst) return { ...stack, future: [], at: now };
  const past = [...stack.past, clone(before)];
  if (past.length > UNDO_CAP) past.splice(0, past.length - UNDO_CAP);
  return { past, future: [], at: now };
}

/** Step back. `current` is pushed onto the redo branch. Returns null when there is nothing to undo. */
export function undo(stack: UndoStack, current: Arch): { stack: UndoStack; arch: Arch } | null {
  if (!canUndo(stack)) return null;
  const past = stack.past.slice(0, -1);
  const arch = stack.past[stack.past.length - 1];
  return { stack: { past, future: [...stack.future, clone(current)], at: 0 }, arch };
}

/** Step forward again after an undo. Returns null when there is nothing to redo. */
export function redo(stack: UndoStack, current: Arch): { stack: UndoStack; arch: Arch } | null {
  if (!canRedo(stack)) return null;
  const future = stack.future.slice(0, -1);
  const arch = stack.future[stack.future.length - 1];
  return { stack: { past: [...stack.past, clone(current)], future, at: 0 }, arch };
}
