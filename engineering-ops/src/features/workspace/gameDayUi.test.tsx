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
const panel = () => host!.querySelector('[data-testid="gameday"]');

async function open(template: string) {
  window.location.hash = `#/lab?template=${template}`;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await waitFor(() => g().session?.missionId === 'lab' && panel());
}

beforeEach(() => {
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('Game day panel', () => {
  it('offers the scenarios and starts one', async () => {
    await open('three-tier');
    const options = [...host!.querySelectorAll('select[aria-label="Game day scenario"] option')].map((o) => o.textContent);
    expect(options.length).toBeGreaterThanOrEqual(3);
    const start = [...panel()!.querySelectorAll('button')].find((b) => b.textContent === 'Start')!;
    await act(async () => start.click());
    await tick();
    expect(g().session?.gameday?.id).toBe('bad-deploy');
    expect(panel()!.textContent).toContain('Minute 0 of 40');
    expect(g().session!.ops.some((o) => o.op === 'gameday')).toBe(true);
  });

  it('shows the announcements as they fire and a graded result at the end', async () => {
    await open('three-tier');
    await act(async () => g().setWorkload({ baseRps: 15 }));
    await act(async () => g().beginGameDay('az-loss'));
    await act(async () => g().step(8));
    await tick();
    expect(panel()!.textContent).toContain('Traffic is climbing faster than forecast');
    expect(panel()!.querySelector('[data-testid="gameday-result"]')).toBeNull();
    await act(async () => g().step(30));
    await tick();
    const result = panel()!.querySelector('[data-testid="gameday-result"]');
    expect(result?.textContent).toMatch(/Grade [A-F]/);
    expect(result?.textContent).toMatch(/\/100/);
    expect(panel()!.textContent).toContain('Run again');
  });

  it('warns before starting when the design is already failing', async () => {
    await open('three-tier');
    await act(async () => g().step(3));
    await tick();
    expect(panel()!.textContent).toContain('already failing customers');
  });
});
