import { describe, expect, it } from 'vitest';
import type { ADR, Decision } from '@/content/missions/types';
import { DOCUMENTED, isDocumented, resolveDecisions, tagsFor } from '@/game/decisions';
import { createSession } from '@/game/session';

const adr = (cons: string): ADR => ({
  id: 'a',
  title: 't',
  context: '',
  problem: '',
  options: '',
  decision: 'Hide the query pattern behind a cache for now and fix it next quarter.',
  pros: '',
  cons,
  implications: '',
  minute: 0,
});
const WRITTEN = adr(
  'The pattern stays in the code and returns when the cache is cold; we accept that until the batching work is scheduled.',
);
const shortcut: Decision = { tag: 'x:shortcut', label: 'l', carries: 'c', shortcut: true };

describe('decision judgement', () => {
  it('calls a shortcut taken blind and unrecorded debt, and says what was missing', () => {
    const [d] = resolveDecisions([shortcut], { adrs: [], informed: false });
    expect(d.kind).toBe('debt');
    expect(d.judgement).toMatch(/did not check the evidence/);
    expect(d.judgement).toMatch(/no reason was written down/);
  });

  it('calls the same shortcut a justified trade-off when it was informed and written down', () => {
    const [d] = resolveDecisions([shortcut], { adrs: [WRITTEN], informed: true });
    expect(d.kind).toBe('tradeoff');
    expect(d.judgement).toMatch(/justified/);
  });

  it('needs both: evidence alone, or a record alone, is still debt', () => {
    expect(resolveDecisions([shortcut], { adrs: [], informed: true })[0].kind).toBe('debt');
    expect(resolveDecisions([shortcut], { adrs: [WRITTEN], informed: false })[0].kind).toBe('debt');
  });

  it('does not count a token ADR as documentation', () => {
    expect(isDocumented({ adrs: [adr('meh')] })).toBe(false);
  });

  it('keeps investments and authored trade-offs as they are', () => {
    const [i, t] = resolveDecisions(
      [
        { tag: 'a', label: '', carries: '' },
        { tag: 'b', label: '', carries: '', kind: 'tradeoff' },
      ],
      { adrs: [], informed: false },
    );
    expect(i.kind).toBe('investment');
    expect(t.kind).toBe('tradeoff');
  });

  it('marks only justified shortcuts as documented for later missions', () => {
    const ok = resolveDecisions([shortcut], { adrs: [WRITTEN], informed: true });
    const bad = resolveDecisions([shortcut], { adrs: [], informed: false });
    expect(tagsFor(ok)).toEqual(['x:shortcut', 'x:shortcut' + DOCUMENTED]);
    expect(tagsFor(bad)).toEqual(['x:shortcut']);
  });
});

describe('a documented trade-off is cheaper to carry than the same debt', () => {
  const edge = (s: ReturnType<typeof createSession>) => s.live.edges.find((e) => e.id === 'e-shop-shop-db')!.config.weight;
  const start = (tags: string[]) => createSession('m9-merger', 'advanced', 1, undefined, tags);

  it('the cached N+1 is milder when it was a documented choice', () => {
    const tag = 'm7-n-plus-one:hid-it-behind-a-cache';
    expect(edge(start([tag, tag + DOCUMENTED]))).toBeLessThan(edge(start([tag])));
  });

  it('a documented slow query hurts less at peak than an undocumented one', () => {
    const tag = 'm2-db-meltdown:scaled-the-database';
    expect(start([tag, tag + DOCUMENTED]).workload.slowQueryShare).toBeLessThan(start([tag]).workload.slowQueryShare);
  });

  it('the intro text tells the player which one they inherited', () => {
    const tag = 'm8-impatient-client:left-retries-loose';
    expect(start([tag, tag + DOCUMENTED]).consequences[0].text).toMatch(/knowingly/);
    expect(start([tag]).consequences[0].text).not.toMatch(/knowingly/);
  });
});
