import { useMemo } from 'react';
import { alertHistory } from '@/engine/telemetry';
import { useGame } from '@/game/store';
import { clock } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function AlertsPanel() {
  const { session, report } = useLive();
  const tick = useGame((s) => s.tick);
  const events = useMemo(() => (session ? alertHistory(session.live, session.history) : []), [tick, session]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session || !report) return null;
  return (
    <div className="panel-body">
      <div className="row-between">
        <h4>Alert history</h4>
        <span className="muted">
          Estimated time-to-detect <b className={report.obs.mttdMinutes <= 5 ? 'ok' : 'warn'}>{report.obs.mttdMinutes} min</b> ·
          observability coverage <b>{report.obs.coverage}%</b>
        </span>
      </div>
      {report.obs.alerts === 0 && (
        <div className="callout callout-warn">
          <strong>No alert rules are configured.</strong>
          <p>
            You will find out about problems when customers tell you — typically 15+ minutes late. Add an <b>Alert rule</b> on a
            customer-visible symptom (error rate or p95 latency) and link it to a runbook.
          </p>
        </div>
      )}
      {report.obs.notes.map((n) => (
        <p key={n} className="tip">
          {n}
        </p>
      ))}
      <ol className="timeline">
        {events.map((e, i) => (
          <li key={i} className={`tl-${e.source}`}>
            <span className="tl-t">{clock(e.t)}</span>
            <div>
              <b>{e.title}</b>
              <p>{e.detail}</p>
              <span className="muted tiny">
                {e.source} · {e.severity}
                {e.actionable ? ' · runbook' : ''}
              </span>
            </div>
          </li>
        ))}
        {events.length === 0 && <li className="muted">No alerts have fired.</li>}
      </ol>
    </div>
  );
}
