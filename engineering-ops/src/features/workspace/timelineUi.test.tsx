import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { makeEdge, makeNode } from '@/engine/arch';
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
const slider = () => host!.querySelector<HTMLInputElement>('.scrub input[type="range"]')!;
const note = () => host!.querySelector('.scrub-note');
const canvas = () => host!.querySelector<HTMLElement>('.canvas')!;
const liveBtn = () => [...host!.querySelectorAll<HTMLButtonElement>('.scrub button')].find((b) => /Back to live/.test(b.textContent ?? ''));
const drag = async (value: number) => {
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    set.call(slider(), String(value));
    slider().dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick();
};
const press = async (key: string) => {
  await act(async () => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
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
  await waitFor(() => g().session?.missionId === 'lab');
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('timeline scrubber', () => {
  it('is hidden until there is history to look back through', () => {
    expect(host!.querySelector('.scrub')).toBeNull();
  });

  it('rewinds to an earlier minute, marks the canvas as the past, and returns to live', async () => {
    await act(async () => g().step(10));
    await tick();
    expect(slider()).toBeTruthy();
    expect(canvas().dataset.viewing).toBe('false');
    expect(note()).toBeNull();

    const first = Number(slider().min);
    await drag(first + 2);
    expect(canvas().dataset.viewing).toBe('true');
    expect(note()?.textContent).toMatch(/minutes? ago/);
    expect(note()?.textContent).toMatch(/nothing has changed/i);
    expect(g().running).toBe(false);

    await act(async () => liveBtn()!.click());
    await tick();
    expect(canvas().dataset.viewing).toBe('false');
    expect(note()).toBeNull();
  });

  it('shows the health strip for the viewed minute, not the latest', async () => {
    await act(async () => g().step(10));
    await tick();
    const clockNow = host!.querySelector('.clock')?.textContent;
    await drag(Number(slider().min) + 1);
    expect(host!.querySelector('.clock')?.textContent).not.toBe(clockNow);
  });

  it('jumps to an event when its marker is clicked', async () => {
    await act(async () => g().step(6));
    await act(async () => {
      g().editDraft((a) => {
        a.nodes[1].config.replicas = 4; // something to deploy
      });
    });
    await act(async () => g().deploy());
    await act(async () => g().step(6));
    await tick();
    const mark = host!.querySelector<HTMLButtonElement>('.scrub-mark.mk-deploy');
    expect(mark).toBeTruthy();
    await act(async () => mark!.click());
    await tick();
    expect(canvas().dataset.viewing).toBe('true');
    expect(note()?.textContent).toMatch(/deploy/i);
  });

  it('[ and ] step back and forward, and moving time on returns to live', async () => {
    await act(async () => g().step(8));
    await tick();
    await press('[');
    await press('[');
    expect(canvas().dataset.viewing).toBe('true');
    await press(']');
    expect(canvas().dataset.viewing).toBe('true');
    await press(']');
    expect(canvas().dataset.viewing).toBe('false');

    await press('[');
    expect(canvas().dataset.viewing).toBe('true');
    await act(async () => g().step(1));
    await tick();
    expect(canvas().dataset.viewing).toBe('false');
  });

  it('can look back to before a component existed (the architecture changed since)', async () => {
    await act(async () => g().step(6));
    await act(async () => {
      g().editDraft((a) => {
        a.nodes.push(makeNode('s3', { x: 900, y: 200 }, { id: 'later', label: 'Added later' }));
        a.edges.push(makeEdge('api', 'later'));
      });
    });
    await act(async () => g().deploy());
    await act(async () => g().step(6));
    await tick();
    expect(g().session!.live.nodes.some((n) => n.id === 'later')).toBe(true);
    // the oldest snapshots know nothing about 'later': the canvas and health strip must still render
    await drag(Number(slider().min));
    expect(canvas().dataset.viewing).toBe('true');
    expect(host!.querySelectorAll('.react-flow__node').length).toBeGreaterThan(0);
    expect(host!.querySelector('.ch-kpis')).toBeTruthy();
    expect(note()).toBeTruthy();
  });
});
