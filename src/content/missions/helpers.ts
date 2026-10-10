import { makeEdge, makeNode } from '@/engine/arch';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, ArchEdge, ArchNode, Fault, Workload } from '@/engine/types';

export const wl = (o: Partial<Workload>): Workload => ({ ...DEFAULT_WORKLOAD, ...o });

/** Mission layouts are authored on a compact grid; icon-tile nodes with stats need more room, so scale once here. */
const LAYOUT_X = 1.25;
const LAYOUT_Y = 1.2;

export const N = (
  kind: string,
  id: string,
  x: number,
  y: number,
  config: Record<string, any> = {},
  label?: string,
  faults?: Fault[],
): ArchNode => makeNode(kind, { x: Math.round(x * LAYOUT_X), y: Math.round(y * LAYOUT_Y) }, { id, label, config, faults });

export const E = (s: string, t: string, config: Partial<ArchEdge['config']> = {}): ArchEdge => makeEdge(s, t, config);

export function patchNode(arch: Arch, id: string, config: Record<string, any>): Arch {
  return { ...arch, nodes: arch.nodes.map((n) => (n.id === id ? { ...n, config: { ...n.config, ...config } } : n)) };
}
export function setFaults(arch: Arch, id: string, faults: Fault[] | undefined): Arch {
  return { ...arch, nodes: arch.nodes.map((n) => (n.id === id ? { ...n, faults } : n)) };
}
export function addFault(arch: Arch, id: string, fault: Fault): Arch {
  return {
    ...arch,
    nodes: arch.nodes.map((n) => (n.id === id ? { ...n, faults: [...(n.faults ?? []).filter((f) => f.id !== fault.id), fault] } : n)),
  };
}
export function clearFaults(arch: Arch, ids: string[]): Arch {
  return { ...arch, nodes: arch.nodes.map((n) => (n.faults ? { ...n, faults: n.faults.filter((f) => !ids.includes(f.id)) } : n)) };
}
