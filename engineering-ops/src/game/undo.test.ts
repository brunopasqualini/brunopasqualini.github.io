import { describe, expect, it } from 'vitest';
import { makeNode } from '@/engine/arch';
import type { Arch } from '@/engine/types';
import { COALESCE_MS, UNDO_CAP, canRedo, canUndo, emptyUndo, record, redo, undo } from '@/game/undo';

const arch = (n: number): Arch => ({
  nodes: Array.from({ length: n }, (_, i) => makeNode('alb', { x: i * 10, y: 0 }, { id: `n${i}` })),
  edges: [],
});
const T = COALESCE_MS * 10; // far enough apart that edits never coalesce

describe('undo stack', () => {
  it('starts empty', () => {
    const s = emptyUndo();
    expect(canUndo(s)).toBe(false);
    expect(canRedo(s)).toBe(false);
    expect(undo(s, arch(1))).toBeNull();
    expect(redo(s, arch(1))).toBeNull();
  });

  it('undoes and redoes a sequence of edits in order', () => {
    // drafts: 1 node → 2 → 3 (record is called with the draft BEFORE each edit)
    let s = record(emptyUndo(), arch(1), T);
    s = record(s, arch(2), T * 2);
    const u1 = undo(s, arch(3))!;
    expect(u1.arch.nodes).toHaveLength(2);
    const u2 = undo(u1.stack, u1.arch)!;
    expect(u2.arch.nodes).toHaveLength(1);
    expect(undo(u2.stack, u2.arch)).toBeNull();
    const r1 = redo(u2.stack, u2.arch)!;
    expect(r1.arch.nodes).toHaveLength(2);
    const r2 = redo(r1.stack, r1.arch)!;
    expect(r2.arch.nodes).toHaveLength(3);
    expect(redo(r2.stack, r2.arch)).toBeNull();
  });

  it('a new edit after an undo discards the redo branch', () => {
    let s = record(emptyUndo(), arch(1), T);
    const u = undo(s, arch(2))!;
    expect(canRedo(u.stack)).toBe(true);
    s = record(u.stack, u.arch, T * 2);
    expect(canRedo(s)).toBe(false);
  });

  it('collapses a burst of edits (a slider drag) into one step', () => {
    let s = record(emptyUndo(), arch(1), T);
    s = record(s, arch(2), T + 100);
    s = record(s, arch(3), T + 200);
    expect(s.past).toHaveLength(1);
    expect(s.past[0].nodes).toHaveLength(1); // the state before the whole burst
    s = record(s, arch(4), T + 200 + COALESCE_MS + 1);
    expect(s.past).toHaveLength(2);
  });

  it('always records the first edit, even at time zero', () => {
    expect(record(emptyUndo(), arch(1), 0).past).toHaveLength(1);
  });

  it('keeps snapshots independent of later mutation', () => {
    const a = arch(1);
    const s = record(emptyUndo(), a, T);
    a.nodes[0].label = 'mutated afterwards';
    expect(s.past[0].nodes[0].label).not.toBe('mutated afterwards');
  });

  it('caps its length, dropping the oldest', () => {
    let s = emptyUndo();
    for (let i = 0; i < UNDO_CAP + 20; i++) s = record(s, arch(1 + (i % 3)), T * (i + 1));
    expect(s.past).toHaveLength(UNDO_CAP);
  });
});
