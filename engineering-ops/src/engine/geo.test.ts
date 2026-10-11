import { describe, expect, it } from 'vitest';
import { TEMPLATES, templateWorkload } from '@/content/templates';
import { clone, makeEdge, makeNode } from '@/engine/arch';
import {
  EDGE_RTT,
  GEOS,
  INTER_REGION_PER_GB,
  REGIONS,
  REGION_RTT,
  SLOW_P95_MS,
  TRIPS_DIRECT,
  USER_MIXES,
  USER_RTT,
  analyzeGeography,
  type GeoInput,
} from '@/engine/geo';
import { DEFAULT_WORKLOAD } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

const wl: Workload = { ...DEFAULT_WORKLOAD, baseRps: 400, readRatio: 0.8 };
const input = (o: Partial<GeoInput> = {}): GeoInput => ({
  primary: 'us-east-1',
  secondary: 'eu-west-1',
  mix: { na: 0.4, eu: 0.3, ap: 0.3 },
  backendP95Ms: 100,
  ...o,
});

/** users → alb → api → db, nothing about Regions yet. */
const base = (): Arch => ({
  nodes: [
    makeNode('users', { x: 0, y: 0 }, { id: 'users' }),
    makeNode('alb', { x: 1, y: 0 }, { id: 'lb' }),
    makeNode('ecs', { x: 2, y: 0 }, { id: 'api' }),
    makeNode('rds', { x: 3, y: 0 }, { id: 'db', config: { multiAZ: true } }),
  ],
  edges: [makeEdge('users', 'lb'), makeEdge('lb', 'api'), makeEdge('api', 'db')],
});
const add = (a: Arch, ...n: ReturnType<typeof makeNode>[]): Arch => ({ ...a, nodes: [...a.nodes, ...n] });
const dr = (strategy: string) => makeNode('dr-config', { x: 0, y: 5 }, { id: 'dr', config: { strategy } });
const dns = (routing: string, healthChecks: boolean) =>
  makeNode('route53', { x: 0, y: 6 }, { id: 'dns', config: { routing, healthChecks } });
const withReplica = (a: Arch): Arch => {
  const c = clone(a);
  c.nodes.find((n) => n.id === 'db')!.config.crossRegionReplica = true;
  return c;
};
const row = (r: ReturnType<typeof analyzeGeography>, g: string) => r.rows.find((x) => x.geo === g)!;

describe('the network model', () => {
  it('has a round trip for every pair, symmetric between Regions and nearest for the home geography', () => {
    for (const a of REGIONS) {
      expect(REGION_RTT[a.id][a.id]).toBe(0);
      for (const b of REGIONS) expect(REGION_RTT[a.id][b.id], `${a.id}-${b.id}`).toBe(REGION_RTT[b.id][a.id]);
    }
    for (const g of GEOS) for (const r of REGIONS) expect(USER_RTT[g.id][r.id]).toBeGreaterThan(0);
    expect(USER_RTT.na['us-east-1']).toBeLessThan(USER_RTT.na['eu-west-1']);
    expect(USER_RTT.eu['eu-west-1']).toBeLessThan(USER_RTT.eu['us-east-1']);
    expect(USER_RTT.ap['ap-southeast-1']).toBeLessThan(USER_RTT.ap['us-east-1']);
  });
  it('mixes sum to one', () => {
    for (const m of USER_MIXES) expect(Object.values(m.share).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 5);
  });
});

describe('latency by geography', () => {
  it('a single Region serves everyone from the primary, so distance decides', () => {
    const r = analyzeGeography(base(), wl, input());
    expect(r.mode).toBe('single-region');
    for (const x of r.rows) expect(x.servedFrom).toEqual(['us-east-1']);
    expect(row(r, 'na').p95).toBe(100 + TRIPS_DIRECT * 25);
    expect(row(r, 'ap').p95).toBe(100 + TRIPS_DIRECT * 225);
    expect(row(r, 'na').p95).toBeLessThan(row(r, 'eu').p95);
    expect(row(r, 'eu').p95).toBeLessThan(row(r, 'ap').p95);
    expect(row(r, 'ap').slow).toBe(true);
    expect(row(r, 'na').slow).toBe(false);
  });

  it('a CDN ends the handshakes near the user and so helps far users most', () => {
    const plain = analyzeGeography(base(), wl, input());
    const cdn = analyzeGeography(add(base(), makeNode('cloudfront', { x: 0, y: 1 }, { id: 'cdn' })), wl, input());
    expect(row(cdn, 'ap').p95).toBe(100 + 2 * EDGE_RTT + 225);
    for (const g of ['na', 'eu', 'ap']) expect(row(cdn, g).p95).toBeLessThanOrEqual(row(plain, g).p95);
    expect(row(plain, 'ap').p95 - row(cdn, 'ap').p95).toBeGreaterThan(row(plain, 'na').p95 - row(cdn, 'na').p95);
  });

  it('shares are normalised, even from arbitrary numbers, and the weighted p95 follows them', () => {
    const r = analyzeGeography(base(), wl, input({ mix: { na: 7, eu: 2, ap: 1 } }));
    expect(r.rows.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 5);
    expect(row(r, 'na').share).toBeCloseTo(0.7, 5);
    const naHeavy = r.weightedP95;
    const apHeavy = analyzeGeography(base(), wl, input({ mix: { na: 1, eu: 2, ap: 7 } })).weightedP95;
    expect(apHeavy).toBeGreaterThan(naHeavy);
    expect(analyzeGeography(base(), wl, input({ mix: { na: 0, eu: 0, ap: 0 } })).rows.every((x) => Number.isFinite(x.share))).toBe(true);
  });

  it('counts the share of users who are slow', () => {
    const r = analyzeGeography(base(), wl, input({ mix: { na: 0.5, eu: 0.2, ap: 0.3 } }));
    expect(r.slowShare).toBeCloseTo(row(r, 'ap').share + (row(r, 'eu').slow ? row(r, 'eu').share : 0), 5);
  });
});

describe('active / active', () => {
  const aa = (routing: string) => add(withReplica(base()), dr('active-active'), dns(routing, true));

  it('with latency routing serves each geography from its nearest Region and beats a single Region', () => {
    const r = analyzeGeography(aa('latency'), wl, input());
    expect(r.mode).toBe('active-active-routed');
    expect(row(r, 'na').servedFrom).toEqual(['us-east-1']);
    expect(row(r, 'eu').servedFrom).toEqual(['eu-west-1']);
    expect(row(r, 'eu').p95).toBeLessThan(analyzeGeography(base(), wl, input()).rows.find((x) => x.geo === 'eu')!.p95);
    expect(r.weightedP95).toBeLessThan(analyzeGeography(base(), wl, input()).weightedP95);
  });

  it('weighted routing splits users whatever their location', () => {
    const r = analyzeGeography(aa('weighted'), wl, input());
    expect(r.mode).toBe('active-active-split');
    expect(row(r, 'eu').servedFrom).toEqual(['us-east-1', 'eu-west-1']);
    expect(r.notes.join(' ')).toMatch(/Weighted routing splits users 50\/50/);
    expect(r.weightedP95).toBeGreaterThan(analyzeGeography(aa('latency'), wl, input()).weightedP95);
  });

  it('simple or failover routing leaves the second Region idle and says so', () => {
    for (const routing of ['simple', 'failover']) {
      const r = analyzeGeography(aa(routing), wl, input());
      expect(r.mode).toBe('active-active-unrouted');
      for (const x of r.rows) expect(x.servedFrom).toEqual(['us-east-1']);
      expect(r.notes.join(' ')).toMatch(/second Region idles/);
    }
    const noDns = analyzeGeography(add(withReplica(base()), dr('active-active')), wl, input());
    expect(noDns.notes.join(' ')).toMatch(/no DNS routing policy/);
  });

  it('warns that active/active needs data in both Regions, and about write conflicts', () => {
    const noData = analyzeGeography(add(base(), dr('active-active'), dns('latency', true)), wl, input());
    expect(noData.notes.join(' ')).toMatch(/second Region has nothing to serve/);
    const withData = analyzeGeography(aa('latency'), wl, input());
    expect(withData.notes.join(' ')).toMatch(/conflicts/);
    expect(withData.notes.join(' ')).not.toMatch(/nothing to serve/);
  });

  it('is single-region when primary and secondary are the same Region', () => {
    expect(analyzeGeography(aa('latency'), wl, input({ secondary: 'us-east-1' })).mode).toBe('single-region');
  });
});

describe('losing the primary Region', () => {
  it('has no place to fail over to when nothing is copied elsewhere', () => {
    const f = analyzeGeography(base(), wl, input()).failover;
    expect(f.path).toBe('none');
    expect(f.possible).toBe(false);
    expect(f.minutes).toBeGreaterThan(1000); // wait for the Region to return
  });

  it('is manual without health-checked DNS, and slower than automatic', () => {
    const manual = analyzeGeography(add(withReplica(base()), dr('warm-standby')), wl, input()).failover;
    expect(manual.path).toBe('manual');
    const noChecks = analyzeGeography(add(withReplica(base()), dr('warm-standby'), dns('failover', false)), wl, input()).failover;
    expect(noChecks.path).toBe('manual');
    const auto = analyzeGeography(add(withReplica(base()), dr('warm-standby'), dns('failover', true)), wl, input()).failover;
    expect(auto.path).toBe('automatic');
    expect(auto.minutes).toBeLessThan(manual.minutes);
    expect(auto.steps.map((s) => s.label).join(' ')).toMatch(/Health checks fail/);
  });

  it('DNS is not the slow part: a pilot light still has to be brought up', () => {
    const pilot = analyzeGeography(add(withReplica(base()), dr('pilot-light'), dns('failover', true)), wl, input());
    const warm = analyzeGeography(add(withReplica(base()), dr('warm-standby'), dns('failover', true)), wl, input());
    expect(pilot.failover.minutes).toBeGreaterThan(warm.failover.minutes);
    expect(pilot.notes.join(' ')).toMatch(/DNS is not the slow part/);
  });

  it('active/active with health-checked DNS recovers in minutes, because the second Region is already serving', () => {
    const f = analyzeGeography(add(withReplica(base()), dr('active-active'), dns('latency', true)), wl, input()).failover;
    expect(f.path).toBe('automatic');
    expect(f.minutes).toBeLessThan(5);
    expect(f.steps).toHaveLength(2);
  });

  it('shows what each geography feels once everyone is served from the secondary', () => {
    const r = analyzeGeography(add(withReplica(base()), dr('warm-standby'), dns('failover', true)), wl, input());
    expect(row(r, 'eu').p95AfterFailover).toBeLessThan(row(r, 'na').p95AfterFailover);
    const far = analyzeGeography(
      add(withReplica(base()), dr('warm-standby'), dns('failover', true)),
      wl,
      input({ mix: { na: 0.2, eu: 0.1, ap: 0.7 }, secondary: 'eu-west-1' }),
    );
    expect(far.notes.join(' ')).toMatch(/After failover Asia-Pacific users/);
  });

  it('a manual failover waits as long as it takes to notice, so alerting matters', () => {
    const quiet = add(withReplica(base()), dr('warm-standby'));
    const alerted = add(quiet, makeNode('alert-rule', { x: 0, y: 9 }, { id: 'alarm' }));
    const a = analyzeGeography(quiet, wl, input()).failover.minutes;
    const b = analyzeGeography(alerted, wl, input()).failover.minutes;
    expect(b).toBeLessThanOrEqual(a);
  });
});

describe('the link between Regions', () => {
  const linked = () => withReplica(base());

  it('has no replication lag or transfer when nothing is replicated continuously', () => {
    const r = analyzeGeography(base(), wl, input());
    expect(r.replicationLagSec).toBeNull();
    expect(r.transferCostMonthly).toBe(0);
  });

  it('lag grows with distance and with write load', () => {
    const near = analyzeGeography(linked(), wl, input({ secondary: 'eu-west-1' })).replicationLagSec!;
    const far = analyzeGeography(linked(), wl, input({ secondary: 'ap-southeast-1' })).replicationLagSec!;
    expect(far).toBeGreaterThan(near);
    const busy = analyzeGeography(linked(), { ...wl, baseRps: 4000 }, input()).replicationLagSec!;
    expect(busy).toBeGreaterThan(near);
    const readHeavy = analyzeGeography(linked(), { ...wl, readRatio: 0.99 }, input()).replicationLagSec!;
    expect(readHeavy).toBeLessThan(near);
  });

  it('transfer cost scales with write volume at the inter-Region price', () => {
    const r = analyzeGeography(linked(), wl, input());
    expect(r.transferGBMonthly).toBeGreaterThan(0);
    expect(r.transferCostMonthly).toBeCloseTo(r.transferGBMonthly * INTER_REGION_PER_GB, 6);
    const double = analyzeGeography(linked(), { ...wl, baseRps: 800 }, input());
    expect(double.transferGBMonthly).toBeCloseTo(r.transferGBMonthly * 2, 4);
  });

  it('warns when the replica runs more than a second behind', () => {
    const r = analyzeGeography(linked(), { ...wl, baseRps: 20000, readRatio: 0.2 }, input({ secondary: 'ap-southeast-1' }));
    expect(r.replicationLagSec!).toBeGreaterThan(1);
    expect(r.notes.join(' ')).toMatch(/behind/);
  });

  it('has no cross-Region link when the secondary is the primary', () => {
    expect(analyzeGeography(linked(), wl, input({ secondary: 'us-east-1' })).replicationLagSec).toBeNull();
  });
});

describe('the analysis as a whole', () => {
  it('is deterministic and does not mutate the design or the workload', () => {
    const a = add(withReplica(base()), dr('active-active'), dns('latency', true));
    const before = JSON.stringify([a, wl]);
    const one = analyzeGeography(a, wl, input());
    expect(JSON.stringify(analyzeGeography(a, wl, input()))).toBe(JSON.stringify(one));
    expect(JSON.stringify([a, wl])).toBe(before);
  });

  it('runs on every template and every mix with finite numbers', () => {
    for (const t of TEMPLATES)
      for (const m of USER_MIXES)
        for (const p of REGIONS)
          for (const s of REGIONS) {
            const r = analyzeGeography(t.arch, templateWorkload(t), input({ primary: p.id, secondary: s.id, mix: m.share }));
            expect(Number.isFinite(r.weightedP95), `${t.id}/${m.id}/${p.id}/${s.id}`).toBe(true);
            expect(r.slowShare).toBeGreaterThanOrEqual(0);
            expect(r.slowShare).toBeLessThanOrEqual(1 + 1e-9);
            expect(Number.isFinite(r.failover.minutes)).toBe(true);
            for (const x of r.rows) {
              expect(x.p95).toBeGreaterThan(0);
              expect(x.slow).toBe(x.p95 > SLOW_P95_MS);
            }
          }
  });

  it('moving the primary Region to where the users are lowers latency', () => {
    const eu = { na: 0.1, eu: 0.8, ap: 0.1 };
    const us = analyzeGeography(base(), wl, input({ primary: 'us-east-1', mix: eu })).weightedP95;
    const ie = analyzeGeography(base(), wl, input({ primary: 'eu-west-1', secondary: 'us-east-1', mix: eu })).weightedP95;
    expect(ie).toBeLessThan(us);
  });
});
