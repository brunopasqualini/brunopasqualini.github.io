import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { makeNode } from '@/engine/arch';
import { useGame } from '@/game/store';

let root: Root | undefined;
let host: HTMLElement | undefined;

const tick = (ms = 30) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
async function waitFor(test: () => unknown, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !test()) await tick(25);
}
const g = () => useGame.getState();
const ids = () => g().session!.draft.nodes.map((n) => n.id);
const btn = (label: string) => host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const press = async (key: string, opts: KeyboardEventInit = {}, target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
  });
  await tick();
};

beforeEach(async () => {
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
  window.location.hash = '#/lab?template=three-tier';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await waitFor(() => g().session?.missionId === 'lab' && btn('Undo'));
  await act(async () => {
    g().editDraft((a) => {
      a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
    });
  });
  await tick();
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('undo / redo on the canvas', () => {
  it('enables the buttons only when there is something to do', async () => {
    expect(btn('Undo').disabled).toBe(false);
    expect(btn('Redo').disabled).toBe(true);
    await act(async () => btn('Undo').click());
    expect(ids()).not.toContain('extra');
    expect(btn('Undo').disabled).toBe(true);
    expect(btn('Redo').disabled).toBe(false);
    await act(async () => btn('Redo').click());
    expect(ids()).toContain('extra');
  });

  it('responds to Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y', async () => {
    await press('z', { ctrlKey: true });
    expect(ids()).not.toContain('extra');
    await press('z', { ctrlKey: true, shiftKey: true });
    expect(ids()).toContain('extra');
    await press('z', { metaKey: true }); // ⌘Z on a Mac
    expect(ids()).not.toContain('extra');
    await press('y', { ctrlKey: true });
    expect(ids()).toContain('extra');
  });

  it('leaves Ctrl+Z to a text field that has focus', async () => {
    const input = document.createElement('input');
    host!.appendChild(input);
    await press('z', { ctrlKey: true }, input);
    expect(ids()).toContain('extra');
  });
});
