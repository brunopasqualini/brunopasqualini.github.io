import { useCallback, useEffect, useState } from 'react';
import { FX_DEFAULT, nextFxLevel, parseFxLevel, type FxLevel } from '@/features/workspace/effects/fx';

const KEY = 'eo-fx';

function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * The viewer's chosen effects level (remembered per browser), and the level actually applied:
 * a system "reduce motion" preference always wins, whatever was chosen.
 */
export function useFx(): { chosen: FxLevel; level: FxLevel; reduced: boolean; cycle: () => void } {
  const [chosen, setChosen] = useState<FxLevel>(() => {
    try {
      return parseFxLevel(window.localStorage.getItem(KEY));
    } catch {
      return FX_DEFAULT;
    }
  });
  const [reduced, setReduced] = useState(reducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  const cycle = useCallback(() => {
    setChosen((cur) => {
      const next = nextFxLevel(cur);
      try {
        window.localStorage.setItem(KEY, next);
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }, []);
  return { chosen, level: reduced ? 'off' : chosen, reduced, cycle };
}
