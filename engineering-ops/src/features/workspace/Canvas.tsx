import { Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, useStore } from '@xyflow/react';
import { useMemo, useRef, useState } from 'react';
import { usePersistentFlag } from '@/shared/hooks/usePersistentFlag';
import { entryOf } from '@/engine/catalog';
import { ArchNodeView, type ArchNodeData } from '@/features/workspace/ArchNodeView';
import { PacketLayer } from '@/features/workspace/effects/PacketLayer';
import { useFx } from '@/features/workspace/effects/useFx';
import { useGame } from '@/game/store';
import { useLive } from '@/game/hooks';
import { canRedo, canUndo } from '@/game/undo';
import { ArchitectureOutline } from './canvas/ArchitectureOutline';
import { buildEdges, buildFxEdges } from './canvas/buildEdges';
import { CanvasEmptyHint, CanvasLegend } from './canvas/CanvasOverlays';
import { CanvasToolbar } from './canvas/CanvasToolbar';
import { FIT } from './canvas/geometry';
import { useCanvasClipboard } from './canvas/useCanvasClipboard';
import { useCanvasEditing } from './canvas/useCanvasEditing';
import { useCanvasSelection } from './canvas/useCanvasSelection';
import { useGraphNodes } from './canvas/useGraphNodes';

const nodeTypes = { arch: ArchNodeView };

function CanvasInner() {
  const { session, snap, report, viewing } = useLive();
  const tick = useGame((s) => s.tick);
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const { chosen: fxChosen, level: fx, reduced: fxReduced, cycle: cycleFx } = useFx();
  const selection = useGame((s) => s.selection);
  const highlight = useGame((s) => s.highlight);
  const undoable = useGame((s) => s.undoState.owner === s.session && canUndo(s.undoState.stack));
  const redoable = useGame((s) => s.undoState.owner === s.session && canRedo(s.undoState.stack));
  // semantic zoom: 2 = close (everything), 1 = overview (no metric text), 0 = far (tiles and names only)
  const detail = useStore((s) => (s.transform[2] >= 0.85 ? 2 : s.transform[2] >= 0.55 ? 1 : 0));
  const [showMap, toggleMap] = usePersistentFlag('eo-minimap', false);
  const [showRefs, setShowRefs] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);

  const draft = session?.draft;
  const live = session?.live;

  const { multi, setMulti, onNodesChange, selectedIds } = useCanvasSelection();
  const { duplicate } = useCanvasClipboard(selectedIds, setMulti);
  const edit = useCanvasEditing(wrap, session);
  const nodes = useGraphNodes({
    draft,
    live,
    snap,
    report,
    selection,
    multi,
    highlight,
    fx,
    missionId: session?.missionId,
    attempt: session?.attempt,
  });
  const edges = useMemo(
    () => buildEdges({ draft, snap, selection, running, showRefs, detail, fxChosen, fxReduced }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, draft, snap, selection.type, selection.id, running, showRefs, detail, fxChosen, fxReduced],
  );
  const fxEdges = useMemo(() => buildFxEdges(draft, snap), [draft, snap]);
  const hasNetwork = !!draft?.nodes.some((n) => entryOf(n.kind).role === 'network');

  return (
    <div
      className="canvas"
      data-detail={detail}
      data-viewing={viewing}
      data-fx={fx}
      data-running={running}
      ref={wrap}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={edit.onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onConnect={edit.onConnect}
        onConnectEnd={edit.onConnectEnd}
        isValidConnection={edit.isValid}
        onNodeClick={(_, n) => useGame.getState().select('node', n.id)}
        onEdgeClick={(_, e) => {
          if (!e.id.startsWith('ref-')) useGame.getState().select('edge', e.id);
        }}
        onPaneClick={() => useGame.getState().select(null)}
        onNodeDragStart={() => useGame.getState().recordDraft()}
        onNodesDelete={edit.onNodesDelete}
        onEdgesDelete={edit.onEdgesDelete}
        deleteKeyCode={['Backspace', 'Delete']}
        minZoom={0.25}
        maxZoom={1.8}
        fitView
        fitViewOptions={FIT}
        proOptions={{ hideAttribution: true }}
        colorMode="dark"
        selectionOnDrag={false}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        panOnScroll={false}
        zoomOnDoubleClick={false}
        aria-label="Architecture canvas"
      >
        <PacketLayer edges={fxEdges} level={fx} running={running} speed={speed} detail={detail as 0 | 1 | 2} />
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="#1c2b4a" />
        <Controls position="top-left" showInteractive={false} aria-label="Canvas zoom controls" />
        {showMap && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            style={{ width: 132, height: 88 }}
            nodeColor={(n) =>
              (
                ({
                  healthy: '#34d399',
                  degraded: '#f59e0b',
                  overloaded: '#f97316',
                  unavailable: '#ef4444',
                  insecure: '#a78bfa',
                  misconfigured: '#f59e0b',
                  idle: '#475569',
                }) as Record<string, string>
              )[(n.data as ArchNodeData).status] ?? '#475569'
            }
            maskColor="rgba(7,12,24,0.7)"
          />
        )}
      </ReactFlow>
      <ArchitectureOutline />
      <CanvasLegend />
      <CanvasToolbar
        undoable={undoable}
        redoable={redoable}
        canDuplicate={selectedIds().length > 0}
        onDuplicate={duplicate}
        onArrange={edit.arrange}
        showMap={showMap}
        onToggleMap={() => toggleMap()}
        fx={fx}
        fxReduced={fxReduced}
        onCycleFx={cycleFx}
        hasNetwork={hasNetwork}
        showRefs={showRefs}
        onToggleRefs={() => setShowRefs((v) => !v)}
      />
      {draft && draft.nodes.length <= 1 && <CanvasEmptyHint />}
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
