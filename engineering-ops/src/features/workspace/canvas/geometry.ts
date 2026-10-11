import { nodeById } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import type { Arch, ArchNode } from '@/engine/types';

const CARD_ROLES = ['db', 'kv', 'cache', 'search'];
export const nodeW = (n: ArchNode) => (CARD_ROLES.includes(entryOf(n.kind).role) ? 196 : 156);

/** When two nodes sit roughly above one another, connect bottom-to-top instead of looping around the sides. */
export function verticalPair(arch: Arch, sourceId: string, targetId: string): 'down' | 'up' | null {
  const s = nodeById(arch, sourceId);
  const t = nodeById(arch, targetId);
  if (!s || !t) return null;
  const dx = s.position.x + nodeW(s) / 2 - (t.position.x + nodeW(t) / 2);
  const dy = t.position.y - s.position.y;
  if (Math.abs(dx) > 70 || Math.abs(dy) < 90) return null;
  return dy > 0 ? 'down' : 'up';
}

/** Nearest unoccupied grid slot to `from`, so click-added components never stack on top of each other. */
export function freeSpot(arch: Arch, from: { x: number; y: number }): { x: number; y: number } {
  const free = (x: number, y: number) => !arch.nodes.some((n) => Math.abs(n.position.x - x) < 190 && Math.abs(n.position.y - y) < 150);
  const sx = 210;
  const sy = 170;
  const cx = Math.round((from.x - 78) / sx) * sx;
  const cy = Math.round((from.y - 40) / sy) * sy;
  for (let ring = 0; ring < 8; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx * sx;
        const y = cy + dy * sy;
        if (free(x, y)) return { x, y };
      }
    }
  }
  return { x: cx, y: cy };
}

/** What the inspector is showing: one component or one connection. */
export type Selection = { type: 'node' | 'edge' | null; id?: string };

/** Leave room for the overlay controls (toolbar top-right, zoom controls left, legend/minimap bottom). */
export const FIT = { padding: { top: '40px', right: '24px', bottom: '60px', left: '56px' }, maxZoom: 1.2 } as const;
