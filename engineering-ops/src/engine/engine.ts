import { attachedTo, edgeClass, flowEdges, nodeById, roleOf, topoOrder } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import { nodeCost, type CostCtx } from '@/engine/cost';
import { egressToInternet, ingressFromInternet, internalFlow, isPlaced } from '@/engine/net';
import * as P from '@/engine/params';
import { APP_PORT } from '@/engine/params';
import type {
  Arch,
  ArchEdge,
  ArchNode,
  EdgeMetrics,
  NodeMetrics,
  NodeStatus,
  Reason,
  SimState,
  Snapshot,
  SystemMetrics,
  Workload,
} from '@/engine/types';

export type Chaos =
  | { type: 'az-outage'; az: string }
  | { type: 'node-down'; nodeId: string }
  | { type: 'slow'; nodeId: string; mult: number }
  | { type: 'spike'; mult: number };

export const emptyState = (): SimState => ({ queues: {}, replicas: {} });

export function rpsAt(w: Workload, minute: number): number {
  const p = w.profile;
  if (!p.length) return w.baseRps;
  if (minute <= p[0].t) return w.baseRps * p[0].mult;
  for (let i = 1; i < p.length; i++) {
    if (minute <= p[i].t) {
      const a = p[i - 1];
      const b = p[i];
      const f = (minute - a.t) / Math.max(1e-9, b.t - a.t);
      return w.baseRps * (a.mult + (b.mult - a.mult) * f);
    }
  }
  return w.baseRps * p[p.length - 1].mult;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Queueing delay multiplier: 1/(1-u) below saturation, rapidly worse beyond. */
function sat(u: number): number {
  if (u < 0.95) return 1 / (1 - Math.max(0, u));
  return Math.min(40, 20 + (u - 0.95) * 60);
}

const ROUTING_ROLES = new Set(['lb', 'gateway', 'edge', 'cdn', 'waf', 'source']);

interface Facts {
  replicas: number;
  capacity: number;
  baseLat: number;
  cpuMult: number;
  latMult: number;
  faultErr: number;
  poison: number;
  memAdd: number;
  down: boolean;
  slow: number;
  autoscale: boolean;
  minRep: number;
  maxRep: number;
  perRep: number;
}

function sizeMult(n: ArchNode): number {
  return P.SIZE_MULT[n.config.size ?? n.config.instanceSize ?? 'small'] ?? 1;
}

export function edgeRetries(arch: Arch, e: ArchEdge): { retries: number; backoff: boolean; breaker: boolean; breakerAt: number } {
  const src = nodeById(arch, e.source);
  let retries = e.config.retries;
  let backoff = false;
  let breaker = e.config.circuitBreaker;
  let breakerAt = 0.5;
  if (src) {
    for (const a of attachedTo(arch, src.id)) {
      if (a.kind === 'retry-policy') {
        retries = Math.max(retries, a.config.maxRetries ?? 0);
        backoff = backoff || !!a.config.backoff;
      }
      if (a.kind === 'circuit-breaker') {
        breaker = true;
        breakerAt = (a.config.failureThreshold ?? 50) / 100;
      }
    }
  }
  return { retries, backoff, breaker, breakerAt };
}

function computeFacts(arch: Arch, n: ArchNode, prev: SimState, workload: Workload, chaos: Chaos[]): Facts {
  const role = roleOf(n);
  const c = n.config;
  const faults = n.faults ?? [];
  const cpuMult = faults.reduce((m, f) => m * (f.cpuMult ?? 1), 1);
  let latMult = faults.reduce((m, f) => m * (f.latencyMult ?? 1), 1);
  const faultErr = 1 - faults.reduce((m, f) => m * (1 - (f.errorRate ?? 0)), 1);
  const poison = faults.reduce((s, f) => s + (f.poisonShare ?? 0), 0);
  const memAdd = faults.reduce((s, f) => s + (f.memAdd ?? 0), 0);
  let down = false;
  let slow = 1;
  for (const k of chaos) {
    if (k.type === 'node-down' && k.nodeId === n.id) down = true;
    if (k.type === 'slow' && k.nodeId === n.id) {
      slow *= k.mult;
      latMult *= k.mult;
    }
  }
  const base: Facts = {
    replicas: 1,
    capacity: 1e9,
    baseLat: 2,
    cpuMult,
    latMult,
    faultErr,
    poison,
    memAdd,
    down,
    slow,
    autoscale: false,
    minRep: 1,
    maxRep: 1,
    perRep: 1e9,
  };
  if (role === 'compute' || role === 'worker') {
    const params = P.COMPUTE[n.kind] ?? P.COMPUTE['backend-service'];
    const pol = attachedTo(arch, n.id).find((a) => a.kind === 'autoscaling');
    const autoscale = !!c.autoscale || !!pol;
    const minRep = pol ? (pol.config.minReplicas ?? c.replicas) : c.replicas;
    const maxRep = pol ? (pol.config.maxReplicas ?? c.maxReplicas) : c.maxReplicas;
    let replicas = autoscale ? clamp(prev.replicas[n.id] ?? c.replicas, minRep, Math.max(minRep, maxRep)) : c.replicas;
    const subnet = c.subnet ? nodeById(arch, c.subnet) : undefined;
    for (const k of chaos) {
      if (k.type === 'az-outage') {
        if (subnet) {
          if (subnet.config.az === k.az) replicas = 0;
        } else replicas = Math.floor(replicas / 2);
      }
    }
    const perRep = params.rps * sizeMult(n);
    let capacity = (replicas * perRep) / cpuMult;
    if (role === 'worker') {
      const conc = Math.min(replicas * (c.concurrency ?? 10), c.maxConcurrency ?? 1e9);
      capacity = (conc * 1000) / Math.max(5, workload.avgProcessMs * latMult) / cpuMult;
    }
    return {
      ...base,
      replicas,
      capacity: down ? 0 : capacity,
      baseLat: role === 'worker' ? workload.avgProcessMs : params.latency,
      autoscale,
      minRep,
      maxRep,
      perRep,
    };
  }
  return base;
}

export interface SolveResult {
  snapshot: Snapshot;
  next: SimState;
}

export function solve(arch: Arch, workload: Workload, minute: number, prev: SimState, chaos: Chaos[] = []): SolveResult {
  const nodes = new Map(arch.nodes.map((n) => [n.id, n]));
  const flows = flowEdges(arch);
  const outE = new Map<string, ArchEdge[]>();
  const inE = new Map<string, ArchEdge[]>();
  arch.nodes.forEach((n) => {
    outE.set(n.id, []);
    inE.set(n.id, []);
  });
  flows.forEach((e) => {
    if (nodes.has(e.source) && nodes.has(e.target)) {
      outE.get(e.source)!.push(e);
      inE.get(e.target)!.push(e);
    }
  });
  const order = topoOrder(arch).filter((id) => nodes.has(id));
  const spike = chaos.reduce((m, k) => (k.type === 'spike' ? m * k.mult : m), 1);
  const rps0 = rpsAt(workload, minute) * spike;

  const facts: Record<string, Facts> = {};
  for (const n of arch.nodes) facts[n.id] = computeFacts(arch, n, prev, workload, chaos);

  // Network reachability is static for a given architecture.
  const blocked: Record<string, string | undefined> = {};
  for (const e of flows) {
    const s = nodes.get(e.source);
    const t = nodes.get(e.target);
    if (!s || !t) continue;
    const sr = roleOf(s);
    const tr = roleOf(t);
    let r;
    if (tr === 'external' && sr !== 'source') r = egressToInternet(arch, s, 443);
    else if (tr === 'storage' && sr === 'compute' && !t.config.vpcEndpoint && isPlaced(s)) r = egressToInternet(arch, s, 443);
    else if (sr === 'source' && isPlaced(t)) r = ingressFromInternet(arch, t, 443);
    else if (isPlaced(s) || s.config.sg) {
      if (tr === 'db' || tr === 'cache') r = internalFlow(arch, s, t, tr === 'db' ? 5432 : 6379);
      else if (sr === 'lb' && tr === 'compute') r = internalFlow(arch, s, t, APP_PORT);
    }
    if (r && !r.ok) blocked[e.id] = `${r.blockedAt}: ${r.steps.find((x) => !x.ok)?.detail ?? 'blocked'}`;
  }
  // Chaos: AZ outage takes out single-AZ stateful nodes; node-down handled per fact.
  const azDown = new Set(chaos.filter((k) => k.type === 'az-outage').map((k) => (k as any).az as string));

  // DB connection demand (static for given replicas).
  const connDemand: Record<string, number> = {};
  for (const n of arch.nodes) {
    if (roleOf(n) !== 'db') continue;
    let d = 0;
    for (const e of inE.get(n.id) ?? []) {
      const s = nodes.get(e.source)!;
      if (roleOf(s) === 'compute' || roleOf(s) === 'worker') d += facts[s.id].replicas * (s.config.dbPoolSize ?? 10);
    }
    connDemand[n.id] = d;
  }

  // Iteration state
  const failGuess: Record<string, number> = {};
  const latGuess: Record<string, number> = {};
  for (const n of arch.nodes) {
    failGuess[n.id] = 0;
    latGuess[n.id] = facts[n.id].baseLat;
  }

  let offered: Record<string, number> = {};
  let edgeRps: Record<string, number> = {};
  let edgeInv: Record<string, number> = {};
  let edgeExp: Record<string, number> = {};
  let edgeAmp: Record<string, number> = {};
  let edgeBreaker: Record<string, boolean> = {};
  let nodeOut: Record<string, Partial<NodeMetrics> & { own: number; ownLat: number; ownP95: number }> = {};
  let qOut: Record<
    string,
    {
      next: { depth: number; poison: number; dlq: number; lost: number };
      arrival: number;
      drain: number;
      delay: number;
      dup: number;
      capacity: number;
      hasDlq: boolean;
      dlqId?: string;
      goodFrac: number;
      poisonRate: number;
    }
  > = {};
  const hit: Record<string, number> = {};
  let healthy: Record<string, number> = {};
  let dbInfo: Record<string, { connUsed: number; connMax: number; lag: number; stale: number }> = {};
  let kvInfo: Record<string, { hotWrites: number; hotLoss: number; hotThrottle: number }> = {};
  let succ: Record<string, number> = {};
  let lat: Record<string, number> = {};
  let p95: Record<string, number> = {};

  const caches = arch.nodes.filter((n) => roleOf(n) === 'cache');
  const cacheHit = (cn: ArchNode, util = 0): number => {
    const needed = Math.max(1, (rps0 * 0.5) / P.CACHE_KEYSPACE_RPS_PER_UNIT);
    const memFit = Math.min(1, (cn.config.nodes * sizeMult(cn)) / needed);
    const ttl = cn.config.ttlSeconds ?? 60;
    const h = workload.cacheableShare * (1 - Math.exp(-ttl / (workload.keyReuseSeconds ?? 45))) * (0.35 + 0.65 * memFit) * (1 - Math.min(0.5, util * 0.1));
    return facts[cn.id].down ? 0 : clamp(h, 0, 0.98);
  };
  for (const cn of caches) hit[cn.id] = cacheHit(cn);

  for (let iter = 0; iter < 10; iter++) {
    offered = {};
    edgeRps = {};
    edgeInv = {};
    edgeExp = {};
    edgeAmp = {};
    edgeBreaker = {};
    nodeOut = {};
    qOut = {};
    healthy = {};
    dbInfo = {};
    kvInfo = {};
    arch.nodes.forEach((n) => {
      offered[n.id] = 0;
    });

    // Health-check removal: load balancers evict targets whose end-to-end latency exceeds the probe timeout.
    for (const n of arch.nodes) {
      if (roleOf(n) !== 'lb') continue;
      const hc = attachedTo(arch, n.id).find((a) => a.kind === 'health-check');
      const timeoutMs = hc?.config.timeoutMs ?? n.config.healthTimeoutMs ?? 2000;
      for (const e of outE.get(n.id) ?? []) {
        const t = nodes.get(e.target)!;
        if (roleOf(t) !== 'compute') continue;
        const probe = (latGuess[t.id] ?? 0) * 1.35;
        const removed = facts[t.id].down ? 1 : probe > timeoutMs ? clamp((probe - timeoutMs) / probe, 0, 0.9) : 0;
        healthy[t.id] = 1 - removed;
      }
    }

    for (const id of order) {
      const n = nodes.get(id)!;
      const role = roleOf(n);
      const f = facts[id];
      const c = n.config;
      let inRate = offered[id];
      let served = inRate;
      let own = 0;
      let ownLat = f.baseLat * f.latMult;
      let ownP95 = 0;
      let emit = 1;
      let cap = f.capacity;
      let util = 0;
      const out: any = {};
      const guards = attachedTo(arch, id).filter((a) => a.kind === 'rate-limiter');
      let guardCap = guards.length ? Math.min(...guards.map((g) => g.config.maxRps ?? 1e9)) : Infinity;

      switch (role) {
        case 'source': {
          inRate = rps0 * (c.share ?? 1);
          offered[id] = inRate;
          served = inRate;
          ownLat = 0;
          cap = inRate;
          break;
        }
        case 'edge': {
          ownLat = 2;
          cap = 1e9;
          break;
        }
        case 'cdn': {
          const ttl = c.cacheTTLSec ?? 3600;
          const h = workload.staticShare * (ttl >= 60 ? 0.92 : 0.5) * (f.down ? 0 : 1);
          emit = 1 - h;
          ownLat = 6;
          cap = 1e9;
          hit[id] = h;
          break;
        }
        case 'waf': {
          emit = 1 - (c.managedRules ? workload.maliciousShare * 0.9 : 0);
          if (c.rateLimit > 0) guardCap = Math.min(guardCap, rps0 * 0.9 + 50);
          ownLat = 1.5;
          cap = 1e9;
          break;
        }
        case 'lb': {
          ownLat = 3;
          cap = 1e9;
          const targets = (outE.get(id) ?? []).map((e) => nodes.get(e.target)!).filter((t) => roleOf(t) === 'compute');
          if (targets.length && targets.every((t) => (healthy[t.id] ?? 1) < 0.05)) {
            own = 1;
          } else if (targets.length) {
            const avgHealthy = targets.reduce((s, t) => s + (healthy[t.id] ?? 1), 0) / targets.length;
            if (avgHealthy < 0.05) own = 1;
          }
          break;
        }
        case 'gateway': {
          ownLat = 10;
          cap = c.maxRps ?? 1e9;
          if (c.throttleRps > 0) cap = Math.min(cap, c.throttleRps);
          break;
        }
        case 'compute': {
          cap = f.capacity * (healthy[id] ?? 1);
          if (azDown.size && !c.subnet) {
            /* handled in replicas */
          }
          break;
        }
        case 'worker': {
          cap = f.capacity;
          break;
        }
        default:
          break;
      }

      if (role === 'db') {
        const maxConn = P.DB[c.size]?.maxConn ?? 100;
        const demand = connDemand[id] ?? 0;
        const pooled = !!c.connectionPooler;
        const used = pooled ? Math.min(demand, maxConn * 0.45) : Math.min(demand, maxConn);
        const refuse = !pooled && demand > maxConn ? 1 - maxConn / demand : 0;
        const R = c.readReplicas ?? 0;
        const rr = workload.readRatio;
        const slow = c.indexed ? 0 : workload.slowQueryShare;
        const readUnit = P.DB_READ_UNITS * (1 + slow * (P.DB_SLOW_SCAN_MULT - 1));
        // Replica lag is driven by the write and replay load, so it is computed before any reads are rerouted.
        const lagUnits = inRate * ((rr / (1 + R)) * readUnit + (1 - rr) * P.DB_WRITE_UNITS);
        // Reads that must see the user's own write can be pinned to the primary: they leave the replicas and load it.
        const raw = R > 0 ? (workload.readAfterWriteShare ?? 0) : 0;
        const pinned = c.readYourWrites === 'primary';
        const movedReads = pinned ? inRate * rr * raw * (R / (1 + R)) : 0;
        const primaryUnits = lagUnits + movedReads * readUnit;
        const replicaUnits = inRate * (rr / (1 + R)) * readUnit - movedReads * readUnit;
        const dbCap = (P.DB[c.size]?.qps ?? 300) / f.cpuMult;
        util = Math.max(primaryUnits / dbCap, R > 0 ? replicaUnits / dbCap : 0);
        const azFail = azDown.size > 0 && !c.multiAZ && azDown.has('a');
        cap = azFail || f.down ? 0 : dbCap;
        const dbUtilServed = util > 1 ? 1 / util : 1;
        served = azFail || f.down ? 0 : inRate * dbUtilServed;
        own = azFail || f.down ? 1 : 1 - (1 - (inRate > 0 ? 1 - served / inRate : 0)) * (1 - refuse);
        const readMs = P.DB_BASE_READ_MS * (1 + slow * (P.DB_SLOW_SCAN_MULT - 1));
        ownLat = (rr * readMs + (1 - rr) * P.DB_BASE_WRITE_MS) * f.latMult * sat(util) + (pooled ? 1.5 : 0);
        const lag = R > 0 ? 0.2 + clamp(lagUnits / dbCap, 0, 1.5) * 3 : 0;
        const stale = R > 0 && !pinned && raw > 0 ? clamp((lag - P.RAW_TOLERATED_LAG_SEC) / P.RAW_READ_WINDOW_SEC, 0, 1) * 100 : 0;
        dbInfo[id] = { connUsed: used, connMax: maxConn, lag, stale };
        out.connUsed = used;
        out.connMax = maxConn;
        cap = dbCap;
      } else if (role === 'kv') {
        const prov = c.capacityMode === 'provisioned';
        const reads = inRate * workload.readRatio;
        const writes = inRate * (1 - workload.readRatio);
        util = prov ? Math.max(reads / Math.max(1, c.rcu), writes / Math.max(1, c.wcu)) : inRate / 40000;
        cap = prov ? Math.min(c.rcu / Math.max(0.01, workload.readRatio), c.wcu / Math.max(0.01, 1 - workload.readRatio)) : 40000;
        // One item cannot take more writes than a single partition allows, however much table capacity is bought.
        const shards = Math.max(1, c.writeShards ?? 1);
        const hotShare = workload.hotKeyShare ?? 0;
        const hotWrites = (writes * hotShare) / shards;
        const hotThrottle = hotWrites > P.KV_ITEM_WRITES_PER_SEC ? 1 - P.KV_ITEM_WRITES_PER_SEC / hotWrites : 0;
        const hotLoss = (1 - workload.readRatio) * hotShare * hotThrottle;
        kvInfo[id] = { hotWrites, hotLoss, hotThrottle };
        served = inRate * (util > 1 ? 1 / util : 1) * (1 - hotLoss);
        own = f.down ? 1 : inRate > 0 ? 1 - served / inRate : 0;
        ownLat = 6 * f.latMult * (prov ? sat(util) : 1);
      } else if (role === 'search') {
        cap = ((c.nodes ?? 2) * sizeMult(n) * 300) / f.cpuMult;
        util = inRate / cap;
        served = Math.min(inRate, cap);
        own = f.down ? 1 : inRate > 0 ? 1 - served / inRate : 0;
        ownLat = 25 * f.latMult * sat(util);
      } else if (role === 'cache') {
        const h = hit[id] ?? 0;
        util = inRate / (P.CACHE_KEYSPACE_RPS_PER_UNIT * 10 * (c.nodes ?? 1));
        cap = P.CACHE_KEYSPACE_RPS_PER_UNIT * 10 * (c.nodes ?? 1);
        served = inRate;
        own = f.down ? 1 : 0;
        ownLat = 1.2 * f.latMult;
        const hasOut = (outE.get(id) ?? []).length > 0;
        if (hasOut) emit = 1 - workload.readRatio * h;
        out.hitRate = h;
      } else if (role === 'storage') {
        util = 0;
        cap = 1e9;
        served = inRate;
        own = f.down ? 1 : 0;
        ownLat = 25 * f.latMult;
      } else if (role === 'external') {
        cap = c.rpsLimit ?? 200;
        util = inRate / cap;
        served = Math.min(inRate, cap);
        own = f.down ? 1 : 1 - (1 - (inRate > 0 ? 1 - served / inRate : 0)) * (c.availability ? c.availability / 100 : 1);
        ownLat = (c.latencyMs ?? 120) * f.latMult * (util > 0.8 ? sat(util) / 5 : 1);
      } else if (role === 'queue') {
        ownLat = 6;
        cap = 1e9;
        served = inRate;
        own = f.down ? 1 : 0;
        if (c.isDlq) {
          nodeOut[id] = { own, ownLat, ownP95: 12, util: 0, capacity: 1e9, served: inRate, offered: inRate };
          continue;
        }
        const consumers = (outE.get(id) ?? []).filter((e) => {
          const t = nodes.get(e.target)!;
          return roleOf(t) !== 'queue';
        });
        const dlqEdge = (outE.get(id) ?? []).find((e) => nodes.get(e.target) && roleOf(nodes.get(e.target)!) === 'queue');
        const hasDlq = !!dlqEdge;
        const q = prev.queues[id] ?? { depth: 0, poison: 0, dlq: 0, lost: 0 };
        const consumerNodes = consumers.map((e) => nodes.get(e.target)!);
        const poisonP = clamp(workload.poisonShare + consumerNodes.reduce((s, t) => s + facts[t.id].poison, 0), 0, 0.95);
        const maxRecv = c.maxReceiveCount ?? 5;
        const vis = c.visibilityTimeoutSec ?? 30;
        // Consumer capacity (work units/sec): depends on concurrency and downstream latency.
        let C = 0;
        let procMs = workload.avgProcessMs;
        let childFail = 0;
        for (const t of consumerNodes) {
          if (roleOf(t) !== 'worker' && roleOf(t) !== 'compute') continue;
          const ft = facts[t.id];
          const downLat = (outE.get(t.id) ?? []).reduce(
            (s, e) => s + Math.min(1, e.config.weight) * Math.max(1, e.config.weight) * (latGuess[e.target] ?? 0),
            0,
          );
          const proc = Math.max(5, (roleOf(t) === 'worker' ? workload.avgProcessMs * ft.latMult : ft.baseLat * ft.latMult) + downLat);
          procMs = Math.max(procMs, proc);
          const concurrency =
            roleOf(t) === 'worker'
              ? Math.min(ft.replicas * (t.config.concurrency ?? 10), t.config.maxConcurrency ?? 1e9)
              : ft.replicas * 10;
          C += ft.down ? 0 : (concurrency * 1000) / proc / ft.cpuMult;
          childFail = Math.max(childFail, failGuess[t.id] ?? 0);
        }
        const dupBase = vis * 1000 < procMs * 2.2 ? clamp(1 - (vis * 1000) / (procMs * 2.2), 0.05, 0.9) : 0.002;
        const reprocess = 1 / (1 - Math.min(0.8, childFail));
        let workArrival = inRate * (1 - poisonP) * reprocess;
        let stuckWaste = 0;
        if (hasDlq) workArrival += inRate * poisonP * maxRecv;
        else {
          workArrival += inRate * poisonP;
          stuckWaste = Math.min(C * 0.9, q.poison / Math.max(1, vis));
          workArrival += stuckWaste;
        }
        workArrival *= 1 + dupBase;
        const avail = workArrival + q.depth / 60;
        const D = Math.min(C, avail);
        const depthNext = Math.max(0, (avail - D) * 60);
        const goodFrac = workArrival > 0 ? clamp((inRate * (1 - poisonP) * reprocess * (1 + dupBase)) / workArrival, 0, 1) : 1;
        qOut[id] = {
          next: {
            depth: depthNext,
            poison: hasDlq ? 0 : q.poison + inRate * poisonP * 60,
            dlq: hasDlq ? q.dlq + inRate * poisonP * 60 : q.dlq,
            lost: q.lost,
          },
          arrival: inRate,
          drain: D,
          delay: depthNext / Math.max(0.001, D),
          dup: dupBase,
          capacity: C,
          hasDlq,
          dlqId: dlqEdge?.target,
          goodFrac,
          poisonRate: inRate * poisonP,
        };
        util = C > 0 ? workArrival / C : inRate > 0 ? 9 : 0;
        cap = C;
        served = D;
        // consumer feed
        for (const e of consumers) {
          const t = nodes.get(e.target)!;
          const ft = facts[t.id];
          const concurrency =
            roleOf(t) === 'worker'
              ? Math.min(ft.replicas * (t.config.concurrency ?? 10), t.config.maxConcurrency ?? 1e9)
              : ft.replicas * 10;
          const share = C > 0 ? (ft.down ? 0 : concurrency * 1000) / Math.max(5, procMs) / ft.cpuMult / C : 0;
          const rate = D * share;
          edgeRps[e.id] = rate;
          edgeInv[e.id] = 1;
          edgeExp[e.id] = 1;
          edgeAmp[e.id] = 1;
          offered[t.id] += rate;
        }
        if (dlqEdge) {
          edgeRps[dlqEdge.id] = inRate * poisonP;
          offered[dlqEdge.target] += inRate * poisonP;
          edgeInv[dlqEdge.id] = 0;
          edgeExp[dlqEdge.id] = 1;
          edgeAmp[dlqEdge.id] = 1;
        }
        nodeOut[id] = { own, ownLat, ownP95: ownLat * 2, util, capacity: cap, served, offered: inRate };
        continue;
      } else if (role === 'bus') {
        ownLat = 8;
        cap = 1e9;
        served = inRate;
        own = f.down ? 1 : 0;
      } else if (role === 'compute' || role === 'worker') {
        const effCap = Math.min(cap, guardCap === Infinity ? cap : guardCap);
        util = effCap > 0 ? inRate / cap : inRate > 0 ? 9 : 0;
        served = Math.min(inRate, effCap);
        const drop = inRate > 0 ? 1 - served / inRate : 0;
        own = 1 - (1 - drop) * (1 - f.faultErr);
        if (f.down || f.replicas === 0) own = inRate > 0 ? 1 : 0;
        ownLat = role === 'worker' ? f.baseLat * f.latMult : f.baseLat * f.latMult * sat(Math.min(util, 5));
      } else if (['source', 'edge', 'cdn', 'waf', 'lb', 'gateway'].includes(role)) {
        const effCap = Math.min(cap, guardCap);
        util = role !== 'source' && effCap > 0 && effCap < 1e8 ? inRate / effCap : 0;
        served = Math.min(inRate, effCap);
        const drop = inRate > 0 ? 1 - served / inRate : 0;
        own = Math.max(own, 1 - (1 - drop) * (1 - (role === 'lb' ? own : 0)));
        if (f.down) own = 1;
        ownLat *= f.latMult;
      }
      ownP95 = ownLat * (1.4 + 1.2 * Math.min(util, 1.5) ** 2);

      nodeOut[id] = { own: clamp(own, 0, 1), ownLat, ownP95, util, capacity: cap, served, offered: inRate, ...out };

      // Distribute to downstream flow edges.
      const outs = outE.get(id) ?? [];
      const groups = new Map<string, number>();
      if (ROUTING_ROLES.has(role))
        for (const e of outs) {
          const k = nodes.get(e.target)!.kind;
          groups.set(k, (groups.get(k) ?? 0) + 1);
        }
      // Cache-aside: any cache that is a sibling target reduces read traffic to databases.
      let aside = 1;
      for (const e of outs) {
        const t = nodes.get(e.target)!;
        if (roleOf(t) === 'cache' && (outE.get(t.id) ?? []).length === 0)
          aside = Math.min(aside, 1 - workload.readRatio * (hit[t.id] ?? 0));
      }
      const goodFracOut = role === 'worker' ? workerGoodFrac(id, qOut, inE, nodes) : 1;
      for (const e of outs) {
        if (qOut[id]) continue;
        const t = nodes.get(e.target)!;
        const tr = roleOf(t);
        let share = ROUTING_ROLES.has(role) ? 1 / (groups.get(t.kind) ?? 1) : 1;
        if (role === 'lb' && tr === 'compute') {
          // Real load balancers steer traffic toward healthy targets.
          const peers = outs.filter((x) => nodes.get(x.target)!.kind === t.kind);
          const wt = (x: ArchEdge) => {
            const f2 = facts[x.target];
            return f2.down || f2.replicas === 0 ? 0 : (healthy[x.target] ?? 1);
          };
          const tot = peers.reduce((sum, x) => sum + wt(x), 0);
          if (tot > 0) share = wt(e) / tot;
        }
        const dbFactor = tr === 'db' || tr === 'kv' || tr === 'search' ? aside : 1;
        const inv = emit * share * Math.min(1, e.config.weight) * dbFactor * (role === 'worker' ? goodFracOut : 1);
        const exp = Math.max(1, e.config.weight);
        edgeInv[e.id] = inv;
        edgeExp[e.id] = exp;
        const cls = edgeClass(arch, e);
        const calls = served * inv * exp;
        if (cls === 'async') {
          edgeRps[e.id] = calls;
          edgeAmp[e.id] = 1;
          offered[t.id] += calls;
          continue;
        }
        const er = edgeRetries(arch, e);
        const ft = clamp(failGuess[t.id] ?? 0, 0, 1);
        const p95g = (latGuess[t.id] ?? 0) * 1.6;
        const tf = p95g > e.config.timeoutMs ? Math.min(0.95, 1 - e.config.timeoutMs / p95g) : 0;
        const fe = 1 - (1 - ft) * (1 - tf);
        let amp = 1;
        const open = er.breaker && fe > er.breakerAt;
        edgeBreaker[e.id] = open;
        const effR = er.retries * (er.backoff ? 0.5 : 1);
        if (blocked[e.id]) amp = 0;
        else if (open) amp = 0.1;
        else amp = fe >= 0.999 ? effR + 1 : (1 - fe ** (effR + 1)) / (1 - fe);
        edgeAmp[e.id] = amp;
        const rate = calls * amp;
        edgeRps[e.id] = rate;
        if (!blocked[e.id]) offered[t.id] += rate;
      }
    }

    // Success / latency recursion (reverse topological order).
    succ = {};
    lat = {};
    p95 = {};
    for (let k = order.length - 1; k >= 0; k--) {
      const id = order[k];
      const no = nodeOut[id];
      if (!no) {
        succ[id] = 1;
        lat[id] = 0;
        p95[id] = 0;
        continue;
      }
      let s = 1 - no.own;
      let l = no.ownLat;
      let l95 = no.ownP95;
      for (const e of outE.get(id) ?? []) {
        const t = nodes.get(e.target)!;
        const cls = edgeClass(arch, e);
        const inv = edgeInv[e.id] ?? 0;
        const exp = edgeExp[e.id] ?? 1;
        if (cls === 'async') {
          l += inv * (lat[e.target] ?? 0) * 0 + (roleOf(t) === 'queue' || roleOf(t) === 'bus' ? inv * 6 : 0);
          continue;
        }
        if (inv === 0) continue;
        const er = edgeRetries(arch, e);
        const ft = clamp(1 - (succ[e.target] ?? 1), 0, 1);
        const p95t = p95[e.target] ?? 0;
        const tf = p95t > e.config.timeoutMs ? Math.min(0.95, 1 - e.config.timeoutMs / p95t) : 0;
        let fe = 1 - (1 - ft) * (1 - tf);
        if (blocked[e.id]) fe = 1;
        const open = edgeBreaker[e.id];
        const callFail = blocked[e.id] || open ? 1 : fe ** (er.retries + 1);
        const pOk = 1 - inv * (1 - (1 - callFail) ** exp);
        s *= pOk;
        const tl = blocked[e.id] ? e.config.timeoutMs : open ? 2 : (lat[e.target] ?? 0);
        const retryLat = blocked[e.id] ? e.config.timeoutMs * er.retries : fe * er.retries * Math.min(e.config.timeoutMs, tl * 3 + 20);
        l += inv * exp * tl + inv * retryLat;
        l95 += inv * exp * (blocked[e.id] ? e.config.timeoutMs : open ? 2 : (p95[e.target] ?? 0)) + inv * retryLat * 1.5;
      }
      succ[id] = clamp(s, 0, 1);
      lat[id] = l;
      p95[id] = Math.max(l95, l);
    }
    // Damped update of guesses.
    let delta = 0;
    for (const n of arch.nodes) {
      const nf = 1 - (succ[n.id] ?? 1);
      delta += Math.abs(nf - failGuess[n.id]) + Math.abs((lat[n.id] ?? 0) - (latGuess[n.id] ?? 0)) / 1000;
      failGuess[n.id] = 0.5 * failGuess[n.id] + 0.5 * nf;
      latGuess[n.id] = 0.5 * latGuess[n.id] + 0.5 * (lat[n.id] ?? 0);
    }
    if (iter > 4 && delta < 1e-4) break;
  }

  // -------------------------------------------------------------------------
  // Assemble metrics
  // -------------------------------------------------------------------------
  const nodeMetrics: Record<string, NodeMetrics> = {};
  const next: SimState = { queues: {}, replicas: {} };
  const SECS = P.SECONDS_PER_MONTH;
  const servedMap: Record<string, number> = {};
  arch.nodes.forEach((n) => {
    servedMap[n.id] = nodeOut[n.id]?.served ?? 0;
  });
  const costCtx: CostCtx = { arch, workload, served: servedMap, offered, edgeRps, secondsPerMonth: SECS, hit, blocked };

  for (const n of arch.nodes) {
    const role = roleOf(n);
    const no = nodeOut[n.id] ?? { own: 0, ownLat: 0, ownP95: 0 };
    const f = facts[n.id];
    const reasons: Reason[] = [];
    const q = qOut[n.id];
    const off = offered[n.id] ?? 0;
    const util = (no as any).util ?? 0;
    const errorRate = clamp(1 - (succ[n.id] ?? 1), 0, 1);
    const m: NodeMetrics = {
      id: n.id,
      kind: n.kind,
      role,
      offered: off,
      served: (no as any).served ?? 0,
      capacity: (no as any).capacity ?? 0,
      util,
      mem: clamp(0.22 + 0.45 * Math.min(util, 1.2) + f.memAdd, 0, 1),
      latencyMs: lat[n.id] ?? 0,
      p95Ms: p95[n.id] ?? 0,
      errorRate,
      status: 'healthy',
      replicas: f.replicas,
      costMonthly: 0,
      reasons,
    };
    if (role === 'compute' || role === 'worker') {
      if (f.autoscale) {
        let want = role === 'worker' ? 0 : Math.ceil(off / (f.perRep * 0.6));
        if (role === 'worker') {
          const feeders = (inE.get(n.id) ?? []).map((e) => qOut[e.source]).filter(Boolean);
          const backlog = feeders.reduce((s, x) => s + x.next.depth / 300 + x.arrival, 0);
          const per = ((n.config.concurrency ?? 10) * 1000) / Math.max(5, workload.avgProcessMs);
          want = Math.ceil(backlog / (per * 0.6));
        }
        const cur = f.replicas;
        const step = n.kind === 'lambda' ? cur * 2 + 5 : Math.max(2, Math.ceil(cur * 0.5));
        next.replicas[n.id] = clamp(
          want > cur ? Math.min(want, cur + step) : Math.max(want, cur - 1),
          f.minRep,
          Math.max(f.minRep, f.maxRep),
        );
      }
      if (util >= 1)
        reasons.push({
          code: 'saturated',
          severity: 'crit',
          text: `Saturated: ${off.toFixed(0)} rps offered vs ${m.capacity.toFixed(0)} rps capacity (${f.replicas} × ${f.perRep.toFixed(0)}). Excess requests are rejected.`,
        });
      else if (util > 0.8)
        reasons.push({
          code: 'hot',
          severity: 'warn',
          text: `Running hot at ${(util * 100).toFixed(0)}% utilisation; latency grows non-linearly as utilisation approaches 100%.`,
        });
      if (f.autoscale && (next.replicas[n.id] ?? f.replicas) > f.replicas)
        reasons.push({
          code: 'scaling',
          severity: 'info',
          text: `Autoscaling is adding replicas (${f.replicas} → ${next.replicas[n.id]}) but new capacity arrives after a delay.`,
        });
      if (healthy[n.id] !== undefined && healthy[n.id]! < 0.99)
        reasons.push({
          code: 'health',
          severity: 'crit',
          text: `Load balancer health checks are removing ${(100 - healthy[n.id]! * 100).toFixed(0)}% of this target's capacity: the probe timeout is shorter than the endpoint's latency.`,
        });
      if (f.faultErr > 0.01)
        reasons.push({
          code: 'errors',
          severity: 'warn',
          text: `Elevated application errors (${(f.faultErr * 100).toFixed(0)}%) not explained by load.`,
        });
    }
    if (role === 'db') {
      const di = dbInfo[n.id];
      m.connUsed = di.connUsed;
      m.connMax = di.connMax;
      m.replicaLagSec = di.lag;
      m.staleReadPct = di.stale;
      const demand = connDemand[n.id] ?? 0;
      if (!n.config.connectionPooler && demand > di.connMax)
        reasons.push({
          code: 'connections',
          severity: 'crit',
          text: `Connection demand ${demand} exceeds the limit of ${di.connMax}; ${(100 * (1 - di.connMax / demand)).toFixed(0)}% of new connections are refused.`,
        });
      else if (!n.config.connectionPooler && demand > di.connMax * 0.8)
        reasons.push({
          code: 'connections-high',
          severity: 'warn',
          text: `Connections ${demand}/${di.connMax} — scaling clients further will exhaust the limit.`,
        });
      if (util >= 1)
        reasons.push({
          code: 'db-saturated',
          severity: 'crit',
          text: `Database CPU saturated (${(util * 100).toFixed(0)}%): queries queue and time out.`,
        });
      else if (util > 0.75) reasons.push({ code: 'db-hot', severity: 'warn', text: `Database at ${(util * 100).toFixed(0)}% CPU.` });
      if (di.stale > 1)
        reasons.push({
          code: 'stale-read',
          severity: di.stale > 5 ? 'crit' : 'warn',
          text: `Replicas are about ${di.lag.toFixed(1)}s behind the primary, so ${di.stale.toFixed(0)}% of reads that follow a user's own write return data from before it.`,
        });
      if (n.config.readReplicas > 0 && di.lag > workload.freshnessSeconds * 0.5)
        reasons.push({ code: 'lag', severity: 'warn', text: `Replica lag ≈ ${di.lag.toFixed(1)}s may violate freshness requirements.` });
    }
    if (role === 'kv') {
      const ki = kvInfo[n.id];
      if (ki && ki.hotWrites > 0) {
        m.hotItemWritesPerSec = ki.hotWrites;
        if (ki.hotThrottle > 0)
          reasons.push({
            code: 'hot-key',
            severity: ki.hotLoss > 0.01 ? 'crit' : 'warn',
            text: `One item receives about ${ki.hotWrites.toFixed(0)} writes/s, above the ${P.KV_ITEM_WRITES_PER_SEC}/s a single partition can take: ${(ki.hotThrottle * 100).toFixed(0)}% of writes to it are throttled even though the table has spare capacity.`,
          });
      }
    }
    if (role === 'cache') {
      m.hitRate = hit[n.id] ?? 0;
      const stale = n.config.invalidateOnWrite ? 1 : n.config.ttlSeconds;
      if (stale > workload.freshnessSeconds && workload.readRatio < 1)
        reasons.push({
          code: 'stale',
          severity: 'warn',
          text: `Cached entries can be up to ${stale}s stale but the product requires ≤ ${workload.freshnessSeconds}s freshness. Invalidate on write or shorten the TTL.`,
        });
    }
    if (role === 'cdn') m.hitRate = hit[n.id] ?? 0;
    if (q) {
      m.queueDepth = q.next.depth;
      m.arrivalRate = q.arrival;
      m.drainRate = q.drain;
      m.queueDelaySec = q.delay;
      m.dupRate = q.dup;
      m.dlqDepth = q.next.dlq;
      next.queues[n.id] = q.next;
      if (q.capacity === 0 && q.arrival > 0)
        reasons.push({ code: 'noconsumer', severity: 'crit', text: 'Messages are arriving but no consumer capacity exists.' });
      else if (q.drain < q.arrival * 0.99 && q.drain >= q.capacity * 0.999)
        reasons.push({
          code: 'backlog',
          severity: 'crit',
          text: `Consumers are at capacity (${q.capacity.toFixed(0)}/s) but work arrives at ${q.arrival.toFixed(0)}/s: backlog grows.`,
        });
      if (!q.hasDlq && q.poisonRate > 0)
        reasons.push({
          code: 'poison',
          severity: 'crit',
          text: `${q.poisonRate.toFixed(1)}/s messages fail on every attempt and there is no dead-letter queue: they are redelivered forever and waste consumer capacity.`,
        });
      if (q.dup > 0.02)
        reasons.push({
          code: 'redelivery',
          severity: 'warn',
          text: `Visibility timeout (${n.config.visibilityTimeoutSec}s) is shorter than worst-case processing: ~${(q.dup * 100).toFixed(0)}% of messages are delivered again while still being processed.`,
        });
    }
    // DLQ node displays its parent's parked messages.
    if (n.config.isDlq) {
      for (const pq of Object.values(qOut)) if (pq.dlqId === n.id) m.queueDepth = pq.next.dlq;
      m.dlqDepth = m.queueDepth ?? 0;
    }
    if (role === 'external') {
      if (util >= 1)
        reasons.push({
          code: 'ratelimited',
          severity: 'crit',
          text: `Third-party rate limit (${n.config.rpsLimit} rps) exceeded — excess calls get 429s.`,
        });
    }
    const blockedIn = (inE.get(n.id) ?? []).find((e) => blocked[e.id]);
    if (blockedIn) {
      m.blocked = blocked[blockedIn.id];
      reasons.push({ code: 'blocked', severity: 'crit', text: `Traffic is blocked: ${blocked[blockedIn.id]}` });
    }
    for (const e of inE.get(n.id) ?? [])
      if (edgeBreaker[e.id])
        reasons.push({
          code: 'breaker',
          severity: 'info',
          text: `Circuit breaker is open for calls to this dependency; callers fail fast to let it recover.`,
        });

    m.status = classify(m, role, !!blockedIn, f.down);
    nodeMetrics[n.id] = m;
  }

  for (const n of arch.nodes) {
    nodeMetrics[n.id].costMonthly = nodeCost(n, nodeMetrics[n.id], costCtx).total;
  }

  const edgeMetrics: Record<string, EdgeMetrics> = {};
  for (const e of flows) {
    const t = nodeMetrics[e.target];
    edgeMetrics[e.id] = {
      rps: edgeRps[e.id] ?? 0,
      errorRate: t ? t.errorRate : 0,
      amplification: edgeAmp[e.id] ?? 1,
      breakerOpen: !!edgeBreaker[e.id],
      blocked: blocked[e.id],
    };
  }

  // System-level
  const sources = arch.nodes.filter((n) => roleOf(n) === 'source');
  const totalRps = sources.reduce((s, n) => s + (nodeOut[n.id]?.offered ?? 0), 0);
  // Traffic you are entitled to reject (an abusive client over its quota) does not count against availability or latency.
  const slo = sources.filter((n) => !n.config.excludeFromSlo);
  const sloSources = slo.length ? slo : sources;
  const sloRps = sloSources.reduce((s, n) => s + (nodeOut[n.id]?.offered ?? 0), 0);
  const weighted = (get: (id: string) => number) =>
    sloRps > 0 ? sloSources.reduce((s, n) => s + (nodeOut[n.id]?.offered ?? 0) * get(n.id), 0) / sloRps : 0;
  const successRate = sloRps > 0 ? weighted((id) => succ[id] ?? 1) : 1;
  let queueBacklog = 0,
    queueDelay = 0,
    dlq = 0,
    dupRate = 0,
    lost = 0;
  for (const [id, q] of Object.entries(qOut)) {
    queueBacklog += q.next.depth;
    queueDelay = Math.max(queueDelay, q.delay);
    dlq += q.next.dlq + q.next.poison;
    lost += q.hasDlq ? 0 : q.poisonRate * 60;
    const consumers = (outE.get(id) ?? []).map((e) => nodes.get(e.target)!).filter((t) => t && roleOf(t) !== 'queue');
    const idem = consumers.length > 0 && consumers.every((t) => t.config.idempotent || roleOf(t) === 'compute');
    if (!idem && q.arrival > 0) dupRate = Math.max(dupRate, q.dup);
  }
  const dbPct = Math.max(
    0,
    ...Object.values(nodeMetrics)
      .filter((m) => m.role === 'db')
      .map((m) => (m.connMax ? (m.connUsed ?? 0) / m.connMax : 0)),
  );
  const system: SystemMetrics = {
    rps: totalRps,
    throughput: sources.reduce((s, n) => s + (nodeOut[n.id]?.offered ?? 0) * (succ[n.id] ?? 1), 0),
    successRate,
    errorRate: 1 - successRate,
    p50: weighted((id) => lat[id] ?? 0),
    p95: weighted((id) => p95[id] ?? 0),
    costMonthly: Object.values(nodeMetrics).reduce((s, m) => s + m.costMonthly, 0),
    queueBacklog,
    queueDelaySec: queueDelay,
    dlqDepth: dlq,
    duplicateRate: dupRate,
    lostPerMin: lost,
    dbConnPct: dbPct,
    maxUtil: Math.max(
      0,
      ...Object.values(nodeMetrics)
        .filter((m) => ['compute', 'worker', 'db', 'cache', 'kv'].includes(m.role))
        .map((m) => m.util),
    ),
    failedRequests: sloRps * 60 * (1 - successRate),
    customerImpact: sloRps * 60 * (1 - successRate),
  };

  return { snapshot: { minute, rps: totalRps, nodes: nodeMetrics, edges: edgeMetrics, system }, next };
}

function workerGoodFrac(
  id: string,
  qOut: Record<string, { goodFrac: number }>,
  inE: Map<string, ArchEdge[]>,
  _nodes: Map<string, ArchNode>,
): number {
  const feeders = (inE.get(id) ?? []).map((e) => qOut[e.source]).filter(Boolean);
  if (!feeders.length) return 1;
  return feeders.reduce((s, q) => s + q.goodFrac, 0) / feeders.length;
}

function classify(m: NodeMetrics, role: string, blocked: boolean, down: boolean): NodeStatus {
  if (['network', 'identity', 'delivery', 'observability', 'policy', 'resilience'].includes(role)) return 'healthy';
  if (down || blocked) return 'unavailable';
  if (role === 'queue') {
    if ((m.queueDelaySec ?? 0) > 300 || m.reasons.some((r) => r.severity === 'crit')) return 'overloaded';
    if ((m.queueDelaySec ?? 0) > 60) return 'degraded';
    return m.offered < 0.01 && !(m.queueDepth ?? 0) ? 'idle' : 'healthy';
  }
  if (m.offered < 0.01 && role !== 'source') return 'idle';
  if (m.errorRate >= 0.9 && role !== 'source') return 'unavailable';
  if (m.util >= 1) return 'overloaded';
  if (m.errorRate > 0.02 || m.util > 0.8 || m.reasons.some((r) => r.severity === 'crit')) return 'degraded';
  return 'healthy';
}

export function entryName(kind: string): string {
  return entryOf(kind).name;
}
