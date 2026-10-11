import { Siren } from 'lucide-react';
import { useState } from 'react';
import { GAME_DAYS, GAME_DAY_BY_ID } from '@/content/gamedays';
import { alreadyFailing, isFinished, scoreGameDay } from '@/game/gameday';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { Chip } from '@/shared/ui/common';

const KIND = { A: 'ok', B: 'ok', C: 'warn', D: 'warn', F: 'crit' } as const;

/** Lab section: run a scripted multi-fault exercise and see how the design and the monitoring held up. */
export function GameDayPanel() {
  const { session } = useLive();
  useGame((s) => s.tick);
  const begin = useGame((s) => s.beginGameDay);
  const [pick, setPick] = useState(GAME_DAYS[0].id);
  if (!session) return null;
  const run = session.gameday;
  const day = run ? GAME_DAY_BY_ID[run.id] : undefined;
  const last = session.history[session.history.length - 1];
  const finished = !!run && isFinished(run, session.minute);

  if (run && day) {
    const window = session.history.filter((h) => h.minute >= run.start);
    const score = scoreGameDay(day, window, session.live, finished);
    const elapsed = Math.min(day.minutes, session.minute - run.start);
    const feed = session.events.filter(
      (e) => e.minute >= run.start && (e.kind === 'incident' || e.kind === 'deploy' || e.kind === 'action'),
    );
    return (
      <section className="gameday" data-testid="gameday">
        <h4>
          <Siren size={14} /> Game day: {day.title}
        </h4>
        <p className="tiny">
          {finished ? 'Finished' : `Minute ${elapsed} of ${day.minutes}`} — {day.teaches}
        </p>
        <ul className="gd-feed">
          {feed.length === 0 && <li className="tiny">All quiet so far. Press play.</li>}
          {feed.map((e, i) => (
            <li key={i} className="tiny">
              <b>+{e.minute - run.start}m</b> {e.text}
            </li>
          ))}
        </ul>
        <div className="gd-score">
          <Chip kind={score.impactMinutes ? 'crit' : 'ok'}>{score.impactMinutes} min customer impact</Chip>
          <Chip kind="info">detect {score.detectionMinutes === null ? '—' : `~${score.detectionMinutes}m`}</Chip>
          <Chip kind={score.recoveryMinutes === null ? (score.impactMinutes ? 'warn' : 'ok') : 'info'}>
            recover {score.recoveryMinutes === null ? '—' : `${score.recoveryMinutes}m`}
          </Chip>
        </div>
        {finished && (
          <div className="gd-result" data-testid="gameday-result">
            <Chip kind={KIND[score.grade]}>Grade {score.grade}</Chip> <b>{score.total}/100</b>
            <p className="tiny">
              Impact {score.impactPoints}/50 · Recovery {score.recoveryPoints}/30 · Detection {score.detectionPoints}/20 ·{' '}
              {score.failedRequests.toLocaleString()} failed requests
            </p>
            {score.notes.map((n) => (
              <p key={n} className="tiny">
                {n}
              </p>
            ))}
          </div>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => begin(day.id)}>
          {finished ? 'Run again' : 'Restart'}
        </button>
      </section>
    );
  }

  const chosen = GAME_DAY_BY_ID[pick];
  return (
    <section className="gameday" data-testid="gameday">
      <h4>
        <Siren size={14} /> Game day
      </h4>
      <p className="tiny">A scripted sequence of faults. You are told what the on-call engineer sees, not what is wrong.</p>
      <div className="row-gap">
        <select aria-label="Game day scenario" value={pick} onChange={(e) => setPick(e.target.value)}>
          {GAME_DAYS.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <button className="btn btn-primary btn-sm" onClick={() => begin(pick)} disabled={session.live.nodes.length === 0}>
          Start
        </button>
      </div>
      <p className="tiny">
        {chosen.blurb} ({chosen.minutes} min)
      </p>
      {alreadyFailing(last) && (
        <p className="tiny warn">
          Your design is already failing customers before any fault. Fix that first or the score will only measure it.
        </p>
      )}
    </section>
  );
}
