import { go } from '@/shared/lib/nav';
import { Clock, Lock } from 'lucide-react';
import { journeyOrder, stageOfMission } from '@/content/journey';
import { MISSIONS } from '@/content/missions';
import { Chip } from '@/shared/ui/common';
import { when } from '@/shared/lib/fmt';
import { MissionButtons, useMissionState } from '@/entities/mission/MissionButtons';

export function MissionsPage() {
  const { progress, saved, status, unmet } = useMissionState();
  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Mission Control</h1>
          <p className="muted">
            A campaign of progressively harder engineering scenarios. Each is data-driven: evidence, constraints and success criteria — not
            a single “right” diagram.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => go('/paths')}>
            Follow a learning path for your role
          </button>
        </div>
      </header>
      <ol className="campaign">
        {journeyOrder(MISSIONS).map((m) => {
          const st = status(m);
          const o = progress.completed[m.id];
          const missing = unmet(m);
          return (
            <li key={m.id} className={`mission-card st-${st}`}>
              <div className="mc-num">{m.number}</div>
              <div className="mc-body">
                <div className="row-between">
                  <h3>{m.title}</h3>
                  <div className="chips">
                    {stageOfMission(m.id) && <Chip kind="purple">Level {stageOfMission(m.id)!.level}</Chip>}
                    <Chip kind={m.kind === 'incident' ? 'crit' : 'info'}>{m.kind}</Chip>
                    <Chip kind={m.difficulty === 'Beginner' ? 'ok' : m.difficulty === 'Intermediate' ? 'warn' : 'crit'}>
                      {m.difficulty}
                    </Chip>
                    <Chip>
                      <Clock size={11} /> ~{m.estMinutes}m
                    </Chip>
                  </div>
                </div>
                <p>{m.tagline}</p>
                {(m.consequences ?? []).length > 0 && (
                  <p className="tiny carried-note">
                    <b>Reacts to your earlier decisions:</b> debts and benefits from missions you have passed shape the starting design.
                  </p>
                )}
                <div className="mc-cols">
                  <div>
                    <h5>Learning objectives</h5>
                    <ul className="list">
                      {m.learning.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5>Constraints</h5>
                    <ul className="list">
                      {m.constraints.notes.slice(0, 4).map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5>Prerequisites &amp; status</h5>
                    {m.prerequisites.length === 0 ? (
                      <p className="muted">None — start here.</p>
                    ) : (
                      <ul className="list">
                        {m.prerequisites.map((p) => (
                          <li key={p}>
                            {progress.completed[p]?.passed ? '✓' : '○'} {MISSIONS.find((x) => x.id === p)?.title}
                          </li>
                        ))}
                      </ul>
                    )}
                    {missing.length > 0 && (
                      <p className="tiny warn">
                        <Lock size={11} /> Recommended after the above, but you can still start.
                      </p>
                    )}
                    <p>
                      {st === 'completed' ? (
                        <Chip kind="ok">
                          Completed · Grade {o.grade} · {o.overall}/100 · {progress.attempts[m.id] ?? 1} attempt(s)
                        </Chip>
                      ) : st === 'progress' ? (
                        <Chip kind="warn">In progress</Chip>
                      ) : (
                        <Chip>Not started</Chip>
                      )}
                    </p>
                  </div>
                </div>
                <MissionButtons m={m} />
                {saved[m.id] && st !== 'completed' && saved[m.id].ops.length > 0 && (
                  <span className="muted tiny"> Saved {when(saved[m.id].updatedAt)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
