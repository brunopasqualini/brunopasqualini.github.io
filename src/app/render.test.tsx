import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { MISSIONS } from '@/content/missions';
import { useGame } from '@/game/store';

let root: Root | undefined;
let host: HTMLElement | undefined;

async function waitFor(sel: string, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (host!.querySelector(sel)) return;
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

async function mount(hash: string) {
  window.location.hash = hash;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

beforeEach(() => {
  useGame.getState().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  window.location.hash = '';
});

describe('router', () => {
  it('redirects the legacy /academy path and renders a 404 page', async () => {
    await mount('#/academy');
    await waitFor('h1');
    expect(window.location.hash).toBe('#/learning');
    await act(async () => root!.unmount());
    host!.remove();
    await mount('#/nope');
    await waitFor('h1');
    expect(host!.querySelector('h1')!.textContent).toMatch(/Nothing here/);
  });
});

describe('primary navigation renders every section', () => {
  const cases: [string, RegExp][] = [
    ['#/', /./],
    ['#/missions', /Mission Control/],
    ['#/incidents', /Incident Response/],
    ['#/learning', /Engineering Academy/],
    ['#/journal', /Engineering Journal/],
    ['#/achievements', /Achievements/],
  ];
  for (const [hash, re] of cases) {
    it(hash, async () => {
      await mount(hash);
      await waitFor('h1');
      expect(host!.querySelector('h1')!.textContent).toMatch(re);
      expect(host!.querySelectorAll('.navtab').length).toBe(7);
    });
  }
  it('Mission Control lists every mission with controls', async () => {
    await mount('#/missions');
    await waitFor('.mission-card');
    expect(host!.querySelectorAll('.mission-card').length).toBe(MISSIONS.length);
    expect(host!.querySelectorAll('.mission-card .btn-primary').length).toBe(MISSIONS.length);
  });
});

describe('home', () => {
  it('presents the product promise, the five-stage journey, pillars and audiences', async () => {
    await mount('#/');
    await waitFor('.stages');
    expect(host!.querySelector('h1')!.textContent).toMatch(/Think like an engineer/);
    expect(host!.querySelectorAll('.stages .stage').length).toBe(5);
    expect(host!.querySelectorAll('.pillar').length).toBe(4);
    expect(host!.querySelectorAll('.audience').length).toBe(3);
    expect(host!.querySelector('.stages .stage:last-child')?.textContent).toMatch(/Principal/);
    expect(host!.querySelector('.stage-soon')).toBeNull();
  });
});

describe('workspace', () => {
  it('renders a mission workspace with status bar, library, inspector tabs and dock', async () => {
    await mount('#/play/m2-db-meltdown');
    await waitFor('.canvas-head');
    expect(host!.querySelector('.canvas-head')).toBeTruthy();
    expect(host!.querySelector('.library')).toBeTruthy();
    expect(host!.querySelector('.dock')).toBeTruthy();
    expect(host!.querySelector('.events')).toBeTruthy();
    expect(host!.textContent).toMatch(/The Database Meltdown/);
    expect(document.querySelector('.modal')).toBeTruthy();
    await act(async () => {
      (document.querySelector('.modal-foot .btn-primary') as HTMLButtonElement).click();
    });
    expect(document.querySelector('.modal')).toBeNull();
    expect(useGame.getState().running).toBe(true);
  });
  it('renders the sandbox', async () => {
    await mount('#/lab?template=three-tier');
    await waitFor('.lab-panel, .ws-right');
    expect(host!.querySelector('.lab-panel') ?? host!.querySelector('.ws-right')).toBeTruthy();
    expect(useGame.getState().session!.missionId).toBe('lab');
  });
});
