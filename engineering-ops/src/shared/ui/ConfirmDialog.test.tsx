import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { SettingsDialog } from '@/app/dialogs/SettingsDialog';
import App from '@/app/App';
import { TEMPLATES } from '@/content/templates';
import { useGame } from '@/game/store';
import { useConfirm } from '@/shared/ui/ConfirmDialog';

let root: Root | undefined;
let host: HTMLElement | undefined;
let confirmSpy: MockInstance<typeof window.confirm>;

const tick = (ms = 30) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
async function waitFor(test: () => unknown, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && !test()) await tick(25);
  return test();
}
async function mount(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(node);
  });
  await tick();
}
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]');
const button = (label: RegExp) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => label.test(b.textContent ?? ''));
const click = async (el: Element | undefined) => {
  expect(el).toBeTruthy();
  await act(async () => {
    el!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await tick();
};

beforeEach(() => {
  // the native dialog is blocked silently in sandboxed iframes; nothing may depend on it
  confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => {
    throw new Error('window.confirm must not be used');
  });
  useGame.getState().resetAll();
  useGame.setState({ settings: { mode: 'beginner', onboarded: true, showAllComponents: false } });
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  window.location.hash = '';
  confirmSpy.mockRestore();
});

function Harness({ onYes }: { onYes: () => void }) {
  const { ask, dialog: d } = useConfirm();
  return (
    <>
      <button onClick={() => ask({ title: 'Sure?', message: 'Really do it?', confirmLabel: 'Do it' }, onYes)}>open</button>
      {d}
    </>
  );
}

describe('useConfirm', () => {
  it('runs the action only after the person confirms', async () => {
    const yes = vi.fn();
    await mount(<Harness onYes={yes} />);
    expect(dialog()).toBeNull();
    await click(button(/^open$/));
    expect(dialog()?.textContent).toMatch(/Really do it\?/);
    expect(yes).not.toHaveBeenCalled();
    await click(button(/^Do it$/));
    expect(yes).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
  });
  it('does nothing when cancelled', async () => {
    const yes = vi.fn();
    await mount(<Harness onYes={yes} />);
    await click(button(/^open$/));
    await click(button(/^Cancel$/));
    expect(yes).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});

describe('Lab template picker', () => {
  const pick = async (id: string) => {
    const select = (await waitFor(() => document.querySelector('select[aria-label="Template"]'))) as HTMLSelectElement;
    expect(select).toBeTruthy();
    await act(async () => {
      select.value = id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await tick();
  };
  const nodes = () => useGame.getState().session!.draft.nodes.length;

  it('loads the chosen template after confirming, without the native dialog', async () => {
    window.location.hash = '#/lab?template=three-tier';
    await mount(<App />);
    await waitFor(() => useGame.getState().session?.missionId === 'lab');
    const before = nodes();
    const target = TEMPLATES.find((t) => t.id === 'scaled-platform')!;
    expect(target.arch.nodes.length).not.toBe(before);
    await pick('scaled-platform');
    expect(dialog()?.textContent).toContain(target.name);
    expect(nodes()).toBe(before); // nothing changes until confirmed
    await click(button(/Replace sandbox/));
    await waitFor(() => nodes() === target.arch.nodes.length);
    expect(nodes()).toBe(target.arch.nodes.length);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('keeps the sandbox when the person cancels', async () => {
    window.location.hash = '#/lab?template=three-tier';
    await mount(<App />);
    await waitFor(() => useGame.getState().session?.missionId === 'lab');
    const before = nodes();
    await pick('scaled-platform');
    await click(button(/^Cancel$/));
    expect(nodes()).toBe(before);
    expect(dialog()).toBeNull();
  });
});

describe('Settings: reset all progress', () => {
  it('asks in-app and resets only after confirming', async () => {
    const onClose = vi.fn();
    await mount(<SettingsDialog onClose={onClose} />);
    const reset = vi.spyOn(useGame.getState(), 'resetAll');
    await click(button(/Reset all progress/));
    expect(document.body.textContent).toMatch(/cannot be undone/);
    expect(onClose).not.toHaveBeenCalled();
    await click(button(/Erase everything/));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(confirmSpy).not.toHaveBeenCalled();
    reset.mockRestore();
  });
});
