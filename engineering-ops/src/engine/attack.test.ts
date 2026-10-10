import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { clone, makeEdge, makeNode } from '@/engine/arch';
import { ATTACKS, runAttack, whatToChange, type AttackId } from '@/engine/attack';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

const wl: Workload = { ...DEFAULT_WORKLOAD, baseRps: 100, readRatio: 0.8 };
const run = (id: AttackId, a: Arch) => runAttack(id, a, wl);
const stage = (a: Arch, id: AttackId, name: RegExp) => run(id, a).stages.find((s) => name.test(s.name))!;
const node = (a: Arch, id: string) => a.nodes.find((n) => n.id === id)!;

/** users → api (role) → db + bucket, with an unrelated second bucket the api does not use. */
function withIam(policy: 'scoped' | 'broad' | 'admin' = 'scoped'): Arch {
  return {
    nodes: [
      makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
      makeNode('ecs', { x: 1, y: 0 }, { id: 'api', label: 'API', config: { iamRole: 'role' } }),
      makeNode('iam', { x: 2, y: 0 }, { id: 'role', label: 'api-role', config: { policy } }),
      makeNode('rds', { x: 3, y: 0 }, { id: 'db', label: 'Orders DB', config: { encrypted: true, backupRetentionDays: 7, multiAZ: true } }),
      makeNode('s3', { x: 4, y: 0 }, { id: 'used', label: 'Uploads', config: { encrypted: true, versioning: true } }),
      makeNode('s3', { x: 5, y: 0 }, { id: 'other', label: 'Finance exports', config: { encrypted: true, versioning: true } }),
    ],
    edges: [makeEdge('users', 'api'), makeEdge('api', 'db'), makeEdge('api', 'used')],
  };
}
const withAudit = (a: Arch, trail: boolean, alert: boolean): Arch => {
  const c = clone(a);
  if (trail) c.nodes.push(makeNode('cloudtrail', { x: 0, y: 1 }, { id: 'trail' }));
  if (alert) c.nodes.push(makeNode('alert-rule', { x: 0, y: 2 }, { id: 'alarm' }));
  return c;
};

describe('every attack', () => {
  it('is described, and runs on every template without throwing', () => {
    expect(ATTACKS.map((a) => a.id)).toEqual(['leaked-credential', 'public-exposure', 'ddos']);
    for (const t of TEMPLATES)
      for (const a of ATTACKS) {
        const r = runAttack(a.id, t.arch, templateWorkload(t));
        expect(r.stages.length, `${t.id}/${a.id}`).toBeGreaterThan(0);
        expect(['contained', 'partial', 'breach', 'n/a']).toContain(r.outcome);
        for (const s of r.stages) {
          expect(s.detail.length).toBeGreaterThan(10);
          if (s.status === 'failed')
            expect(
              s.fix || s.name === 'Measured impact (simulated)' || s.defence === 'Provider network',
              `${a.id}: ${s.name}`,
            ).toBeTruthy();
        }
        for (const id of r.blastRadius)
          expect(
            t.arch.nodes.some((n) => n.id === id),
            `${t.id}/${a.id}: ${id}`,
          ).toBe(true);
      }
  });

  it('is deterministic and never mutates the design', () => {
    const a = withIam('admin');
    const before = JSON.stringify(a);
    for (const at of ATTACKS) expect(JSON.stringify(run(at.id, a))).toBe(JSON.stringify(run(at.id, a)));
    expect(JSON.stringify(a)).toBe(before);
  });
});

describe('leaked credential', () => {
  it('has nothing to steal in a design with no IAM role on a workload', () => {
    const a = withIam();
    a.nodes = a.nodes.filter((n) => n.kind !== 'iam');
    const r = run('leaked-credential', a);
    expect(r.outcome).toBe('n/a');
    expect(r.stages).toHaveLength(1);
    expect(r.blastRadius).toEqual([]);
  });

  it('an administrator role is a breach that reaches every data store', () => {
    const r = run('leaked-credential', withIam('admin'));
    expect(r.outcome).toBe('breach');
    expect(stage(withIam('admin'), 'leaked-credential', /What the key can do/).status).toBe('failed');
    for (const id of ['db', 'used', 'other']) expect(r.blastRadius).toContain(id);
    expect(r.impact).toContain('3 of 3');
  });

  it('a scoped role reaches only the stores its workload uses', () => {
    const r = run('leaked-credential', withIam('scoped'));
    expect(r.blastRadius).toEqual(expect.arrayContaining(['role', 'api', 'db', 'used']));
    expect(r.blastRadius).not.toContain('other');
    expect(r.impact).toContain('2 of 3');
  });

  it('a broad role is a breach too, and encryption only partly helps against it', () => {
    const a = withIam('broad');
    expect(run('leaked-credential', a).outcome).toBe('breach');
    expect(stage(a, 'leaked-credential', /Readability/).status).toBe('partial');
  });

  it('encryption does not help against an administrator, but does against a scoped role', () => {
    expect(stage(withIam('admin'), 'leaked-credential', /Readability/).status).toBe('failed');
    expect(stage(withIam('scoped'), 'leaked-credential', /Readability/).status).toBe('held');
  });

  it('an unencrypted store is readable even with a scoped role, and that is a breach', () => {
    const a = withIam('scoped');
    node(a, 'db').config.encrypted = false;
    expect(stage(a, 'leaked-credential', /Readability/).status).toBe('failed');
    expect(run('leaked-credential', a).outcome).toBe('breach');
  });

  it('a role that can read secrets lets the attacker move on', () => {
    const a = withIam('scoped');
    node(a, 'role').config.canReadSecrets = true;
    expect(stage(a, 'leaked-credential', /Secrets/).status).toBe('failed');
    expect(run('leaked-credential', a).outcome).toBe('breach');
  });

  it('detection depends on an audit trail and an alert', () => {
    const none = stage(withIam(), 'leaked-credential', /Detection/);
    expect(none).toMatchObject({ status: 'failed', at: null });
    const trail = stage(withAudit(withIam(), true, false), 'leaked-credential', /Detection/);
    expect(trail.status).toBe('partial');
    expect(trail.at).toBeGreaterThan(60);
    const both = stage(withAudit(withIam(), true, true), 'leaked-credential', /Detection/);
    expect(both).toMatchObject({ status: 'held', at: 10 });
    expect(run('leaked-credential', withIam()).impact).toContain('never detected');
  });

  it('recovery needs backups on databases and versioning on buckets', () => {
    const a = withIam('scoped');
    expect(stage(a, 'leaked-credential', /Recovery/).status).toBe('held');
    node(a, 'db').config.backupRetentionDays = 0;
    expect(stage(a, 'leaked-credential', /Recovery/).status).toBe('partial');
    node(a, 'used').config.versioning = false;
    expect(stage(a, 'leaked-credential', /Recovery/).status).toBe('failed');
  });

  it('is contained only when scoped, encrypted, detected and recoverable', () => {
    expect(run('leaked-credential', withAudit(withIam('scoped'), true, true)).outcome).toBe('contained');
    expect(run('leaked-credential', withIam('scoped')).outcome).toBe('partial'); // limited, but never noticed
  });

  it('attacks the most privileged role that is actually in use', () => {
    const a = withIam('scoped');
    a.nodes.push(makeNode('iam', { x: 9, y: 9 }, { id: 'admin-role', label: 'ci-admin', config: { policy: 'admin' } }));
    expect(run('leaked-credential', a).summary).toContain('api-role'); // the admin role is attached to nothing
    node(a, 'api').config.iamRole = 'admin-role';
    expect(run('leaked-credential', a).summary).toContain('ci-admin');
  });
});

describe('open data store', () => {
  const plain = (): Arch => ({
    nodes: [
      makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
      makeNode('ecs', { x: 1, y: 0 }, { id: 'api' }),
      makeNode('rds', { x: 2, y: 0 }, { id: 'db', label: 'Orders DB', config: { encrypted: true } }),
      makeNode('s3', { x: 3, y: 0 }, { id: 'bucket', label: 'Uploads', config: { encrypted: true, publicAccess: false } }),
    ],
    edges: [makeEdge('users', 'api'), makeEdge('api', 'db'), makeEdge('api', 'bucket')],
  });

  it('is contained when nothing is public', () => {
    const r = run('public-exposure', plain());
    expect(r.outcome).toBe('contained');
    expect(r.blastRadius).toEqual([]);
    expect(r.stages).toHaveLength(1);
  });

  it('a public bucket is a breach, and encryption at rest does not help', () => {
    const a = plain();
    node(a, 'bucket').config.publicAccess = true;
    const r = run('public-exposure', a);
    expect(r.outcome).toBe('breach');
    expect(r.blastRadius).toEqual(['bucket']);
    expect(stage(a, 'public-exposure', /Access control/).status).toBe('failed');
    const enc = stage(a, 'public-exposure', /Encryption/);
    expect(enc.status).toBe('failed');
    expect(enc.detail).toMatch(/does not help/);
    expect(r.impact).toContain('Uploads');
  });

  it('a public database endpoint is only a partial exposure: credentials are still needed', () => {
    const a = plain();
    node(a, 'db').config.publicAccess = true;
    const r = run('public-exposure', a);
    expect(r.outcome).toBe('partial');
    expect(stage(a, 'public-exposure', /Access control/).status).toBe('partial');
  });

  it('a database port open to the world through its security group counts as exposed', () => {
    const a = plain();
    a.nodes.push(makeNode('sg', { x: 9, y: 9 }, { id: 'sg-db', label: 'db-sg', config: { inbound: [{ port: 5432, source: 'world' }] } }));
    node(a, 'db').config.sg = 'sg-db';
    const r = run('public-exposure', a);
    expect(r.blastRadius).toEqual(['db']);
    expect(r.outcome).toBe('partial');
  });

  it('detection follows the audit trail and alerting', () => {
    const a = plain();
    node(a, 'bucket').config.publicAccess = true;
    expect(stage(a, 'public-exposure', /Detection/).status).toBe('failed');
    expect(stage(withAudit(a, true, true), 'public-exposure', /Detection/).status).toBe('held');
    expect(stage(a, 'public-exposure', /Detection/).detail).toMatch(/access logging/);
  });
});

describe('HTTP flood', () => {
  function build(o: { waf?: boolean; rate?: number; cdn?: boolean; autoscale?: boolean; gw?: number; replicas?: number } = {}): Arch {
    const nodes = [makeNode('users', { x: 0, y: 0 }, { id: 'users' })];
    const edges: Arch['edges'] = [];
    let prev = 'users';
    const chain = (n: ReturnType<typeof makeNode>) => {
      nodes.push(n);
      edges.push(makeEdge(prev, n.id));
      prev = n.id;
    };
    if (o.cdn) chain(makeNode('cloudfront', { x: 0, y: 0 }, { id: 'cdn' }));
    if (o.waf) chain(makeNode('waf', { x: 0, y: 0 }, { id: 'waf', config: { managedRules: true, rateLimit: o.rate ?? 0 } }));
    if (o.gw !== undefined) chain(makeNode('apigw', { x: 0, y: 0 }, { id: 'gw', config: { maxRps: 10000, throttleRps: o.gw } }));
    chain(makeNode('alb', { x: 0, y: 0 }, { id: 'lb' }));
    chain(makeNode('ecs', { x: 0, y: 0 }, { id: 'api', config: { replicas: o.replicas ?? 3, autoscale: !!o.autoscale, maxReplicas: 20 } }));
    chain(makeNode('rds', { x: 0, y: 0 }, { id: 'db', config: { multiAZ: true, size: 'large' } }));
    return { nodes, edges };
  }

  it('measures the design with the real engine: an undefended design falls over', () => {
    const r = run('ddos', build());
    expect(r.outcome).toBe('breach');
    expect(r.measured!.baselineAvailability).toBeGreaterThan(99);
    expect(r.measured!.availability).toBeLessThan(50);
    expect(r.measured!.p95).toBeGreaterThan(r.measured!.baselineP95);
    for (const v of Object.values(r.measured!)) expect(Number.isFinite(v)).toBe(true);
  });

  it('a firewall with managed rules filters the junk and keeps the service up', () => {
    const bare = run('ddos', build());
    const waf = run('ddos', build({ waf: true }));
    expect(waf.measured!.availability).toBeGreaterThan(bare.measured!.availability);
    expect(waf.outcome).toBe('contained');
    expect(stageOf(waf, /Filtering/).status).toBe('partial'); // filters, but a normal-looking flood also needs a rate limit
    expect(stageOf(run('ddos', build({ waf: true, rate: 100 })), /Filtering/).status).toBe('held');
    expect(stageOf(bare, /Filtering/).status).toBe('failed');
  });

  it('autoscaling can ride it out, and is reported as a backstop that costs money', () => {
    const r = run('ddos', build({ autoscale: true }));
    expect(r.measured!.availability).toBeGreaterThan(run('ddos', build()).measured!.availability);
    expect(stageOf(r, /Absorbing/).status).toBe('partial');
    expect(stageOf(r, /Absorbing/).fix).toMatch(/filter and throttle first/i);
    expect(r.measured!.costMonthly).toBeGreaterThan(r.measured!.baselineCostMonthly);
  });

  it('a blunt throttle is not claimed to hold: it rejects real users too', () => {
    const r = run('ddos', build({ gw: 300 }));
    expect(stageOf(r, /Throttling/).status).toBe('partial');
    expect(stageOf(r, /Throttling/).detail).toMatch(/cannot tell junk from customers/);
    expect(r.measured!.availability).toBeLessThan(99);
  });

  it('reports a CDN as partial protection and its absence as a failure', () => {
    expect(stageOf(run('ddos', build({ cdn: true })), /Edge/).status).toBe('partial');
    expect(stageOf(run('ddos', build()), /Edge/).status).toBe('failed');
  });

  it('does not change the workload it was given', () => {
    const w = { ...wl };
    runAttack('ddos', build(), w);
    expect(w).toEqual(wl);
  });
});

function stageOf(r: ReturnType<typeof runAttack>, name: RegExp) {
  return r.stages.find((s) => name.test(s.name))!;
}

describe('what to change', () => {
  it('lists each distinct fix once, most serious first', () => {
    const fixes = whatToChange(run('leaked-credential', withIam('admin')));
    expect(fixes.length).toBeGreaterThan(1);
    expect(new Set(fixes).size).toBe(fixes.length);
    expect(fixes[0]).toMatch(/policy/i);
  });
  it('is empty when everything held', () => {
    expect(whatToChange(run('public-exposure', { nodes: [makeNode('users', { x: 0, y: 0 }, { id: 'users' })], edges: [] }))).toEqual([]);
  });
});
