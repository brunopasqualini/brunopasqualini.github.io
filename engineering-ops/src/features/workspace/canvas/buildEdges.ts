import { MarkerType, type BuiltInEdge } from '@xyflow/react';
import { CONFIG_REF_KEYS, edgeClass, nodeById } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import type { Arch, Snapshot } from '@/engine/types';
import { EDGE_COLOR, edgeLook } from '@/features/workspace/edgeStyle';
import type { FxEdge, FxLevel } from '@/features/workspace/effects/fx';
import { verticalPair, type Selection } from './geometry';

export interface EdgeInputs {
  draft: Arch | undefined;
  snap: Snapshot | undefined;
  selection: Selection;
  running: boolean;
  showRefs: boolean;
  /** Semantic zoom: 2 = close, 1 = overview, 0 = far. */
  detail: number;
  fxChosen: FxLevel;
  fxReduced: boolean;
}

/** The React Flow edges: styled by connector class, with rates, errors and open breakers shown on the label. */
export function buildEdges({ draft, snap, selection, running, showRefs, detail, fxChosen, fxReduced }: EdgeInputs): BuiltInEdge[] {
  if (!draft) return [];
  const out: BuiltInEdge[] = [];
  for (const e of draft.edges) {
    const cls = edgeClass(draft, e);
    const em = snap?.edges[e.id];
    const sel = selection.type === 'edge' && selection.id === e.id;
    const look = edgeLook(
      cls,
      nodeById(draft, e.source) && entryOf(nodeById(draft, e.source)!.kind).role,
      nodeById(draft, e.target) && entryOf(nodeById(draft, e.target)!.kind).role,
    );
    let color: string = look.color;
    let dash = look.dash;
    let width = look.width;
    let label: string | undefined;
    if (cls === 'traffic' || cls === 'async') {
      const rps = em?.rps ?? 0;
      width = look.width + Math.min(2.2, Math.log10(1 + rps) * 0.6);
      if (em && em.errorRate > 0.3) color = EDGE_COLOR.bad;
      else if (em && em.errorRate > 0.05) color = EDGE_COLOR.warn;
      if (em?.blocked) {
        color = EDGE_COLOR.bad;
        dash = '6 4';
      }
      const tgt = snap?.nodes[e.target];
      const per =
        em && tgt && ['compute', 'worker'].includes(tgt.role) && tgt.replicas > 1 && !em.blocked && rps >= 0.5
          ? ` · ${tgt.replicas}× ≈${rps / tgt.replicas >= 100 ? (rps / tgt.replicas).toFixed(0) : (rps / tgt.replicas).toFixed(1)}/s`
          : '';
      const notable = !!em && (em.blocked || em.errorRate > 0.05 || em.amplification > 1.25 || em.breakerOpen);
      // rates on every connector turn a busy diagram into noise: show them up close, when selected, or when something is wrong
      label =
        em && (detail === 2 || sel || notable)
          ? em.blocked
            ? '✕ blocked'
            : rps >= 0.5
              ? `${rps >= 100 ? rps.toFixed(0) : rps.toFixed(1)}/s${em.amplification > 1.25 ? ` ×${em.amplification.toFixed(1)}` : ''}${em.breakerOpen ? ' ⚡open' : ''}${per}`
              : undefined
          : undefined;
    }
    const vertical = verticalPair(draft, e.source, e.target);
    out.push({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: vertical ? (vertical === 'down' ? 'sb' : 'st') : undefined,
      targetHandle: vertical ? (vertical === 'down' ? 'tt' : 'tb') : undefined,
      selected: sel,
      // the marching dashes are the original flow cue; with effects on, packets carry the motion instead
      animated:
        running && fxChosen === 'off' && !fxReduced && (cls === 'traffic' || cls === 'async') && (em?.rps ?? 0) > 0.5 && !em?.blocked,
      label,
      labelStyle: { fill: color, fontSize: 10, fontFamily: 'ui-monospace, monospace' },
      labelBgStyle: { fill: '#0a1224', fillOpacity: 0.9 },
      labelBgPadding: [4, 2],
      labelBgBorderRadius: 4,
      style: {
        stroke: color,
        strokeWidth: sel ? width + 1.5 : width,
        strokeDasharray: dash,
        opacity: cls === 'attach' || cls === 'deploy' ? 0.85 : 1,
      },
      markerEnd: look.arrow ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } : undefined,
      markerStart: look.bidirectional ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } : undefined,
      type: 'smoothstep',
      pathOptions: { borderRadius: 18 },
    });
  }
  if (showRefs) {
    for (const n of draft.nodes) {
      for (const k of CONFIG_REF_KEYS) {
        const ref = n.config[k];
        if (typeof ref === 'string' && ref && nodeById(draft, ref)) {
          out.push({
            id: `ref-${n.id}-${k}`,
            source: n.id,
            target: ref,
            selectable: false,
            focusable: false,
            deletable: false,
            style: { stroke: '#2f4468', strokeDasharray: '1 6', strokeWidth: 1.2, opacity: 0.8 },
            type: 'default',
          });
        }
      }
    }
  }
  return out;
}

/** Traffic connectors as the packet layer needs them. */
export function buildFxEdges(draft: Arch | undefined, snap: Snapshot | undefined): FxEdge[] {
  if (!draft || !snap) return [];
  const out: FxEdge[] = [];
  for (const e of draft.edges) {
    const em = snap.edges[e.id];
    const s = nodeById(draft, e.source);
    const t = nodeById(draft, e.target);
    if (!em || !s || !t) continue;
    const cls = edgeClass(draft, e);
    if (cls !== 'traffic' && cls !== 'async') continue;
    const look = edgeLook(cls, entryOf(s.kind).role, entryOf(t.kind).role);
    if (look.kind !== 'request' && look.kind !== 'async' && look.kind !== 'storage') continue;
    const ts = snap.nodes[e.target]?.status;
    out.push({
      id: e.id,
      target: e.target,
      tone: look.kind,
      rps: em.rps,
      errorRate: em.errorRate,
      blocked: !!em.blocked,
      slow: ts === 'degraded' || ts === 'overloaded',
    });
  }
  return out;
}
