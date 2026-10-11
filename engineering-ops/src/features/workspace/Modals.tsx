import { CompareTab } from './CompareTab';
import { assessHypothesis } from '@/game/diagnosis';
import { Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MISSIONS } from '@/content/missions';
import { SKILLS } from '@/game/progression';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Chip, Meter, Modal } from '@/shared/ui/common';
import { usd2 } from '@/shared/lib/fmt';
import { go } from '@/shared/lib/nav';
import { FeedbackCard } from '@/features/workspace/FeedbackCard';

export function MissionIntro() {
  const session = useGame((s) => s.session);
  const open = useGame((s) => s.introOpen);
  const start = useGame((s) => s.startIncident);
  const setOpen = useGame((s) => s.setIntroOpen);
  const mode = useGame((s) => s.settings.mode);
  if (!session || !open) return null;
  const m = missionOf(session.missionId);
  return (
    <Modal
      title={`Mission ${m.number}: ${m.title}`}
      onClose={() => setOpen(false)}
      wide
      footer={
        <button className="btn btn-primary" onClick={start}>
          {m.kind === 'incident' ? 'Take the pager — start incident' : 'Start mission'}
        </button>
      }
    >
      <div className="intro">
        <div className="chips">
          <Chip kind={m.kind === 'incident' ? 'crit' : 'info'}>{m.kind}</Chip>
          <Chip>{m.difficulty}</Chip>
          <Chip>~{m.estMinutes}m</Chip>
          <Chip>{mode} mode</Chip>
        </div>
        <p className="story">{m.story}</p>
        <div className="intro-grid">
          <div>
            <h4>Business context</h4>
            <p>{m.business.context}</p>
            <h4>User impact</h4>
            <p>{m.business.impact}</p>
          </div>
          <div>
            <h4>Constraints &amp; success criteria</h4>
            <ul className="list">
              {m.constraints.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4>You will learn</h4>
            <ul className="list">
              {m.learning.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
        {session.consequences.length > 0 && (
          <section className="callout callout-purple carried" aria-label="Inherited from your earlier decisions">
            <strong>Inherited from your earlier decisions</strong>
            <ul className="list">
              {session.consequences.map((c) => (
                <li key={c.id}>
                  <b>{c.title}.</b> {c.text}
                </li>
              ))}
            </ul>
          </section>
        )}
        {m.kind === 'incident' && (
          <p className="callout callout-warn">
            This is a live incident: simulated time advances while you work. Opening investigation panels costs a minute of simulated time
            (except in beginner mode), and the clock stops when you pause. Customer impact accumulates — too much ends the incident as a
            failure.
          </p>
        )}
        {mode === 'beginner' && (
          <p className="callout callout-info">
            Beginner mode: the Mission tab explains each step, highlights where to look, and component inspectors include engineering
            concepts. Hints are always available.
          </p>
        )}
        {mode === 'advanced' && (
          <p className="callout callout-purple">
            Advanced mode: logs are noisier, tracing must be added by you, and there is no guidance. Competing requirements are real —
            choose trade-offs deliberately.
          </p>
        )}
      </div>
    </Modal>
  );
}

const ADR_FIELDS: {
  k: 'title' | 'context' | 'problem' | 'options' | 'decision' | 'pros' | 'cons' | 'implications';
  label: string;
  ph: string;
  rows?: number;
}[] = [
  { k: 'title', label: 'Title', ph: 'e.g. Adopt a modular monolith with enforced module boundaries', rows: 1 },
  { k: 'context', label: 'Context', ph: 'What situation, constraints and forces led to this decision?' },
  { k: 'problem', label: 'Problem being solved', ph: 'What exactly is going wrong or needs to change?' },
  { k: 'options', label: 'Options considered', ph: 'List the alternatives you weighed, including “do nothing”.' },
  { k: 'decision', label: 'Chosen solution', ph: 'What did you decide and why this over the others?' },
  { k: 'pros', label: 'Advantages', ph: 'What gets better? Because…' },
  { k: 'cons', label: 'Disadvantages & risks', ph: 'What gets worse or riskier? What trade-off are you accepting?' },
  {
    k: 'implications',
    label: 'Security, reliability, cost & operational implications',
    ph: 'Cover each: security, reliability, cost, operational complexity.',
  },
];

export function ADRModal({ onClose }: { onClose: () => void }) {
  const save = useGame((s) => s.saveADR);
  const [v, setV] = useState({ title: '', context: '', problem: '', options: '', decision: '', pros: '', cons: '', implications: '' });
  const ready = v.title.trim().length > 2 && v.decision.trim().length > 10;
  return (
    <Modal
      title="Architecture Decision Record"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!ready}
            onClick={() => {
              save(v);
              onClose();
            }}
          >
            Save ADR
          </button>
        </>
      }
    >
      <p className="muted">
        An ADR records <i>why</i>, not just what. Scoring rewards completeness and genuine trade-off reasoning — not length.
      </p>
      <div className="form">
        {ADR_FIELDS.map((f) => (
          <label key={f.k} className="form-field">
            <span>{f.label}</span>
            {f.rows === 1 ? (
              <input value={v[f.k]} placeholder={f.ph} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
            ) : (
              <textarea rows={3} value={v[f.k]} placeholder={f.ph} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
            )}
          </label>
        ))}
      </div>
    </Modal>
  );
}

const PM_FIELDS: { k: 'what' | 'impact' | 'evidence' | 'restored' | 'worsened' | 'prevent'; label: string; ph: string }[] = [
  { k: 'what', label: 'What happened?', ph: 'A short, blameless narrative of the incident.' },
  { k: 'impact', label: 'What was the customer impact?', ph: 'Who was affected, how badly, and for how long?' },
  { k: 'evidence', label: 'What evidence identified the cause?', ph: 'Which metrics, logs, traces or changes pointed to it?' },
  { k: 'restored', label: 'Which actions restored service?', ph: 'What you did, in order, and what effect each had.' },
  { k: 'worsened', label: 'Which decisions worsened the incident (or wasted time)?', ph: 'Be honest — this is where most learning is.' },
  {
    k: 'prevent',
    label: 'What preventive actions should follow?',
    ph: 'Concrete changes to tests, rollout, monitoring, design or process.',
  },
];

export function PostmortemModal({ onClose }: { onClose: () => void }) {
  const session = useGame((s) => s.session);
  const save = useGame((s) => s.savePostmortem);
  const [v, setV] = useState(() => session?.postmortem ?? { what: '', impact: '', evidence: '', restored: '', worsened: '', prevent: '' });
  const timeline = session?.events.filter((e) => ['action', 'deploy', 'incident', 'revert'].includes(e.kind)).slice(-12) ?? [];
  return (
    <Modal
      title="Incident postmortem"
      onClose={onClose}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={v.what.trim().length < 10}
            onClick={() => {
              save(v);
              onClose();
            }}
          >
            Save postmortem
          </button>
        </>
      }
    >
      <div className="pm-grid">
        <div className="form">
          {PM_FIELDS.map((f) => (
            <label key={f.k} className="form-field">
              <span>{f.label}</span>
              <textarea rows={3} value={v[f.k]} placeholder={f.ph} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
            </label>
          ))}
        </div>
        <aside className="pm-timeline">
          <h4>Your incident timeline</h4>
          <ol>
            {timeline.map((e, i) => (
              <li key={i}>
                <span className="mono">T+{e.minute}m</span> {e.text}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </Modal>
  );
}

export function Debrief() {
  const d = useGame((s) => s.debrief);
  const session = useGame((s) => s.session);
  const close = useGame((s) => s.closeDebrief);
  const retry = useGame((s) => s.retryMission);
  const progress = useGame((s) => s.progress);
  const [tab, setTab] = useState<'result' | 'learn' | 'compare' | 'diagnosis' | 'record'>('result');
  const m = session ? missionOf(session.missionId) : undefined;
  const next = useMemo(() => (m ? MISSIONS.find((x) => x.number === m.number + 1) : undefined), [m]);
  if (!d || !m || !session) return null;
  const o = d.outcome;
  const failed = o.reqs.filter((r) => !r.pass);
  const rep = d.report;
  const sideEffects: string[] = [
    ...rep.design.notes,
    ...rep.pipeline.notes,
    ...rep.obs.notes,
    ...(rep.recovery.singlePoints.length ? [`Single points of failure remain: ${rep.recovery.singlePoints.join('; ')}.`] : []),
    ...rep.findings.slice(0, 4).map((f) => `${f.severity.toUpperCase()}: ${f.title} (${f.fix})`),
    ...(rep.metrics.staleRisk ? ['A cache can serve data older than the freshness requirement — correctness trade-off.'] : []),
    ...(rep.metrics.cost > (m.constraints.budget ?? Infinity)
      ? [`Cost ${usd2(rep.metrics.cost)} exceeds the ${usd2(m.constraints.budget!)} budget.`]
      : []),
  ];
  return (
    <Modal
      title={o.passed ? 'Mission debrief' : 'Mission review — not quite there yet'}
      onClose={close}
      wide
      footer={
        <>
          <button className="btn btn-ghost" onClick={close}>
            Keep experimenting
          </button>
          <button className="btn btn-ghost" onClick={() => retry(m.id)}>
            Retry from scratch
          </button>
          {o.passed && next && (
            <button
              className="btn btn-primary"
              onClick={() => {
                close();
                go('/missions');
              }}
            >
              Back to Mission Control
            </button>
          )}
          {!o.passed && (
            <button className="btn btn-primary" onClick={close}>
              Fix and resubmit
            </button>
          )}
        </>
      }
    >
      <div className={`result ${o.passed ? 'result-pass' : 'result-fail'}`}>
        <div className="grade" aria-label={`Grade ${o.grade}`}>
          {o.grade}
        </div>
        <div>
          <h3>{o.passed ? 'Requirements satisfied' : 'Hard requirements still failing'}</h3>
          <p>
            Overall <b>{o.overall}/100</b>
            {o.xp > 0 && (
              <>
                {' '}
                · <Trophy size={14} /> <b>+{o.xp} XP</b>
                {!d.firstTime && ' (reduced: already completed)'}
              </>
            )}{' '}
            · attempt {o.attempt} · {o.hintsUsed} hint(s)
          </p>
          {o.failedIncident && (
            <p className="crit">
              The customer-impact budget was exceeded during the incident, so this attempt cannot pass. Retry to practise a faster
              diagnosis.
            </p>
          )}
          {Object.keys(o.skillXp).length > 0 && (
            <p className="muted tiny">
              Skill XP:{' '}
              {Object.entries(o.skillXp)
                .map(([k, v]) => `${SKILLS.find((s) => s.id === k)?.label.split(' ')[0]} +${v}`)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>
      <FeedbackCard
        ctx={{
          missionId: o.missionId,
          attempt: o.attempt,
          mode: session.mode,
          passed: o.passed,
          overall: o.overall,
          hintsUsed: o.hintsUsed,
          minutes: o.minutes,
        }}
      />
      <div className="tabs" role="tablist">
        {(
          [
            ['result', 'Results'],
            ['learn', 'What you should take away'],
            ['compare', 'Before and after'],
            ['diagnosis', 'Diagnosis'],
            ['record', 'Your decisions'],
          ] as const
        ).map(([id, l]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'tab-on' : ''}`} onClick={() => setTab(id)}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'result' && (
        <div className="debrief-grid">
          <section>
            <h4>Scoring dimensions</h4>
            <ul className="dims">
              {o.dims
                .filter((x) => x.weight > 0 && x.score != null)
                .map((x) => (
                  <li key={x.id}>
                    <div className="row-between">
                      <span>
                        {x.label} <span className="muted tiny">×{x.weight}</span>
                      </span>
                      <b>{x.score}</b>
                    </div>
                    <Meter value={x.score!} max={100} kind={x.score! >= 75 ? 'ok' : x.score! >= 50 ? 'warn' : 'crit'} label={x.label} />
                    <small>{x.note}</small>
                  </li>
                ))}
            </ul>
          </section>
          <section>
            <h4>Requirements</h4>
            <ul className="reqs">
              {o.reqs.map((r) => (
                <li key={r.id} className={r.pass ? 'pass' : 'fail'}>
                  <span className={r.pass ? 'ok' : 'crit'}>{r.pass ? '✓' : '✕'}</span>
                  <div>
                    <span>{r.label}</span>
                    <small>{r.detail}</small>
                    {!r.pass && (
                      <small className="why">
                        <b>Why it matters:</b> {r.why}
                      </small>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {o.passed && (o.decisions ?? []).length > 0 && (
              <div className="callout callout-purple decisions">
                <strong>Decisions recorded for later missions</strong>
                <ul className="list">
                  {(o.decisions ?? []).map((d) => (
                    <li key={d.tag}>
                      <Chip kind={d.kind === 'investment' ? 'ok' : d.kind === 'tradeoff' ? 'info' : 'warn'}>
                        {d.kind === 'investment' ? 'investment' : d.kind === 'tradeoff' ? 'trade-off' : 'debt'}
                      </Chip>{' '}
                      <b>{d.label}</b> {d.carries}
                      {d.judgement && <p className="muted tiny">{d.judgement}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'learn' && (
        <div className="learn">
          <section>
            <h4>Observed root cause</h4>
            <p>{m.debrief.rootCause}</p>
          </section>
          <section>
            <h4>Why your solution {o.passed ? 'worked' : 'fell short'}</h4>
            {failed.length === 0 ? (
              <p>
                Every requirement was satisfied. Your design addressed the cause rather than a symptom, stayed within constraints, and the
                verification load test confirmed it.
              </p>
            ) : (
              <ul className="list">
                {failed.map((r) => (
                  <li key={r.id}>
                    <b>{r.label}</b> — {r.detail}. {r.why}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h4>Side effects and remaining risks in your design</h4>
            {sideEffects.length ? (
              <ul className="list">
                {sideEffects.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <p>No notable side effects detected by the simulation.</p>
            )}
          </section>
          <section>
            <h4>Underlying engineering concepts</h4>
            {m.debrief.concepts.map((c) => (
              <div key={c.title} className="concept-card">
                <b>{c.title}</b>
                <p>{c.body}</p>
              </div>
            ))}
          </section>
          <section>
            <h4>Alternative approaches — and when they are right</h4>
            <div className="alts">
              {m.debrief.alternatives.map((a) => (
                <div key={a.name} className="alt">
                  <b>{a.name}</b>
                  <p>
                    <i>Use when:</i> {a.when}
                  </p>
                  <p>
                    <i>Trade-offs:</i> {a.tradeoffs}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h4>Common production mistakes</h4>
            <ul className="list">
              {m.debrief.mistakes.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Relevant AWS services &amp; principles</h4>
            <ul className="list">
              {m.debrief.aws.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Suggested follow-up experiments</h4>
            <ul className="list">
              {m.debrief.experiments.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </section>
        </div>
      )}

      {tab === 'compare' && <CompareTab session={session} />}

      {tab === 'diagnosis' && (
        <div className="learn">
          {m.rootCauses.length === 0 ? (
            <p>This is a design project, so there is no hidden root cause. Diagnosis is not scored.</p>
          ) : (
            <>
              <p>
                Your hypothesis:{' '}
                {o.diagnosis?.chosen.length ? (
                  o.diagnosis.chosen.map((id) => m.rootCauses.find((c) => c.id === id)?.label).join('; ')
                ) : (
                  <i>none recorded</i>
                )}
                . You consulted {o.diagnosis?.panelsSeen}/{o.diagnosis?.panelsNeeded} of the key evidence panels.
              </p>
              <h4>Was your reasoning supported by the evidence?</h4>
              <ul className="causes reasoning">
                {assessHypothesis(m.rootCauses, session.chosenCauses, session.panelsSeen).map((r) => (
                  <li key={r.id} className={r.verdict === 'supported' ? 'right' : 'wrong'}>
                    <div className="row-between">
                      <b>{r.label}</b>
                      <Chip kind={r.verdict === 'supported' ? 'ok' : r.verdict === 'unverified' ? 'warn' : 'crit'}>
                        {{ supported: 'supported', unverified: 'unverified', refuted: 'refuted', missed: 'missed' }[r.verdict]}
                      </Chip>
                    </div>
                    <p>{r.message}</p>
                  </li>
                ))}
              </ul>
              <h4>All candidate causes</h4>
              <ul className="causes">
                {m.rootCauses.map((c) => {
                  const picked = session.chosenCauses.includes(c.id);
                  return (
                    <li key={c.id} className={c.correct ? 'right' : 'wrong'}>
                      <div className="row-between">
                        <b>{c.label}</b>
                        <span>
                          {c.correct ? <Chip kind="ok">actual cause</Chip> : <Chip kind="neutral">red herring</Chip>}{' '}
                          {picked && <Chip kind="info">you chose this</Chip>}
                        </span>
                      </div>
                      <p>{c.why}</p>
                      <small className="muted">Evidence: {c.evidencePanels.join(', ')}</small>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'record' && (
        <div className="learn">
          <section>
            <h4>Timeline of your actions</h4>
            <ol className="timeline">
              {session.events
                .filter((e) => e.kind !== 'note')
                .map((e, i) => (
                  <li key={i}>
                    <span className="tl-t">T+{e.minute}m</span>
                    <div>{e.text}</div>
                  </li>
                ))}
            </ol>
          </section>
          {session.adrs.map((a) => (
            <section key={a.id}>
              <h4>ADR: {a.title}</h4>
              <p>
                <b>Decision:</b> {a.decision}
              </p>
              <p>
                <b>Trade-offs:</b> {a.cons}
              </p>
            </section>
          ))}
          {session.postmortem && (
            <section>
              <h4>Your postmortem</h4>
              <p>
                <b>What happened:</b> {session.postmortem.what}
              </p>
              <p>
                <b>Prevent recurrence:</b> {session.postmortem.prevent}
              </p>
            </section>
          )}
          <p className="muted tiny">Attempts so far: {progress.attempts[m.id] ?? 1}. Saved to your Engineering Journal.</p>
        </div>
      )}
    </Modal>
  );
}
