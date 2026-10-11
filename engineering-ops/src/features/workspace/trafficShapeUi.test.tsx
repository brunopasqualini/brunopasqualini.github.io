import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { TEMPLATES } from '@/content/templates';
import { SHAPE_BY_ID } from '@/content/trafficShapes';
import { rpsAt } from '@/engine/engine';
import { replay } from '@/game/session';
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
const picker = () => host!.querySelector<HTMLSelectElement>('select[aria-label="Traffic shape"]')!;
const choose = async (id: string) => {
  await act(async () => {
    picker().value = id;
    picker().dispatchEvent(new Event('change', { bubbles: true }));
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
  await waitFor(() => g().session?.missionId === 'lab' && picker());
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('traffic shape picker in the Lab', () => {
  it('starts on Steady and describes the shape and its peak', () => {
    expect(picker().value).toBe('steady');
    expect(host!.querySelector('.shape-preview')).toBeTruthy();
    expect(host!.querySelector('.shape-meta')?.textContent).toMatch(/Peak\s*120 rps/);
    expect(host!.textContent).toContain(SHAPE_BY_ID.steady.blurb);
  });

  it('applies a shape to the workload, and the peak follows base traffic', async () => {
    await choose('flash-sale');
    const w = g().session!.workload;
    expect(w.profileCycle).toBe(90);
    expect(rpsAt(w, 25)).toBe(120 * 6);
    expect(host!.querySelector('.shape-meta')?.textContent).toMatch(/Peak\s*720 rps/);
    expect(host!.querySelector('.shape-meta')?.textContent).toMatch(/repeats every 90 minutes/);
  });

  it('switching back to Steady clears the repeat', async () => {
    await choose('daily');
    expect(g().session!.workload.profileCycle).toBe(1440);
    await choose('steady');
    expect(g().session!.workload.profileCycle).toBe(0);
    expect(rpsAt(g().session!.workload, 777)).toBe(120);
  });

  it('really changes the traffic the simulation sees as time passes', async () => {
    await choose('batch');
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      await act(async () => g().step(1));
      seen.push(g().session!.history[g().session!.history.length - 1].rps);
    }
    expect(Math.max(...seen)).toBeGreaterThan(Math.min(...seen) * 1.5); // it ramps up
  });

  it('is recorded as an ordinary operation, so a replay reproduces the same traffic', async () => {
    await choose('thundering-herd');
    await act(async () => g().step(20));
    const s = g().session!;
    const start = TEMPLATES.find((x) => x.id === 'three-tier')!.arch; // a Lab save also stores its starting architecture
    const copy = replay(s.missionId, s.mode, s.attempt, s.ops, start, s.inherited);
    expect(JSON.stringify(copy.workload.profile)).toBe(JSON.stringify(s.workload.profile));
    expect(copy.workload.profileCycle).toBe(45);
    expect(copy.history.map((h) => h.rps)).toEqual(s.history.map((h) => h.rps));
  });

  it('shows a custom profile as custom instead of pretending it is a shape', async () => {
    await act(async () => {
      g().setWorkload({
        profile: [
          { t: 0, mult: 1 },
          { t: 5, mult: 2 },
        ],
        profileCycle: 0,
      });
    });
    await tick();
    expect(picker().value).toBe('custom');
    expect(picker().querySelector('option[value="custom"]')?.textContent).toMatch(/Custom/);
  });
});
