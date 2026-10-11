import type { Node } from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArchNodeData } from '@/features/workspace/ArchNodeView';
import { detectMoments, type FxLevel, type Moment, type Observed } from '@/features/workspace/effects/fx';
import { useGame } from '@/game/store';
import { buildNodes, type NodeInputs } from './buildNodes';

type Inputs = Omit<NodeInputs, 'moments'> & { fx: FxLevel; missionId?: string; attempt?: number };

/** The canvas nodes, plus the one-shot effects for what just happened to a component (hit, recovered, scaled, deployed). */
export function useGraphNodes({ fx, missionId, attempt, ...inputs }: Inputs): Node[] {
  const tick = useGame((s) => s.tick);
  const [moments, setMoments] = useState<Record<string, Moment>>({});
  const seen = useRef<{ key: string; obs: Record<string, Observed>; n: number; last: Record<string, number> }>({
    key: '',
    obs: {},
    n: 0,
    last: {},
  });
  const { draft, selection, snap, report, highlight } = inputs;
  const nodes = useMemo(
    () => buildNodes({ ...inputs, moments }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, draft, selection.type, selection.id, snap, report, moments, highlight],
  );

  useEffect(() => {
    const key = `${missionId}:${attempt}:${fx === 'off' ? 'off' : 'on'}`;
    const obs: Record<string, Observed> = {};
    for (const n of nodes) {
      const d = n.data as ArchNodeData;
      obs[n.id] = { status: d.metrics?.status ?? 'idle', replicas: d.metrics?.replicas, pending: d.pending, changed: !!d.changed };
    }
    const prev = seen.current;
    seen.current = { key, obs, n: prev.n, last: prev.key === key ? prev.last : {} };
    if (fx === 'off' || prev.key !== key) return;
    const stamp = ++seen.current.n;
    const found = detectMoments(prev.obs, obs, stamp);
    // a component that keeps flapping between ok and not-ok gets one effect per few seconds, not a strobe
    const nowMs = Date.now();
    for (const [id, m] of Object.entries(found)) {
      if (m.kind !== 'hit' && m.kind !== 'recover') continue;
      if (nowMs - (seen.current.last[id] ?? 0) < 5000) delete found[id];
      else seen.current.last[id] = nowMs;
    }
    if (!Object.keys(found).length) return;
    setMoments((cur) => ({ ...cur, ...found }));
    const t = window.setTimeout(
      () =>
        setMoments((cur) => {
          const rest = Object.fromEntries(Object.entries(cur).filter(([, m]) => m.at !== stamp));
          return Object.keys(rest).length === Object.keys(cur).length ? cur : rest;
        }),
      2600,
    );
    return () => window.clearTimeout(t);
  }, [nodes, fx, missionId, attempt]);

  return nodes;
}
