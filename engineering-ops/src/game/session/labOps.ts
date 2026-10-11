import type { Session } from './types';
import { clone } from '@/engine/arch';
import type { Chaos } from '@/engine/engine';
import type { Workload } from '@/engine/types';

export function setChaos(s: Session, chaos: Chaos[], log = true) {
  s.chaos = chaos;
  s.events.push({
    minute: s.minute,
    kind: 'chaos',
    text: chaos.length ? `Chaos injected: ${chaos.map(describeChaos).join(', ')}` : 'Chaos cleared.',
  });
  if (log) s.ops.push({ op: 'chaos', chaos: clone(chaos) });
}

export function describeChaos(c: Chaos): string {
  switch (c.type) {
    case 'az-outage':
      return `AZ ${c.az} outage`;
    case 'node-down':
      return `component ${c.nodeId} down`;
    case 'slow':
      return `${c.nodeId} ×${c.mult} slower`;
    case 'spike':
      return `traffic ×${c.mult}`;
  }
}

export function patchWorkload(s: Session, patch: Partial<Workload>, log = true) {
  s.workload = { ...s.workload, ...patch };
  if (log) s.ops.push({ op: 'workload', patch: clone(patch) });
}
