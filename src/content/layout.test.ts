import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { TEMPLATES } from '@/content/templates';
import { roleOf } from '@/engine/arch';
import { createSession } from '@/game/session';
import type { Arch } from '@/engine/types';

/** Rendered size of a node (px), measured from the canvas: icon tile + label + stats block, data-store card, small network chip. */
const COMPACT = ['observability', 'delivery', 'policy', 'identity', 'resilience', 'source'];
const size = (role: string) =>
  role === 'network'
    ? { w: 124, h: 112 }
    : ['db', 'kv', 'cache', 'search'].includes(role)
      ? { w: 196, h: 165 }
      : { w: 156, h: COMPACT.includes(role) ? 118 : 170 };

function overlaps(arch: Arch): string[] {
  const out: string[] = [];
  const boxes = arch.nodes.map((n) => ({ id: n.id, ...size(roleOf(n)), x: n.position.x, y: n.position.y }));
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (w > 6 && h > 6) out.push(`${a.id} x ${b.id} (${Math.round(w)}x${Math.round(h)})`);
    }
  return out;
}

describe('authored layouts leave every component visible', () => {
  for (const m of MISSIONS) {
    it(`${m.id} starting design`, () => expect(overlaps(m.initial)).toEqual([]));
  }
  for (const t of TEMPLATES) {
    it(`template ${t.id}`, () => expect(overlaps(t.arch)).toEqual([]));
  }
  for (const m of MISSIONS.filter((x) => (x.consequences ?? []).length > 0)) {
    it(`${m.id} with every inherited consequence applied`, () => {
      const s = createSession(
        m.id,
        'beginner',
        1,
        undefined,
        (m.consequences ?? []).map((c) => c.tag),
      );
      expect(overlaps(s.live)).toEqual([]);
    });
  }
});
