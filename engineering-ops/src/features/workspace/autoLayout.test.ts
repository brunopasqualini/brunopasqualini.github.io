import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import { TEMPLATES } from '@/content/templates';
import { layoutArch } from '@/features/workspace/autoLayout';
import type { Arch } from '@/engine/types';

const arches: [string, Arch][] = [
  ...MISSIONS.map((m) => [m.id, m.initial] as [string, Arch]),
  ...TEMPLATES.map((t) => [t.id, t.arch] as [string, Arch]),
];

describe('auto layout', () => {
  it('places every node exactly once with finite coordinates', () => {
    for (const [name, arch] of arches) {
      const pos = layoutArch(arch);
      expect(Object.keys(pos).sort(), name).toEqual(arch.nodes.map((n) => n.id).sort());
      for (const p of Object.values(pos)) expect(Number.isFinite(p.x) && Number.isFinite(p.y), name).toBe(true);
    }
  });

  it('never stacks two nodes on the same spot', () => {
    for (const [name, arch] of arches) {
      const pos = layoutArch(arch);
      const seen = new Set<string>();
      for (const [id, p] of Object.entries(pos)) {
        const k = `${Math.round(p.x / 20)}:${Math.round(p.y / 20)}`;
        expect(seen.has(k), `${name}: ${id} overlaps another node`).toBe(false);
        seen.add(k);
      }
    }
  });

  it('flows left to right along the request path', () => {
    const t = TEMPLATES.find((x) => x.id === 'scaled-platform')!;
    const pos = layoutArch(t.arch);
    expect(pos.users.x).toBeLessThan(pos.cdn.x);
    expect(pos.cdn.x).toBeLessThan(pos.lb.x);
    expect(pos.lb.x).toBeLessThan(pos.web.x);
    expect(pos.web.x).toBeLessThan(pos.db.x);
    expect(pos.queue.x).toBeLessThan(pos.worker.x);
  });

  it('survives cycles and empty graphs', () => {
    expect(layoutArch({ nodes: [], edges: [] })).toEqual({});
    const t = TEMPLATES.find((x) => x.id === 'three-tier')!;
    const cyc: Arch = { nodes: t.arch.nodes, edges: [...t.arch.edges, { ...t.arch.edges[1], id: 'back', source: 'api', target: 'lb' }] };
    expect(() => layoutArch(cyc)).not.toThrow();
  });

  it('hangs monitoring under the component it watches', () => {
    const t = TEMPLATES.find((x) => x.id === 'scaled-platform')!;
    const pos = layoutArch(t.arch);
    expect(pos.cw.y).toBeGreaterThan(pos.web.y);
  });
});
