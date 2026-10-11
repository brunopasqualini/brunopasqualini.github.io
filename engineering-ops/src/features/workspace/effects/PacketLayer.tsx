import { ViewportPortal } from '@xyflow/react';
import { useEffect, useRef } from 'react';
import {
  DROP_COLOR,
  PACKET_COLOR,
  dropAt,
  packetCap,
  packetSpeed,
  spawnIntervalMs,
  type FxEdge,
  type FxLevel,
} from '@/features/workspace/effects/fx';

interface Props {
  edges: FxEdge[];
  level: FxLevel;
  running: boolean;
  speed: 1 | 4 | 16;
  detail: 0 | 1 | 2;
}

const NS = 'http://www.w3.org/2000/svg';
const DIE_MS = 300;

interface Packet {
  p: number;
  v: number;
  dropAt: number | null;
  dyingFor: number;
  head: SVGCircleElement;
  tails: SVGCircleElement[];
}
interface EdgeState {
  next: number;
  /** The rendered connector, when React Flow currently has it mounted (it re-mounts connectors on a tick). */
  src: Element | null;
  /** Our own hidden copy of the connector's geometry, so packets survive those re-mounts. */
  geo: SVGPathElement;
  d: string;
  len: number;
  packets: Packet[];
}

const arrivedAt = new Map<string, number>();

/** Escape a value for use inside a double-quoted attribute selector. */
const q = (s: string) => s.replace(/["\\]/g, '\\$&');

/** Flash the receiving component. Throttled per node so a busy connector does not strobe. */
function arrive(root: ParentNode, id: string, color: string, now: number): void {
  if (now - (arrivedAt.get(id) ?? -1e9) < 260) return;
  arrivedAt.set(id, now);
  const tile = root.querySelector(`.react-flow__node[data-id="${q(id)}"] .anode-tile`) as HTMLElement | null;
  if (!tile) return;
  tile.style.setProperty('--rc', color);
  tile.classList.remove('fx-arrive');
  void tile.offsetWidth; // restart the one-shot animation
  tile.classList.add('fx-arrive');
}

/**
 * Packets travelling along the live connectors. Imperative on purpose: one requestAnimationFrame loop moving
 * a few dozen SVG circles, with no React state, so a busy diagram never re-renders per frame.
 * It lives in the flow viewport, above the connectors and below the components, so it pans and zooms with them.
 */
export function PacketLayer(props: Props) {
  const { level, running } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const active = running && level !== 'off';

  useEffect(() => {
    const svg = svgRef.current;
    if (!active || !svg || typeof requestAnimationFrame !== 'function') return;
    const root: ParentNode = svg.closest('.react-flow') ?? document;
    const states = new Map<string, EdgeState>();
    let raf = 0;
    let last = performance.now();
    let perf = 1;
    let slowMs = 0;
    let frames = 0;

    const circle = (edgeId: string, r: number, fill: string, opacity: number) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('r', String(r));
      c.setAttribute('fill', fill);
      c.setAttribute('opacity', String(opacity));
      c.style.color = fill;
      c.setAttribute('class', 'fx-packet');
      c.dataset.edge = edgeId;
      svg.appendChild(c);
      return c;
    };
    const remove = (k: Packet) => {
      k.head.remove();
      k.tails.forEach((t) => t.remove());
    };

    const frame = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      // performance governor: if frames keep taking too long, quietly thin the packets out
      frames++;
      slowMs += dt > 42 ? dt : 0;
      if (frames >= 90) {
        perf = slowMs > 1200 ? Math.max(0.35, perf * 0.7) : slowMs < 200 ? Math.min(1, perf * 1.1) : perf;
        frames = 0;
        slowMs = 0;
      }
      const cfg = live.current;
      const cap = packetCap(cfg.level, cfg.detail, perf);
      const tailN = cfg.level === 'full' && cfg.detail > 0 ? 2 : cfg.level === 'subtle' && cfg.detail > 0 ? 1 : 0;
      let total = 0;
      for (const s of states.values()) total += s.packets.length;
      const seen = new Set<string>();

      for (const e of cfg.edges) {
        seen.add(e.id);
        let s = states.get(e.id);
        if (!s) {
          const geo = document.createElementNS(NS, 'path');
          geo.setAttribute('style', 'fill:none;stroke:none');
          svg.appendChild(geo);
          s = { next: Math.random() * 600, src: null, geo, d: '', len: 0, packets: [] };
          states.set(e.id, s);
        }
        if (!s.src || !s.src.isConnected) s.src = root.querySelector(`.react-flow__edge[data-id="${q(e.id)}"] path.react-flow__edge-path`);
        const d = s.src?.getAttribute('d');
        if (d && d !== s.d) {
          s.d = d;
          s.geo.setAttribute('d', d);
          s.len = typeof s.geo.getTotalLength === 'function' ? s.geo.getTotalLength() : 0; // connectors re-route when components move
        }
        const path = s.geo;
        const interval = spawnIntervalMs(e.rps, cfg.level, cfg.speed);
        s.next -= dt;
        if (s.len > 8 && interval !== null && s.next <= 0 && total < cap) {
          s.next = interval * (0.7 + Math.random() * 0.6);
          const color = PACKET_COLOR[e.tone];
          s.packets.push({
            p: 0,
            v: packetSpeed(cfg.level, cfg.speed, e.slow),
            dropAt: dropAt(e, Math.random(), Math.random()),
            dyingFor: -1,
            head: circle(e.id, cfg.level === 'full' ? 4.4 : 3.4, color, 1),
            tails: Array.from({ length: tailN }, (_, i) =>
              circle(e.id, (cfg.level === 'full' ? 3.2 : 2.6) - i * 0.9, color, 0.5 - i * 0.2),
            ),
          });
          total++;
        }
        const color = PACKET_COLOR[e.tone];
        const keep: Packet[] = [];
        for (const k of s.packets) {
          if (s.len <= 8) {
            remove(k);
            continue;
          }
          if (k.dyingFor >= 0) {
            k.dyingFor += dt;
            const u = k.dyingFor / DIE_MS;
            if (u >= 1) {
              remove(k);
              continue;
            }
            k.head.setAttribute('r', String(4.5 + u * 6));
            k.head.setAttribute('opacity', String(0.9 * (1 - u)));
            keep.push(k);
            continue;
          }
          k.p += (k.v * dt) / 1000 / s.len;
          if (k.dropAt !== null && k.p >= k.dropAt) {
            k.dyingFor = 0;
            k.head.setAttribute('fill', DROP_COLOR);
            k.head.style.color = DROP_COLOR;
            k.tails.forEach((t) => t.remove());
            k.tails = [];
            keep.push(k);
            continue;
          }
          if (k.p >= 0.985) {
            if (cfg.level === 'full') arrive(root, e.target, color, now);
            remove(k);
            continue;
          }
          const at = (q: number) => path.getPointAtLength(Math.max(0, q) * s.len);
          const h = at(k.p);
          k.head.setAttribute('cx', h.x.toFixed(1));
          k.head.setAttribute('cy', h.y.toFixed(1));
          k.tails.forEach((t, i) => {
            const pt = at(k.p - 0.02 * (i + 1));
            t.setAttribute('cx', pt.x.toFixed(1));
            t.setAttribute('cy', pt.y.toFixed(1));
          });
          keep.push(k);
        }
        s.packets = keep;
      }
      for (const [id, s] of states) {
        if (!seen.has(id)) {
          s.packets.forEach(remove);
          s.geo.remove();
          states.delete(id);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      svg.replaceChildren();
    };
  }, [active]);

  if (!active) return null;
  return (
    <ViewportPortal>
      <svg ref={svgRef} className="fx-layer" aria-hidden="true" />
    </ViewportPortal>
  );
}
