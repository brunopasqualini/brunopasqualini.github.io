import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '@/app/App';
import { LESSONS, lessonById } from '@/content/academy';
import { useGame } from '@/game/store';

let root: Root | undefined;
let host: HTMLElement | undefined;

async function mount(hash: string) {
  window.location.hash = hash;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<App />);
  });
  const t0 = Date.now();
  while (Date.now() - t0 < 3000 && !host.querySelector('.skill-detail')) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25));
    });
  }
}

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

describe('lessonById', () => {
  it('finds a lesson and its skill branch', () => {
    expect(lessonById('sd-2')).toMatchObject({ skill: 'sd', lesson: { id: 'sd-2', title: 'Retries, timeouts and breakers' } });
    expect(lessonById('fo-3')?.skill).toBe('finops');
  });
  it('returns undefined for an unknown or missing id', () => {
    expect(lessonById('nope')).toBeUndefined();
    expect(lessonById(null)).toBeUndefined();
    expect(lessonById(undefined)).toBeUndefined();
  });
  it('every lesson id resolves to itself', () => {
    for (const lessons of Object.values(LESSONS)) for (const l of lessons) expect(lessonById(l.id)?.lesson).toBe(l);
  });
});

describe('/learning?lesson=…', () => {
  it('opens the lesson’s skill branch and highlights the lesson', async () => {
    await mount('#/learning?lesson=aws-2');
    expect(host!.querySelector('.skill-detail h2')?.textContent).toMatch(/AWS|Cloud/i);
    const focused = host!.querySelector('.lessons .lesson-focus');
    expect(focused?.id).toBe('lesson-aws-2');
    expect(focused?.textContent).toContain('Multi-AZ vs read replicas');
    expect(host!.querySelectorAll('.lessons .lesson-focus')).toHaveLength(1);
  });

  it('opens the default branch with nothing highlighted when there is no lesson in the link', async () => {
    await mount('#/learning');
    expect(host!.querySelector('.lessons .lesson-focus')).toBeNull();
  });

  it('ignores a lesson id that does not exist', async () => {
    await mount('#/learning?lesson=zzz-9');
    expect(host!.querySelector('.skill-detail')).toBeTruthy();
    expect(host!.querySelector('.lessons .lesson-focus')).toBeNull();
  });
});
