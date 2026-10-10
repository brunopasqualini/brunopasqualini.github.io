import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
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
    ['#/', /Command Center/],
    ['#/missions', /Mission Control/],
    ['#/incidents', /Incident Response/],
    ['#/learning', /Engineering Academy/],
    ['#/journal', /Engineering Journal/],
  ];
  for (const [hash, re] of cases) {
    it(hash, async () => {
      await mount(hash);
      await waitFor('h1');
      expect(host!.querySelector('h1')!.textContent).toMatch(re);
      expect(host!.querySelectorAll('.sidenav li a').length).toBe(6);
    });
  }
  it('Mission Control lists all six missions with controls', async () => {
    await mount('#/missions');
    await waitFor('.mission-card');
    expect(host!.querySelectorAll('.mission-card').length).toBe(6);
    expect(host!.querySelectorAll('.mission-card .btn-primary').length).toBe(6);
  });
});

describe('workspace', () => {
  it('renders a mission workspace with status bar, library, inspector tabs and dock', async () => {
    await mount('#/play/m2-db-meltdown');
    await waitFor('.statusbar');
    expect(host!.querySelector('.statusbar')).toBeTruthy();
    expect(host!.querySelector('.library')).toBeTruthy();
    expect(host!.querySelector('.dock')).toBeTruthy();
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
