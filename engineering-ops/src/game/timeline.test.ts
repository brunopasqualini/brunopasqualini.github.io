import { describe, expect, it } from 'vitest';
import type { Snapshot } from '@/engine/types';
import { eventsAt, indexAt, isViewingPast, markersFor, stepView, windowEndingAt } from '@/game/timeline';
import type { TimelineEvent } from '@/game/session';

const hist = (minutes: number[]): Snapshot[] => minutes.map((minute) => ({ minute }) as Snapshot);
const H = hist([10, 11, 12, 13, 14, 15, 16, 17]);

describe('indexAt', () => {
  it('returns -1 for no history', () => expect(indexAt([], 5)).toBe(-1));
  it('null means the latest snapshot', () => expect(indexAt(H, null)).toBe(7));
  it('finds the exact minute', () => expect(indexAt(H, 13)).toBe(3));
  it('clamps to the oldest snapshot for a minute before the history starts', () => expect(indexAt(H, 2)).toBe(0));
  it('uses the latest snapshot at or before a minute that is missing (history can have gaps)', () => {
    expect(indexAt(hist([0, 1, 5, 9]), 7)).toBe(2);
  });
  it('clamps to the newest for a minute in the future', () => expect(indexAt(H, 99)).toBe(7));
});

describe('windowEndingAt', () => {
  it('returns the trailing window, oldest first', () => expect(windowEndingAt(H, 5).map((s) => s.minute)).toEqual([11, 12, 13, 14, 15]));
  it('is shorter at the start of the run', () => expect(windowEndingAt(H, 1).map((s) => s.minute)).toEqual([10, 11]));
  it('is empty for no index', () => expect(windowEndingAt(H, -1)).toEqual([]));
});

describe('stepView', () => {
  it('steps back from live', () => expect(stepView(H, null, -1)).toBe(16));
  it('steps forward and lands on live (null) at the newest snapshot', () => {
    expect(stepView(H, 15, 1)).toBe(16);
    expect(stepView(H, 16, 1)).toBeNull();
  });
  it('stops at the oldest snapshot', () => expect(stepView(H, 10, -5)).toBe(10));
  it('jumps by several steps', () => expect(stepView(H, null, -5)).toBe(12));
  it('stays live when there is no history', () => expect(stepView([], null, -1)).toBeNull());
});

describe('isViewingPast', () => {
  it('is false when live, or when the chosen minute is the newest', () => {
    expect(isViewingPast(H, null)).toBe(false);
    expect(isViewingPast(H, 17)).toBe(false);
  });
  it('is true for an older minute', () => expect(isViewingPast(H, 12)).toBe(true));
});

describe('markers', () => {
  const ev = (minute: number, kind: TimelineEvent['kind'], text: string): TimelineEvent => ({ minute, kind, text });
  const events = [ev(3, 'deploy', 'Deployed API'), ev(3, 'action', 'Scaled'), ev(9, 'incident', 'DB down'), ev(20, 'chaos', 'AZ out')];
  it('groups events that share a minute into one marker', () => {
    const m = markersFor(events, 0, 30);
    expect(m.map((x) => x.minute)).toEqual([3, 9, 20]);
    expect(m[0].kinds).toEqual(['deploy', 'action']);
    expect(m[0].text).toBe('Deployed API · Scaled');
  });
  it('only includes events inside the range', () => expect(markersFor(events, 5, 15).map((x) => x.minute)).toEqual([9]));
  it('eventsAt returns exactly that minute', () => expect(eventsAt(events, 3)).toHaveLength(2));
});
