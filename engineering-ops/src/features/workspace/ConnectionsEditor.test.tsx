import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConnectionsEditor } from '@/features/workspace/ConnectionsEditor';
import { useGame } from '@/game/store';

let root: Root | undefined;
let host: HTMLElement | undefined;
const g = () => useGame.getState();
const edges = () => g().session!.draft.edges.map((e) => `${e.source}>${e.target}`);

async function mount(nodeId: string) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<ConnectionsEditor nodeId={nodeId} />));
}

beforeEach(() => {
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: true }, toasts: [] });
  g().openMission('lab', { template: 'three-tier' });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
});

describe('connections editor (keyboard path for the canvas)', () => {
  it('lists existing connections and removes one with a labelled button', async () => {
    await mount('api');
    expect(host!.textContent).toMatch(/←/);
    expect(edges()).toContain('api>db');
    const btn = host!.querySelector('button[aria-label^="Remove connection from"][aria-label$="to db"]') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => btn.click());
    expect(edges()).not.toContain('api>db');
    expect(g().toasts.some((t) => /Removed the connection/.test(t.text))).toBe(true);
  });

  it('adds a valid connection from a select, and only offers targets the model allows', async () => {
    await mount('api');
    await act(async () =>
      (host!.querySelector('button[aria-label^="Remove connection from"][aria-label$="to db"]') as HTMLButtonElement).click(),
    );
    const sel = host!.querySelector('select') as HTMLSelectElement;
    const offered = [...sel.options].map((o) => o.value).filter(Boolean);
    expect(offered).toContain('db');
    expect(offered).not.toContain('api'); // never itself
    expect(offered).not.toContain('users'); // traffic sources cannot be called
    await act(async () => {
      sel.value = 'db';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const add = [...host!.querySelectorAll('button')].find((b) => /Connect$/.test(b.textContent ?? '')) as HTMLButtonElement;
    expect(add.disabled).toBe(false);
    await act(async () => add.click());
    expect(edges()).toContain('api>db');
    const e = g().session!.draft.edges.find((x) => x.source === 'api' && x.target === 'db')!;
    expect(e.config.weight).toBe(2); // data stores start with the heavier call weight, same as dragging
  });
});
