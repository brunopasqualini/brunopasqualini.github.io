import { Rocket, RotateCcw, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import { archSignature, diffArch, validateArch } from '@/engine/arch';
import { solve } from '@/engine/engine';
import { useGame } from '@/game/store';
import { Chip, diffClass } from '@/shared/ui/common';
import { usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function PlanPanel() {
  const { session, snap } = useLive();
  const deploy = useGame((s) => s.deploy);
  const revert = useGame((s) => s.revert);
  const reset = useGame((s) => s.resetDraft);
  const select = useGame((s) => s.select);
  const tick = useGame((s) => s.tick);

  const plan = useMemo(() => {
    if (!session) return undefined;
    const diff = diffArch(session.live, session.draft);
    const issues = validateArch(session.draft);
    const changed = archSignature(session.draft) !== archSignature(session.live);
    let costDelta = 0;
    if (changed && snap) {
      try {
        costDelta =
          solve(session.draft, session.workload, Math.max(0, session.minute - 1), session.sim, session.chaos).snapshot.system.costMonthly -
          snap.system.costMonthly;
      } catch {
        costDelta = 0;
      }
    }
    return { diff, issues, changed, costDelta };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session, snap]);
  if (!session || !plan) return null;
  const errors = plan.issues.filter((i) => i.severity === 'error');
  const warns = plan.issues.filter((i) => i.severity === 'warn');
  const ex = session.explain;

  return (
    <div className="plan">
      <header className="plan-head">
        <h3>Plan &amp; deploy</h3>
        <p className="muted">
          Edits on the canvas are a <b>draft</b>. Review the plan, then deploy it to the running system.
        </p>
      </header>
      <div className="plan-actions">
        <button className="btn btn-primary" disabled={!plan.changed || errors.length > 0} onClick={deploy}>
          <Rocket size={16} /> Deploy changes
        </button>
        <button className="btn btn-ghost" disabled={!plan.changed} onClick={reset}>
          <RotateCcw size={16} /> Discard draft
        </button>
        <button className="btn btn-ghost" disabled={session.liveStack.length === 0} onClick={revert}>
          <Undo2 size={16} /> Revert last deploy
        </button>
      </div>

      <section>
        <div className="row-between">
          <h4>Pending changes</h4>
          {plan.changed && (
            <span className={`mono ${plan.costDelta > 0 ? 'warn' : 'ok'}`}>
              {plan.costDelta >= 0 ? '+' : '−'}
              {usd2(Math.abs(plan.costDelta))}/mo est.
            </span>
          )}
        </div>
        {plan.diff.length === 0 ? (
          <p className="muted">
            No pending changes. Edit the architecture on the canvas, or change a component’s configuration in the inspector.
          </p>
        ) : (
          <ul className="diff">
            {plan.diff.map((d, i) => (
              <li key={i} className={diffClass(d.type)}>
                <span className="op">
                  {d.type === 'add' || d.type === 'connect' ? '+' : d.type === 'remove' || d.type === 'disconnect' ? '−' : '~'}
                </span>
                {d.nodeId ? (
                  <button className="link" onClick={() => select('node', d.nodeId)}>
                    {d.text}
                  </button>
                ) : (
                  d.text
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h4>Validation</h4>
        {plan.issues.length === 0 && <p className="ok">✓ The draft is structurally valid.</p>}
        <ul className="issues">
          {errors.map((i, k) => (
            <li key={`e${k}`} className="crit">
              <Chip kind="crit">error</Chip>{' '}
              {i.nodeId ? (
                <button className="link" onClick={() => select('node', i.nodeId)}>
                  {i.text}
                </button>
              ) : (
                i.text
              )}
            </li>
          ))}
          {warns.map((i, k) => (
            <li key={`w${k}`}>
              <Chip kind="warn">warning</Chip>{' '}
              {i.nodeId ? (
                <button className="link" onClick={() => select('node', i.nodeId)}>
                  {i.text}
                </button>
              ) : (
                i.text
              )}
            </li>
          ))}
        </ul>
        {errors.length > 0 && (
          <p className="muted tiny">
            Errors block deployment. Warnings are allowed — but read them: they often explain tomorrow’s incident.
          </p>
        )}
      </section>

      {ex && (
        <section className="explain">
          <div className="row-between">
            <h4>What changed and why</h4>
            <Chip kind={ex.settled ? 'ok' : 'info'}>{ex.settled ? 'settled' : 'settling…'}</Chip>
          </div>
          <p className="muted tiny">
            Deployed at minute {ex.deployedAt}: {ex.title}
          </p>
          {ex.changes.length === 0 && (
            <p className="muted">
              No significant metric change yet. Run the simulation for a few minutes — autoscaling and queues take time to react.
            </p>
          )}
          <ul className="changes">
            {ex.changes.map((c) => (
              <li key={c.key} className={c.better ? 'better' : 'worse'}>
                <div className="row-between">
                  <b>{c.label}</b>
                  <span className="mono">
                    {fmt(c.before, c.unit)} → {fmt(c.after, c.unit)} {c.better ? '▲' : '▼'}
                  </span>
                </div>
                <p>{c.because}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function fmt(v: number, unit: string): string {
  if (unit === '$') return usd2(v);
  if (unit === 'ms') return `${v.toFixed(0)}ms`;
  if (unit === '%') return `${v.toFixed(v > 99 ? 2 : 1)}%`;
  return v.toFixed(0);
}
