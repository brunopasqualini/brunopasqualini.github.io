import { FirstRunGuide } from '@/features/workspace/FirstRunGuide';
import { isFirstRun } from '@/game/guide';
import { evidenceProgress } from '@/game/diagnosis';
import { ArrowLeft, BookOpen, CheckCircle2, ClipboardList, Lightbulb, Siren, Target, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { evalRequirement } from '@/game/scoring';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Chip } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';
import { ADRModal, PostmortemModal } from '@/features/workspace/Modals';
import { go } from '@/shared/lib/nav';

export function MissionPanel() {
  const { session, snap, report } = useLive();
  const setHyp = useGame((s) => s.setHypothesis);
  const nextHint = useGame((s) => s.nextHint);
  const act = useGame((s) => s.act);
  const setIntro = useGame((s) => s.setIntroOpen);
  const setDock = useGame((s) => s.setDock);
  const [adr, setAdr] = useState(false);
  const [pm, setPm] = useState(false);
  const closeSession = useGame((s) => s.closeSession);
  useGame((s) => s.tick);
  const progress = useGame((s) => s.progress);

  const mission = session ? missionOf(session.missionId) : undefined;
  const reqs = useMemo(() => {
    if (!session || !mission || !report || !snap) return [];
    return mission.requirements.map((r) =>
      evalRequirement(r, {
        arch: session.live,
        report,
        snap,
        workload: session.workload,
        flags: session.flags,
        actionsTaken: session.actionsTaken,
        adrs: session.adrs,
        postmortem: session.postmortem,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, mission, report, snap, session?.adrs.length, session?.postmortem]);
  if (!session || !mission) return null;
  const back = () => {
    closeSession();
    go(mission.kind === 'incident' ? '/incidents' : '/missions');
  };

  const passing = reqs.filter((r) => r.pass).length;
  const hardOpen = reqs.filter((r) => r.hard && !r.pass).length;
  const actions = mission.actions.filter((a) => !a.available || a.available(session.live, session.flags));
  const mode = session.mode;
  const firstRun = isFirstRun(session, Object.keys(progress.completed).length, progress.outcomes.length);

  return (
    <div className="mission-panel">
      <button className="back-link" onClick={back}>
        <ArrowLeft size={15} /> Back to {mission.kind === 'incident' ? 'Incidents' : 'Missions'}
      </button>
      <header className="mp-head">
        <span className={`mp-icon ${mission.kind === 'incident' ? 'mp-icon-crit' : ''}`} aria-hidden="true">
          {mission.kind === 'incident' ? <Siren size={22} /> : <Target size={22} />}
        </span>
        <div>
          <small>Mission {mission.number}</small>
          <h3>{mission.title}</h3>
        </div>
      </header>
      <div className="chips">
        <Chip kind={mission.kind === 'incident' ? 'crit' : 'info'}>{mission.kind === 'incident' ? 'Incident' : 'Design project'}</Chip>
        <Chip>{mission.difficulty}</Chip>
        <Chip>~{mission.estMinutes}m</Chip>
        {session.failed && <Chip kind="crit">impact budget exceeded</Chip>}
      </div>
      <p className="mp-story">{mission.tagline}</p>
      <button className="btn btn-ghost btn-sm" onClick={() => setIntro(true)}>
        <BookOpen size={14} /> Re-read briefing
      </button>

      {firstRun && <FirstRunGuide session={session} />}

      <section>
        <div className="row-between">
          <h4>Objectives</h4>
          <span className="muted tiny">
            {passing}/{reqs.length} met · {hardOpen} hard open
          </span>
        </div>
        <ul className="reqs">
          {reqs.map((r) => (
            <li key={r.id} className={r.pass ? 'pass' : 'fail'}>
              {r.pass ? (
                <CheckCircle2 size={16} className="ok" aria-label="met" />
              ) : (
                <XCircle size={16} className={r.hard ? 'crit' : 'warn'} aria-label="not met" />
              )}
              <div>
                <span>
                  {r.label} {r.hard ? <Chip kind="neutral">hard</Chip> : <Chip kind="neutral">soft</Chip>}
                </span>
                <small>{r.detail}</small>
              </div>
            </li>
          ))}
        </ul>
        <p className="muted tiny">
          Live status of your <i>deployed</i> architecture at the current traffic level. “Verify &amp; submit” runs a full load test before
          scoring.
        </p>
      </section>

      <section>
        <h4>Hints</h4>
        <ul className="hints">
          {mission.hints.slice(0, session.hintsUsed).map((h, i) => (
            <li key={i}>
              <Lightbulb size={14} /> <span>{h.text}</span>
            </li>
          ))}
        </ul>
        {session.hintsUsed < mission.hints.length ? (
          <button className="btn btn-ghost btn-sm" onClick={nextHint}>
            <Lightbulb size={14} /> Reveal {session.hintsUsed === 0 ? 'a hint' : 'another hint'}{' '}
            <span className="muted">
              ({session.hintsUsed}/{mission.hints.length}, small score effect)
            </span>
          </button>
        ) : (
          <p className="muted tiny">All hints revealed.</p>
        )}
      </section>

      {mode === 'beginner' && !firstRun && (
        <div className="callout callout-info">
          <strong>How to approach this</strong>
          <ol className="steps-mini">
            <li>
              <b>Investigate</b> — open the highlighted <i>look here</i> tabs below the canvas
              {mission.kind === 'incident' ? ' (the incident keeps running while you do)' : ''}.
            </li>
            {mission.rootCauses.length > 0 && (
              <li>
                <b>Form a hypothesis</b> — record what you think the root cause is.
              </li>
            )}
            <li>
              <b>Change the design</b> — edit components in the inspector, open <b>Plan</b>, then <b>Deploy</b>.
            </li>
            <li>
              <b>Observe</b> — read “what changed and why”, then fix any side effects.
            </li>
            <li>
              <b>Verify &amp; submit</b> when every hard requirement is green.
            </li>
          </ol>
        </div>
      )}

      <section>
        <h4>Constraints</h4>
        <ul className="list">
          {mission.constraints.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      </section>

      {mission.rootCauses.length > 0 && (
        <section>
          <h4>Hypothesis</h4>
          <p className="muted tiny">
            What do you believe the root cause is? Select all that apply — diagnosis quality is scored on accuracy and on the evidence you
            consulted.
          </p>
          <ul className="hyp">
            {mission.rootCauses.map((c) => (
              <li key={c.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={session.chosenCauses.includes(c.id)}
                    onChange={(e) =>
                      setHyp(e.target.checked ? [...session.chosenCauses, c.id] : session.chosenCauses.filter((x) => x !== c.id))
                    }
                  />
                  <span>{c.label}</span>
                </label>
                {session.chosenCauses.includes(c.id) && (
                  <small className="muted">
                    Evidence checked: {evidenceProgress(c, session.panelsSeen).seen}/{evidenceProgress(c, session.panelsSeen).total} panels
                  </small>
                )}
                {mode === 'beginner' && (
                  <small className="muted">
                    Evidence:{' '}
                    {c.evidencePanels
                      .map((p) => (
                        <button key={p} className="link" onClick={() => setDock(p)}>
                          {p}
                        </button>
                      ))
                      .reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ', ', x] : [x]), [])}
                  </small>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {actions.length > 0 && (
        <section>
          <h4>Operational actions</h4>
          <ul className="actions">
            {actions.map((a) => (
              <li key={a.id}>
                <div>
                  <b>{a.label}</b>
                  <p>{a.description}</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => act(a.id)}>
                  Run · ~{a.minutes}m
                </button>
              </li>
            ))}
          </ul>
          <p className="muted tiny">
            Actions take simulated time to complete; customers keep experiencing the system in the meantime. You can achieve the same
            changes by editing the architecture yourself.
          </p>
        </section>
      )}

      <section>
        <h4>Engineering record</h4>
        <div className="row-gap">
          <button className="btn btn-ghost btn-sm" onClick={() => setAdr(true)}>
            <ClipboardList size={14} /> Record ADR {session.adrs.length > 0 && <Chip kind="ok">{session.adrs.length}</Chip>}
          </button>
          {mission.needsPostmortem && (
            <button className="btn btn-ghost btn-sm" onClick={() => setPm(true)}>
              <ClipboardList size={14} /> {session.postmortem ? 'Edit postmortem' : 'Write postmortem'}{' '}
              {session.postmortem && <Chip kind="ok">saved</Chip>}
            </button>
          )}
        </div>
        <p className="muted tiny">
          {mission.needsADR
            ? 'This mission requires an ADR explaining your decision.'
            : 'ADRs are optional here but strengthen your rationale score.'}
          {mission.needsPostmortem ? ' A postmortem is required for incidents.' : ''}
        </p>
      </section>
      {adr && <ADRModal onClose={() => setAdr(false)} />}
      {pm && <PostmortemModal onClose={() => setPm(false)} />}
    </div>
  );
}
