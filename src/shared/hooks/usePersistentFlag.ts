import { useCallback, useState } from 'react';

/** A boolean UI preference remembered in localStorage (per-viewer convenience only; every access is guarded). */
export function usePersistentFlag(key: string, initial: boolean): [boolean, (next?: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next?: boolean) => {
      setValue((cur) => {
        const v = typeof next === 'boolean' ? next : !cur;
        try {
          window.localStorage.setItem(key, v ? '1' : '0');
        } catch {
          /* storage unavailable */
        }
        return v;
      });
      // the canvas re-fits once the grid has finished animating
      window.setTimeout(() => window.dispatchEvent(new Event('eo-fit')), 260);
    },
    [key],
  );
  return [value, set];
}
