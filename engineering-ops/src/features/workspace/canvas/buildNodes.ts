import type { Node } from '@xyflow/react';
import { attachedTo } from '@/engine/arch';
import { visualStatus, type Report } from '@/engine/analysis';
import { entryOf } from '@/engine/catalog';
import type { Arch, Snapshot } from '@/engine/types';
import type { ArchNodeData } from '@/features/workspace/ArchNodeView';
import type { Moment } from '@/features/workspace/effects/fx';
import { tilesFor, type Tile } from '@/features/workspace/InstanceStrip';

import type { Selection } from './geometry';

export interface NodeInputs {
  draft: Arch | undefined;
  live: Arch | undefined;
  snap: Snapshot | undefined;
  report: Report | undefined;
  selection: Selection;
  /** Every component in the current multi-selection. */
  multi: string[];
  /** Components marked as the blast radius of an attack. */
  highlight: string[];
  moments: Record<string, Moment>;
}

/** The React Flow nodes for the draft: each carries its live metrics, status and any one-shot effect. */
export function buildNodes({ draft, live, snap, report, selection, multi, highlight, moments }: NodeInputs): Node[] {
  if (!draft) return [];
  const liveIds = new Set(live?.nodes.map((n) => n.id));
  const liveCfg = new Map(live?.nodes.map((n) => [n.id, JSON.stringify(n.config)]));
  return draft.nodes.map((n) => {
    const m = snap?.nodes[n.id];
    const flag = report?.flags[n.id];
    const isNetwork = entryOf(n.kind).role === 'network';
    const data: ArchNodeData = {
      node: n,
      metrics: m,
      status: m ? visualStatus(m.status, flag) : 'idle',
      insecure: flag?.insecure,
      misconfigured: flag?.misconfigured,
      attachedAutoscaling: attachedTo(draft, n.id).some((a) => a.kind === 'autoscaling'),
      pending: !liveIds.has(n.id),
      changed: liveIds.has(n.id) && liveCfg.get(n.id) !== JSON.stringify(n.config),
      isNetwork,
      minute: snap?.minute ?? 0,
      attacked: highlight.includes(n.id),
      moment: moments[n.id],
    };
    if (entryOf(n.kind).role === 'lb' && snap) {
      const tiles: Tile[] = [];
      let up = 0,
        total = 0;
      for (const e of draft.edges) {
        if (e.source !== n.id) continue;
        const t = draft.nodes.find((x) => x.id === e.target);
        const tm = t && snap.nodes[t.id];
        if (!t || !tm || !['compute', 'worker'].includes(tm.role)) continue;
        const ts = tilesFor(t, tm, snap.minute).filter((x) => x.kind !== 'ghost');
        up += ts.filter((x) => x.kind === 'on').length;
        total += ts.length;
        tiles.push(...ts.map((x) => ({ ...x, key: `${t.id}-${x.key}` })));
      }
      if (tiles.length) {
        data.fanout = tiles.slice(0, 16);
        data.fanoutLabel = `${up}/${total} healthy`;
      }
    }
    return {
      id: n.id,
      type: 'arch',
      position: n.position,
      data,
      selected: multi.includes(n.id) || (selection.type === 'node' && selection.id === n.id),
      zIndex: isNetwork ? 0 : 1,
    };
  });
}
