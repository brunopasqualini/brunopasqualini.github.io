import { useMemo } from 'react';
import { alertHistory } from '@/engine/telemetry';
import { useGame } from '@/game/store';
import { ago, clock } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function DeploymentsPanel() {
  const { session } = useLive();
  const tick = useGame((s) => s.tick);
  const items = useMemo(() => {
    if (!session) return [];
    const rows: { minute: number; kind: string; title: string; detail: string; by: string }[] = [
      ...session.deployLog.map((d) => ({ minute: d.minute, kind: d.kind, title: d.title, detail: d.detail, by: d.by })),
      ...alertHistory(session.live, session.history).map((a) => ({
        minute: a.t,
        kind: 'alert',
        title: a.title,
        detail: a.detail,
        by: a.source,
      })),
      ...session.events
        .filter((e) => ['incident', 'chaos', 'verify', 'revert'].includes(e.kind))
        .map((e) => ({ minute: e.minute, kind: e.kind, title: e.text, detail: '', by: 'system' })),
    ];
    return rows.sort((a, b) => b.minute - a.minute);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session]);
  if (!session) return null;
  return (
    <div className="panel-body">
      <p className="muted tiny">
        Recent deployments, configuration changes, alerts and incidents. Correlate their timing with the metrics — what changed just before
        things went wrong?
      </p>
      <ol className="timeline">
        {items.map((d, i) => (
          <li key={i} className={`tl-${d.kind}`}>
            <span className="tl-t">{d.minute < 0 ? ago(d.minute) : clock(d.minute)}</span>
            <div>
              <b>{d.title}</b>
              {d.detail && <p>{d.detail}</p>}
              <span className="muted tiny">
                {d.kind} · {d.by}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
