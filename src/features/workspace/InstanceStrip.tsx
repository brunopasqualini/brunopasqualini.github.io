import type { ArchNode, NodeMetrics } from '@/engine/types';

/** Visual-only helper: the engine models load as an even split; real fleets wobble a little, so we add a small deterministic jitter. */
function jitter(id: string, i: number, minute: number): number {
  let h = 2166136261;
  const s = `${id}:${i}:${Math.floor(minute / 2)}`;
  for (let k = 0; k < s.length; k++) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000 - 0.5;
}

export interface Tile {
  key: string;
  kind: 'on' | 'ghost' | 'down' | 'primary' | 'standby' | 'replica';
  load: number;
  title: string;
  tag?: string;
}

const MAX_TILES = 12;

export function tilesFor(n: ArchNode, m: NodeMetrics | undefined, minute: number): Tile[] {
  if (!m) return [];
  const c = n.config;
  const down = m.status === 'unavailable';
  const tiles: Tile[] = [];
  const role = m.role;
  if (role === 'compute' || role === 'worker') {
    const max = Math.max(m.replicas, c.autoscale ? (c.maxReplicas ?? c.replicas) : c.replicas, 1);
    const live = m.replicas;
    const provisioned = down && live === 0 ? (c.replicas ?? 1) : live;
    for (let i = 0; i < Math.min(max, MAX_TILES); i++) {
      if (i < live) {
        const load = Math.max(0.03, Math.min(1, m.util * (1 + jitter(n.id, i, minute) * 0.22)));
        tiles.push({
          key: `i${i}`,
          kind: 'on',
          load,
          title: `instance ${i + 1}: ~${(m.offered / Math.max(1, live)).toFixed(0)} rps, ${(load * 100).toFixed(0)}% busy`,
        });
      } else if (i < provisioned) tiles.push({ key: `i${i}`, kind: 'down', load: 0, title: `instance ${i + 1}: down` });
      else tiles.push({ key: `i${i}`, kind: 'ghost', load: 0, title: `instance ${i + 1}: scaled in (autoscaling headroom)` });
    }
    return tiles;
  }
  if (role === 'db') {
    tiles.push({
      key: 'p',
      kind: down ? 'down' : 'primary',
      load: Math.min(1, m.util),
      tag: 'W',
      title: `primary: ${(m.util * 100).toFixed(0)}% busy`,
    });
    if (c.multiAZ)
      tiles.push({
        key: 's',
        kind: down ? 'down' : 'standby',
        load: 0.12,
        tag: 'S',
        title: 'synchronous standby in another AZ (failover target, serves no reads)',
      });
    const rr = Math.min(c.readReplicas ?? 0, MAX_TILES - 2);
    for (let i = 0; i < rr; i++) {
      const base = Math.min(1, m.util * 0.8);
      tiles.push({
        key: `r${i}`,
        kind: down ? 'down' : 'replica',
        load: Math.max(0.04, Math.min(1, base * (1 + jitter(n.id, i, minute) * 0.25))),
        tag: 'R',
        title: `read replica ${i + 1}: lag ≈ ${(m.replicaLagSec ?? 0).toFixed(1)}s`,
      });
    }
    return tiles;
  }
  if (role === 'cache') {
    const k = Math.min(c.nodes ?? 1, MAX_TILES);
    for (let i = 0; i < k; i++)
      tiles.push({
        key: `c${i}`,
        kind: down ? 'down' : 'on',
        load: Math.max(0.05, Math.min(1, (m.hitRate ?? 0.5) * (1 + jitter(n.id, i, minute) * 0.1))),
        title: `cache node ${i + 1}: hit ${((m.hitRate ?? 0) * 100).toFixed(0)}%`,
      });
    return tiles;
  }
  return tiles;
}

export function Strip({ tiles, label }: { tiles: Tile[]; label?: string }) {
  if (!tiles.length) return null;
  return (
    <div className="istrip" aria-label={label}>
      {tiles.map((t) => (
        <span key={t.key} className={`itile it-${t.kind} ${t.load > 0.9 ? 'it-hot' : t.load > 0.7 ? 'it-warm' : ''}`} title={t.title}>
          <i style={{ height: `${Math.round(t.load * 100)}%` }} />
          {t.tag && <b>{t.tag}</b>}
        </span>
      ))}
      {label && <em>{label}</em>}
    </div>
  );
}

export function QueueDots({ depth, dlq }: { depth: number; dlq: number }) {
  const filled = Math.min(14, Math.ceil(Math.log10(1 + depth) * 3.2));
  const dead = Math.min(4, Math.ceil(Math.log10(1 + dlq) * 1.6));
  return (
    <div className="qdots" title={`${Math.round(depth)} waiting${dlq ? `, ${Math.round(dlq)} dead-lettered` : ''}`}>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className={i < filled ? 'on' : ''} />
      ))}
      {dead > 0 && Array.from({ length: dead }, (_, i) => <span key={`d${i}`} className="dead" />)}
    </div>
  );
}
