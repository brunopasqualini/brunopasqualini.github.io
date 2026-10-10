import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '@/content/templates';
import { edgeClass } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import { edgeLook, EDGE_COLOR } from '@/features/workspace/edgeStyle';
import { serviceName } from '@/shared/ui/serviceName';
import { toneOfKind } from '@/shared/ui/roleTone';

describe('connector language', () => {
  it('uses solid blue for requests and dashed orange for async work', () => {
    const req = edgeLook('traffic', 'lb', 'compute');
    expect(req).toMatchObject({ color: EDGE_COLOR.request, arrow: true, bidirectional: false });
    expect(req.dash).toBeUndefined();
    expect(edgeLook('async', 'queue', 'worker')).toMatchObject({ color: EDGE_COLOR.async, dash: expect.any(String), arrow: true });
  });
  it('draws monitoring as dashed pink without an arrowhead, storage as dashed green', () => {
    expect(edgeLook('attach', 'observability', 'compute')).toMatchObject({ color: EDGE_COLOR.monitor, arrow: false });
    expect(edgeLook('traffic', 'worker', 'storage')).toMatchObject({ color: EDGE_COLOR.storage, dash: expect.any(String) });
  });
  it('shows cache to database as a two-way arrow', () => {
    expect(edgeLook('traffic', 'cache', 'db').bidirectional).toBe(true);
    expect(edgeLook('traffic', 'compute', 'db').bidirectional).toBe(false);
  });
});

describe('node naming and colour', () => {
  it('names services the way diagrams do', () => {
    expect(serviceName('rds')).toBe('RDS');
    expect(serviceName('alb')).toBe('ALB');
    expect(serviceName('relational-db')).toBe('Relational database');
  });
  it('colours autoscaling like compute (orange), as in the reference', () => {
    expect(toneOfKind('autoscaling', entryOf('autoscaling').role)).toBe('compute');
    expect(toneOfKind('sqs', 'queue')).toBe('messaging');
  });
});

describe('scaled-platform template', () => {
  const t = TEMPLATES.find((x) => x.id === 'scaled-platform')!;
  it('only uses connections the model allows and exercises every connector kind', () => {
    const kinds = new Set(t.arch.edges.map((e) => edgeClass(t.arch, e)));
    expect(kinds).toEqual(new Set(['traffic', 'async', 'attach']));
    const ids = new Set(t.arch.nodes.map((n) => n.id));
    for (const e of t.arch.edges) expect(ids.has(e.source) && ids.has(e.target), e.id).toBe(true);
  });
});
