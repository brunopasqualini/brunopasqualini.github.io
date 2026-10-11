import { useCallback, useEffect } from 'react';
import { copySelection, pasteClip, type Clip } from '@/engine/duplicate';
import { useGame } from '@/game/store';

/** What Ctrl/⌘+C last copied. Module-level so it survives opening another mission or the Lab. */
let clipboard: Clip | null = null;
let pasteCount = 0;

/** Copy, paste and duplicate for the selected components, with their keyboard shortcuts. */
export function useCanvasClipboard(selectedIds: () => string[], setMulti: (ids: string[]) => void) {
  const copy = useCallback(() => {
    const g = useGame.getState();
    const clip = g.session ? copySelection(g.session.draft, selectedIds()) : null;
    if (!clip) return false;
    clipboard = clip;
    pasteCount = 0;
    g.toast(`Copied ${clip.nodes.length} component${clip.nodes.length === 1 ? '' : 's'}. Paste with Ctrl/⌘+V.`, 'info');
    return true;
  }, [selectedIds]);

  const paste = useCallback(() => {
    const g = useGame.getState();
    if (!g.session || !clipboard) return;
    pasteCount += 1;
    const p = pasteClip(g.session.draft, clipboard, { x: 40 * pasteCount, y: 40 * pasteCount });
    g.editDraft((a) => {
      a.nodes.push(...p.nodes);
      a.edges.push(...p.edges);
    });
    setMulti(p.ids);
    g.select('node', p.ids[0]);
  }, [setMulti]);

  const duplicate = useCallback(() => {
    if (copy()) paste();
  }, [copy, paste]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!t || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === 'c' && selectedIds().length) {
        e.preventDefault();
        copy();
      } else if (k === 'v' && clipboard) {
        e.preventDefault();
        paste();
      } else if (k === 'd' && selectedIds().length) {
        e.preventDefault(); // also the browser's "bookmark this page"
        duplicate();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [copy, paste, duplicate, selectedIds]);

  return { duplicate };
}
