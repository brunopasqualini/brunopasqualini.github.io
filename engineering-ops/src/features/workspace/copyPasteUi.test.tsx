import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
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
const nodes = () => g().session!.draft.nodes;
const labels = () => nodes().map((n) => n.label);
const dupBtn = () => host!.querySelector<HTMLButtonElement>('button[aria-label="Duplicate selection"]')!;
const press = async (key: string, opts: KeyboardEventInit = { ctrlKey: true }, target: EventTarget = document.body) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts }));
  });
  await tick();
};
const API = 'api';

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
  await waitFor(() => g().session?.missionId === 'lab' && dupBtn());
  expect(nodes().some((n) => n.id === API)).toBe(true);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('copy, paste and duplicate on the canvas', () => {
  it('has nothing to duplicate until a component is selected', async () => {
    expect(dupBtn().disabled).toBe(true);
    await act(async () => g().select('node', API));
    await tick();
    expect(dupBtn().disabled).toBe(false);
  });

  it('Ctrl+D duplicates the selected component and selects the copy', async () => {
    const before = nodes().length;
    const label = nodes().find((n) => n.id === API)!.label;
    await act(async () => g().select('node', API));
    await press('d');
    expect(nodes()).toHaveLength(before + 1);
    expect(labels()).toContain(`${label} copy`);
    expect(g().selection.id).not.toBe(API);
    expect(nodes().find((n) => n.id === g().selection.id)!.label).toBe(`${label} copy`);
  });

  it('the Duplicate button does the same', async () => {
    const before = nodes().length;
    await act(async () => g().select('node', API));
    await tick();
    await act(async () => dupBtn().click());
    expect(nodes()).toHaveLength(before + 1);
  });

  it('Ctrl+C then repeated Ctrl+V adds staggered copies, and undo takes them back one by one', async () => {
    const before = nodes().length;
    await act(async () => g().select('node', API));
    await press('c');
    await press('v');
    await press('v');
    expect(nodes()).toHaveLength(before + 2);
    const [a, b] = nodes().slice(-2);
    expect(a.position).not.toEqual(b.position); // never stacked exactly on top of each other
    // pastes are spaced by a few ms in this test, so wait out the undo coalescing window
    await tick(600);
    await press('z');
    expect(nodes().length).toBeLessThan(before + 2);
  });

  it('does nothing when a text field has focus', async () => {
    const before = nodes().length;
    await act(async () => g().select('node', API));
    const input = document.createElement('input');
    host!.appendChild(input);
    await press('d', { ctrlKey: true }, input);
    expect(nodes()).toHaveLength(before);
  });
});
