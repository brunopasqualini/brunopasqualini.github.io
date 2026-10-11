import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackSection } from '@/app/dialogs/FeedbackSection';
import { FeedbackCard, type FeedbackContext } from '@/features/workspace/FeedbackCard';
import { useFeedback } from '@/game/feedbackStore';
import { useGame } from '@/game/store';

let root: Root | undefined;
let host: HTMLElement | undefined;

const tick = (ms = 20) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
async function mount(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  await tick();
}
const btn = (label: RegExp) => [...host!.querySelectorAll<HTMLButtonElement>('button')].find((b) => label.test(b.textContent ?? ''))!;
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await tick();
};
const type = async (el: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const entries = () => useFeedback.getState().entries;

const ctx: FeedbackContext = {
  missionId: 'm2-db-meltdown',
  attempt: 1,
  mode: 'beginner',
  passed: false,
  overall: 61,
  hintsUsed: 2,
  minutes: 14,
};

beforeEach(() => useFeedback.setState({ entries: [] }));
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = host = undefined;
  vi.restoreAllMocks();
});

describe('feedback card', () => {
  it('saves each answer straight away, together with what happened on the attempt', async () => {
    await mount(<FeedbackCard ctx={ctx} />);
    expect(entries()).toHaveLength(0);
    expect(host!.querySelector('textarea')).toBeNull(); // the note appears once there is an answer
    await click(btn(/Too hard/));
    expect(entries()).toHaveLength(1);
    expect(entries()[0]).toMatchObject({
      missionId: 'm2-db-meltdown',
      attempt: 1,
      difficulty: 'too-hard',
      passed: false,
      overall: 61,
      hintsUsed: 2,
      minutes: 14,
    });
    expect(btn(/Too hard/).getAttribute('aria-pressed')).toBe('true');
    expect(btn(/About right/).getAttribute('aria-pressed')).toBe('false');
    await click(btn(/Confusing/));
    expect(entries()[0]).toMatchObject({ difficulty: 'too-hard', clarity: 'unclear' });
  });

  it('changing an answer updates the same response instead of adding another', async () => {
    await mount(<FeedbackCard ctx={ctx} />);
    await click(btn(/Too hard/));
    await click(btn(/About right/));
    expect(entries()).toHaveLength(1);
    expect(entries()[0].difficulty).toBe('about-right');
  });

  it('saves a note when the field loses focus', async () => {
    await mount(<FeedbackCard ctx={ctx} />);
    await click(btn(/Too hard/));
    const ta = host!.querySelector('textarea')!;
    await type(ta, 'I could not find the database panel');
    await act(async () => ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await tick();
    expect(entries()[0].note).toBe('I could not find the database panel');
  });

  it('keeps a separate response for each attempt and restores a previous answer', async () => {
    await mount(<FeedbackCard ctx={ctx} />);
    await click(btn(/Too hard/));
    await act(async () => root!.unmount());
    host!.remove();
    await mount(<FeedbackCard ctx={{ ...ctx, attempt: 2, passed: true }} />);
    expect(btn(/Too hard/).getAttribute('aria-pressed')).toBe('false'); // new attempt, nothing answered yet
    await click(btn(/About right/));
    expect(entries()).toHaveLength(2);
    await act(async () => root!.unmount());
    host!.remove();
    await mount(<FeedbackCard ctx={ctx} />);
    expect(btn(/Too hard/).getAttribute('aria-pressed')).toBe('true'); // attempt 1 still remembered
  });
});

describe('feedback in settings', () => {
  const seed = () =>
    useFeedback.setState({
      entries: [
        { ...ctx, at: 1, difficulty: 'too-hard', clarity: 'unclear', note: 'lost at step 3', simVersion: 1 },
        { ...ctx, missionId: 'm5-queue', at: 2, difficulty: 'about-right', passed: true, simVersion: 1 },
      ],
    });

  it('explains itself when there is nothing yet', async () => {
    await mount(<FeedbackSection />);
    expect(host!.textContent).toMatch(/Nothing yet/);
    expect(host!.querySelector('a')).toBeNull();
  });

  it('summarises per mission and offers a pre-filled issue link that opens safely in a new tab', async () => {
    seed();
    await mount(<FeedbackSection />);
    expect(host!.textContent).toMatch(/2 responses saved on this device/);
    expect(host!.textContent).toMatch(/1 too hard/);
    expect(host!.textContent).toMatch(/1 confusing/);
    const a = host!.querySelector<HTMLAnchorElement>('a')!;
    expect(a.href).toContain('/issues/new?');
    expect(a.target).toBe('_blank');
    expect(a.rel).toContain('noopener');
    expect(decodeURIComponent(a.href)).toContain('lost at step 3');
  });

  it('copies the text, or shows it to select when the clipboard is blocked', async () => {
    seed();
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await mount(<FeedbackSection />);
    await click(btn(/Copy as text/));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('lost at step 3'));
    expect(host!.textContent).toMatch(/Copied\./);

    write.mockRejectedValue(new Error('blocked'));
    await click(btn(/Copy as text/));
    expect(host!.querySelector<HTMLTextAreaElement>('textarea.fb-manual')?.value).toContain('lost at step 3');
  });

  it('needs two clicks to clear, and clears only feedback', async () => {
    seed();
    await mount(<FeedbackSection />);
    await click(btn(/^\s*Clear\s*$/));
    expect(entries()).toHaveLength(2); // armed, not yet cleared
    await click(btn(/Click again to delete/));
    expect(entries()).toHaveLength(0);
  });

  it('survives "Reset all progress", which is about the game save', async () => {
    seed();
    useGame.getState().resetAll();
    expect(entries()).toHaveLength(2);
  });
});
