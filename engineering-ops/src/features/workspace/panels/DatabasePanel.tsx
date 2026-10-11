import { roleOf } from '@/engine/arch';
import { dbQueryStats } from '@/engine/telemetry';
import { Chip, Empty, Meter } from '@/shared/ui/common';
import { ms, num, pct } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { Section } from './shared';

export function DatabasePanel() {
  const { session, snap } = useLive();
  if (!session || !snap) return null;
  const dbs = session.live.nodes.filter((n) => ['db', 'kv'].includes(roleOf(n)));
  if (!dbs.length) return <Empty title="No databases">Add a relational database or DynamoDB table to see query statistics.</Empty>;
  return (
    <div className="panel-body">
      {dbs.map((d) => {
        const m = snap.nodes[d.id];
        const stats = roleOf(d) === 'db' ? dbQueryStats(d, snap, session.workload) : [];
        return (
          <Section
            key={d.id}
            title={`${d.label} — ${d.kind}`}
            right={m && <Chip kind={m.status === 'healthy' ? 'ok' : m.status === 'idle' ? 'neutral' : 'crit'}>{m.status}</Chip>}
          >
            {m && (
              <div className="grid4">
                <div className="mini">
                  <span>CPU</span>
                  <b className={m.util >= 1 ? 'crit' : m.util > 0.75 ? 'warn' : ''}>{(m.util * 100).toFixed(0)}%</b>
                  <Meter value={m.util} label="CPU" />
                </div>
                {m.connMax != null && (
                  <div className="mini">
                    <span>Connections</span>
                    <b>
                      {(m.connUsed ?? 0).toFixed(0)} / {m.connMax}
                    </b>
                    <Meter value={m.connUsed ?? 0} max={m.connMax} label="Connections" />
                  </div>
                )}
                <div className="mini">
                  <span>Queries / s</span>
                  <b>{num(m.offered)}</b>
                </div>
                <div className="mini">
                  <span>Avg latency</span>
                  <b>{ms(m.latencyMs)}</b>
                </div>
                {m.staleReadPct != null && m.staleReadPct > 0 && (
                  <div className="mini">
                    <span>Stale reads after a write</span>
                    <b className={m.staleReadPct > 1 ? 'crit' : 'warn'}>{m.staleReadPct.toFixed(0)}%</b>
                  </div>
                )}
                {m.hotItemWritesPerSec != null && m.hotItemWritesPerSec > 0 && (
                  <div className="mini">
                    <span>Hottest item writes/s</span>
                    <b className={m.hotItemWritesPerSec > 1000 ? 'crit' : ''}>{num(m.hotItemWritesPerSec)} / 1,000</b>
                  </div>
                )}
                {m.replicaLagSec != null && m.replicaLagSec > 0 && (
                  <div className="mini">
                    <span>Replica lag</span>
                    <b>{m.replicaLagSec.toFixed(1)}s</b>
                  </div>
                )}
              </div>
            )}
            {stats.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Statement</th>
                    <th>Calls/min</th>
                    <th>Mean</th>
                    <th>% of DB time</th>
                    <th>Plan</th>
                  </tr>
                </thead>
                <tbody>
                  {stats
                    .sort((a, b) => b.share - a.share)
                    .map((q, i) => (
                      <tr key={i}>
                        <td className="mono sql">{q.sql}</td>
                        <td className="mono">{num(q.callsPerMin)}</td>
                        <td className="mono">{ms(q.meanMs)}</td>
                        <td className="mono">
                          <b>{pct(q.share, 0)}</b>
                        </td>
                        <td className={`tiny ${q.plan.startsWith('Seq') ? 'crit' : ''}`}>{q.plan}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
            {m && m.reasons.length > 0 && (
              <ul className="list">
                {m.reasons.map((r, i) => (
                  <li key={i} className={`r-${r.severity}`}>
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        );
      })}
    </div>
  );
}
