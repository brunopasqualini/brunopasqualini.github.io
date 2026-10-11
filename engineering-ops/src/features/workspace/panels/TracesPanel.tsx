import { useMemo, useState } from 'react';
import { ofKind } from '@/engine/arch';
import { generateTraces } from '@/engine/telemetry';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Chip, Empty } from '@/shared/ui/common';
import { ms } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function TracesPanel() {
  const { session, snap } = useLive();
  const mode = useGame((s) => s.settings.mode);
  const [pick, setPick] = useState(0);
  const tick = useGame((s) => s.tick);
  const traces = useMemo(
    () => (session && snap ? generateTraces(session.live, snap, missionOf(session.missionId).seed) : []),
    [tick, session, snap],
  ); // eslint-disable-line react-hooks/exhaustive-deps
  if (!session) return null;
  const enabled = ofKind(session.live, 'tracing', 'observability-stack').length > 0 || mode === 'beginner';
  if (!enabled)
    return (
      <Empty title="Distributed tracing is not configured">
        Without traces you can see <i>that</i> requests are slow but not <i>where</i> the time goes. Add a <b>Distributed tracing</b>{' '}
        component (Reliability category) and deploy it.
      </Empty>
    );
  const t = traces[Math.min(pick, traces.length - 1)];
  return (
    <div className="panel-body traces">
      {mode === 'beginner' && ofKind(session.live, 'tracing').length === 0 && (
        <p className="tip span-all">
          Beginner mode enables tracing for you. In harder modes you must add a tracing component to get this view.
        </p>
      )}
      <ul className="trace-list" aria-label="Sampled traces">
        {traces.map((x, i) => (
          <li key={x.id}>
            <button className={`${i === pick ? 'on' : ''} ${x.error ? 'err' : ''}`} onClick={() => setPick(i)}>
              <span className="mono">{x.id.slice(0, 8)}</span>
              <span>{ms(x.total)}</span>
              {x.error ? <Chip kind="crit">error</Chip> : <Chip kind="ok">ok</Chip>}
            </button>
          </li>
        ))}
        {traces.length === 0 && <li className="muted">No traffic to sample.</li>}
      </ul>
      {t && (
        <div className="waterfall" role="img" aria-label="Trace waterfall">
          <div className="wf-head">
            <b>Trace {t.id}</b> · {ms(t.total)} · {t.spans.length} spans
          </div>
          {t.spans.map((s) => (
            <div key={s.id} className="wf-row" style={{ paddingLeft: s.depth * 14 }}>
              <span className="wf-name" title={s.label}>
                {s.label}
              </span>
              <div className="wf-track">
                <div
                  className={`wf-bar ${s.error ? 'err' : s.duration > 200 ? 'slow' : ''}`}
                  style={{
                    left: `${(s.start / Math.max(1, t.total)) * 100}%`,
                    width: `${Math.max(1.5, (s.duration / Math.max(1, t.total)) * 100)}%`,
                  }}
                />
              </div>
              <span className="wf-dur">
                {ms(s.duration)}
                {s.error && <Chip kind="crit">{s.error}</Chip>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
