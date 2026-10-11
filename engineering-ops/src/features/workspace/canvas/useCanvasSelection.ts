import type { NodeChange } from '@xyflow/react';
import { useCallback, useState } from 'react';
import { useGame } from '@/game/store';

/**
 * Which components are selected. `multi` is every component in the current multi-selection (Shift/Ctrl/⌘-click or
 * Shift-drag a box); the store's `selection` stays the one the inspector shows.
 */
export function useCanvasSelection() {
  const [multi, setMulti] = useState<string[]>([]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const g = useGame.getState();
    for (const c of changes) {
      if (c.type === 'position' && c.position) g.moveNode(c.id, c.position);
      if (c.type === 'select') {
        setMulti((cur) => (c.selected ? (cur.includes(c.id) ? cur : [...cur, c.id]) : cur.filter((x) => x !== c.id)));
        // un-selecting the component the inspector is showing must clear it too, or it would stay highlighted
        if (!c.selected && g.selection.type === 'node' && g.selection.id === c.id) g.select(null);
      }
    }
  }, []);

  /** Components to act on: the multi-selection, or the single selected component, limited to ones that still exist. */
  const selectedIds = useCallback((): string[] => {
    const g = useGame.getState();
    const ids = new Set(g.session?.draft.nodes.map((n) => n.id));
    const picked = multi.filter((id) => ids.has(id));
    if (picked.length) return picked;
    return g.selection.type === 'node' && g.selection.id && ids.has(g.selection.id) ? [g.selection.id] : [];
  }, [multi]);

  return { multi, setMulti, onNodesChange, selectedIds };
}
