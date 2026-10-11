import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeNode } from '@/engine/arch';
import { useGame } from '@/game/store';
import { COALESCE_MS } from '@/game/undo';

const g = () => useGame.getState();
const names = () => g().session!.draft.nodes.map((n) => n.id);

function open(template = 'three-tier') {
  g().openMission('lab', { template, fresh: true });
}
/** Edits closer together than COALESCE_MS merge into one undo step; tests need them separate. */
function pause() {
  vi.setSystemTime(Date.now() + COALESCE_MS * 3);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
  open();
});

describe('draft undo/redo in the store', () => {
  it('undoes and redoes adding a component', () => {
    const before = names();
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
    expect(names()).toContain('extra');
    g().undoEdit();
    expect(names()).toEqual(before);
    g().redoEdit();
    expect(names()).toContain('extra');
  });

  it('keeps every step when edits are spaced out, and merges a burst into one', () => {
    const base = names();
    for (const id of ['a', 'b']) {
      pause();
      g().editDraft((a) => {
        a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id }));
      });
    }
    g().undoEdit();
    expect(names()).toEqual([...base, 'a']);
    g().undoEdit();
    expect(names()).toEqual(base);

    pause();
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'c' }));
    });
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'd' }));
    }); // same burst
    g().undoEdit();
    expect(names()).toEqual(base);
  });

  it('undoes an undone node drag as a single step via recordDraft', () => {
    const id = g().session!.draft.nodes[0].id;
    const start = { ...g().session!.draft.nodes[0].position };
    g().recordDraft();
    g().moveNode(id, { x: 500, y: 500 });
    g().moveNode(id, { x: 520, y: 540 });
    expect(g().session!.draft.nodes[0].position).toEqual({ x: 520, y: 540 });
    g().undoEdit();
    expect(g().session!.draft.nodes[0].position).toEqual(start);
  });

  it('can undo discarding the draft', () => {
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
    pause();
    g().resetDraft();
    expect(names()).not.toContain('extra');
    g().undoEdit();
    expect(names()).toContain('extra');
  });

  it('does not touch the deployed system', () => {
    const live = JSON.stringify(g().session!.live);
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
    g().undoEdit();
    expect(JSON.stringify(g().session!.live)).toBe(live);
  });

  it('clears the selection if the selected component disappears', () => {
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
    g().select('node', 'extra');
    g().undoEdit();
    expect(g().selection.type).toBeNull();
  });

  it('starts clean when another session is opened', () => {
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
    open('serverless');
    const before = names();
    g().undoEdit();
    expect(names()).toEqual(before);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    const before = names();
    g().undoEdit();
    g().redoEdit();
    expect(names()).toEqual(before);
  });
});
