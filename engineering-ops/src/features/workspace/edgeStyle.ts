import type { EdgeClass } from '@/engine/catalog';
import type { Role } from '@/engine/types';

/**
 * Connector language (matches the reference diagram):
 *  - solid blue + arrowhead: synchronous request path
 *  - dashed orange: asynchronous work (queues, events) and autoscaling attachments
 *  - dashed pink, no arrowhead: monitoring / observability attached to a component
 *  - dashed green: object storage links
 *  - solid blue with arrowheads at both ends: cache <-> database
 *  - red (solid) when failing, red dashed when blocked
 */
export const EDGE_COLOR = {
  request: '#3b9eff',
  async: '#fb923c',
  monitor: '#f472b6',
  storage: '#4ade80',
  policy: '#fb923c',
  deploy: '#5b8cd8',
  warn: '#f59e0b',
  bad: '#ef4444',
} as const;

export interface EdgeLook {
  color: string;
  dash?: string;
  arrow: boolean;
  bidirectional: boolean;
  width: number;
  kind: 'request' | 'async' | 'monitor' | 'storage' | 'policy' | 'deploy';
}

export function edgeLook(cls: EdgeClass, source: Role | undefined, target: Role | undefined): EdgeLook {
  if (cls === 'attach') {
    const monitor = source === 'observability';
    return {
      kind: monitor ? 'monitor' : 'policy',
      color: monitor ? EDGE_COLOR.monitor : EDGE_COLOR.policy,
      dash: '6 5',
      arrow: false,
      bidirectional: false,
      width: 1.6,
    };
  }
  if (cls === 'deploy') return { kind: 'deploy', color: EDGE_COLOR.deploy, dash: '3 5', arrow: false, bidirectional: false, width: 1.4 };
  if (cls === 'async') return { kind: 'async', color: EDGE_COLOR.async, dash: '7 5', arrow: true, bidirectional: false, width: 1.8 };
  if (source === 'storage' || target === 'storage') {
    return { kind: 'storage', color: EDGE_COLOR.storage, dash: '7 5', arrow: true, bidirectional: false, width: 1.8 };
  }
  const cacheToStore = source === 'cache' && (target === 'db' || target === 'kv' || target === 'search');
  return { kind: 'request', color: EDGE_COLOR.request, arrow: true, bidirectional: cacheToStore, width: 1.8 };
}
