import { ArrowRight, Check, Lock } from 'lucide-react';
import { useState } from 'react';
import { PATHS } from '@/content/paths';
import { TEMPLATES } from '@/content/templates';
import { pathProgress, type StepState } from '@/game/paths';
import { SKILLS } from '@/game/progression';
import { useGame } from '@/game/store';
import { Chip, Meter } from '@/shared/ui/common';
import { go } from '@/shared/lib/nav';

const STATE_LABEL: Record<StepState, string> = { done: 'Done', next: 'Up next', open: 'Ready', blocked: 'Locked' };
const STATE_KIND: Record<StepState, 'ok' | 'info' | 'neutral' | 'warn'> = { done: 'ok', next: 'info', open: 'neutral', blocked: 'warn' };

export function PathsPage() {
  const completed = useGame((s) => s.progress.completed);
  const [sel, setSel] = useState(PATHS[0].id);
  const path = PATHS.find((p) => p.id === sel)!;
  const prog = pathProgress(path, completed);
  const skillName = (id: string) => SKILLS.find((s) => s.id === id)?.label ?? id;

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Learning paths</h1>
          <p className="muted">
            Pick the role closest to yours. Each path is an ordered route through existing missions, with Lab drills for extra practice.
            Progress comes from missions you have passed.
          </p>
        </div>
      </header>
      <div className="skill-grid" role="tablist" aria-label="Learning paths">
        {PATHS.map((p) => {
          const pr = pathProgress(p, completed);
          return (
            <button
              key={p.id}
              role="tab"
              aria-selected={sel === p.id}
              className={`skill-card ${sel === p.id ? 'on' : ''}`}
              onClick={() => setSel(p.id)}
            >
              <b>{p.title}</b>
              <span className="muted tiny">
                {pr.done} of {pr.total} missions
              </span>
              <Meter value={pr.done} max={pr.total} kind="info" label={`${p.title} progress`} />
            </button>
          );
        })}
      </div>
      <section className="card path-detail" data-testid="path-detail" aria-label={path.title}>
        <div className="row-between">
          <h2>{path.title}</h2>
          <Chip kind={prog.complete ? 'ok' : 'info'}>{prog.complete ? 'Complete' : `${prog.pct}%`}</Chip>
        </div>
        <p className="muted">{path.who}</p>
        <p>
          <b>You will be able to:</b> {path.outcome}
        </p>
        <p className="tiny muted">Builds: {path.skills.map(skillName).join(' · ')}</p>
        {prog.next ? (
          <div className="callout path-next" data-testid="path-next">
            <div>
              <span className="tiny muted">Next step</span>
              <div>
                <b>{prog.next.title}</b>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => go(`/play/${prog.next!.missionId}`)}>
              Start <ArrowRight size={14} />
            </button>
          </div>
        ) : (
          prog.complete && <p className="callout path-next">You have finished every mission on this path. Try the Lab drills below.</p>
        )}
        <ol className="path-steps">
          {prog.steps.map((s, i) => (
            <li key={s.missionId} className={`path-step is-${s.state}`} data-state={s.state}>
              <span className="path-num" aria-hidden>
                {s.state === 'done' ? <Check size={14} /> : s.state === 'blocked' ? <Lock size={13} /> : i + 1}
              </span>
              <div className="path-body">
                <div className="row-between">
                  <b>{s.title}</b>
                  <Chip kind={STATE_KIND[s.state]}>{STATE_LABEL[s.state]}</Chip>
                </div>
                {s.state === 'blocked' && (
                  <p className="tiny muted">
                    Pass {s.unmet.length} earlier mission{s.unmet.length === 1 ? '' : 's'} first.
                  </p>
                )}
                {s.lessons.length > 0 && <p className="tiny muted">Reading: {s.lessons.map((l) => l.title).join(' · ')}</p>}
              </div>
              {s.state !== 'blocked' && (
                <button className="btn btn-ghost btn-sm" onClick={() => go(`/play/${s.missionId}`)}>
                  {s.state === 'done' ? 'Replay' : 'Open'}
                </button>
              )}
            </li>
          ))}
        </ol>
        {path.drills.length > 0 && (
          <>
            <h3>Lab drills</h3>
            <div className="row-gap">
              {path.drills.map((id) => (
                <button key={id} className="btn btn-ghost btn-sm" onClick={() => go(`/lab?template=${id}`)}>
                  {TEMPLATES.find((t) => t.id === id)?.drill?.title ?? id}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
