import { useReactFlow, type Connection, type Edge, type Node, type OnConnectEnd } from '@xyflow/react';
import { useCallback, useEffect, type RefObject } from 'react';
import { CONFIG_REF_KEYS, defaultEdgeWeight, makeEdge, makeNode, nodeById } from '@/engine/arch';
import { canConnect, entryOf } from '@/engine/catalog';
import { layoutArch } from '@/features/workspace/autoLayout';
import type { Session } from '@/game/session';
import { useGame } from '@/game/store';
import { FIT, freeSpot } from './geometry';

/** Adding, connecting, deleting and arranging components, plus the window events other panels use to drive the canvas. */
export function useCanvasEditing(wrap: RefObject<HTMLDivElement | null>, session: Session | null) {
  const rf = useReactFlow();

  const addNode = useCallback(
    (kind: string, pos?: { x: number; y: number }) => {
      const g = useGame.getState();
      const s = g.session;
      if (!s) return;
      const e = entryOf(kind);
      const count = s.draft.nodes.filter((n) => n.kind === kind).length;
      const rect = wrap.current?.getBoundingClientRect();
      const center = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 200, y: 200 };
      const p = pos ?? freeSpot(s.draft, center);
      const node = makeNode(kind, p, { label: count > 0 ? `${e.name} ${count + 1}` : undefined });
      g.editDraft((a) => {
        a.nodes.push(node);
      });
      g.select('node', node.id);
      // keep every component in view as the diagram grows
      window.setTimeout(() => rf.fitView({ ...FIT, duration: 250 }), 60);
    },
    [rf, wrap],
  );

  useEffect(() => {
    const on = (ev: Event) => addNode((ev as CustomEvent<{ kind: string }>).detail.kind);
    window.addEventListener('eo-add', on);
    return () => window.removeEventListener('eo-add', on);
  }, [addNode]);

  useEffect(() => {
    const on = () => rf.fitView({ ...FIT, duration: 300 });
    window.addEventListener('eo-fit', on);
    const t = setTimeout(() => rf.fitView(FIT), 80);
    return () => {
      window.removeEventListener('eo-fit', on);
      clearTimeout(t);
    };
  }, [rf, session?.missionId, session?.attempt]);

  const onDrop = useCallback(
    (ev: React.DragEvent) => {
      ev.preventDefault();
      const kind = ev.dataTransfer.getData('application/x-eo-kind');
      if (!kind) return;
      const pos = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
      addNode(kind, { x: pos.x - 70, y: pos.y - 24 });
    },
    [rf, addNode],
  );

  const isValid = useCallback((c: Connection | Edge) => {
    const g = useGame.getState().session;
    if (!g || !c.source || !c.target || c.source === c.target) return false;
    const s = nodeById(g.draft, c.source);
    const t = nodeById(g.draft, c.target);
    if (!s || !t) return false;
    if (g.draft.edges.some((e) => e.source === c.source && e.target === c.target)) return false;
    return canConnect(s.kind, t.kind).ok;
  }, []);

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const g = useGame.getState();
    const s = nodeById(g.session!.draft, c.source)!;
    const t = nodeById(g.session!.draft, c.target)!;
    const weight = defaultEdgeWeight(t.kind);
    g.editDraft((a) => {
      a.edges.push(makeEdge(c.source!, c.target!, { weight }));
    });
    g.select('edge', `e-${c.source}-${c.target}`);
    void s;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid || !state.fromNode) return;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : (event as MouseEvent);
    const el = document
      .elementsFromPoint(pt.clientX, pt.clientY)
      .find((x) => (x as HTMLElement).classList?.contains('react-flow__node')) as HTMLElement | undefined;
    const toId = state.toNode?.id ?? el?.getAttribute('data-id');
    if (!toId || toId === state.fromNode.id) return;
    const g = useGame.getState();
    const s = nodeById(g.session!.draft, state.fromNode.id);
    const t = nodeById(g.session!.draft, toId);
    if (s && t) {
      const exists = g.session!.draft.edges.some((e) => e.source === s.id && e.target === t.id);
      g.toast(
        exists ? 'Those components are already connected.' : (canConnect(s.kind, t.kind).reason ?? 'That connection is not valid.'),
        'warn',
      );
    }
  }, []);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map((d) => d.id));
    const g = useGame.getState();
    g.editDraft((a) => {
      a.nodes = a.nodes.filter((n) => !ids.has(n.id));
      a.edges = a.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
      a.nodes.forEach((n) => {
        for (const k of CONFIG_REF_KEYS) if (ids.has(n.config[k])) n.config[k] = '';
      });
    });
    g.select(null);
  }, []);
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const ids = new Set(deleted.filter((d) => !d.id.startsWith('ref-')).map((d) => d.id));
    if (!ids.size) return;
    const g = useGame.getState();
    g.editDraft((a) => {
      a.edges = a.edges.filter((e) => !ids.has(e.id));
    });
    g.select(null);
  }, []);

  const arrange = useCallback(() => {
    const g = useGame.getState();
    const s = g.session;
    if (!s) return;
    const pos = layoutArch(s.draft);
    g.editDraft((a) => {
      for (const n of a.nodes) if (pos[n.id]) n.position = pos[n.id];
    });
    g.toast('Components arranged left to right along the request path.', 'info');
    window.setTimeout(() => window.dispatchEvent(new Event('eo-fit')), 80);
  }, []);

  return { onDrop, isValid, onConnect, onConnectEnd, onNodesDelete, onEdgesDelete, arrange };
}
