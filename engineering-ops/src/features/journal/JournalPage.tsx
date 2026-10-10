import { useMemo, useState } from 'react';
import { MISSIONS } from '@/content/missions';
import { useGame } from '@/game/store';
import { Chip, Empty, Tabs } from '@/shared/ui/common';
import { usd2, when } from '@/shared/lib/fmt';

export function JournalPage() {
  const progress = useGame((s) => s.progress);
  const [tab, setTab] = useState<'missions' | 'adrs' | 'pms' | 'exp' | 'lessons' | 'designs'>('missions');
  const title = (id: string) => MISSIONS.find((m) => m.id === id)?.title ?? id;
  const outcomes = useMemo(() => [...progress.outcomes].reverse(), [progress.outcomes]);
  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Engineering Journal</h1>
          <p className="muted">Your record: completed missions, architecture decisions, postmortems, experiments and lessons learned.</p>
        </div>
      </header>
      <Tabs
        label="Journal sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'missions', label: `Missions (${progress.outcomes.length})` },
          { id: 'adrs', label: `Decisions (${progress.adrs.length})` },
          { id: 'pms', label: `Postmortems (${progress.postmortems.length})` },
          { id: 'exp', label: `Experiments (${progress.experiments.length})` },
          { id: 'lessons', label: `Lessons (${progress.lessons.length})` },
          { id: 'designs', label: `Saved designs (${progress.designs.length})` },
        ]}
      />
      <div className="card">
        {tab === 'missions' &&
          (outcomes.length === 0 ? (
            <Empty title="Nothing recorded yet">Submit a mission to see its scorecard here.</Empty>
          ) : (
            <ul className="rows">
              {outcomes.map((o, i) => (
                <li key={i}>
                  <div>
                    <b>{title(o.missionId)}</b> <Chip kind={o.passed ? 'ok' : 'warn'}>{o.passed ? 'passed' : 'not yet'}</Chip>{' '}
                    <Chip>Grade {o.grade}</Chip>{' '}
                    <span className="muted tiny">
                      attempt {o.attempt} · {o.hintsUsed} hints
                    </span>
                    <div className="dimline">
                      {o.dims
                        .filter((d) => d.weight > 0 && d.score != null)
                        .map((d) => (
                          <span key={d.id} title={d.note}>
                            {d.label.split(' ')[0]} <b>{d.score}</b>
                          </span>
                        ))}
                    </div>
                  </div>
                  <span className="muted tiny">{when(o.finishedAt)}</span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'adrs' &&
          (progress.adrs.length === 0 ? (
            <Empty title="No ADRs yet">Record Architecture Decision Records inside missions.</Empty>
          ) : (
            progress.adrs.map((a) => (
              <article key={a.id} className="doc">
                <h3>{a.title}</h3>
                <p className="muted tiny">
                  {title(a.missionId)} · {when(a.at)}
                </p>
                <dl>
                  <dt>Context</dt>
                  <dd>{a.context}</dd>
                  <dt>Problem</dt>
                  <dd>{a.problem}</dd>
                  <dt>Options considered</dt>
                  <dd>{a.options}</dd>
                  <dt>Decision</dt>
                  <dd>{a.decision}</dd>
                  <dt>Advantages</dt>
                  <dd>{a.pros}</dd>
                  <dt>Disadvantages</dt>
                  <dd>{a.cons}</dd>
                  <dt>Implications</dt>
                  <dd>{a.implications}</dd>
                </dl>
              </article>
            ))
          ))}
        {tab === 'pms' &&
          (progress.postmortems.length === 0 ? (
            <Empty title="No postmortems yet">Incident missions ask you to write one.</Empty>
          ) : (
            progress.postmortems.map((p, i) => (
              <article key={i} className="doc">
                <h3>Postmortem — {title(p.missionId)}</h3>
                <p className="muted tiny">{when(p.at)}</p>
                <dl>
                  <dt>What happened</dt>
                  <dd>{p.pm.what}</dd>
                  <dt>Customer impact</dt>
                  <dd>{p.pm.impact}</dd>
                  <dt>Evidence</dt>
                  <dd>{p.pm.evidence}</dd>
                  <dt>Restored by</dt>
                  <dd>{p.pm.restored}</dd>
                  <dt>Made it worse</dt>
                  <dd>{p.pm.worsened}</dd>
                  <dt>Prevention</dt>
                  <dd>{p.pm.prevent}</dd>
                </dl>
              </article>
            ))
          ))}
        {tab === 'exp' &&
          (progress.experiments.length === 0 ? (
            <Empty title="No experiments logged">Compare designs in the Architecture Lab and log what you learn.</Empty>
          ) : (
            <ul className="rows">
              {progress.experiments.map((e) => (
                <li key={e.id}>
                  <div>
                    <b>{e.name}</b>
                    <p>{e.note || <i className="muted">No note</i>}</p>
                    <p className="muted tiny">
                      availability {e.metrics.availability?.toFixed(1)}% · p95 {e.metrics.p95?.toFixed(0)}ms · cost{' '}
                      {usd2(e.metrics.cost ?? 0)}
                    </p>
                  </div>
                  <span className="muted tiny">{when(e.at)}</span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'lessons' &&
          (progress.lessons.length === 0 ? (
            <Empty title="No lessons yet">Lessons from debriefs and your own “made it worse” notes collect here.</Empty>
          ) : (
            <ul className="rows">
              {[...progress.lessons].reverse().map((l, i) => (
                <li key={i}>
                  <div>
                    <b>{title(l.missionId)}</b>
                    <p>{l.text}</p>
                  </div>
                  <span className="muted tiny">{when(l.at)}</span>
                </li>
              ))}
            </ul>
          ))}
        {tab === 'designs' &&
          (progress.designs.length === 0 ? (
            <Empty title="No saved designs">Save designs from the Architecture Lab.</Empty>
          ) : (
            <ul className="rows">
              {progress.designs.map((d) => (
                <li key={d.id}>
                  <div>
                    <b>{d.name}</b>
                    <p className="muted tiny">
                      {d.arch.nodes.length} components · {d.arch.edges.length} connections
                    </p>
                  </div>
                  <span className="muted tiny">{when(d.savedAt)}</span>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </div>
  );
}
