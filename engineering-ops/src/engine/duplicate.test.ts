import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/content/templates';
import { clone, makeEdge, makeNode, validateArch } from '@/engine/arch';
import { copySelection, pasteClip, uniqueCopyLabel } from '@/engine/duplicate';
import type { Arch } from '@/engine/types';

const sample = (): Arch => ({
  nodes: [
    makeNode('alb', { x: 0, y: 0 }, { id: 'lb', label: 'Load Balancer' }),
    makeNode('ecs', { x: 200, y: 0 }, { id: 'api', label: 'API', faults: [{ type: 'down' } as never] }),
    makeNode('rds', { x: 400, y: 0 }, { id: 'db', label: 'Database' }),
  ],
  edges: [makeEdge('lb', 'api', { weight: 2 }), makeEdge('api', 'db', { timeoutMs: 900 })],
});

describe('copySelection', () => {
  it('returns null for an empty or unknown selection', () => {
    expect(copySelection(sample(), [])).toBeNull();
    expect(copySelection(sample(), ['nope'])).toBeNull();
  });

  it('keeps connections between selected components and drops the rest', () => {
    const clip = copySelection(sample(), ['lb', 'api'])!;
    expect(clip.nodes.map((n) => n.id)).toEqual(['lb', 'api']);
    expect(clip.edges.map((e) => e.id)).toEqual(['e-lb-api']);
  });

  it('does not copy live fault state, and does not alias the original', () => {
    const arch = sample();
    const clip = copySelection(arch, ['api'])!;
    expect(clip.nodes[0].faults).toBeUndefined();
    clip.nodes[0].label = 'changed';
    expect(arch.nodes[1].label).toBe('API');
  });
});

describe('pasteClip', () => {
  it('creates new ids, offsets the position, and wires the copies to each other', () => {
    const arch = sample();
    const p = pasteClip(arch, copySelection(arch, ['lb', 'api'])!, { x: 40, y: 40 });
    expect(p.nodes).toHaveLength(2);
    for (const n of p.nodes) expect(arch.nodes.some((x) => x.id === n.id)).toBe(false);
    expect(p.nodes[0].position).toEqual({ x: 40, y: 40 });
    expect(p.edges).toHaveLength(1);
    expect(p.edges[0].source).toBe(p.ids[0]);
    expect(p.edges[0].target).toBe(p.ids[1]);
    expect(p.edges[0].config.weight).toBe(2); // connection settings travel with the copy
  });

  it('gives copies unique, readable labels', () => {
    let arch = sample();
    const clip = copySelection(arch, ['api'])!;
    const labels: string[] = [];
    for (let i = 0; i < 3; i++) {
      const p = pasteClip(arch, clip, { x: 0, y: 0 });
      arch = { nodes: [...arch.nodes, ...p.nodes], edges: arch.edges };
      labels.push(p.nodes[0].label);
    }
    expect(labels).toEqual(['API copy', 'API copy 2', 'API copy 3']);
    expect(uniqueCopyLabel('API copy 2', new Set(['API copy']))).toBe('API copy 2');
  });

  it('remaps references between pasted components and keeps references to anything else', () => {
    const arch: Arch = {
      nodes: [
        makeNode('vpc', { x: 0, y: 0 }, { id: 'vpc1' }),
        makeNode('subnet', { x: 0, y: 0 }, { id: 'sn1', config: { vpc: 'vpc1' } as never }),
        makeNode('ecs', { x: 0, y: 0 }, { id: 'api', config: { subnet: 'sn1' } as never }),
      ],
      edges: [],
    };
    // copy the subnet and the service, but not the VPC
    const p = pasteClip(arch, copySelection(arch, ['sn1', 'api'])!, { x: 10, y: 10 });
    const [sn, api] = p.nodes;
    expect(api.config.subnet).toBe(sn.id); // follows the pasted subnet
    expect(sn.config.vpc).toBe('vpc1'); // the VPC was not copied, so the copy still lives in it
  });

  it('never mutates the clip or the architecture it pastes into', () => {
    const arch = sample();
    const clip = copySelection(arch, ['lb', 'api'])!;
    const before = JSON.stringify([arch, clip]);
    pasteClip(arch, clip, { x: 5, y: 5 });
    expect(JSON.stringify([arch, clip])).toBe(before);
  });

  it('pasting into a valid template does not introduce validation errors', () => {
    for (const t of TEMPLATES) {
      const arch = clone(t.arch);
      const baseline = validateArch(arch).filter((i) => i.severity === 'error').length;
      const ids = arch.nodes.filter((n) => !['users', 'vpc'].includes(n.kind)).map((n) => n.id);
      const clip = copySelection(arch, ids);
      if (!clip) continue;
      const p = pasteClip(arch, clip, { x: 30, y: 30 });
      const next: Arch = { nodes: [...arch.nodes, ...p.nodes], edges: [...arch.edges, ...p.edges] };
      expect(validateArch(next).filter((i) => i.severity === 'error').length, t.id).toBe(baseline);
    }
  });
});
