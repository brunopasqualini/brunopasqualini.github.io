import { AlertTriangle, GitCommitHorizontal, Info, RotateCcw, Siren, Wrench, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLive } from '@/game/hooks';
import type { TimelineEvent } from '@/game/session';

const META: Record<TimelineEvent['kind'], { icon: ReactNode; tone: 'crit' | 'warn' | 'info' | 'ok' }> = {
  incident: { icon: <Siren size={15} />, tone: 'crit' },
  chaos: { icon: <Zap size={15} />, tone: 'crit' },
  deploy: { icon: <GitCommitHorizontal size={15} />, tone: 'info' },
  action: { icon: <Wrench size={15} />, tone: 'warn' },
  revert: { icon: <RotateCcw size={15} />, tone: 'warn' },
  verify: { icon: <AlertTriangle size={15} />, tone: 'ok' },
  note: { icon: <Info size={15} />, tone: 'info' },
};

const when = (now: number, at: number) => (now - at <= 0 ? 'now' : `${now - at}m ago`);

/** The most recent things that happened in the simulated world, newest first. */
export function EventsCard() {
  const { session } = useLive();
  if (!session) return null;
  const events = [...session.events].reverse().slice(0, 5);
  return (
    <section className="card-panel events" aria-label="Recent events">
      <h3 className="cp-title">Recent Events</h3>
      {events.length === 0 ? (
        <p className="muted tiny">Nothing has happened yet. Press Run to start the clock.</p>
      ) : (
        <ul>
          {events.map((e, i) => {
            const m = META[e.kind];
            return (
              <li key={`${e.minute}-${i}`} className={`ev ev-${m.tone}`}>
                <span className="ev-ico">{m.icon}</span>
                <span className="ev-text">{e.text}</span>
                <time className="ev-time">{when(session.minute, e.minute)}</time>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
