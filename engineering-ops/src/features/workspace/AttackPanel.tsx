import { ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { archSignature } from '@/engine/arch';
import { ATTACKS, runAttack, whatToChange, type AttackId, type AttackResult, type Outcome, type StageStatus } from '@/engine/attack';
import { useGame } from '@/game/store';
import { Chip } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';

const OUTCOME_LABEL: Record<AttackId, Record<Outcome, string>> = {
  'leaked-credential': { contained: 'Contained', partial: 'Partly exposed', breach: 'Breach', 'n/a': 'Not applicable' },
  'public-exposure': { contained: 'Nothing exposed', partial: 'Partly exposed', breach: 'Breach', 'n/a': 'Not applicable' },
  ddos: { contained: 'Held', partial: 'Degraded', breach: 'Outage', 'n/a': 'Not applicable' },
};
const OUTCOME_KIND: Record<Outcome, 'ok' | 'warn' | 'crit' | 'neutral'> = {
  contained: 'ok',
  partial: 'warn',
  breach: 'crit',
  'n/a': 'neutral',
};
const ICON: Record<StageStatus, { mark: string; label: string }> = {
  held: { mark: '✓', label: 'Held' },
  partial: { mark: '◐', label: 'Partly held' },
  failed: { mark: '✕', label: 'Failed' },
  info: { mark: '●', label: 'Premise' },
};

/** "T+10 min", "T+6 h", or "never" when nothing would notice. */
export function when(at: number | null): string {
  if (at === null) return 'never';
  if (at < 60) return `T+${at} min`;
  return `T+${Math.round(at / 60)} h`;
}

/**
 * Run an attack against the deployed design and read the breach timeline: which defences held, which failed, why, how far
 * the damage spreads (marked on the canvas) and what to change. It analyses the system; it does not change it.
 */
export function AttackPanel() {
  const { session } = useLive();
  const setHighlight = useGame((s) => s.setHighlight);
  const [attack, setAttack] = useState<AttackId>('leaked-credential');
  const [run, setRun] = useState<{ result: AttackResult; sig: string } | null>(null);
  const [show, setShow] = useState(true);

  const liveSig = session ? archSignature(session.live) : '';
  const stale = !!run && run.sig !== liveSig;
  const radius = useMemo(() => (run && show && !stale ? run.result.blastRadius : []), [run, show, stale]);
  useEffect(() => {
    setHighlight(radius);
    return () => setHighlight([]);
  }, [radius, setHighlight]);
  if (!session) return null;

  const pending = archSignature(session.draft) !== liveSig;
  const info = ATTACKS.find((a) => a.id === attack)!;
  const result = run?.result;
  const fixes = result ? whatToChange(result) : [];

  return (
    <section className="attack-panel" aria-label="Attack simulation">
      <h4>
        <ShieldAlert size={14} /> Attack simulation
      </h4>
      <label className="sr-only" htmlFor="attack-select">
        Attack
      </label>
      <select
        id="attack-select"
        aria-label="Attack"
        value={attack}
        onChange={(e) => {
          setAttack(e.target.value as AttackId);
          setRun(null);
        }}
      >
        {ATTACKS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.title}
          </option>
        ))}
      </select>
      <p className="muted tiny">{info.blurb}</p>
      <div className="row-gap">
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setRun({ result: runAttack(attack, session.live, session.workload), sig: liveSig })}
        >
          Run attack
        </button>
        {result && result.blastRadius.length > 0 && (
          <label className="row-gap tiny">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show blast radius on canvas
          </label>
        )}
      </div>
      <p className="muted tiny">
        Attacks the deployed system{pending ? ' (you have undeployed changes: deploy them to test them)' : ''}. Nothing in your run changes.
      </p>

      {result && (
        <div className="attack-result" aria-live="polite">
          {stale && <p className="tiny warn">The deployed design has changed since this run. Run it again.</p>}
          <div className="ar-head">
            <Chip kind={OUTCOME_KIND[result.outcome]}>{OUTCOME_LABEL[result.attack][result.outcome]}</Chip>
            <span>{result.summary}</span>
          </div>
          <p className="ar-impact">{result.impact}</p>
          <ol className="ar-stages">
            {result.stages.map((s) => (
              <li key={s.name} className={`ar-stage ar-${s.status}`}>
                <span className="ar-mark" aria-hidden="true">
                  {ICON[s.status].mark}
                </span>
                <div>
                  <div className="ar-title">
                    <b>{s.name}</b>
                    <span className="sr-only"> ({ICON[s.status].label})</span>
                    <span className="muted tiny">
                      {' '}
                      {s.defence} · {when(s.at)}
                    </span>
                  </div>
                  <p>{s.detail}</p>
                  {s.fix && (s.status === 'failed' || s.status === 'partial') && (
                    <p className="ar-fix">
                      <b>Fix:</b> {s.fix}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {fixes.length > 0 && (
            <div className="ar-todo">
              <b>What to change</b>
              <ul>
                {fixes.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="muted tiny">Timings are illustrative, not measurements. The flood numbers come from the simulation engine.</p>
        </div>
      )}
    </section>
  );
}
