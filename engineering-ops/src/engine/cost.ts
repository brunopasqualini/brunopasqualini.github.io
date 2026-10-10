import { flowEdges, nodeById, ofKind, roleOf } from '@/engine/arch';
import * as P from '@/engine/params';
import type { Arch, ArchNode, NodeMetrics, Workload } from '@/engine/types';

export interface CostLine {
  label: string;
  usd: number;
  category: 'compute' | 'data' | 'network' | 'storage' | 'observability' | 'delivery' | 'transfer' | 'messaging' | 'security';
}

export interface CostCtx {
  arch: Arch;
  workload: Workload;
  served: Record<string, number>;
  offered: Record<string, number>;
  edgeRps: Record<string, number>;
  secondsPerMonth: number;
  hit: Record<string, number>;
  blocked: Record<string, string | undefined>;
}

const GB = (rps: number, kb: number, secs: number) => (rps * kb * secs) / 1e6;

function retentionDays(arch: Arch): number {
  const cw = ofKind(arch, 'cloudwatch', 'central-logging', 'observability-stack')[0];
  return cw?.config.retentionDays ?? 30;
}

/** Simulated monthly cost for a single component, broken into explainable lines. */
export function costLines(n: ArchNode, m: Pick<NodeMetrics, 'replicas' | 'offered'>, ctx: CostCtx): CostLine[] {
  const { arch, workload: w, secondsPerMonth: S } = ctx;
  const c = n.config;
  const role = roleOf(n);
  const lines: CostLine[] = [];
  const reqPerMonth = (ctx.offered[n.id] ?? 0) * S;
  const add = (label: string, usd: number, category: CostLine['category']) => {
    if (usd > 0.005) lines.push({ label, usd, category });
  };

  const size = P.SIZE_MULT[c.instanceSize ?? c.size ?? 'small'] ?? 1;
  if (role === 'compute' || role === 'worker') {
    const p = P.COMPUTE[n.kind] ?? P.COMPUTE['backend-service'];
    if (n.kind === 'lambda') {
      add(`Invocations (${(reqPerMonth / 1e6).toFixed(1)}M/mo)`, (reqPerMonth / 1e6) * (p.perMillionReq ?? 2.2), 'compute');
    } else {
      add(
        `${m.replicas} × ${c.instanceSize ?? 'small'} instance${m.replicas === 1 ? '' : 's'}`,
        m.replicas * p.hourly * size * P.HOURS_PER_MONTH,
        'compute',
      );
    }
    if (p.fixed) add('Control plane', p.fixed, 'compute');
    const served = ctx.served[n.id] ?? 0;
    const gb = ((served * S) / 1e6) * w.logGBPerMillionReq * (P.LOG_LEVEL_MULT[c.logLevel ?? 'info'] ?? 1);
    add(`Logs ingest (${gb.toFixed(0)} GB, ${c.logLevel ?? 'info'})`, gb * P.LOG_INGEST_PER_GB, 'observability');
    add(`Log storage (${retentionDays(arch)}d retention)`, gb * P.LOG_STORE_PER_GB_MONTH * (retentionDays(arch) / 30), 'observability');
  } else if (role === 'db') {
    const d = P.DB[c.size] ?? P.DB.small;
    const az = c.multiAZ ? 2 : 1;
    add(`Primary ${c.size}${c.multiAZ ? ' (Multi-AZ ×2)' : ''}`, d.hourly * P.HOURS_PER_MONTH * az, 'data');
    if (c.readReplicas > 0) add(`${c.readReplicas} read replica(s)`, d.hourly * P.HOURS_PER_MONTH * c.readReplicas, 'data');
    if (c.crossRegionReplica) add('Cross-region replica + transfer', d.hourly * P.HOURS_PER_MONTH * 1.15, 'data');
    add(`Storage ${c.storageGB} GB`, c.storageGB * P.DB_STORAGE_PER_GB * az, 'storage');
    if (c.backupRetentionDays > 7)
      add(`Backups (${c.backupRetentionDays}d)`, c.storageGB * 0.095 * ((c.backupRetentionDays - 7) / 30), 'storage');
    if (c.connectionPooler) add('Connection pooler / proxy', 15 * (c.size === 'small' ? 1 : P.SIZE_MULT[c.size] / 2), 'data');
  } else if (role === 'kv') {
    if (c.capacityMode === 'provisioned')
      add('Provisioned capacity', (c.rcu * P.DDB_RCU_HOURLY + c.wcu * P.DDB_WCU_HOURLY) * P.HOURS_PER_MONTH, 'data');
    else
      add(
        'On-demand requests',
        ((reqPerMonth * w.readRatio) / 1e6) * P.DDB_READ_PER_MILLION + ((reqPerMonth * (1 - w.readRatio)) / 1e6) * P.DDB_WRITE_PER_MILLION,
        'data',
      );
  } else if (role === 'cache') {
    add(`${c.nodes} × ${c.size} node(s)`, c.nodes * P.CACHE_NODE_HOURLY * (P.SIZE_MULT[c.size] ?? 1) * P.HOURS_PER_MONTH, 'data');
  } else if (role === 'search') {
    add(`${c.nodes} × ${c.size} node(s)`, c.nodes * P.SEARCH_NODE_HOURLY * (P.SIZE_MULT[c.size] ?? 1) * P.HOURS_PER_MONTH, 'data');
  } else if (role === 'queue') {
    add(`Requests (${(reqPerMonth / 1e6).toFixed(1)}M/mo)`, (reqPerMonth / 1e6) * P.QUEUE_PER_MILLION_REQ, 'messaging');
  } else if (role === 'bus') {
    add('Events', (reqPerMonth / 1e6) * P.BUS_PER_MILLION, 'messaging');
  } else if (role === 'storage') {
    const gb = c.storageGB ?? 0;
    const base = P.S3_PRICE[c.storageClass ?? 'standard'] ?? 0.023;
    const versioned = c.versioning && !c.lifecycle ? 1.6 : 1;
    const eff = c.lifecycle ? base * (1 - P.S3_LIFECYCLE_COLD_SHARE) + P.S3_PRICE.glacier * P.S3_LIFECYCLE_COLD_SHARE : base;
    add(`Storage ${gb} GB${c.lifecycle ? ' (lifecycle)' : ''}`, gb * eff * versioned, 'storage');
    add('Requests', (reqPerMonth / 1e6) * 0.4, 'storage');
  } else if (n.kind === 'dr-config') {
    // The standby stack in the second Region costs a share of the primary stack, by strategy.
    const share = { 'backup-restore': 0, 'pilot-light': 0.1, 'warm-standby': 0.5, 'active-active': 1 }[c.strategy as string] ?? 0;
    const stack = arch.nodes.reduce((sum, x) => {
      const xc = x.config;
      const xs = P.SIZE_MULT[xc.instanceSize ?? xc.size ?? 'small'] ?? 1;
      if (roleOf(x) === 'compute' && x.kind !== 'lambda')
        return sum + (xc.replicas ?? 1) * (P.COMPUTE[x.kind] ?? P.COMPUTE['backend-service']).hourly * xs * P.HOURS_PER_MONTH;
      if (roleOf(x) === 'db') return sum + (P.DB[xc.size] ?? P.DB.small).hourly * P.HOURS_PER_MONTH * (xc.multiAZ ? 2 : 1);
      return sum;
    }, 0);
    add('DR tooling and runbooks', P.FIXED_MONTHLY['dr-config'] ?? 0, 'observability');
    add(`Standby stack in the second Region (${c.strategy})`, stack * share, 'compute');
  } else if (n.kind === 'nat') {
    let gbThrough = 0;
    for (const e of flowEdges(arch)) {
      const s = nodeById(arch, e.source);
      const t = nodeById(arch, e.target);
      if (!s || !t) continue;
      const sub = s.config.subnet ? nodeById(arch, s.config.subnet) : undefined;
      const viaThisNat = sub
        ? sub.config.routeInternet === 'nat' && sub.config.nat === n.id
        : ofKind(arch, 'nat')[0]?.id === n.id && ['compute', 'worker'].includes(roleOf(s));
      if (!viaThisNat) continue;
      const tr = roleOf(t);
      if (tr === 'external') gbThrough += GB(ctx.edgeRps[e.id] ?? 0, w.payloadKB, S);
      else if (tr === 'storage' && !t.config.vpcEndpoint) gbThrough += GB(ctx.edgeRps[e.id] ?? 0, w.payloadKB * 3, S);
    }
    add('NAT gateway (hourly)', P.NAT_HOURLY * P.HOURS_PER_MONTH, 'network');
    add(`NAT data processing (${gbThrough.toFixed(0)} GB)`, gbThrough * P.NAT_PER_GB, 'network');
  } else if (n.kind === 'alb') {
    const lcu = Math.max(1, Math.ceil((ctx.offered[n.id] ?? 0) / 60));
    add('Load balancer (hourly)', P.ALB_HOURLY * P.HOURS_PER_MONTH, 'network');
    add(`LCU usage (${lcu})`, lcu * P.ALB_LCU_HOURLY * P.HOURS_PER_MONTH, 'network');
  } else if (n.kind === 'apigw') {
    add('API requests', (reqPerMonth / 1e6) * P.APIGW_PER_MILLION, 'network');
  } else if (n.kind === 'cloudfront') {
    add('CDN transfer', GB(ctx.offered[n.id] ?? 0, w.payloadKB, S) * P.CDN_PER_GB, 'transfer');
  } else if (n.kind === 'waf') {
    add('Web ACL + rules', P.WAF_BASE, 'security');
    add('Requests inspected', (reqPerMonth / 1e6) * P.WAF_PER_MILLION, 'security');
  } else if (n.kind === 'route53') {
    add('Hosted zone + queries', P.ROUTE53_BASE, 'network');
  } else if (n.kind === 'cloudwatch') {
    const nodesMonitored = arch.nodes.filter((x) => ['compute', 'worker', 'db', 'queue'].includes(roleOf(x))).length;
    add(`Metrics (${nodesMonitored} resources)`, nodesMonitored * P.METRIC_PER_NODE, 'observability');
  } else {
    const f = P.FIXED_MONTHLY[n.kind] ?? 0;
    const cat: CostLine['category'] = role === 'delivery' ? 'delivery' : role === 'identity' ? 'security' : 'observability';
    add('Subscription / usage', f, cat);
  }

  // Data transfer out to users: charged on the first hop behind the traffic source.
  for (const e of arch.edges.filter((x) => x.target === n.id)) {
    const s = nodeById(arch, e.source);
    if (s && roleOf(s) === 'source' && n.kind !== 'cloudfront') {
      add('Internet data transfer out', GB(ctx.edgeRps[e.id] ?? 0, w.payloadKB, S) * P.EGRESS_PER_GB, 'transfer');
    }
  }
  return lines;
}

export function nodeCost(n: ArchNode, m: NodeMetrics, ctx: CostCtx): { total: number; lines: CostLine[] } {
  const lines = costLines(n, m, ctx);
  return { total: lines.reduce((s, l) => s + l.usd, 0), lines };
}
