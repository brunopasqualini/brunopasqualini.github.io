import { describe, expect, it } from 'vitest';
import {
  breathSeconds,
  detectMoments,
  dropAt,
  momentLabel,
  nextFxLevel,
  packetCap,
  packetSpeed,
  parseFxLevel,
  spawnIntervalMs,
  type Observed,
} from '@/features/workspace/effects/fx';

const obs = (o: Partial<Observed> = {}): Observed => ({ status: 'healthy', replicas: 2, pending: false, changed: false, ...o });

describe('effects level', () => {
  it('defaults to subtle and ignores garbage', () => {
    expect(parseFxLevel(null)).toBe('subtle');
    expect(parseFxLevel('loud')).toBe('subtle');
    expect(parseFxLevel('full')).toBe('full');
    expect(parseFxLevel('off')).toBe('off');
  });
  it('cycles subtle → full → off → subtle', () => {
    expect(nextFxLevel('subtle')).toBe('full');
    expect(nextFxLevel('full')).toBe('off');
    expect(nextFxLevel('off')).toBe('subtle');
  });
});

describe('packet density', () => {
  it('sends nothing when effects are off or the connector is idle', () => {
    expect(spawnIntervalMs(100, 'off', 1)).toBeNull();
    expect(spawnIntervalMs(0.2, 'full', 1)).toBeNull();
    expect(spawnIntervalMs(0, 'subtle', 1)).toBeNull();
  });
  it('busier connectors get more packets, but not proportionally more', () => {
    const quiet = spawnIntervalMs(5, 'subtle', 1)!;
    const busy = spawnIntervalMs(500, 'subtle', 1)!;
    expect(busy).toBeLessThan(quiet);
    expect(quiet / busy).toBeLessThan(5); // 100× the traffic is nowhere near 100× the dots
  });
  it('full is denser than subtle, and fast-forward thins packets out', () => {
    expect(spawnIntervalMs(100, 'full', 1)!).toBeLessThan(spawnIntervalMs(100, 'subtle', 1)!);
    expect(spawnIntervalMs(100, 'full', 16)!).toBeGreaterThan(spawnIntervalMs(100, 'full', 1)!);
  });
  it('never spawns faster than the floor', () => {
    expect(spawnIntervalMs(1e9, 'full', 1)!).toBeGreaterThanOrEqual(170);
  });
  it('packets slow down on a struggling target', () => {
    expect(packetSpeed('subtle', 1, true)).toBeLessThan(packetSpeed('subtle', 1, false));
  });
  it('caps live packets, fewer when zoomed out or on a slow machine', () => {
    expect(packetCap('full', 2, 1)).toBeGreaterThan(packetCap('subtle', 2, 1));
    expect(packetCap('subtle', 0, 1)).toBeLessThan(packetCap('subtle', 2, 1));
    expect(packetCap('full', 2, 0.35)).toBeLessThan(packetCap('full', 2, 1));
    expect(packetCap('subtle', 0, 0.01)).toBeGreaterThanOrEqual(12);
  });
});

describe('dropped packets', () => {
  it('a healthy connector drops nothing', () => {
    expect(dropAt({ errorRate: 0, blocked: false }, 0, 0.5)).toBeNull();
    expect(dropAt({ errorRate: 0.01, blocked: false }, 0, 0.5)).toBeNull();
  });
  it('the share of dropped packets follows the error rate', () => {
    const e = { errorRate: 0.4, blocked: false };
    expect(dropAt(e, 0.39, 0.5)).not.toBeNull();
    expect(dropAt(e, 0.41, 0.5)).toBeNull();
    const at = dropAt(e, 0, 0.5)!;
    expect(at).toBeGreaterThan(0.3);
    expect(at).toBeLessThan(0.85);
  });
  it('a blocked connector drops every packet, near the far end', () => {
    for (const r of [0, 0.5, 0.999]) {
      const at = dropAt({ errorRate: 0, blocked: true }, r, r)!;
      expect(at).toBeGreaterThanOrEqual(0.82);
      expect(at).toBeLessThan(0.96);
    }
  });
});

describe('moments', () => {
  it('stays quiet for a component seen for the first time', () => {
    expect(detectMoments({}, { a: obs({ status: 'unavailable' }) }, 1)).toEqual({});
  });
  it('does not flag an idle component waking up as a hit', () => {
    for (const s of ['degraded', 'overloaded', 'unavailable'])
      expect(detectMoments({ a: obs({ status: 'idle' }) }, { a: obs({ status: s }) }, 1)).toEqual({});
  });
  it('flags a healthy component that goes bad as a hit', () => {
    for (const s of ['degraded', 'overloaded', 'unavailable'])
      expect(detectMoments({ a: obs() }, { a: obs({ status: s }) }, 7).a).toEqual({ kind: 'hit', at: 7 });
  });
  it('flags a bad component that heals as recovered, but not a still-bad one', () => {
    expect(detectMoments({ a: obs({ status: 'overloaded' }) }, { a: obs() }, 1).a.kind).toBe('recover');
    expect(detectMoments({ a: obs({ status: 'overloaded' }) }, { a: obs({ status: 'degraded' }) }, 1)).toEqual({});
  });
  it('reports the replica delta when autoscaling or a deploy changes the fleet', () => {
    expect(detectMoments({ a: obs({ replicas: 2 }) }, { a: obs({ replicas: 5 }) }, 1).a).toEqual({ kind: 'scale-out', delta: 3, at: 1 });
    expect(detectMoments({ a: obs({ replicas: 5 }) }, { a: obs({ replicas: 4 }) }, 1).a).toEqual({ kind: 'scale-in', delta: -1, at: 1 });
  });
  it('flags a deploy when pending or edited components go live', () => {
    expect(detectMoments({ a: obs({ pending: true }) }, { a: obs() }, 1).a.kind).toBe('deploy');
    expect(detectMoments({ a: obs({ changed: true }) }, { a: obs() }, 1).a.kind).toBe('deploy');
  });
  it('shows one moment per component, and a hit outranks a scale', () => {
    const m = detectMoments({ a: obs({ replicas: 2 }) }, { a: obs({ status: 'overloaded', replicas: 6 }) }, 1);
    expect(m.a.kind).toBe('hit');
  });
  it('ignores components that did not change', () => {
    expect(detectMoments({ a: obs() }, { a: obs() }, 1)).toEqual({});
  });
  it('labels scale, recover and deploy moments', () => {
    expect(momentLabel({ kind: 'scale-out', delta: 2, at: 1 })).toBe('+2');
    expect(momentLabel({ kind: 'scale-in', delta: -1, at: 1 })).toBe('-1');
    expect(momentLabel({ kind: 'recover', at: 1 })).toBe('recovered');
    expect(momentLabel({ kind: 'deploy', at: 1 })).toBe('deployed');
    expect(momentLabel({ kind: 'hit', at: 1 })).toBeUndefined();
  });
});

describe('breathing', () => {
  it('beats faster the busier a component is, within bounds', () => {
    expect(breathSeconds(0)).toBeGreaterThan(breathSeconds(0.5));
    expect(breathSeconds(0.5)).toBeGreaterThan(breathSeconds(1));
    expect(breathSeconds(5)).toBe(breathSeconds(1));
    expect(breathSeconds(-1)).toBe(breathSeconds(0));
  });
});
