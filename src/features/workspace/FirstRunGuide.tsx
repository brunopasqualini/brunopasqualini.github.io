import { CheckCircle2, Circle } from 'lucide-react';
import { missionOf, type Session } from '@/game/session';
import { guideSteps } from '@/game/guide';
import { useGame } from '@/game/store';
import { usePersistentFlag } from '@/shared/hooks/usePersistentFlag';

/** A self-ticking checklist for a player's first mission: always shows the one thing to do next. */
export function FirstRunGuide({ session }: { session: Session }) {
  const setDock = useGame((s) => s.setDock);
  const [hidden, setHidden] = usePersistentFlag('eo-guide-hidden', false);
  const mission = missionOf(session.missionId);
  const steps = guideSteps(session, mission);
  const current = steps.findIndex((s) => !s.done);
  if (hidden)
    return (
      <button className="link tiny" onClick={() => setHidden(false)}>
        Show the first-mission guide
      </button>
    );
  return (
    <section className="callout callout-info first-run" aria-label="First mission guide">
      <div className="row-between">
        <strong>Your first mission: {current === -1 ? 'done' : `step ${current + 1} of ${steps.length}`}</strong>
        <button className="link tiny" onClick={() => setHidden(true)}>
          Hide guide
        </button>
      </div>
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={s.done ? 'done' : i === current ? 'current' : ''} aria-current={i === current ? 'step' : undefined}>
            <span className="guide-mark" aria-hidden="true">
              {s.done ? <CheckCircle2 size={15} /> : <Circle size={15} />}
            </span>
            <div>
              <b>{s.title}</b>
              {i === current && (
                <>
                  <p>{s.body}</p>
                  {s.panel && (
                    <button className="btn btn-primary btn-sm" onClick={() => setDock(s.panel!)}>
                      Open {s.panel}
                    </button>
                  )}
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
