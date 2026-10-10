import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { makeNode } from '@/engine/arch';
import { when } from '@/features/workspace/AttackPanel';
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
const panel = () => host!.querySelector('.attack-panel');
const select = () => host!.querySelector<HTMLSelectElement>('select[aria-label="Attack"]')!;
const runBtn = () =>
  [...host!.querySelectorAll<HTMLButtonElement>('.attack-panel button')].find((b) => /Run attack/.test(b.textContent ?? ''))!;
const result = () => host!.querySelector('.attack-result');
const choose = async (id: string) => {
  await act(async () => {
    select().value = id;
    select().dispatchEvent(new Event('change', { bubbles: true }));
  });
  await tick();
};
const run = async () => {
  await act(async () => runBtn().click());
  await tick();
};

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
/** Add an IAM role, attach it to the first service, and deploy so the running system has it. */
async function deployRole(policy: 'scoped' | 'admin') {
  await act(async () => {
    g().editDraft((a) => {
      a.nodes.push(makeNode('iam', { x: 0, y: 300 }, { id: 'role', label: 'api-role', config: { policy } }));
      const svc = a.nodes.find((n) => ['ecs', 'backend-service', 'monolith'].includes(n.kind))!;
      svc.config.iamRole = 'role';
    });
  });
  await act(async () => g().deploy());
  await tick();
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

describe('formatting', () => {
  it('writes illustrative timings readably', () => {
    expect(when(0)).toBe('T+0 min');
    expect(when(10)).toBe('T+10 min');
    expect(when(360)).toBe('T+6 h');
    expect(when(null)).toBe('never');
  });
});

describe('attack panel in the Lab', () => {
  it('offers the three attacks and runs none until asked', async () => {
    await open('three-tier');
    expect([...select().options].map((o) => o.textContent)).toEqual(['Leaked credential', 'Open data store', 'HTTP flood (DDoS)']);
    expect(result()).toBeNull();
    expect(host!.textContent).toMatch(/Nothing in your run changes/);
  });

  it('says a leaked credential is not applicable until a role is attached to a service', async () => {
    await open('three-tier');
    await run();
    expect(result()!.textContent).toMatch(/Not applicable/);
    expect(result()!.textContent).toMatch(/Add an IAM role/);
    expect(g().highlight).toEqual([]);
  });

  it('shows the breach timeline, the fixes, and marks the blast radius on the canvas', async () => {
    await open('three-tier');
    await deployRole('admin');
    await run();
    expect(result()!.textContent).toMatch(/Breach/);
    expect(result()!.textContent).toMatch(/administrator permissions/);
    expect(result()!.textContent).toMatch(/never/); // no audit trail in this design
    expect(result()!.querySelectorAll('.ar-stage').length).toBeGreaterThan(4);
    expect(result()!.querySelector('.ar-todo')?.textContent).toMatch(/What to change/);
    const hl = g().highlight;
    expect(hl).toContain('role');
    await waitFor(() => host!.querySelector('.anode-attacked'));
    expect(host!.querySelectorAll('.anode-attacked').length).toBe(hl.length);
  });

  it('a scoped role is a smaller blast radius than an administrator', async () => {
    await open('three-tier');
    await deployRole('admin');
    await run();
    const admin = g().highlight.length;
    await act(async () => {
      g().editDraft((a) => {
        a.nodes.find((n) => n.id === 'role')!.config.policy = 'scoped';
      });
    });
    await act(async () => g().deploy());
    await run();
    expect(g().highlight.length).toBeLessThanOrEqual(admin);
    expect(result()!.textContent).not.toMatch(/administrator permissions \(\*:\*\)/);
  });

  it('can hide the blast radius, and clears it when the panel goes away', async () => {
    await open('three-tier');
    await deployRole('admin');
    await run();
    const box = host!.querySelector<HTMLInputElement>('.attack-panel input[type="checkbox"]')!;
    await act(async () => box.click());
    expect(g().highlight).toEqual([]);
    await act(async () => box.click());
    expect(g().highlight.length).toBeGreaterThan(0);
    await act(async () => root!.unmount());
    expect(g().highlight).toEqual([]);
    root = undefined;
  });

  it('changing the attack clears the previous result', async () => {
    await open('three-tier');
    await deployRole('admin');
    await run();
    expect(result()).toBeTruthy();
    await choose('ddos');
    expect(result()).toBeNull();
    expect(g().highlight).toEqual([]);
  });

  it('tells you when the deployed design changed since the run', async () => {
    await open('three-tier');
    await deployRole('admin');
    await run();
    expect(result()!.textContent).not.toMatch(/has changed since this run/);
    await act(async () => {
      g().editDraft((a) => {
        a.nodes.find((n) => n.id === 'role')!.config.policy = 'scoped';
      });
    });
    await act(async () => g().deploy());
    await tick();
    expect(result()!.textContent).toMatch(/has changed since this run/);
    expect(g().highlight).toEqual([]); // a stale run no longer paints the canvas
  });

  it('runs the flood through the engine and reports measured numbers', async () => {
    await open('scaled-platform');
    await choose('ddos');
    await run();
    expect(result()!.textContent).toMatch(/Measured impact/);
    expect(result()!.textContent).toMatch(/available/);
    expect(result()!.textContent).toMatch(/engine/);
  });

  it('notes undeployed changes, because it attacks what is running', async () => {
    await open('three-tier');
    expect(host!.querySelector('.attack-panel')!.textContent).not.toMatch(/undeployed changes/);
    await act(async () => {
      g().editDraft((a) => {
        a.nodes.push(makeNode('s3', { x: 0, y: 0 }, { id: 'extra' }));
      });
    });
    await tick();
    expect(host!.querySelector('.attack-panel')!.textContent).toMatch(/undeployed changes/);
  });
});
