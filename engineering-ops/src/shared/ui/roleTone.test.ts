import { describe, expect, it } from 'vitest';
import { CATALOG } from '@/engine/catalog';
import { toneOf } from '@/shared/ui/roleTone';

describe('roleTone', () => {
  it('gives every catalog component a colour family', () => {
    for (const e of CATALOG) expect(toneOf(e.role), `${e.kind} (${e.role})`).toBeTruthy();
  });
  it('keeps data stores, compute and messaging visually distinct', () => {
    expect(new Set([toneOf('db'), toneOf('compute'), toneOf('queue'), toneOf('storage')]).size).toBe(4);
    expect(toneOf('cache')).toBe(toneOf('db'));
  });
});
