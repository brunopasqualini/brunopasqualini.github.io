import { describe, expect, it } from 'vitest';
import { makeNode } from '@/engine/arch';
import { analyzeRecovery } from '@/engine/analysis';
import type { Arch } from '@/engine/types';

const node = (kind: string, id: string, config: Record<string, unknown> = {}) => makeNode(kind, { x: 0, y: 0 }, { id, config });
const arch = (...extra: ReturnType<typeof node>[]): Arch => ({
  nodes: [node('rds', 'db', { multiAZ: true, size: 'medium' }), ...extra],
  edges: [],
});

describe('losing a whole Region', () => {
  it('with nothing stored elsewhere, you wait for the Region and may lose days of data', () => {
    const r = analyzeRecovery(arch(node('backup', 'b', { frequencyHours: 24 })));
    expect(r.regionRtoMinutes).toBe(2880);
    expect(r.regionRpoMinutes).toBeGreaterThanOrEqual(1440);
  });

  it('Multi-AZ and same-Region backups do not survive a Region loss', () => {
    const r = analyzeRecovery(arch(node('backup', 'b', { frequencyHours: 1, restoreTested: true })));
    expect(r.multiAZ).toBe(true);
    expect(r.regionRtoMinutes).toBe(2880);
  });

  it('a cross-Region replica gives seconds-to-minutes of data loss', () => {
    const a = arch(node('dr-config', 'dr', { strategy: 'pilot-light' }));
    a.nodes[0].config.crossRegionReplica = true;
    const r = analyzeRecovery(a);
    expect(r.regionRpoMinutes).toBeLessThanOrEqual(5);
    expect(r.regionRtoMinutes).toBe(60);
  });

  it('a cross-Region backup is only as fresh as its schedule', () => {
    const r = analyzeRecovery(
      arch(node('backup', 'b', { frequencyHours: 6, crossRegion: true }), node('dr-config', 'dr', { strategy: 'backup-restore' })),
    );
    expect(r.regionRpoMinutes).toBe(360);
  });

  it('warmer strategies restore faster', () => {
    const rto = (strategy: string) => {
      const a = arch(node('dr-config', 'dr', { strategy }));
      a.nodes[0].config.crossRegionReplica = true;
      return analyzeRecovery(a).regionRtoMinutes;
    };
    expect(rto('active-active')).toBeLessThan(rto('warm-standby'));
    expect(rto('warm-standby')).toBeLessThan(rto('pilot-light'));
    expect(rto('pilot-light')).toBeLessThan(rto('backup-restore'));
  });
});
