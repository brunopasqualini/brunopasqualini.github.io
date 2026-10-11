/**
 * Canvas effects: pure decisions only (how many packets, which die, what changed). No DOM, no React,
 * so the rules are unit-testable and the animation layer stays a thin renderer.
 *
 * Every effect encodes something the engine already reports: traffic volume, error share, load, status
 * transitions, replica counts. Nothing here is decoration, and nothing feeds back into the simulation.
 */
export type FxLevel = 'off' | 'subtle' | 'full';
export const FX_ORDER: readonly FxLevel[] = ['subtle', 'full', 'off'];
export const FX_LABEL: Record<FxLevel, string> = { off: 'Off', subtle: 'Subtle', full: 'Full' };
export const FX_DEFAULT: FxLevel = 'subtle';

export function parseFxLevel(raw: string | null | undefined): FxLevel {
  return raw === 'off' || raw === 'subtle' || raw === 'full' ? raw : FX_DEFAULT;
}
export function nextFxLevel(l: FxLevel): FxLevel {
  return FX_ORDER[(FX_ORDER.indexOf(l) + 1) % FX_ORDER.length];
}

export type PacketTone = 'request' | 'async' | 'storage';
export const PACKET_COLOR: Record<PacketTone, string> = { request: '#7cc4ff', async: '#ffc08a', storage: '#8af0b0' };
export const DROP_COLOR = '#ff5d5d';

/** A traffic connector as the animation layer needs it. */
export interface FxEdge {
  id: string;
  target: string;
  tone: PacketTone;
  rps: number;
  errorRate: number;
  blocked: boolean;
  /** The downstream component is struggling, so requests visibly take longer to arrive. */
  slow: boolean;
}

/**
 * One dot stands for a share of the traffic, not for one request (400 rps cannot be drawn as 400 dots a second).
 * Density grows with log10(rps): a 10× busier connector looks clearly busier, not ten times noisier.
 * Returns the mean gap between packets in ms, or null when nothing flows.
 */
export function spawnIntervalMs(rps: number, level: FxLevel, speed: 1 | 4 | 16): number | null {
  if (level === 'off' || !(rps >= 0.5)) return null;
  const density = 0.6 + Math.log10(1 + rps) * 0.7;
  const base = level === 'full' ? 700 : 1250;
  const pace = speed === 16 ? 2.4 : speed === 4 ? 1.4 : 1;
  return Math.max(170, (base * pace) / density);
}

export function packetSpeed(level: FxLevel, speed: 1 | 4 | 16, slow: boolean): number {
  const s = (level === 'full' ? 150 : 130) * (speed === 16 ? 1.9 : speed === 4 ? 1.3 : 1);
  return slow ? s * 0.6 : s;
}

/** Hard cap on live packets: the whole layer must stay cheap. Fewer when zoomed out, fewer again on a slow machine. */
export function packetCap(level: FxLevel, detail: 0 | 1 | 2, perf: number): number {
  const base = level === 'full' ? 150 : 70;
  return Math.max(12, Math.round(base * (detail === 0 ? 0.5 : 1) * perf));
}

/** Where along its path a packet is dropped, or null if it gets through. `r1`/`r2` are uniform [0,1) draws. */
export function dropAt(e: Pick<FxEdge, 'errorRate' | 'blocked'>, r1: number, r2: number): number | null {
  if (e.blocked) return 0.82 + r2 * 0.13; // rejected at the far end
  const share = Math.min(1, Math.max(0, e.errorRate));
  if (share < 0.02 || r1 >= share) return null;
  return 0.3 + r2 * 0.55;
}

export interface Observed {
  status: string;
  replicas?: number;
  pending: boolean;
  changed: boolean;
}
export type MomentKind = 'hit' | 'recover' | 'scale-out' | 'scale-in' | 'deploy';
export interface Moment {
  kind: MomentKind;
  /** Replica delta for scale moments. */
  delta?: number;
  /** Unique per moment so the one-shot CSS animation restarts. */
  at: number;
}
const BAD = new Set(['degraded', 'overloaded', 'unavailable']);

/**
 * What just happened to each component, from two consecutive observations. A component seen for the first time
 * never produces a moment, and neither does an idle one waking up (idle is not a healthy state to fall from), so
 * opening a mission or pressing Run does not flash the whole diagram.
 */
export function detectMoments(prev: Record<string, Observed>, next: Record<string, Observed>, stamp: number): Record<string, Moment> {
  const out: Record<string, Moment> = {};
  for (const [id, n] of Object.entries(next)) {
    const p = prev[id];
    if (!p) continue;
    if (p.status === 'healthy' && BAD.has(n.status)) out[id] = { kind: 'hit', at: stamp };
    else if (BAD.has(p.status) && n.status === 'healthy') out[id] = { kind: 'recover', at: stamp };
    else if (p.replicas !== undefined && n.replicas !== undefined && p.replicas !== n.replicas) {
      const delta = n.replicas - p.replicas;
      out[id] = { kind: delta > 0 ? 'scale-out' : 'scale-in', delta, at: stamp };
    } else if ((p.pending && !n.pending) || (p.changed && !n.changed)) out[id] = { kind: 'deploy', at: stamp };
  }
  return out;
}

/** Breathing period: an idle component rests slowly, a busy one beats faster. */
export function breathSeconds(util: number): number {
  return +(4.2 - Math.min(1, Math.max(0, util)) * 2.6).toFixed(2);
}

export function momentLabel(m: Moment): string | undefined {
  switch (m.kind) {
    case 'scale-out':
      return `+${m.delta}`;
    case 'scale-in':
      return `${m.delta}`;
    case 'recover':
      return 'recovered';
    case 'deploy':
      return 'deployed';
    default:
      return undefined;
  }
}
