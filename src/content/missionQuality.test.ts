import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSIONS } from '@/content/missions';
import type { PanelId } from '@/content/missions/types';

/**
 * Every mission must carry the whole learning loop, not just a scenario: evidence to investigate, a hypothesis to test
 * against it, alternatives with the circumstances that favour each, and golden tests for the fix and the tempting
 * mistakes. A new mission that skips a step fails here instead of shipping half a lesson.
 */
const PANELS: PanelId[] = [
  'overview',
  'logs',
  'metrics',
  'traces',
  'dependencies',
  'deployments',
  'cost',
  'security',
  'alerts',
  'database',
  'queues',
  'network',
  'notes',
];
const goldenSource = readFileSync(resolve(import.meta.dirname, '../game/missions.test.ts'), 'utf8');

describe.each(MISSIONS)('learning loop: $id', (m) => {
  it('gives the player something to investigate and a hypothesis to test against it', () => {
    expect(m.rootCauses.length, 'candidate causes').toBeGreaterThanOrEqual(3);
    expect(
      m.rootCauses.some((c) => c.correct),
      'a real cause',
    ).toBe(true);
    expect(
      m.rootCauses.some((c) => !c.correct),
      'a red herring',
    ).toBe(true);
    for (const c of m.rootCauses) {
      expect(c.evidencePanels.length, `${c.id} evidence`).toBeGreaterThan(0);
      for (const p of c.evidencePanels) expect(PANELS, `${c.id} panel`).toContain(p);
      expect(c.why.length, `${c.id} explanation`).toBeGreaterThanOrEqual(40);
    }
  });

  it('points beginners at the panels that hold the evidence for the real cause', () => {
    const needed = new Set(m.rootCauses.filter((c) => c.correct).flatMap((c) => c.evidencePanels));
    const guided = new Set(m.guidance);
    const unguided = [...needed].filter((p) => !guided.has(p));
    expect(unguided, 'evidence panels beginners are never pointed to').toEqual([]);
  });

  it('escalates hints from a nudge to the answer', () => {
    expect(m.hints.map((h) => h.tier)).toEqual([1, 2, 3]);
    expect(m.hints[2].text.length).toBeGreaterThan(m.hints[0].text.length);
  });

  it('closes the loop with alternatives that say when each is right, and the mistakes to avoid', () => {
    const d = m.debrief;
    expect(d.rootCause.length).toBeGreaterThan(40);
    expect(d.concepts.length).toBeGreaterThanOrEqual(2);
    expect(d.alternatives.length).toBeGreaterThanOrEqual(2);
    for (const a of d.alternatives) {
      expect(a.when.length, `${a.name}: when`).toBeGreaterThanOrEqual(30);
      expect(a.tradeoffs.length, `${a.name}: trade-offs`).toBeGreaterThanOrEqual(20);
    }
    expect(d.mistakes.length).toBeGreaterThanOrEqual(3);
    expect(d.experiments.length).toBeGreaterThanOrEqual(2);
  });

  it('has golden tests for the intended fix and for a tempting wrong one', () => {
    const block = goldenSource.split(/\ndescribe\(/).find((b) => new RegExp(`^'Mission ${m.number} `).test(b));
    expect(block, `a describe block for Mission ${m.number} in game/missions.test.ts`).toBeDefined();
    expect(block!).toMatch(/\bpasses\b|\bpass\b/);
    expect(block!).toMatch(/fails|worse|does not|no difference|blows|not enough|only/i);
  });
});
