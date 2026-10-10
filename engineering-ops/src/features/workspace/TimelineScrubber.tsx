import { ChevronLeft, ChevronRight, History } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { eventsAt, markersFor, type Marker } from '@/game/timeline';
import { clock } from '@/shared/lib/fmt';

/** Which event colours a minute's marker: the most serious kind wins. */
const KIND_ORDER = ['incident', 'chaos', 'deploy', 'revert', 'verify', 'action', 'note'] as const;
const markerKind = (m: Marker) => KIND_ORDER.find((k) => m.kinds.includes(k)) ?? 'note';

/**
 * Rewind the run. Drag the slider (or press [ and ]) to look at any earlier minute: the canvas, the health strip and the
 * panels show the system as it was then, paused. Markers show where you deployed, injected a fault or an incident began.
 * Nothing is replayed or changed; "Back to live" (or running, stepping, deploying) returns to now.
 */
export function TimelineScrubber() {
  const { session, snap, viewing } = useLive();
  const viewAt = useGame((s) => s.viewAt);
  const scrub = useGame((s) => s.scrub);
  const history = session?.history;
  const first = history?.[0]?.minute ?? 0;
  const last = history?.[history.length - 1]?.minute ?? 0;
  const eventCount = session?.events.length ?? 0;
  const markers = useMemo(
    () => (session ? markersFor(session.events, first, last) : []),
    // events are appended in place, so key on their count
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session, eventCount, first, last],
  );
  // [ and ] step back and forward, unless a text field or slider has focus
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '[') scrub(-1);
      if (e.key === ']') scrub(1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [scrub]);
  if (!session || !history || history.length < 2 || !snap) return null;

  const cur = snap.minute;
  const span = Math.max(1, last - first);
  const here = viewing ? eventsAt(session.events, cur) : [];
  return (
    <div className={`scrub ${viewing ? 'scrub-past' : ''}`} role="group" aria-label="Run timeline">
      <div className="scrub-row">
        <History size={14} className="scrub-icon" aria-hidden="true" />
        <button
          className="icon-btn"
          onClick={() => scrub(-1)}
          disabled={cur <= first}
          aria-label="Back one minute"
          title="Back one minute ( [ )"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          className="icon-btn"
          onClick={() => scrub(1)}
          disabled={!viewing}
          aria-label="Forward one minute"
          title="Forward one minute ( ] )"
        >
          <ChevronRight size={14} />
        </button>
        <div className="scrub-track">
          <input
            type="range"
            min={first}
            max={last}
            step={1}
            value={cur}
            onChange={(e) => viewAt(Number(e.target.value))}
            aria-label="Look back at an earlier minute of this run"
            aria-valuetext={`${clock(cur)}${viewing ? `, ${last - cur} minutes ago` : ', live'}`}
          />
          {markers.map((m) => (
            <button
              key={m.minute}
              className={`scrub-mark mk-${markerKind(m)}`}
              style={{ left: `${((m.minute - first) / span) * 100}%` }}
              onClick={() => viewAt(m.minute)}
              title={`${clock(m.minute)}: ${m.text}`}
              aria-label={`Jump to ${clock(m.minute)}: ${m.text}`}
            />
          ))}
        </div>
        <span className="scrub-time">{clock(cur)}</span>
        {viewing ? (
          <button className="btn btn-primary btn-sm" onClick={() => viewAt(null)}>
            Back to live
          </button>
        ) : (
          <span className="scrub-hint">Live. Drag back to look at an earlier minute.</span>
        )}
      </div>
      {viewing && (
        <p className="scrub-note" role="status">
          Viewing {clock(cur)}, {last - cur} minute{last - cur === 1 ? '' : 's'} ago. Paused; nothing has changed.
          {here.length > 0 && <b> {here.map((e) => e.text).join(' · ')}</b>}
        </p>
      )}
    </div>
  );
}
