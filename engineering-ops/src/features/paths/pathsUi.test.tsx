import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { PATHS } from '@/content/paths';
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
async function mount(hash: string) {
  window.location.hash = hash;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await waitFor(() => host!.querySelector('[data-testid="path-detail"]'));
}
const detail = () => host!.querySelector('[data-testid="path-detail"]')!;
const tabs = () => [...host!.querySelectorAll<HTMLElement>('[role="tab"]')];

beforeEach(() => {
  useGame.getState().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('Learning paths page', () => {
  it('lists every path and shows the first one with its next step', async () => {
    await mount('#/paths');
    expect(tabs().map((t) => t.querySelector('b')?.textContent)).toEqual(PATHS.map((p) => p.title));
    expect(detail().textContent).toContain(PATHS[0].title);
    expect(detail().querySelector('[data-testid="path-next"]')?.textContent).toContain('The N+1 Endpoint');
    expect(detail().querySelectorAll('.path-step')).toHaveLength(PATHS[0].missions.length);
  });

  it('switches path and reflects passed missions and blocked steps', async () => {
    useGame.setState((s) => ({
      progress: { ...s.progress, completed: { 'm2-db-meltdown': { passed: true } as never } },
    }));
    await mount('#/paths');
    await act(async () =>
      tabs()
        .find((t) => t.textContent?.includes('Site reliability'))!
        .click(),
    );
    await tick();
    const states = [...detail().querySelectorAll<HTMLElement>('.path-step')].map((e) => e.dataset.state);
    expect(states[0]).toBe('done');
    expect(states).toContain('next');
    expect(states).toContain('blocked');
    expect(detail().querySelector('[data-testid="path-next"]')?.textContent).toContain('The Impatient Client');
    expect(detail().textContent).toContain('Lab drills');
  });

  it('opens the next mission from the next-step card', async () => {
    await mount('#/paths');
    const start = [...detail().querySelectorAll('[data-testid="path-next"] button')][0] as HTMLButtonElement;
    await act(async () => start.click());
    await waitFor(() => window.location.hash.startsWith('#/play/'));
    expect(window.location.hash).toBe('#/play/m7-n-plus-one');
  });

  it('is reachable from Mission Control', async () => {
    window.location.hash = '#/missions';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<App />);
    });
    await waitFor(() => host!.textContent?.includes('Mission Control'));
    const link = [...host.querySelectorAll('button')].find((b) => /learning path/i.test(b.textContent ?? ''))!;
    await act(async () => link.click());
    await waitFor(() => host!.querySelector('[data-testid="path-detail"]'));
    expect(window.location.hash).toBe('#/paths');
  });
});
