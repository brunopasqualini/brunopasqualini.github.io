import { CONFIG_REF_KEYS, clone, makeEdge, uid } from '@/engine/arch';
import type { Arch, ArchEdge, ArchNode } from '@/engine/types';

/**
 * Copy and paste of components. Pure: takes an architecture, returns new parts, never mutates its input.
 *
 * A copy keeps the selected components and the connections BETWEEN them. Connections to anything outside the
 * selection are left behind (a pasted component starts unwired from the rest of the system), and live fault state is
 * not copied because faults belong to the running system, not to the plan.
 */
export interface Clip {
  nodes: ArchNode[];
  edges: ArchEdge[];
}

export function copySelection(arch: Arch, ids: readonly string[]): Clip | null {
  const want = new Set(ids);
  const nodes = arch.nodes.filter((n) => want.has(n.id));
  if (!nodes.length) return null;
  const have = new Set(nodes.map((n) => n.id));
  const edges = arch.edges.filter((e) => have.has(e.source) && have.has(e.target));
  return clone({ nodes: nodes.map((n) => ({ ...n, faults: undefined })), edges });
}

const COPY_SUFFIX = /\s+copy(\s+\d+)?$/;

/** "API" → "API copy", then "API copy 2", "API copy 3" … never colliding with an existing label. */
export function uniqueCopyLabel(label: string, taken: ReadonlySet<string>): string {
  const base = label.replace(COPY_SUFFIX, '');
  let candidate = `${base} copy`;
  for (let i = 2; taken.has(candidate); i++) candidate = `${base} copy ${i}`;
  return candidate;
}

export interface Pasted {
  nodes: ArchNode[];
  edges: ArchEdge[];
  /** Ids of the new components, in clip order. */
  ids: string[];
}

/** Build the components and connections to add for pasting `clip` into `arch`, shifted by `offset`. */
export function pasteClip(arch: Arch, clip: Clip, offset: { x: number; y: number }): Pasted {
  const idMap = new Map<string, string>();
  for (const n of clip.nodes) idMap.set(n.id, uid(n.kind));
  const taken = new Set(arch.nodes.map((n) => n.label));
  const nodes = clone(clip.nodes).map((n): ArchNode => {
    const config = { ...n.config };
    // a reference to another pasted component follows the copy; a reference to anything else (the shared VPC, a subnet) stays
    for (const k of CONFIG_REF_KEYS) {
      const to = typeof config[k] === 'string' ? idMap.get(config[k]) : undefined;
      if (to) config[k] = to;
    }
    const label = uniqueCopyLabel(n.label, taken);
    taken.add(label);
    return {
      ...n,
      id: idMap.get(n.id)!,
      label,
      config,
      faults: undefined,
      position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
    };
  });
  const edges = clone(clip.edges).map((e) => makeEdge(idMap.get(e.source)!, idMap.get(e.target)!, e.config));
  return { nodes, edges, ids: nodes.map((n) => n.id) };
}
