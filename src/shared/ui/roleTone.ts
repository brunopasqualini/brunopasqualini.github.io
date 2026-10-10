import type { Role } from '@/engine/types';

export type Tone =
  'source' | 'edge' | 'compute' | 'data' | 'messaging' | 'storage' | 'external' | 'network' | 'security' | 'delivery' | 'observe';

/** Component kinds whose colour differs from their role's family. */
const KIND_TONE: Record<string, Tone> = { autoscaling: 'compute' };

export const toneOfKind = (kind: string, role: Role): Tone => KIND_TONE[kind] ?? toneOf(role);

/** Maps a component role to its colour family (see --cat-* tokens): the same colour language everywhere. */
export function toneOf(role: Role): Tone {
  switch (role) {
    case 'source':
      return 'source';
    case 'edge':
    case 'cdn':
    case 'waf':
    case 'lb':
    case 'gateway':
      return 'edge';
    case 'compute':
    case 'worker':
      return 'compute';
    case 'db':
    case 'kv':
    case 'search':
    case 'cache':
      return 'data';
    case 'queue':
    case 'bus':
      return 'messaging';
    case 'storage':
      return 'storage';
    case 'external':
      return 'external';
    case 'network':
      return 'network';
    case 'identity':
    case 'policy':
      return 'security';
    case 'observability':
      return 'observe';
    case 'delivery':
    case 'resilience':
      return 'delivery';
  }
}
