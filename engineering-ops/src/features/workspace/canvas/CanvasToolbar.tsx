import { Copy, Redo2, Undo2 } from 'lucide-react';
import { FX_LABEL, type FxLevel } from '@/features/workspace/effects/fx';
import { useGame } from '@/game/store';

interface Props {
  undoable: boolean;
  redoable: boolean;
  canDuplicate: boolean;
  onDuplicate: () => void;
  onArrange: () => void;
  showMap: boolean;
  onToggleMap: () => void;
  fx: FxLevel;
  fxReduced: boolean;
  onCycleFx: () => void;
  hasNetwork: boolean;
  showRefs: boolean;
  onToggleRefs: () => void;
}

/** The buttons over the canvas: undo/redo, duplicate, layout, minimap, effects and network links. */
export function CanvasToolbar(p: Props) {
  return (
    <div className="canvas-tools">
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => useGame.getState().undoEdit()}
        disabled={!p.undoable}
        aria-label="Undo"
        title="Undo the last edit to the draft (Ctrl/⌘+Z)"
      >
        <Undo2 size={14} />
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => useGame.getState().redoEdit()}
        disabled={!p.redoable}
        aria-label="Redo"
        title="Redo (Ctrl/⌘+Shift+Z)"
      >
        <Redo2 size={14} />
      </button>
      <button
        className="btn btn-ghost btn-sm"
        onClick={p.onDuplicate}
        disabled={!p.canDuplicate}
        aria-label="Duplicate selection"
        title="Duplicate the selected components (Ctrl/⌘+D). Shift- or Ctrl/⌘-click, or Shift-drag a box, to select several."
      >
        <Copy size={14} />
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event('eo-fit'))}>
        Fit view
      </button>
      <button className="btn btn-ghost btn-sm" onClick={p.onArrange} title="Arrange components left to right along the request path">
        Auto-layout
      </button>
      <button className={`btn btn-ghost btn-sm ${p.showMap ? 'is-on' : ''}`} aria-pressed={p.showMap} onClick={p.onToggleMap}>
        Minimap
      </button>
      <button
        className={`btn btn-ghost btn-sm ${p.fx !== 'off' ? 'is-on' : ''}`}
        onClick={p.onCycleFx}
        disabled={p.fxReduced}
        title={
          p.fxReduced
            ? 'Effects are off because your system asks for reduced motion.'
            : 'Animated traffic and component effects while the simulation runs. Click to cycle Subtle, Full, Off.'
        }
      >
        Effects: {FX_LABEL[p.fx]}
      </button>
      {p.hasNetwork && (
        <button className={`btn btn-ghost btn-sm ${p.showRefs ? 'is-on' : ''}`} aria-pressed={p.showRefs} onClick={p.onToggleRefs}>
          Network links
        </button>
      )}
    </div>
  );
}
