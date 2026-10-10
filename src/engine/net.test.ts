import { describe, expect, it } from 'vitest';
import { makeEdge, makeNode } from '@/engine/arch';
import { egressToInternet, explainFlow, ingressFromInternet, securityFindings } from '@/engine/net';
import type { Arch } from '@/engine/types';

const N = (kind: string, id: string, config: Record<string, any> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });

function vpc(over: { natSubnet?: string; privRoute?: string; egress?: string; nacl?: boolean } = {}): Arch {
  return {
    nodes: [
      N('vpc', 'v'),
      N('igw', 'igw', { vpc: 'v' }),
      N('subnet', 'pub', { vpc: 'v', routeInternet: 'igw' }),
      N('subnet', 'priv', { vpc: 'v', routeInternet: over.privRoute ?? 'nat', nat: 'nat', nacl: over.nacl === false ? 'nacl' : '' }),
      N('nat', 'nat', { subnet: over.natSubnet ?? 'pub' }),
      N('nacl', 'nacl', { allowOutbound: true, allowEphemeralReturn: false }),
      N('sg', 'sg-app', { inbound: [], egressMode: over.egress ? 'restricted' : 'all', egressPorts: over.egress ?? '' }),
      N('ecs', 'app', { subnet: 'priv', sg: 'sg-app' }),
      N('external-api', 'ext'),
      N('alb', 'alb', { subnet: 'pub', sg: 'sg-alb' }),
      N('sg', 'sg-alb', { inbound: [{ port: 443, source: 'world' }] }),
      N('users', 'u'),
    ],
    edges: [makeEdge('app', 'ext'), makeEdge('u', 'alb')],
  };
}
const app = (a: Arch) => a.nodes.find((n) => n.id === 'app')!;

describe('network reachability explains why traffic flows or not', () => {
  it('private subnet with a NAT in a public subnet can reach the internet', () => {
    expect(egressToInternet(vpc(), app(vpc())).ok).toBe(true);
  });
  it('a NAT gateway placed in a private subnet fails and says why', () => {
    const a = vpc({ natSubnet: 'priv' });
    const r = egressToInternet(a, app(a));
    expect(r.ok).toBe(false);
    expect(r.blockedAt).toBe('NAT placement');
    expect(r.steps.find((s) => !s.ok)!.detail).toMatch(/PUBLIC subnet/);
  });
  it('a subnet with no default route has no internet path', () => {
    const a = vpc({ privRoute: 'none' });
    expect(egressToInternet(a, app(a)).steps.some((s) => s.label === 'Route table' && !s.ok)).toBe(true);
  });
  it('restricted outbound security-group rules block 443', () => {
    const a = vpc({ egress: '80' });
    expect(egressToInternet(a, app(a)).steps.some((s) => s.label.startsWith('Security group') && !s.ok)).toBe(true);
    const b = vpc({ egress: '80,443' });
    expect(egressToInternet(b, app(b)).ok).toBe(true);
  });
  it('NACLs are stateless: missing ephemeral return rules block replies', () => {
    const a = vpc({ nacl: false });
    const r = egressToInternet(a, app(a));
    expect(r.ok).toBe(false);
    expect(r.steps.find((s) => !s.ok)!.detail).toMatch(/stateless/);
  });
  it('ingress needs a public subnet and an inbound rule', () => {
    const a = vpc();
    expect(
      ingressFromInternet(
        a,
        a.nodes.find((n) => n.id === 'alb')!,
      ).ok,
    ).toBe(true);
    a.nodes.find((n) => n.id === 'sg-alb')!.config.inbound = [{ port: 80, source: 'world' }];
    expect(
      ingressFromInternet(
        a,
        a.nodes.find((n) => n.id === 'alb')!,
      ).ok,
    ).toBe(false);
    expect(explainFlow(a, 'u', 'alb', 443).blockedAt).toBe('Security group (inbound)');
  });
});

describe('security findings', () => {
  it('flags exposed ports, public data stores and over-broad IAM with remediation', () => {
    const a: Arch = {
      nodes: [
        N('sg', 'sg', {
          inbound: [
            { port: 22, source: 'world' },
            { port: 5432, source: 'world' },
          ],
        }),
        N('s3', 'bucket', { publicAccess: true, encrypted: false }),
        N('rds', 'db', { publicAccess: true, backupRetentionDays: 0 }),
        N('iam', 'role', { policy: 'admin' }),
        N('ecs', 'a', { iamRole: 'role' }),
      ],
      edges: [],
    };
    const f = securityFindings(a);
    const ids = f.map((x) => x.id).join(' ');
    expect(f.filter((x) => x.severity === 'critical').length).toBeGreaterThanOrEqual(3);
    expect(ids).toMatch(/iam-admin/);
    expect(f.every((x) => x.fix.length > 10)).toBe(true);
  });
  it('reports nothing for a least-privilege configuration', () => {
    const a: Arch = {
      nodes: [
        N('sg', 'sg', { inbound: [{ port: 443, source: 'world' }] }),
        N('s3', 'b', {}),
        N('iam', 'r', { policy: 'scoped' }),
        N('cloudtrail', 'ct'),
      ],
      edges: [],
    };
    expect(securityFindings(a)).toEqual([]);
  });
});
