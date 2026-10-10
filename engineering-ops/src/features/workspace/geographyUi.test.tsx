import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { makeNode } from '@/engine/arch';
import type { Arch } from '@/engine/types';
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
const panel = () => host!.querySelector('.geo-panel')!;
const sel = (label: string) => panel().querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
const choose = async (label: string, value: string) => {
  await act(async () => {
    sel(label).value = value;
    sel(label).dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
};
const rows = () =>
  [...panel().querySelectorAll<HTMLElement>('.geo-row')].map((r) => ({
    geo: r.dataset.geo!,
    served: r.dataset.served!,
    p95: Number(r.dataset.p95),
    text: r.textContent ?? '',
  }));

async function open(template = 'three-tier') {
  window.location.hash = `#/lab?template=${template}`;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await waitFor(() => g().session?.missionId === 'lab' && host!.querySelector('.geo-panel'));
}
async function deploy(edit: (a: Arch) => void) {
  await act(async () => g().editDraft(edit));
  await act(async () => g().deploy());
  await tick();
}

beforeEach(() => {
  try {
    window.localStorage.removeItem('eo-geo');
  } catch {
    /* storage unavailable */
  }
  g().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  window.location.hash = '';
});

describe('users and Regions panel in the Lab', () => {
  it('shows a row for each geography with the Region serving it and its latency', async () => {
    await open();
    const r = rows();
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.geo)).toEqual(['na', 'eu', 'ap']);
    expect(r[0].text).toContain('North America');
    for (const x of r) expect(x.served).toBe('us-east-1');
    expect(panel().textContent).toMatch(/Single Region/);
  });

  it('moving users changes who is slow, and the primary Region changes who is close', async () => {
    await open();
    await choose('Where your users are', 'ap-heavy');
    const slowAp = rows()[2].p95;
    await choose('Primary Region', 'ap-southeast-1');
    expect(rows()[2].p95).toBeLessThan(slowAp);
    expect(rows()[2].served).toBe('ap-southeast-1');
    expect(panel().textContent).toMatch(/70%/);
  });

  it('says there is nowhere to fail over to until the design copies data to another Region', async () => {
    await open();
    expect(panel().textContent).toMatch(/No place to fail over to/);
    expect(panel().textContent).toMatch(/cross-Region replica/);
  });

  it('shows an automatic failover, the lag and the transfer cost once the design has them', async () => {
    await open();
    await deploy((a) => {
      a.nodes.find((n) => n.kind === 'rds' || n.kind === 'relational-db')!.config.crossRegionReplica = true;
      a.nodes.push(makeNode('dr-config', { x: 0, y: 400 }, { id: 'dr', config: { strategy: 'warm-standby' } }));
      a.nodes.push(makeNode('route53', { x: 0, y: 500 }, { id: 'dns', config: { routing: 'failover', healthChecks: true } }));
    });
    expect(panel().textContent).toMatch(/Automatic failover/);
    expect(panel().textContent).toMatch(/Health checks fail/);
    expect(panel().textContent).toMatch(/behind/);
    expect(panel().textContent).toMatch(/GB\/month/);
    expect(panel().textContent).toMatch(/\$/);
  });

  it('explains active/active that DNS never uses', async () => {
    await open();
    await deploy((a) => {
      a.nodes.find((n) => n.kind === 'rds' || n.kind === 'relational-db')!.config.crossRegionReplica = true;
      a.nodes.push(makeNode('dr-config', { x: 0, y: 400 }, { id: 'dr', config: { strategy: 'active-active' } }));
    });
    expect(panel().textContent).toMatch(/DNS sends everyone to the primary/);
  });

  it('remembers the choices in this browser', async () => {
    await open();
    await choose('Where your users are', 'eu-heavy');
    await choose('Second Region', 'ap-southeast-1');
    await act(async () => root!.unmount());
    host!.remove();
    await open();
    expect(sel('Where your users are').value).toBe('eu-heavy');
    expect(sel('Second Region').value).toBe('ap-southeast-1');
  });

  it('survives garbage in storage', async () => {
    window.localStorage.setItem('eo-geo', '{"mix":"nope","primary":42}');
    await open();
    expect(sel('Where your users are').value).toBe('global');
    expect(sel('Primary Region').value).toBe('us-east-1');
  });

  it('uses the simulation’s measured time once it is running', async () => {
    await open();
    expect(panel().textContent).toMatch(/100 ms assumed/);
    await act(async () => g().step(3));
    await tick();
    expect(panel().textContent).not.toMatch(/100 ms assumed/);
  });
});
