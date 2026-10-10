import { describe, expect, it } from 'vitest';
import { diffArch, hasCycle, makeEdge, makeNode, validateArch } from '@/engine/arch';
import { canConnect, CATALOG, CATALOG_BY_KIND, CATEGORIES } from '@/engine/catalog';
import type { Arch } from '@/engine/types';

const N = (kind: string, id: string, config: Record<string, any> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });

describe('component catalog', () => {
  it('covers every category and role with consistent data', () => {
    for (const c of CATEGORIES) expect(CATALOG.filter((e) => e.category === c.id).length).toBeGreaterThan(10);
    expect(new Set(CATALOG.map((e) => e.kind)).size).toBe(CATALOG.length);
    for (const e of CATALOG) {
      for (const f of e.fields) {
        if (f.type !== 'rules')
          expect(Object.prototype.hasOwnProperty.call(e.defaults, f.key), `${e.kind}.${f.key} has a default`).toBe(true);
        if (f.type === 'ref') for (const k of f.refKinds!) expect(CATALOG_BY_KIND[k], `${e.kind}.${f.key} refs ${k}`).toBeDefined();
      }
    }
  });
  it('includes the AWS services and platform/reliability components from the brief', () => {
    for (const k of [
      'route53',
      'cloudfront',
      'alb',
      'apigw',
      'vpc',
      'subnet',
      'igw',
      'nat',
      'sg',
      'nacl',
      'ec2',
      'ecs',
      'eks',
      'lambda',
      's3',
      'rds',
      'dynamodb',
      'elasticache',
      'sqs',
      'sns',
      'eventbridge',
      'iam',
      'kms',
      'secrets-manager',
      'cloudwatch',
      'cloudtrail',
      'waf',
      'ci-pipeline',
      'test-suite',
      'cd-pipeline',
      'canary',
      'blue-green',
      'rollback',
      'feature-flag',
      'iac',
      'terraform',
      'dev-portal',
      'service-template',
      'observability-stack',
      'circuit-breaker',
      'retry-policy',
      'rate-limiter',
      'bulkhead',
      'dlq',
      'backup',
      'dr-config',
      'slo',
      'error-budget',
      'tracing',
      'alert-rule',
      'synthetic-monitoring',
    ])
      expect(CATALOG_BY_KIND[k], k).toBeDefined();
  });
});

describe('connection validation', () => {
  it('allows traffic flows, async delivery, attachments and deployment links', () => {
    expect(canConnect('users', 'alb')).toMatchObject({ ok: true, cls: 'traffic' });
    expect(canConnect('backend-service', 'relational-db')).toMatchObject({ ok: true, cls: 'traffic' });
    expect(canConnect('backend-service', 'sqs')).toMatchObject({ ok: true, cls: 'async' });
    expect(canConnect('sqs', 'worker')).toMatchObject({ ok: true, cls: 'async' });
    expect(canConnect('sqs', 'dlq')).toMatchObject({ ok: true, cls: 'async' });
    expect(canConnect('retry-policy', 'backend-service')).toMatchObject({ ok: true, cls: 'attach' });
    expect(canConnect('cd-pipeline', 'ecs')).toMatchObject({ ok: true, cls: 'deploy' });
  });
  it('rejects meaningless connections with an explanation', () => {
    for (const [a, b] of [
      ['relational-db', 'backend-service'],
      ['external-api', 'backend-service'],
      ['backend-service', 'users'],
      ['sqs', 'relational-db'],
      ['subnet', 'ecs'],
      ['backup', 'backend-service'],
    ] as const) {
      const v = canConnect(a, b);
      expect(v.ok, `${a} -> ${b}`).toBe(false);
      expect(v.reason!.length).toBeGreaterThan(20);
    }
  });
});

describe('architecture validation', () => {
  const base = (): Arch => ({
    nodes: [N('users', 'u'), N('alb', 'lb'), N('backend-service', 'app'), N('relational-db', 'db')],
    edges: [makeEdge('u', 'lb'), makeEdge('lb', 'app'), makeEdge('app', 'db', { weight: 2 })],
  });
  it('passes a well-formed design', () => {
    expect(validateArch(base()).filter((i) => i.severity === 'error')).toEqual([]);
  });
  it('detects invalid configuration', () => {
    const a = base();
    a.nodes[2].config.replicas = 0;
    a.nodes[2].config.autoscale = true;
    a.nodes[2].config.maxReplicas = 0;
    a.nodes[2].config.replicas = 1;
    a.nodes[3].config.storageGB = NaN;
    const errs = validateArch(a)
      .filter((i) => i.severity === 'error')
      .map((i) => i.text);
    expect(errs.some((e) => /max replicas/.test(e))).toBe(true);
    expect(errs.some((e) => /Storage.*numeric/.test(e))).toBe(true);
  });
  it('detects missing dependencies and orphans', () => {
    const a = base();
    a.nodes.push(N('worker', 'w'), N('message-queue', 'q'), N('elasticache', 'cache'));
    const warns = validateArch(a)
      .filter((i) => i.severity === 'warn')
      .map((i) => i.text);
    expect(warns.some((w) => /no queue feeds this worker/.test(w))).toBe(true);
    expect(warns.some((w) => /no consumer is connected/.test(w))).toBe(true);
    expect(warns.some((w) => /nothing connects to it/.test(w))).toBe(true);
  });
  it('reports dangling references and invalid edges', () => {
    const a = base();
    a.edges.push(makeEdge('db', 'app'));
    a.nodes.push(N('ec2', 'vm', { subnet: 'missing-subnet' }));
    const errs = validateArch(a)
      .filter((i) => i.severity === 'error')
      .map((i) => i.text);
    expect(errs.some((e) => /leaf in the request path/.test(e))).toBe(true);
    expect(errs.some((e) => /does not exist/.test(e))).toBe(true);
  });
  it('detects call cycles and a missing traffic source', () => {
    const a = base();
    a.edges.push(makeEdge('app', 'lb'));
    expect(hasCycle(a)).toBe(true);
    expect(validateArch(a).some((i) => /cycle/.test(i.text))).toBe(true);
    expect(validateArch({ nodes: [N('backend-service', 'x')], edges: [] }).some((i) => /No traffic source/.test(i.text))).toBe(true);
  });
});

describe('plan diff', () => {
  it('lists additions, removals, connection and config changes', () => {
    const a: Arch = { nodes: [N('users', 'u'), N('backend-service', 'app')], edges: [makeEdge('u', 'app')] };
    const b: Arch = JSON.parse(JSON.stringify(a));
    b.nodes[1].config.replicas = 6;
    b.nodes.push(N('relational-db', 'db'));
    b.edges.push(makeEdge('app', 'db'));
    b.edges = b.edges.filter((e) => e.id !== 'e-u-app');
    const d = diffArch(a, b).map((x) => `${x.type}:${x.text}`);
    expect(d.some((x) => x.startsWith('change:Backend service: replicas 2 → 6'))).toBe(true);
    expect(d).toContain('add:Add Relational database');
    expect(d.some((x) => x.startsWith('connect:'))).toBe(true);
    expect(d.some((x) => x.startsWith('disconnect:'))).toBe(true);
  });
});
