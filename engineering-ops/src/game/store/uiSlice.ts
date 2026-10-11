import type { PanelId } from '@/content/missions/types';
import type { Slice, Store, Toast } from './types';

let toastId = 1;

export interface UiSlice {
  selection: { type: 'node' | 'edge' | null; id?: string };
  /** Components to mark on the canvas (the blast radius of an attack run in the Lab). Runtime only. */
  highlight: string[];
  introOpen: boolean;
  toasts: Toast[];
  dock: PanelId;
  dockOpen: boolean;
  rightTab: 'inspect' | 'plan';
  mobilePane: 'mission' | 'canvas' | 'build' | 'evidence';
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: number) => void;
  select: (type: 'node' | 'edge' | null, id?: string) => void;
  setHighlight: (ids: string[]) => void;
  setDock: (p: PanelId) => void;
  setDockOpen: (v: boolean) => void;
  setRightTab: (t: Store['rightTab']) => void;
  setMobilePane: (p: Store['mobilePane']) => void;
  setIntroOpen: (v: boolean) => void;
}

export const createUiSlice: Slice<UiSlice> = (set, get) => {
  return {
    selection: { type: null },
    highlight: [],
    introOpen: false,
    toasts: [],
    dock: 'overview',
    dockOpen: true,
    rightTab: 'inspect',
    mobilePane: 'canvas',

    toast: (text, kind = 'info') => {
      const id = toastId++;
      set((s) => ({ toasts: [...s.toasts.slice(-3), { id, text, kind }] }));
      setTimeout(() => get().dismissToast(id), kind === 'bad' ? 9000 : 6000);
    },
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    setHighlight: (ids) => set({ highlight: ids }),
    select: (type, id) => set({ selection: { type, id }, rightTab: type ? 'inspect' : get().rightTab }),
    setDock: (p) => {
      set({ dock: p, dockOpen: true });
      get().visitPanel(p);
    },
    setDockOpen: (v) => set({ dockOpen: v }),
    setRightTab: (t) => set({ rightTab: t }),
    setMobilePane: (p) => set({ mobilePane: p }),
    setIntroOpen: (v) => set({ introOpen: v }),
  };
};
