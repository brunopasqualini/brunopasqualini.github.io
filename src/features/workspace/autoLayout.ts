import { edgeClass, flowEdges, roleOf } from '@/engine/arch';
import type { Arch, ArchNode } from '@/engine/types';

export interface LayoutOptions {
  colWidth?: number;
  rowHeight?: number;
  origin?: { x: number; y: number };
}

const SIDE_ROLES = ['observability', 'policy', 'resilience', 'identity'];
const CARD_ROLES = ['db', 'kv', 'cache', 'search'];

/**
 * Left-to-right layered layout for a request path:
 *  - rank = longest path from the traffic sources along request/async edges (cycles are cut, never looped on)
 *  - nodes inside a rank are ordered by the average row of their callers, which untangles most crossings
 *  - monitoring, policies and identities sit directly beneath the component they attach to
 *  - network scaffolding (VPC, subnets, security groups…) and unconnected components form a tidy grid underneath
 * Pure: returns positions, mutates nothing.
 */
export function layoutArch(arch: Arch, opts: LayoutOptions = {}): Record<string, { x: number; y: number }> {
  const colW = opts.colWidth ?? 260;
  const rowH = opts.rowHeight ?? 250;
  const ox = opts.origin?.x ?? 40;
  const oy = opts.origin?.y ?? 40;
  const byId = new Map(arch.nodes.map((n) => [n.id, n]));

  const edges = flowEdges(arch).filter((e) => byId.has(e.source) && byId.has(e.target));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const e of edges) {
    (incoming.get(e.target) ?? incoming.set(e.target, []).get(e.target)!).push(e.source);
    (outgoing.get(e.source) ?? outgoing.set(e.source, []).get(e.source)!).push(e.target);
  }

  const inFlow = (n: ArchNode) => incoming.has(n.id) || outgoing.has(n.id) || roleOf(n) === 'source';
  const attachHost = new Map<string, string>();
  for (const e of arch.edges) {
    if (edgeClass(arch, e) === 'attach' && byId.has(e.target)) attachHost.set(e.source, e.target);
  }
  const flowNodes = arch.nodes.filter((n) => inFlow(n) && roleOf(n) !== 'network');
  const flowIds = new Set(flowNodes.map((n) => n.id));

  // rank by longest path (bounded relaxation: a cycle simply stops raising ranks)
  const rank = new Map<string, number>(flowNodes.map((n) => [n.id, 0]));
  for (let pass = 0; pass < flowNodes.length; pass++) {
    let changed = false;
    for (const e of edges) {
      if (!flowIds.has(e.source) || !flowIds.has(e.target)) continue;
      const want = (rank.get(e.source) ?? 0) + 1;
      if (want > (rank.get(e.target) ?? 0) && want <= flowNodes.length) {
        rank.set(e.target, want);
        changed = true;
      }
    }
    if (!changed) break;
  }

  const columns = new Map<number, ArchNode[]>();
  for (const n of flowNodes) (columns.get(rank.get(n.id) ?? 0) ?? columns.set(rank.get(n.id) ?? 0, []).get(rank.get(n.id) ?? 0)!).push(n);

  const pos: Record<string, { x: number; y: number }> = {};
  const row = new Map<string, number>();
  const ranks = [...columns.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    const col = columns.get(r)!;
    const bary = (n: ArchNode) => {
      const ups = (incoming.get(n.id) ?? []).map((id) => row.get(id)).filter((v): v is number => v !== undefined);
      return ups.length ? ups.reduce((a, b) => a + b, 0) / ups.length : Number.MAX_SAFE_INTEGER;
    };
    col.sort((a, b) => bary(a) - bary(b) || arch.nodes.indexOf(a) - arch.nodes.indexOf(b));
    // place each node as close to its callers' average row as free rows allow
    const used = new Set<number>();
    for (const n of col) {
      const want = Math.max(0, Math.round(Number.isFinite(bary(n)) && bary(n) < 1e9 ? bary(n) : used.size));
      let y = want;
      for (let d = 0; used.has(y); d++) y = d % 2 === 0 ? want + (d >> 1) + 1 : Math.max(0, want - ((d + 1) >> 1));
      while (used.has(y)) y++;
      used.add(y);
      row.set(n.id, y);
    }
  }

  const rows = Math.max(0, ...[...row.values()]) + 1;
  for (const n of flowNodes) {
    const w = CARD_ROLES.includes(roleOf(n)) ? 40 : 0; // cards are wider; nudge so tile centres roughly line up
    pos[n.id] = { x: ox + (rank.get(n.id) ?? 0) * colW - w, y: oy + (row.get(n.id) ?? 0) * rowH };
  }

  // side components hang under their host
  const hung = new Map<string, number>();
  for (const n of arch.nodes) {
    if (pos[n.id] || !SIDE_ROLES.includes(roleOf(n))) continue;
    const host = attachHost.get(n.id);
    const hp = host ? pos[host] : undefined;
    if (!hp) continue;
    const k = (hung.get(host!) ?? 0) + 1;
    hung.set(host!, k);
    pos[n.id] = { x: hp.x + (k - 1) * 0, y: hp.y + rowH * 0.9 * k };
  }

  // the rest: a grid below the flow area
  const rest = arch.nodes.filter((n) => !pos[n.id]);
  const perRow = Math.max(3, Math.min(6, ranks.length + 1));
  const baseY = oy + (rows + (hung.size ? 1 : 0)) * rowH + 40;
  rest.forEach((n, i) => {
    pos[n.id] = { x: ox + (i % perRow) * colW * 0.8, y: baseY + Math.floor(i / perRow) * rowH * 0.7 };
  });
  return pos;
}
