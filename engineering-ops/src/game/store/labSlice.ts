import { clone } from '@/engine/arch';
import type { Chaos } from '@/engine/engine';
import type { Workload } from '@/engine/types';
import { describeChaos, patchWorkload, setChaos, startGameDay } from '@/game/session';
import { persistence } from './persistence';
import type { Slice } from './types';

export interface LabSlice {
  setChaosList: (c: Chaos[]) => void;
  beginGameDay: (id: string) => void;
  setWorkload: (patch: Partial<Workload>) => void;
  saveDesign: (name: string) => void;
  deleteDesign: (id: string) => void;
  loadDesign: (id: string) => void;
  recordExperiment: (name: string, note: string, metrics: Record<string, number>) => void;
}

export const createLabSlice: Slice<LabSlice> = (set, get) => {
  const { persistSession, persistSoon } = persistence(set, get);
  return {
    setChaosList: (c) => {
      const { session } = get();
      if (!session) return;
      setChaos(session, c);
      get().toast(c.length ? `Injected: ${c.map(describeChaos).join(', ')}` : 'Chaos cleared.', c.length ? 'warn' : 'info');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    beginGameDay: (id) => {
      const { session } = get();
      if (!session || !startGameDay(session, id)) return;
      get().toast('Game day started. Press play: faults arrive on a script you cannot see.', 'warn');
      set((s) => ({ tick: s.tick + 1 }));
      persistSession();
    },
    setWorkload: (patch) => {
      const { session } = get();
      if (!session) return;
      patchWorkload(session, patch);
      set((s) => ({ tick: s.tick + 1 }));
      persistSoon();
    },
    saveDesign: (name) => {
      const { session, progress } = get();
      if (!session) return;
      const d = {
        id: `design-${Date.now().toString(36)}`,
        name: name || `Design ${progress.designs.length + 1}`,
        arch: clone({ ...session.draft, nodes: session.draft.nodes.map((n) => ({ ...n, faults: undefined })) }),
        savedAt: Date.now(),
      };
      set({ progress: { ...progress, designs: [...progress.designs, d] } });
      get().toast(`Saved “${d.name}” to your designs.`, 'good');
    },
    deleteDesign: (id) => set((s) => ({ progress: { ...s.progress, designs: s.progress.designs.filter((d) => d.id !== id) } })),
    loadDesign: (id) => {
      const { session, progress } = get();
      const d = progress.designs.find((x) => x.id === id);
      if (!session || !d) return;
      session.draft = clone(d.arch);
      set((s) => ({ tick: s.tick + 1, selection: { type: null }, rightTab: 'plan' }));
      get().toast(`Loaded “${d.name}” into the draft. Press Deploy to run it.`, 'info');
    },
    recordExperiment: (name, note, metrics) =>
      set((s) => ({
        progress: {
          ...s.progress,
          experiments: [...s.progress.experiments, { id: `exp-${Date.now().toString(36)}`, at: Date.now(), name, note, metrics }],
        },
      })),
  };
};
