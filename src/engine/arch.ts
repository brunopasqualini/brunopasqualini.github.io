import { CATALOG_BY_KIND, canConnect, entryOf, type EdgeClass } from '@/engine/catalog';
import type { Arch, ArchEdge, ArchNode, Config, EdgeConfig, Fault, Role } from '@/engine/types';

export const DEFAULT_EDGE: EdgeConfig = { weight: 1, timeoutMs: 3000, retries: 0, circuitBreaker: false };

let counter = 0;
export function uid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function makeNode(
  kind: string,
  position: { x: number; y: number },
  overrides: { id?: string; label?: string; config?: Config; faults?: Fault[] } = {},
): ArchNode {
  const entry = entryOf(kind);
  return {
    id: overrides.id ?? uid(kind),
    kind,
    label: overrides.label ?? entry.name,
    position,
    config: { ...clone(entry.defaults), ...(overrides.config ?? {}) },
    faults: overrides.faults,
  };
}

export function makeEdge(source: string, target: string, config: Partial<EdgeConfig> = {}, id?: string): ArchEdge {
  return { id: id ?? `e-${source}-${target}`, source, target, config: { ...DEFAULT_EDGE, ...config } };
}

/** Call weight a new connection starts with: data stores are hit more than once per request. */
export function defaultEdgeWeight(targetKind: string): number {
  const role = entryOf(targetKind).role;
  return role === 'db' || role === 'kv' ? 2 : 1;
}

export function nodeById(arch: Arch, id: string): ArchNode | undefined {
  return arch.nodes.find((n) => n.id === id);
}

export function roleOf(n: ArchNode): Role {
  return entryOf(n.kind).role;
}

export function edgeClass(arch: Arch, e: ArchEdge): EdgeClass {
  const s = nodeById(arch, e.source);
  const t = nodeById(arch, e.target);
  if (!s || !t) return 'traffic';
  return canConnect(s.kind, t.kind).cls ?? 'traffic';
}

/** Edges that carry requests/messages (sync or async), excluding attachments and deploy links. */
export function flowEdges(arch: Arch): ArchEdge[] {
  return arch.edges.filter((e) => {
    const c = edgeClass(arch, e);
    return c === 'traffic' || c === 'async';
  });
}

/** Components attached to `hostId` by an `attach` edge (policies, observability, backups...). */
export function attachedTo(arch: Arch, hostId: string): ArchNode[] {
  return arch.edges
    .filter((e) => e.target === hostId && edgeClass(arch, e) === 'attach')
    .map((e) => nodeById(arch, e.source))
    .filter((n): n is ArchNode => !!n);
}

/** Delivery components connected (directly) to a service. */
export function deliveryOf(arch: Arch, hostId: string): ArchNode[] {
  return arch.edges
    .filter((e) => e.target === hostId && edgeClass(arch, e) === 'deploy')
    .map((e) => nodeById(arch, e.source))
    .filter((n): n is ArchNode => !!n);
}

export function ofKind(arch: Arch, ...kinds: string[]): ArchNode[] {
  return arch.nodes.filter((n) => kinds.includes(n.kind));
}

export function ofRole(arch: Arch, ...roles: Role[]): ArchNode[] {
  return arch.nodes.filter((n) => roles.includes(roleOf(n)));
}

/** Topological order over flow edges (cycles tolerated: back edges ignored). */
export function topoOrder(arch: Arch): string[] {
  const out = new Map<string, string[]>();
  arch.nodes.forEach((n) => out.set(n.id, []));
  flowEdges(arch).forEach((e) => out.get(e.source)?.push(e.target));
  const state = new Map<string, 0 | 1 | 2>();
  const order: string[] = [];
  const visit = (id: string) => {
    if (state.get(id)) return;
    state.set(id, 1);
    for (const t of out.get(id) ?? []) if (!state.get(t)) visit(t);
    state.set(id, 2);
    order.push(id);
  };
  arch.nodes.filter((n) => roleOf(n) === 'source').forEach((n) => visit(n.id));
  arch.nodes.forEach((n) => visit(n.id));
  return order.reverse();
}

export function hasCycle(arch: Arch): boolean {
  const out = new Map<string, string[]>();
  arch.nodes.forEach((n) => out.set(n.id, []));
  arch.edges.filter((e) => edgeClass(arch, e) === 'traffic').forEach((e) => out.get(e.source)?.push(e.target));
  const color = new Map<string, number>();
  const dfs = (id: string): boolean => {
    color.set(id, 1);
    for (const t of out.get(id) ?? []) {
      const c = color.get(t) ?? 0;
      if (c === 1) return true;
      if (c === 0 && dfs(t)) return true;
    }
    color.set(id, 2);
    return false;
  };
  return arch.nodes.some((n) => (color.get(n.id) ?? 0) === 0 && dfs(n.id));
}

export interface ValidationIssue {
  nodeId?: string;
  severity: 'error' | 'warn';
  text: string;
}

/** Structural validation: missing dependencies, invalid configuration, unreachable components. */
export function validateArch(arch: Arch): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const ids = new Set(arch.nodes.map((n) => n.id));
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const e of arch.edges) {
    if (!ids.has(e.source) || !ids.has(e.target)) {
      issues.push({ severity: 'error', text: `Connection ${e.id} points at a component that no longer exists.` });
      continue;
    }
    const s = nodeById(arch, e.source)!;
    const t = nodeById(arch, e.target)!;
    const verdict = canConnect(s.kind, t.kind);
    if (!verdict.ok) issues.push({ nodeId: e.source, severity: 'error', text: `${s.label} → ${t.label}: ${verdict.reason}` });
    if (e.config.timeoutMs <= 0)
      issues.push({ nodeId: e.source, severity: 'error', text: `${s.label} → ${t.label}: timeout must be positive.` });
    if (e.config.weight < 0)
      issues.push({ nodeId: e.source, severity: 'error', text: `${s.label} → ${t.label}: call weight cannot be negative.` });
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
  }
  for (const n of arch.nodes) {
    const entry = CATALOG_BY_KIND[n.kind];
    if (!entry) {
      issues.push({ nodeId: n.id, severity: 'error', text: `${n.label}: unknown component type "${n.kind}".` });
      continue;
    }
    const role = entry.role;
    const c = n.config;
    for (const f of entry.fields) {
      if (f.type === 'number') {
        const v = c[f.key];
        if (typeof v !== 'number' || Number.isNaN(v))
          issues.push({ nodeId: n.id, severity: 'error', text: `${n.label}: "${f.label}" needs a numeric value.` });
        else if ((f.min != null && v < f.min) || (f.max != null && v > f.max))
          issues.push({ nodeId: n.id, severity: 'error', text: `${n.label}: "${f.label}" must be between ${f.min} and ${f.max}.` });
      }
      if (f.type === 'ref' && c[f.key]) {
        const target = nodeById(arch, c[f.key]);
        if (!target)
          issues.push({ nodeId: n.id, severity: 'error', text: `${n.label}: "${f.label}" references a component that does not exist.` });
        else if (f.refKinds && !f.refKinds.includes(target.kind))
          issues.push({ nodeId: n.id, severity: 'error', text: `${n.label}: "${f.label}" must reference a ${f.refKinds.join('/')}.` });
      }
    }
    if (role === 'compute' || role === 'worker') {
      if (c.autoscale && c.maxReplicas < c.replicas)
        issues.push({
          nodeId: n.id,
          severity: 'error',
          text: `${n.label}: max replicas (${c.maxReplicas}) is below the configured replicas (${c.replicas}).`,
        });
    }
    if (role === 'worker' && !arch.edges.some((e) => e.target === n.id && edgeClass(arch, e) === 'async')) {
      issues.push({ nodeId: n.id, severity: 'warn', text: `${n.label}: no queue feeds this worker, so it will never receive work.` });
    }
    if (
      role === 'queue' &&
      !c.isDlq &&
      !arch.edges.some((e) => e.source === n.id && edgeClass(arch, e) === 'async' && roleOf(nodeById(arch, e.target)!) !== 'queue')
    ) {
      issues.push({
        nodeId: n.id,
        severity: 'warn',
        text: `${n.label}: no consumer is connected — messages will accumulate until they expire.`,
      });
    }
    if (['db', 'kv', 'cache', 'storage', 'search', 'external'].includes(role) && !incoming.get(n.id)) {
      issues.push({
        nodeId: n.id,
        severity: 'warn',
        text: `${n.label}: nothing connects to it, so it receives no traffic (but still costs money).`,
      });
    }
    if (role === 'lb' && !outgoing.get(n.id)) {
      issues.push({ nodeId: n.id, severity: 'warn', text: `${n.label}: no targets are registered behind this load balancer.` });
    }
    if (
      ['compute', 'lb', 'gateway', 'waf', 'cdn', 'edge'].includes(role) &&
      !incoming.get(n.id) &&
      !arch.edges.some((e) => e.source === n.id && e.target !== n.id)
    ) {
      issues.push({ nodeId: n.id, severity: 'warn', text: `${n.label}: this component is not connected to anything.` });
    }
  }
  if (!arch.nodes.some((n) => roleOf(n) === 'source'))
    issues.push({ severity: 'warn', text: 'No traffic source on the canvas — add "Users / Traffic" so the simulation has a workload.' });
  if (hasCycle(arch))
    issues.push({ severity: 'warn', text: 'The synchronous call graph contains a cycle — requests can loop and amplify load.' });
  return issues;
}

export function archSignature(arch: Arch): string {
  return JSON.stringify({
    n: arch.nodes.map((n) => [n.id, n.kind, n.config, n.faults?.map((f) => f.id)]),
    e: arch.edges.map((e) => [e.id, e.source, e.target, e.config]),
  });
}

export interface ArchDiffItem {
  type: 'add' | 'remove' | 'change' | 'connect' | 'disconnect';
  text: string;
  nodeId?: string;
}

export function diffArch(before: Arch, after: Arch): ArchDiffItem[] {
  const out: ArchDiffItem[] = [];
  const b = new Map(before.nodes.map((n) => [n.id, n]));
  const a = new Map(after.nodes.map((n) => [n.id, n]));
  for (const n of after.nodes) {
    const o = b.get(n.id);
    if (!o) {
      out.push({ type: 'add', nodeId: n.id, text: `Add ${n.label}` });
      continue;
    }
    for (const k of new Set([...Object.keys(o.config), ...Object.keys(n.config)])) {
      if (JSON.stringify(o.config[k]) !== JSON.stringify(n.config[k])) {
        out.push({ type: 'change', nodeId: n.id, text: `${n.label}: ${k} ${fmt(o.config[k])} → ${fmt(n.config[k])}` });
      }
    }
    if (o.label !== n.label) out.push({ type: 'change', nodeId: n.id, text: `Rename ${o.label} → ${n.label}` });
  }
  for (const n of before.nodes) if (!a.has(n.id)) out.push({ type: 'remove', text: `Remove ${n.label}` });
  const be = new Map(before.edges.map((e) => [e.id, e]));
  const ae = new Map(after.edges.map((e) => [e.id, e]));
  const nm = (id: string) => (a.get(id) ?? b.get(id))?.label ?? id;
  for (const e of after.edges) {
    const o = be.get(e.id);
    if (!o) out.push({ type: 'connect', text: `Connect ${nm(e.source)} → ${nm(e.target)}` });
    else
      for (const k of Object.keys(e.config) as (keyof EdgeConfig)[]) {
        if (o.config[k] !== e.config[k])
          out.push({ type: 'change', text: `${nm(e.source)} → ${nm(e.target)}: ${k} ${fmt(o.config[k])} → ${fmt(e.config[k])}` });
      }
  }
  for (const e of before.edges) if (!ae.has(e.id)) out.push({ type: 'disconnect', text: `Disconnect ${nm(e.source)} → ${nm(e.target)}` });
  return out;
}

function fmt(v: unknown): string {
  if (v === undefined || v === '') return '∅';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}
