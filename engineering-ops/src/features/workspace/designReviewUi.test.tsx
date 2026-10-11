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
const review = () => host!.querySelector('.design-review');
const items = () => [...host!.querySelectorAll('.dr-item')];

async function open(template: string) {
  window.location.hash = `#/lab?template=${template}`;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  await waitFor(() => g().session?.missionId === 'lab');
  useGame.setState({ rightTab: 'plan' });
  await waitFor(() => review());
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

describe('design review in Plan & deploy', () => {
  it('reviews the draft and shows severity, reason and fix', async () => {
    await open('three-tier');
    expect(items().length).toBeGreaterThan(0);
    const single = items().find((i) => /single Availability Zone/.test(i.textContent ?? ''))!;
    expect(single.className).toContain('dr-high');
    expect(single.textContent).toMatch(/Multi-AZ/);
    expect(single.querySelector('details')?.hasAttribute('open')).toBe(true); // high severity starts open
    expect(review()!.textContent).toMatch(/Advice, not a gate/);
  });

  it('updates live as the draft is fixed', async () => {
    await open('three-tier');
    expect(items().some((i) => /single Availability Zone/.test(i.textContent ?? ''))).toBe(true);
    await act(async () => {
      g().editDraft((a) => {
        for (const n of a.nodes) if (n.config.multiAZ === false) n.config.multiAZ = true;
      });
    });
    await tick();
    expect(items().some((i) => /single Availability Zone/.test(i.textContent ?? ''))).toBe(false);
  });

  it('selecting a finding jumps to the component in the inspector', async () => {
    await open('three-tier');
    const link = [...review()!.querySelectorAll<HTMLButtonElement>('.dr-head button')].find((b) =>
      /single Availability Zone/.test(b.textContent ?? ''),
    )!;
    await act(async () => link.click());
    expect(g().selection.type).toBe('node');
    expect(g().session!.draft.nodes.find((n) => n.id === g().selection.id)?.config.multiAZ).toBe(false);
    expect(g().rightTab).toBe('inspect');
  });

  it('links to the lesson behind a finding', async () => {
    await open('three-tier');
    const lesson = [...review()!.querySelectorAll<HTMLButtonElement>('details button')].find((b) =>
      /Multi-AZ vs read replicas/.test(b.textContent ?? ''),
    )!;
    expect(lesson).toBeTruthy();
    await act(async () => lesson.click());
    await waitFor(() => window.location.hash.includes('/learning')); // the router navigates asynchronously
    expect(window.location.hash).toContain('/learning');
    expect(window.location.hash).toContain('lesson=aws-2');
  });

  it('says so, without praise, when nothing is flagged', async () => {
    await open('blank');
    expect(items()).toHaveLength(0);
    expect(review()!.textContent).toMatch(/not the same as a good design/);
  });
});
