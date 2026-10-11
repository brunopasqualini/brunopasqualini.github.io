import { edgeClass, nodeById } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import { DB } from '@/engine/params';
import type { Arch, ArchNode, Role, Workload } from '@/engine/types';

/**
 * A design review that runs while you build: anti-patterns the simulation is known to punish, each with the reason in
 * plain language, the fix, and (where one fits) the Academy lesson behind it.
 *
 * Every rule reads settings the catalog actually has, so a finding always points at something you can change. The linter
 * is advice, not a verdict: it never blocks a deploy, and a design can be right to break a rule on purpose (that is what the
 * trade-off missions are about). It complements the security findings, which cover exposure and permissions.
 */
export type LintSeverity = 'high' | 'medium' | 'low';

export interface LintItem {
  /** Stable per finding (rule + component), so the UI can key and track it. */
  id: string;
  rule: string;
  severity: LintSeverity;
  nodeId?: string;
  title: string;
  why: string;
  fix: string;
  /** Academy lesson id (e.g. "sd-2") that explains the idea. */
  lesson?: string;
}

const SEVERITY_ORDER: Record<LintSeverity, number> = { high: 0, medium: 1, low: 2 };

const roleOf = (n: ArchNode): Role => entryOf(n.kind).role;
const COMPUTE: Role[] = ['compute', 'worker'];
const BILLABLE: Role[] = ['compute', 'worker', 'db', 'kv', 'cache', 'queue', 'storage', 'search'];

/** Every rule, for documentation and tests: id, one-line title. */
export const LINT_RULES: { id: string; title: string }[] = [
  { id: 'db-single-az', title: 'Database in a single Availability Zone' },
  { id: 'retry-no-breaker', title: 'Aggressive retries without a circuit breaker' },
  { id: 'slow-timeout', title: 'A call can wait a very long time before failing' },
  { id: 'queue-no-dlq', title: 'Queue without a dead-letter queue' },
  { id: 'worker-not-idempotent', title: 'Queue consumer that is not idempotent' },
  { id: 'single-instance', title: 'One instance serving traffic' },
  { id: 'no-alerting', title: 'No alert rules' },
  { id: 'cache-stale', title: 'Cache can serve data older than required' },
  { id: 'db-connections', title: 'Connection pools can exhaust the database' },
  { id: 'no-scaling-for-peak', title: 'Traffic peaks but nothing scales' },
  { id: 'shared-database', title: 'Several services share one database' },
  { id: 'cold-data-standard', title: 'Large bucket with no lifecycle rule' },
  { id: 'debug-logging', title: 'Debug logging in production' },
  { id: 'no-cost-tags', title: 'No cost allocation tags' },
];

export function lintArch(arch: Arch, workload?: Workload): LintItem[] {
  const out: LintItem[] = [];
  const flow = arch.edges.filter((e) => edgeClass(arch, e) === 'traffic');
  const async = arch.edges.filter((e) => edgeClass(arch, e) === 'async');
  const callersOf = (id: string) =>
    flow
      .filter((e) => e.target === id)
      .map((e) => nodeById(arch, e.source))
      .filter((n): n is ArchNode => !!n);
  const push = (i: Omit<LintItem, 'id'> & { id?: string }) => out.push({ ...i, id: i.id ?? `${i.rule}-${i.nodeId ?? 'design'}` });

  for (const n of arch.nodes) {
    const c = n.config;
    const role = roleOf(n);

    // 1. A database with one copy in one zone is the classic hidden outage.
    if (role === 'db' && callersOf(n.id).length > 0 && !c.multiAZ)
      push({
        rule: 'db-single-az',
        severity: 'high',
        nodeId: n.id,
        title: `${n.label} runs in a single Availability Zone`,
        why: 'If that zone has a problem the whole data tier is down until you restore from a backup. Read replicas spread reads; they are not a failover.',
        fix: 'Turn on Multi-AZ, a synchronous standby in a second zone that takes over automatically.',
        lesson: 'aws-2',
      });

    // 4. Poison messages need somewhere to go.
    if (role === 'queue' && !c.isDlq) {
      const targets = async.filter((e) => e.source === n.id).map((e) => nodeById(arch, e.target));
      const consumed = targets.some((x) => x && !x.config.isDlq);
      const hasDlq = targets.some((x) => x?.config.isDlq);
      if (consumed && !hasDlq)
        push({
          rule: 'queue-no-dlq',
          severity: 'medium',
          nodeId: n.id,
          title: `${n.label} has no dead-letter queue`,
          why: 'A message that always fails is retried until it expires, wasting capacity on every attempt and hiding the failure.',
          fix: 'Add a dead-letter queue and connect this queue to it, so repeated failures are parked where you can inspect them.',
          lesson: 'sd-3',
        });
    }

    // 5. At-least-once delivery means duplicates.
    if (
      COMPUTE.includes(role) &&
      c.idempotent === false &&
      async.some((e) => e.target === n.id && roleOf(nodeById(arch, e.source)!) !== 'source')
    )
      push({
        rule: 'worker-not-idempotent',
        severity: 'medium',
        nodeId: n.id,
        title: `${n.label} is not idempotent`,
        why: 'Queues deliver at least once, so the same message will sometimes arrive twice. Without idempotency a duplicate charges, emails or ships twice.',
        fix: 'Deduplicate on a request or message id, or use conditional writes, then mark the consumer idempotent.',
        lesson: 'se-2',
      });

    // 6. One instance is a single point of failure and a deploy is an outage.
    if (COMPUTE.includes(role) && n.kind !== 'lambda' && !c.autoscale && c.replicas === 1 && callersOf(n.id).length > 0)
      push({
        rule: 'single-instance',
        severity: 'medium',
        nodeId: n.id,
        title: `${n.label} has a single instance`,
        why: 'One crash, one deploy or one zone problem takes it out, and there is no spare capacity for a burst.',
        fix: 'Run at least two instances across zones, or enable autoscaling with a minimum of two.',
      });

    // 8. A cache that is allowed to be staler than the product tolerates.
    if (
      role === 'cache' &&
      workload &&
      callersOf(n.id).length > 0 &&
      !c.invalidateOnWrite &&
      typeof c.ttlSeconds === 'number' &&
      c.ttlSeconds > workload.freshnessSeconds
    )
      push({
        rule: 'cache-stale',
        severity: 'medium',
        nodeId: n.id,
        title: `${n.label} can serve data up to ${c.ttlSeconds}s old`,
        why: `Reads here must be at most ${workload.freshnessSeconds}s old, but entries live for ${c.ttlSeconds}s, so users can see outdated data.`,
        fix: `Lower the TTL to ${workload.freshnessSeconds}s or less, or invalidate on write.`,
        lesson: 'sd-4',
      });

    // 9. Pools multiplied by replicas can be more than the database accepts.
    if (role === 'db') {
      const callers = callersOf(n.id).filter((x) => COMPUTE.includes(roleOf(x)));
      const demand = (max: boolean) =>
        callers.reduce(
          (s, x) =>
            s +
            (max && x.config.autoscale ? (x.config.maxReplicas ?? x.config.replicas) : (x.config.replicas ?? 1)) *
              (x.config.dbPoolSize ?? 10),
          0,
        );
      const limit = DB[c.size]?.maxConn ?? 100;
      if (!c.connectionPooler && callers.length > 0) {
        if (demand(false) > limit)
          push({
            rule: 'db-connections',
            severity: 'high',
            nodeId: n.id,
            title: `${n.label} cannot hold ${demand(false)} connections (limit ${limit})`,
            why: 'Each replica opens its own pool, so adding replicas adds connections. Past the limit the database refuses new ones and requests fail.',
            fix: 'Put a connection pooler (an RDS Proxy-style layer) in front, or lower the per-replica pool size.',
            lesson: 'aws-3',
          });
        else if (demand(true) > limit)
          push({
            rule: 'db-connections',
            severity: 'medium',
            nodeId: n.id,
            title: `${n.label} will run out of connections when its callers scale out`,
            why: `At full scale the callers open ${demand(true)} connections against a limit of ${limit}. It is fine today and fails at the worst moment, during a spike.`,
            fix: 'Add a connection pooler, or cap the callers’ pool size or maximum replicas.',
            lesson: 'aws-3',
          });
      }
    }

    // 12. Cold data at the standard price.
    if (role === 'storage' && !c.lifecycle && typeof c.storageGB === 'number' && c.storageGB >= 1000)
      push({
        rule: 'cold-data-standard',
        severity: 'low',
        nodeId: n.id,
        title: `${n.label} keeps ${c.storageGB} GB at the standard price`,
        why: 'Most of a large bucket is rarely read again, but you pay the hot-storage price for all of it.',
        fix: 'Add a lifecycle rule that moves older objects to a cheaper storage class.',
        lesson: 'fo-2',
      });

    // 13. Debug logs are a bill.
    if (COMPUTE.includes(role) && c.logLevel === 'debug')
      push({
        rule: 'debug-logging',
        severity: 'low',
        nodeId: n.id,
        title: `${n.label} logs at debug level`,
        why: 'Debug logging multiplies log volume, and log ingestion is one of the quiet big line items on a cloud bill.',
        fix: 'Use info or warn in production and raise it temporarily while investigating.',
        lesson: 'fo-2',
      });
  }

  // 2 + 3. Retries and timeouts on a call.
  for (const e of flow) {
    const from = nodeById(arch, e.source);
    const to = nodeById(arch, e.target);
    if (!from || !to) continue;
    const { retries, circuitBreaker, timeoutMs } = e.config;
    if (retries >= 3 && !circuitBreaker)
      push({
        rule: 'retry-no-breaker',
        id: `retry-no-breaker-${e.id}`,
        severity: retries >= 5 ? 'high' : 'medium',
        nodeId: from.id,
        title: `${from.label} → ${to.label} retries ${retries} times with no circuit breaker`,
        why: `When ${to.label} struggles, every caller sends up to ${1 + retries}× the load, which keeps it down. This is how a brown-out becomes an outage.`,
        fix: 'Retry once or twice with backoff, and enable the circuit breaker so callers stop hammering a failing dependency.',
        lesson: 'sd-2',
      });
    if (timeoutMs * (1 + retries) > 12000)
      push({
        rule: 'slow-timeout',
        id: `slow-timeout-${e.id}`,
        severity: 'low',
        nodeId: from.id,
        title: `${from.label} → ${to.label} can wait ${Math.round((timeoutMs * (1 + retries)) / 1000)}s before giving up`,
        why: 'While it waits, the caller holds a thread and a connection, so a slow dependency quickly exhausts the caller too.',
        fix: 'Set a timeout close to the dependency’s normal slow case (a few seconds), and budget retries inside it.',
        lesson: 'sd-2',
      });
  }

  // 7. Nobody will tell you about the outage.
  const billable = arch.nodes.filter((n) => BILLABLE.includes(roleOf(n)));
  const hasData = arch.nodes.some((n) => ['db', 'kv'].includes(roleOf(n)));
  if (
    arch.nodes.length >= 3 &&
    billable.some((n) => COMPUTE.includes(roleOf(n))) &&
    hasData &&
    !arch.nodes.some((n) => n.kind === 'alert-rule')
  )
    push({
      rule: 'no-alerting',
      severity: 'medium',
      title: 'Nothing will alert you when this breaks',
      why: 'Without an alert rule you find out about an outage from your customers, and the time until you notice is part of the outage.',
      fix: 'Add an alert rule on a symptom customers feel, such as the error rate, and attach it to the service.',
      lesson: 'sre-1',
    });

  // 10. Spiky traffic against fixed capacity.
  const peak = workload?.profile.length ? Math.max(...workload.profile.map((p) => p.mult)) : 1;
  if (peak >= 2) {
    const fixed = arch.nodes.filter(
      (n) => COMPUTE.includes(roleOf(n)) && n.kind !== 'lambda' && !n.config.autoscale && callersOf(n.id).length > 0,
    );
    if (fixed.length > 0)
      push({
        rule: 'no-scaling-for-peak',
        severity: 'medium',
        title: `Traffic reaches ${peak}× its base level but ${fixed.length === 1 ? fixed[0].label : `${fixed.length} services`} cannot scale`,
        why: 'Fixed capacity is sized for the quiet hours or wastes money all day. Autoscaling follows the load, with a delay.',
        fix: 'Enable autoscaling, or size for the peak and accept the cost. Note autoscaling cannot fix a saturated database behind it.',
        lesson: 'sd-1',
      });
  }

  // 11. A database several services write to is a hidden coupling.
  for (const n of arch.nodes.filter((x) => ['db', 'kv'].includes(roleOf(x)))) {
    const services = callersOf(n.id).filter((x) => x.kind === 'microservice');
    if (services.length >= 2)
      push({
        rule: 'shared-database',
        severity: 'medium',
        nodeId: n.id,
        title: `${services.length} microservices share ${n.label}`,
        why: 'Services that share tables cannot change their schema or scale independently, and one service’s slow query hurts the others.',
        fix: 'Give each service its own data store, or merge services that always change together.',
        lesson: 'sa-3',
      });
  }

  // 14. Spend you cannot attribute.
  if (billable.length >= 3 && billable.every((n) => !n.config.costTag))
    push({
      rule: 'no-cost-tags',
      severity: 'low',
      title: 'No cost allocation tags',
      why: 'The bill arrives as one number. Without tags nobody can say which team or feature caused a jump.',
      fix: 'Set a cost tag such as team=checkout on each billable component.',
      lesson: 'fo-3',
    });

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.title.localeCompare(b.title));
}
