import { Check, Clock, Lock } from 'lucide-react';
import { currentStage, stageProgress } from '@/content/journey';
import { MISSIONS } from '@/content/missions';
import { useGame } from '@/game/store';
import { go } from '@/shared/lib/nav';

/** The five stages of problem complexity. Not job titles to earn in order: where the problems you can handle currently sit. */
export function JourneyMap() {
  const completed = useGame((s) => s.progress.completed);
  const current = currentStage(completed);
  const stages = stageProgress(completed);
  return (
    <section id="journey" className="journey" aria-labelledby="journey-h">
      <h2 id="journey-h" className="section-title">
        The engineering journey
      </h2>
      <p className="muted journey-lede">
        Five stages of problem complexity, from a single application to organisation-wide architecture. They are not job titles to earn in
        sequence: they describe the problems you are learning to solve.
      </p>
      <ol className="stages">
        {stages.map(({ stage, done, total, complete, comingSoon }) => {
          const isCurrent = stage.level === current.level && !comingSoon;
          return (
            <li
              key={stage.level}
              className={`stage ${complete ? 'stage-done' : ''} ${isCurrent ? 'stage-current' : ''} ${comingSoon ? 'stage-soon' : ''}`}
            >
              <div className="stage-top">
                <span className="stage-level">Level {stage.level}</span>
                <span className="stage-state">
                  {complete ? (
                    <>
                      <Check size={13} /> Complete
                    </>
                  ) : comingSoon ? (
                    <>
                      <Lock size={13} /> Coming soon
                    </>
                  ) : isCurrent ? (
                    'You are here'
                  ) : (
                    `${done}/${total}`
                  )}
                </span>
              </div>
              <h3>{stage.title}</h3>
              <p>{stage.tagline}</p>
              <ul className="list stage-focus">
                {stage.focus.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
              <div className="stage-missions">
                {stage.missionIds.map((id) => {
                  const m = MISSIONS.find((x) => x.id === id)!;
                  const ok = completed[id]?.passed;
                  return (
                    <button key={id} className={`stage-mission ${ok ? 'ok' : ''}`} onClick={() => go(`/play/${id}`)}>
                      {ok ? <Check size={13} /> : <Clock size={13} />} {m.title}
                    </button>
                  );
                })}
                {comingSoon && <span className="muted tiny">No scenarios yet: this stage is on the roadmap.</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
