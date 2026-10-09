import {
  Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type Edge, type Node, type NodeChange, type OnConnectEnd,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { tilesFor, type Tile } from './InstanceStrip';
import { edgeClass, makeEdge, makeNode, nodeById } from '../../sim/arch';
import { visualStatus } from '../../sim/analysis';
import { canConnect, entryOf } from '../../sim/catalog';
import { useGame } from '../../game/store';
import { useLive } from '../hooks';
import { ArchNodeView, type ArchNodeData } from './ArchNodeView';

const nodeTypes = { arch: ArchNodeView };
/** Leave room for the overlay controls (toolbar top-right, zoom controls left, legend/minimap bottom). */
const FIT = { padding: { top: '60px', right: '28px', bottom: '48px', left: '60px' }, maxZoom: 1.15 } as const;
const REF_KEYS = ['subnet', 'sg', 'iamRole', 'nat', 'vpc', 'nacl'];

function CanvasInner() {
  const { session, snap, report } = useLive();
  const tick = useGame((s) => s.tick);
  const running = useGame((s) => s.running);
  const selection = useGame((s) => s.selection);
  const [showRefs, setShowRefs] = useState(true);
  const rf = useReactFlow();
  const wrap = useRef<HTMLDivElement>(null);

  const draft = session?.draft;
  const live = session?.live;

  const nodes: Node[] = useMemo(() => {
    if (!draft) return [];
    const liveIds = new Set(live?.nodes.map((n) => n.id));
    const liveCfg = new Map(live?.nodes.map((n) => [n.id, JSON.stringify(n.config)]));
    return draft.nodes.map((n) => {
      const m = snap?.nodes[n.id];
      const flag = report?.flags[n.id];
      const isNetwork = entryOf(n.kind).role === 'network';
      const data: ArchNodeData = {
        node: n, metrics: m, status: m ? visualStatus(m.status, flag) : 'idle', insecure: flag?.insecure, misconfigured: flag?.misconfigured,
        pending: !liveIds.has(n.id), changed: liveIds.has(n.id) && liveCfg.get(n.id) !== JSON.stringify(n.config), isNetwork, minute: snap?.minute ?? 0,
      };
      if (entryOf(n.kind).role === 'lb' && snap) {
        const tiles: Tile[] = [];
        let up = 0, total = 0;
        for (const e of draft.edges) {
          if (e.source !== n.id) continue;
          const t = draft.nodes.find((x) => x.id === e.target);
          const tm = t && snap.nodes[t.id];
          if (!t || !tm || !['compute', 'worker'].includes(tm.role)) continue;
          const ts = tilesFor(t, tm, snap.minute).filter((x) => x.kind !== 'ghost');
          up += ts.filter((x) => x.kind === 'on').length; total += ts.length;
          tiles.push(...ts.map((x) => ({ ...x, key: `${t.id}-${x.key}` })));
        }
        if (tiles.length) { data.fanout = tiles.slice(0, 16); data.fanoutLabel = `${up}/${total} healthy`; }
      }
      return { id: n.id, type: 'arch', position: n.position, data, selected: selection.type === 'node' && selection.id === n.id, zIndex: isNetwork ? 0 : 1 };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, draft, selection.type, selection.id, snap, report]);

  const edges: Edge[] = useMemo(() => {
    if (!draft) return [];
    const out: Edge[] = [];
    for (const e of draft.edges) {
      const cls = edgeClass(draft, e);
      const em = snap?.edges[e.id];
      const sel = selection.type === 'edge' && selection.id === e.id;
      let color = '#3b6ea8';
      let dash: string | undefined;
      let width = 1.6;
      let label: string | undefined;
      if (cls === 'traffic' || cls === 'async') {
        const rps = em?.rps ?? 0;
        width = 1.4 + Math.min(3, Math.log10(1 + rps) * 0.9);
        color = cls === 'async' ? '#a78bfa' : '#22d3ee';
        if (em && em.errorRate > 0.3) color = '#ef4444';
        else if (em && em.errorRate > 0.05) color = '#f59e0b';
        if (em?.blocked) { color = '#ef4444'; dash = '6 4'; }
        if (cls === 'async') dash = '7 5';
        const tgt = snap?.nodes[e.target];
        const per = em && tgt && ['compute', 'worker'].includes(tgt.role) && tgt.replicas > 1 && !em.blocked && rps >= 0.5 ? ` · ${tgt.replicas}× ≈${(rps / tgt.replicas) >= 100 ? (rps / tgt.replicas).toFixed(0) : (rps / tgt.replicas).toFixed(1)}/s` : '';
        label = em ? (em.blocked ? '✕ blocked' : rps >= 0.5 ? `${rps >= 100 ? rps.toFixed(0) : rps.toFixed(1)}/s${em.amplification > 1.25 ? ` ×${em.amplification.toFixed(1)}` : ''}${em.breakerOpen ? ' ⚡open' : ''}${per}` : undefined) : undefined;
      } else if (cls === 'attach') { color = '#64748b'; dash = '2 5'; width = 1.2; } else { color = '#4f78c4'; dash = '3 5'; width = 1.2; }
      out.push({
        id: e.id, source: e.source, target: e.target, selected: sel, animated: running && (cls === 'traffic' || cls === 'async') && (em?.rps ?? 0) > 0.5 && !em?.blocked,
        label, labelStyle: { fill: color, fontSize: 10, fontFamily: 'ui-monospace, monospace' }, labelBgStyle: { fill: '#0a1224', fillOpacity: 0.9 }, labelBgPadding: [4, 2], labelBgBorderRadius: 4,
        style: { stroke: color, strokeWidth: sel ? width + 1.5 : width, strokeDasharray: dash, opacity: cls === 'attach' || cls === 'deploy' ? 0.75 : 1 },
        markerEnd: cls === 'traffic' || cls === 'async' ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 } : undefined,
        type: 'default',
      });
    }
    if (showRefs) {
      for (const n of draft.nodes) {
        for (const k of REF_KEYS) {
          const ref = n.config[k];
          if (typeof ref === 'string' && ref && nodeById(draft, ref)) {
            out.push({ id: `ref-${n.id}-${k}`, source: n.id, target: ref, selectable: false, focusable: false, deletable: false, style: { stroke: '#2f4468', strokeDasharray: '1 6', strokeWidth: 1.2, opacity: 0.8 }, type: 'default' });
          }
        }
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, draft, snap, selection.type, selection.id, running, showRefs]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const g = useGame.getState();
    for (const c of changes) {
      if (c.type === 'position' && c.position) g.moveNode(c.id, c.position);
    }
  }, []);

  const addNode = useCallback((kind: string, pos?: { x: number; y: number }) => {
    const g = useGame.getState();
    const s = g.session;
    if (!s) return;
    const e = entryOf(kind);
    const count = s.draft.nodes.filter((n) => n.kind === kind).length;
    const rect = wrap.current?.getBoundingClientRect();
    const center = rect ? rf.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }) : { x: 200, y: 200 };
    const p = pos ?? { x: center.x + (count % 4) * 30 - 40, y: center.y + (count % 4) * 24 - 30 };
    const node = makeNode(kind, p, { label: count > 0 ? `${e.name} ${count + 1}` : undefined });
    g.editDraft((a) => { a.nodes.push(node); });
    g.select('node', node.id);
  }, [rf]);

  useEffect(() => {
    const on = (ev: Event) => addNode((ev as CustomEvent<{ kind: string }>).detail.kind);
    window.addEventListener('eo-add', on);
    return () => window.removeEventListener('eo-add', on);
  }, [addNode]);

  useEffect(() => {
    const on = () => rf.fitView({ ...FIT, duration: 300 });
    window.addEventListener('eo-fit', on);
    const t = setTimeout(() => rf.fitView(FIT), 80);
    return () => { window.removeEventListener('eo-fit', on); clearTimeout(t); };
  }, [rf, session?.missionId, session?.attempt]);

  const onDrop = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    const kind = ev.dataTransfer.getData('application/x-eo-kind');
    if (!kind) return;
    const pos = rf.screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
    addNode(kind, { x: pos.x - 70, y: pos.y - 24 });
  }, [rf, addNode]);

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
    const role = entryOf(t.kind).role;
    const weight = role === 'db' || role === 'kv' ? 2 : 1;
    g.editDraft((a) => { a.edges.push(makeEdge(c.source!, c.target!, { weight })); });
    g.select('edge', `e-${c.source}-${c.target}`);
    void s;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback((event, state) => {
    if (state.isValid || !state.fromNode) return;
    const pt = 'changedTouches' in event ? event.changedTouches[0] : (event as MouseEvent);
    const el = document.elementsFromPoint(pt.clientX, pt.clientY).find((x) => (x as HTMLElement).classList?.contains('react-flow__node')) as HTMLElement | undefined;
    const toId = state.toNode?.id ?? el?.getAttribute('data-id');
    if (!toId || toId === state.fromNode.id) return;
    const g = useGame.getState();
    const s = nodeById(g.session!.draft, state.fromNode.id);
    const t = nodeById(g.session!.draft, toId);
    if (s && t) {
      const exists = g.session!.draft.edges.some((e) => e.source === s.id && e.target === t.id);
      g.toast(exists ? 'Those components are already connected.' : canConnect(s.kind, t.kind).reason ?? 'That connection is not valid.', 'warn');
    }
  }, []);

  const onNodesDelete = useCallback((deleted: Node[]) => {
    const ids = new Set(deleted.map((d) => d.id));
    const g = useGame.getState();
    g.editDraft((a) => { a.nodes = a.nodes.filter((n) => !ids.has(n.id)); a.edges = a.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target)); a.nodes.forEach((n) => { for (const k of REF_KEYS) if (ids.has(n.config[k])) n.config[k] = ''; }); });
    g.select(null);
  }, []);
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    const ids = new Set(deleted.filter((d) => !d.id.startsWith('ref-')).map((d) => d.id));
    if (!ids.size) return;
    const g = useGame.getState();
    g.editDraft((a) => { a.edges = a.edges.filter((e) => !ids.has(e.id)); });
    g.select(null);
  }, []);

  const hasNetwork = draft?.nodes.some((n) => entryOf(n.kind).role === 'network');

  return (
    <div className="canvas" ref={wrap} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} onNodesChange={onNodesChange} onConnect={onConnect} onConnectEnd={onConnectEnd} isValidConnection={isValid}
        onNodeClick={(_, n) => useGame.getState().select('node', n.id)}
        onEdgeClick={(_, e) => { if (!e.id.startsWith('ref-')) useGame.getState().select('edge', e.id); }}
        onPaneClick={() => useGame.getState().select(null)}
        onNodesDelete={onNodesDelete} onEdgesDelete={onEdgesDelete}
        deleteKeyCode={['Backspace', 'Delete']} minZoom={0.25} maxZoom={1.8} fitView fitViewOptions={FIT} proOptions={{ hideAttribution: true }}
        colorMode="dark" selectionOnDrag={false} panOnScroll={false} zoomOnDoubleClick={false}
        aria-label="Architecture canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2b4a" />
        <Controls position="top-left" showInteractive={false} aria-label="Canvas zoom controls" />
        <MiniMap pannable zoomable position="bottom-left" style={{ width: 128, height: 84 }} nodeColor={(n) => ({ healthy: '#34d399', degraded: '#f59e0b', overloaded: '#f97316', unavailable: '#ef4444', insecure: '#a78bfa', misconfigured: '#f59e0b', idle: '#475569' } as Record<string, string>)[(n.data as ArchNodeData).status] ?? '#475569'} maskColor="rgba(7,12,24,0.7)" />
      </ReactFlow>
      <div className="canvas-legend" aria-hidden="true">
        <span><i className="lg lg-crit" /> critical path</span>
        <span><i className="lg lg-dep" /> dependency</span>
        <span><i className="lg lg-async" /> async / events</span>
        <span><i className="lg lg-attach" /> attached policy</span>
      </div>
      <div className="canvas-tools">
        <button className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event('eo-fit'))}>Fit view</button>
        {hasNetwork && <button className={`btn btn-ghost btn-sm ${showRefs ? 'is-on' : ''}`} aria-pressed={showRefs} onClick={() => setShowRefs((v) => !v)}>Network links</button>}
      </div>
      {draft && draft.nodes.length <= 1 && (
        <div className="canvas-empty">
          <strong>Your canvas is empty.</strong>
          <p>Drag components from the library, or click one to add it. Drag from a node’s right handle to another node’s left handle to connect them.</p>
        </div>
      )}
    </div>
  );
}

export function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
