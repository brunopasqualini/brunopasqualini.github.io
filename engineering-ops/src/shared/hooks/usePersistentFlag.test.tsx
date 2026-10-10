import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { usePersistentFlag } from '@/shared/hooks/usePersistentFlag';

function Probe({ k, initial }: { k: string; initial: boolean }) {
  const [on, set] = usePersistentFlag(k, initial);
  return (
    <div data-on={on ? '1' : '0'}>
      <button className="toggle" onClick={() => set()} />
      <button className="off" onClick={() => set(false)} />
      {/* a DOM event passed by mistake must not be treated as "true" */}
      <button className="event" onClick={(e) => set(e as unknown as boolean)} />
    </div>
  );
}

async function mount(k: string, initial: boolean) {
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Probe k={k} initial={initial} />));
  const click = (sel: string) => act(async () => (host.querySelector(sel) as HTMLButtonElement).click());
  return { root, click, on: () => host.firstElementChild!.getAttribute('data-on') };
}

afterEach(() => window.localStorage.clear());

describe('usePersistentFlag', () => {
  it('toggles, remembers the choice across mounts, and ignores non-boolean arguments', async () => {
    const a = await mount('flag-a', true);
    expect(a.on()).toBe('1');
    await a.click('.toggle');
    expect(a.on()).toBe('0');
    await a.click('.event');
    expect(a.on()).toBe('1');
    await a.click('.off');
    await act(async () => a.root.unmount());
    const b = await mount('flag-a', true);
    expect(b.on()).toBe('0');
    await act(async () => b.root.unmount());
  });
});
