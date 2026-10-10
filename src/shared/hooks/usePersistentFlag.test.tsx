import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { usePersistentFlag } from '@/shared/hooks/usePersistentFlag';

let toggle: (next?: boolean) => void = () => {};
function Probe({ k, initial }: { k: string; initial: boolean }) {
  const [on, set] = usePersistentFlag(k, initial);
  toggle = set;
  return <span data-on={on ? '1' : '0'} />;
}

async function mount(k: string, initial: boolean) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Probe k={k} initial={initial} />));
  return { host, root, on: () => host.querySelector('span')!.getAttribute('data-on') };
}

afterEach(() => window.localStorage.clear());

describe('usePersistentFlag', () => {
  it('toggles, remembers the choice across mounts, and ignores non-boolean arguments', async () => {
    const a = await mount('flag-a', true);
    expect(a.on()).toBe('1');
    await act(async () => toggle());
    expect(a.on()).toBe('0');
    // a DOM event passed by mistake must not be treated as "true"
    await act(async () => toggle({} as unknown as boolean));
    expect(a.on()).toBe('1');
    await act(async () => toggle(false));
    await act(async () => a.root.unmount());
    const b = await mount('flag-a', true);
    expect(b.on()).toBe('0');
    await act(async () => b.root.unmount());
  });
});
