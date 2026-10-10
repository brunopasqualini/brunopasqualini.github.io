import type { Snapshot } from '@/engine/types';
import type { TimelineEvent } from '@/game/session';

/**
 * Looking back through a run. The session already keeps a snapshot for every simulated minute, so "rewinding" is just
 * choosing which snapshot to show; nothing is re-simulated and nothing in the run changes.
 * These helpers are pure so the rules can be tested without React or the store.
 */

/** Index of the snapshot to show for `minute` (null = the latest). -1 when there is no history yet. */
export function indexAt(history: readonly Snapshot[], minute: number | null): number {
  if (history.length === 0) return -1;
  if (minute === null) return history.length - 1;
  let found = 0;
  for (let i = 0; i < history.length; i++) {
    if (history[i].minute <= minute) found = i;
    else break;
  }
  return found;
}

/** The trailing window of snapshots (oldest first) ending at `index`, as the live view uses for its averages. */
export function windowEndingAt(history: readonly Snapshot[], index: number, size = 5): Snapshot[] {
  if (index < 0) return [];
  return history.slice(Math.max(0, index - size + 1), index + 1);
}

/** Move the view by `delta` snapshots. Reaching the newest one returns null, meaning "live" again. */
export function stepView(history: readonly Snapshot[], viewMinute: number | null, delta: number): number | null {
  if (history.length === 0) return null;
  const next = Math.min(history.length - 1, Math.max(0, indexAt(history, viewMinute) + delta));
  return next === history.length - 1 ? null : history[next].minute;
}

/** Is the view on an older snapshot (as opposed to the latest)? */
export function isViewingPast(history: readonly Snapshot[], viewMinute: number | null): boolean {
  return viewMinute !== null && history.length > 0 && indexAt(history, viewMinute) !== history.length - 1;
}

export interface Marker {
  minute: number;
  kinds: TimelineEvent['kind'][];
  text: string;
}

/** Events within [from, to], one marker per minute (several events in the same minute share a marker). */
export function markersFor(events: readonly TimelineEvent[], from: number, to: number): Marker[] {
  const byMinute = new Map<number, Marker>();
  for (const e of events) {
    if (e.minute < from || e.minute > to) continue;
    const m = byMinute.get(e.minute) ?? { minute: e.minute, kinds: [], text: '' };
    if (!m.kinds.includes(e.kind)) m.kinds.push(e.kind);
    m.text = m.text ? `${m.text} · ${e.text}` : e.text;
    byMinute.set(e.minute, m);
  }
  return [...byMinute.values()].sort((a, b) => a.minute - b.minute);
}

/** What happened at exactly `minute`. */
export const eventsAt = (events: readonly TimelineEvent[], minute: number): TimelineEvent[] => events.filter((e) => e.minute === minute);
