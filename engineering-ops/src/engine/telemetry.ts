import { costLines, type CostCtx, type CostLine } from '@/engine/cost';
import { attachedTo, edgeClass, flowEdges, nodeById, roleOf } from '@/engine/arch';
import * as P from '@/engine/params';
import type { Arch, ArchNode, Snapshot, Workload } from '@/engine/types';

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LogLine {
  t: number;
  node: string;
  label: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  source: 'app' | 'infra';
  msg: string;
}

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

export function generateLogs(
  arch: Arch,
  history: Snapshot[],
  opts: { seed: number; mode: 'beginner' | 'intermediate' | 'advanced'; workload: Workload; window?: number },
): LogLine[] {
  const out: LogLine[] = [];
  const recent = history.slice(-(opts.window ?? 12));
  for (const snap of recent) {
    const r = rng(opts.seed * 7919 + snap.minute);
    for (const n of arch.nodes) {
      const m = snap.nodes[n.id];
      if (!m) continue;
      const role = roleOf(n);
      const push = (level: LogLine['level'], msg: string, source: LogLine['source'] = 'app') =>
        out.push({ t: snap.minute, node: n.id, label: n.label, level, source, msg });
      const id = (k = 8) =>
        Math.floor(r() * 16 ** k)
          .toString(16)
          .padStart(k, '0');
      if (role === 'compute' || role === 'worker') {
        if (m.offered > 0.5 && r() < 0.35)
          push(
            'INFO',
            `request completed method=GET path=/api/v1/items status=200 duration=${Math.max(1, m.latencyMs * (0.6 + r() * 0.8)).toFixed(0)}ms req=${id()}`,
          );
        if (m.util >= 1)
          push(
            'ERROR',
            `503 Service Unavailable: request queue full (offered ${m.offered.toFixed(0)} rps, capacity ${m.capacity.toFixed(0)} rps)`,
          );
        else if (m.util > 0.8) push('WARN', `worker pool utilisation ${pct(m.util)}; request latency p95=${m.p95Ms.toFixed(0)}ms`);
        for (const f of n.faults ?? []) if (f.log && r() < 0.8) push('ERROR', f.log.replace('{id}', id(6)));
        for (const e of flowEdges(arch).filter((x) => x.source === n.id)) {
          const em = snap.edges[e.id];
          const t = nodeById(arch, e.target)!;
          if (!em) continue;
          if (em.blocked)
            push(
              'ERROR',
              `connect ETIMEDOUT calling ${t.label} (timeout ${e.config.timeoutMs}ms): no response — SYN packets dropped`,
              'app',
            );
          else if (em.breakerOpen) push('WARN', `circuit breaker OPEN for ${t.label}: failing fast`);
          else if (em.amplification > 1.4)
            push(
              'WARN',
              `retrying call to ${t.label}: attempt ${Math.ceil(em.amplification)} of ${e.config.retries + 1} (amplification ×${em.amplification.toFixed(1)})`,
            );
          else if (snap.nodes[t.id] && snap.nodes[t.id].errorRate > 0.05 && r() < 0.6)
            push('ERROR', `upstream ${t.label} returned errors (${pct(snap.nodes[t.id].errorRate)} of calls failing)`);
        }
        if (role === 'worker' && (m.dupRate ?? 0) > 0.02 && r() < 0.5)
          push('WARN', `message ${id()} received again (receive count 2) while previous attempt still running`);
      }
      if (role === 'db') {
        const slow = !n.config.indexed && opts.workload.slowQueryShare > 0;
        if (slow && m.offered > 1 && r() < 0.7)
          push(
            'WARN',
            `duration: ${(P.DB_BASE_READ_MS * 60 * (0.7 + r() * 0.6)).toFixed(0)} ms  statement: SELECT * FROM orders WHERE customer_id = $1 AND status = 'open' ORDER BY created_at DESC`,
            'infra',
          );
        const demand = m.connUsed ?? 0;
        if (m.connMax && m.reasons.some((x) => x.code === 'connections'))
          push(
            'ERROR',
            `FATAL: remaining connection slots are reserved for non-replication superuser connections (${demand.toFixed(0)}/${m.connMax})`,
            'infra',
          );
        if (m.util >= 1) push('ERROR', `canceling statement due to statement timeout; cpu=${pct(Math.min(1, m.util))}`, 'infra');
        else if (m.util > 0.75) push('WARN', `checkpoint starting: CPU ${pct(m.util)}`, 'infra');
      }
      if (role === 'lb') {
        if (m.reasons.length === 0 && r() < 0.2) push('INFO', `access: 200 ${m.offered.toFixed(0)} rps`, 'infra');
        for (const e of flowEdges(arch).filter((x) => x.source === n.id)) {
          const t = snap.nodes[e.target];
          if (t?.reasons.some((x) => x.code === 'health'))
            push(
              'WARN',
              `target ${nodeById(arch, e.target)?.label} failed health check: response time exceeded ${attachedTo(arch, n.id).find((a) => a.kind === 'health-check')?.config.timeoutMs ?? n.config.healthTimeoutMs}ms — deregistering`,
              'infra',
            );
        }
        if (m.errorRate > 0.2) push('ERROR', `HTTP 5xx rate ${pct(m.errorRate)} — no healthy targets for some requests`, 'infra');
      }
      if (role === 'queue' && !n.config.isDlq) {
        if ((m.queueDepth ?? 0) > 100)
          push(
            'WARN',
            `ApproximateNumberOfMessagesVisible=${Math.round(m.queueDepth!)} oldest message age ${Math.round(m.queueDelaySec ?? 0)}s`,
            'infra',
          );
        if ((m.dupRate ?? 0) > 0.02)
          push(
            'WARN',
            `visibility timeout expired for ${Math.round((m.dupRate ?? 0) * 100)}% of in-flight messages; messages returned to queue`,
            'infra',
          );
        if (m.reasons.some((x) => x.code === 'poison'))
          push(
            'ERROR',
            `ReceiveCount for message ${id()} exceeded ${n.config.maxReceiveCount}; no redrive policy configured — message remains in queue`,
            'infra',
          );
      }
      if (n.config.isDlq && (m.queueDepth ?? 0) > 0 && r() < 0.5)
        push(
          'WARN',
          `${Math.round(m.queueDepth!)} message(s) parked in DLQ; oldest failed with ProcessingError: malformed payload`,
          'infra',
        );
      if (role === 'external') {
        if (m.util >= 1) push('ERROR', `HTTP 429 Too Many Requests from ${n.label}: retry-after=1s`);
      }
      if (role === 'cache' && m.reasons.some((x) => x.code === 'stale') && r() < 0.4)
        push('WARN', `served stale entry age=${n.config.ttlSeconds}s (freshness SLA ${opts.workload.freshnessSeconds}s)`);
      if (opts.mode === 'advanced' && role === 'compute' && r() < 0.5)
        push('INFO', `gc pause ${(r() * 40).toFixed(0)}ms heap=${(m.mem * 100).toFixed(0)}%`);
    }
  }
  return out.sort((a, b) => b.t - a.t);
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------
export interface Span {
  id: string;
  node: string;
  label: string;
  start: number;
  duration: number;
  error?: string;
  depth: number;
}
export interface Trace {
  id: string;
  total: number;
  error: boolean;
  spans: Span[];
}

export function generateTraces(arch: Arch, snap: Snapshot, seed: number, count = 8): Trace[] {
  const r = rng(seed * 31 + snap.minute);
  const edges = flowEdges(arch);
  const sources = arch.nodes.filter((n) => roleOf(n) === 'source');
  if (!sources.length) return [];
  const traces: Trace[] = [];
  const ownLat = (n: ArchNode): number => {
    const m = snap.nodes[n.id];
    if (!m) return 1;
    const kids = edges.filter((e) => e.source === n.id && edgeClass(arch, e) === 'traffic');
    const sub = kids.reduce(
      (s, e) =>
        s +
        (snap.nodes[e.target] && m.served > 0
          ? Math.min(1, (snap.edges[e.id]?.rps ?? 0) / Math.max(1, m.served)) * snap.nodes[e.target].latencyMs
          : 0),
      0,
    );
    return Math.max(0.5, m.latencyMs - sub);
  };
  for (let i = 0; i < count; i++) {
    const spans: Span[] = [];
    let t = 0;
    let error = false;
    const walk = (n: ArchNode, depth: number, visited: Set<string>) => {
      const m = snap.nodes[n.id];
      const jitter = 0.75 + r() * 0.6;
      const dur = ownLat(n) * jitter;
      const span: Span = { id: `${i}-${spans.length}`, node: n.id, label: n.label, start: t, duration: dur, depth };
      spans.push(span);
      const blockedEdge = edges.find((e) => e.target === n.id && snap.edges[e.id]?.blocked);
      if (blockedEdge) {
        span.error = 'connect timeout';
        error = true;
      } else if (m && r() < m.errorRate * 0.6 && m.reasons.some((x) => x.severity === 'crit')) {
        span.error = m.reasons.find((x) => x.severity === 'crit')!.code;
        error = true;
      }
      t += dur * 0.4;
      let childEnd = t;
      for (const e of edges.filter((x) => x.source === n.id && edgeClass(arch, x) === 'traffic')) {
        const c = nodeById(arch, e.target);
        if (!c || visited.has(c.id)) continue;
        const inv = (snap.edges[e.id]?.rps ?? 0) / Math.max(1, m?.served ?? 1);
        if (inv < 0.08 || r() > Math.min(1, inv * 1.2)) continue;
        t = childEnd;
        walk(c, depth + 1, new Set([...visited, c.id]));
        childEnd = t;
      }
      t = Math.max(t, span.start + dur);
      span.duration = Math.max(dur, t - span.start);
    };
    const first = edges.filter((e) => sources.some((s) => s.id === e.source));
    const e = first[Math.floor(r() * first.length)];
    const root = e && nodeById(arch, e.target);
    if (!root) break;
    walk(root, 0, new Set([root.id]));
    traces.push({
      id: Math.floor(r() * 16 ** 12)
        .toString(16)
        .padStart(12, '0'),
      total: t,
      error,
      spans,
    });
  }
  return traces;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export interface AlertEvent {
  t: number;
  source: 'alert' | 'synthetic' | 'customers';
  title: string;
  detail: string;
  severity: 'page' | 'ticket';
  actionable: boolean;
}

function alertMetric(arch: Arch, rule: ArchNode, s: Snapshot): number {
  const host = attachedTo(arch, rule.id).length ? undefined : undefined;
  void host;
  const target = arch.edges.find((e) => e.source === rule.id);
  const m = target ? s.nodes[target.target] : undefined;
  switch (rule.config.metric) {
    case 'errorRate':
      return (m ? m.errorRate : s.system.errorRate) * 100;
    case 'p95':
      return m ? m.p95Ms : s.system.p95;
    case 'cpu':
      return (m ? m.util : s.system.maxUtil) * 100;
    case 'queueAge':
      return m?.queueDelaySec ?? s.system.queueDelaySec;
    case 'dbConn':
      return (m?.connMax ? (m.connUsed ?? 0) / m.connMax : s.system.dbConnPct) * 100;
    case 'dlq':
      return m?.dlqDepth ?? s.system.dlqDepth;
    default:
      return 0;
  }
}

export function alertHistory(arch: Arch, history: Snapshot[]): AlertEvent[] {
  const events: AlertEvent[] = [];
  const rules = arch.nodes.filter((n) => n.kind === 'alert-rule');
  for (const rule of rules) {
    let streak = 0;
    let firing = false;
    for (const s of history) {
      const v = alertMetric(arch, rule, s);
      if (v > rule.config.threshold) streak += 1;
      else {
        streak = 0;
        firing = false;
      }
      if (streak >= (rule.config.forMinutes ?? 1) && !firing) {
        firing = true;
        events.push({
          t: s.minute,
          source: 'alert',
          title: `${rule.label}: ${rule.config.metric} > ${rule.config.threshold}`,
          detail: `Observed ${v.toFixed(1)} for ${streak} min.${rule.config.actionable ? ' Runbook linked.' : ' No runbook — responder must guess where to start.'}`,
          severity: 'page',
          actionable: !!rule.config.actionable,
        });
      }
    }
  }
  const hasSynthetic = arch.nodes.some((n) => n.kind === 'synthetic-monitoring');
  let bad = 0;
  let synFired = false;
  let custFired = false;
  for (const s of history) {
    if (s.system.successRate < 0.95) bad += 1;
    else {
      bad = 0;
      synFired = false;
      custFired = false;
    }
    if (hasSynthetic && bad >= 2 && !synFired) {
      synFired = true;
      events.push({
        t: s.minute,
        source: 'synthetic',
        title: 'Synthetic journey failing',
        detail: `Checkout probe success ${(s.system.successRate * 100).toFixed(0)}%`,
        severity: 'page',
        actionable: true,
      });
    }
    if (bad >= 15 && !custFired) {
      custFired = true;
      events.push({
        t: s.minute,
        source: 'customers',
        title: 'Support: customers report failures',
        detail: 'Tickets are coming in faster than usual. Detection by customer complaint is the slowest and costliest signal.',
        severity: 'ticket',
        actionable: false,
      });
    }
  }
  return events.sort((a, b) => b.t - a.t);
}

// ---------------------------------------------------------------------------
// Database health, cost breakdown
// ---------------------------------------------------------------------------
export interface QueryStat {
  sql: string;
  callsPerMin: number;
  meanMs: number;
  share: number;
  plan: string;
}

export function dbQueryStats(n: ArchNode, snap: Snapshot, w: Workload): QueryStat[] {
  const m = snap.nodes[n.id];
  if (!m) return [];
  const slow = !n.config.indexed && w.slowQueryShare > 0;
  const rate = m.offered * 60;
  const util = Math.min(m.util, 5);
  const q = (sql: string, share: number, base: number, plan: string): QueryStat => ({
    sql,
    callsPerMin: rate * share,
    meanMs: base / Math.max(0.05, 1 - Math.min(util, 0.95)),
    share,
    plan,
  });
  const readShare = w.readRatio;
  const hot = slow ? w.slowQueryShare : 0.15;
  const stats = [
    q(
      "SELECT * FROM orders WHERE customer_id = $1 AND status = 'open' ORDER BY created_at DESC",
      readShare * hot,
      slow ? P.DB_BASE_READ_MS * P.DB_SLOW_SCAN_MULT * 5 : P.DB_BASE_READ_MS,
      slow ? 'Seq Scan on orders  (rows=1.2M, filter: customer_id, status)' : 'Index Scan using idx_orders_customer_status',
    ),
    q(
      'SELECT id, name, price FROM products WHERE id = $1',
      readShare * (1 - hot) * 0.7,
      P.DB_BASE_READ_MS,
      'Index Scan using products_pkey',
    ),
    q(
      'SELECT * FROM sessions WHERE token = $1',
      readShare * (1 - hot) * 0.3,
      P.DB_BASE_READ_MS * 0.6,
      'Index Scan using idx_sessions_token',
    ),
    q('INSERT INTO orders (customer_id, total, status) VALUES ($1,$2,$3)', 1 - readShare, P.DB_BASE_WRITE_MS, 'Insert on orders'),
  ];
  const totalTime = stats.reduce((s, x) => s + x.callsPerMin * x.meanMs, 0) || 1;
  return stats.map((x) => ({ ...x, share: (x.callsPerMin * x.meanMs) / totalTime }));
}

export function costBreakdown(arch: Arch, snap: Snapshot, w: Workload): { node: ArchNode; lines: CostLine[]; total: number }[] {
  const served: Record<string, number> = {};
  const offered: Record<string, number> = {};
  const hit: Record<string, number> = {};
  const edgeRps: Record<string, number> = {};
  for (const n of arch.nodes) {
    const m = snap.nodes[n.id];
    served[n.id] = m?.served ?? 0;
    offered[n.id] = m?.offered ?? 0;
    hit[n.id] = m?.hitRate ?? 0;
  }
  for (const [id, e] of Object.entries(snap.edges)) edgeRps[id] = e.rps;
  const ctx: CostCtx = { arch, workload: w, served, offered, edgeRps, secondsPerMonth: P.SECONDS_PER_MONTH, hit, blocked: {} };
  return arch.nodes
    .map((node) => {
      const m = snap.nodes[node.id];
      const lines = costLines(node, { replicas: m?.replicas ?? 1, offered: m?.offered ?? 0 }, ctx);
      return { node, lines, total: lines.reduce((s, l) => s + l.usd, 0) };
    })
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}
