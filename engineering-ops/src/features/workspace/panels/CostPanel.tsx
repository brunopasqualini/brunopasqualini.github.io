import { useMemo } from 'react';
import { costBreakdown } from '@/engine/telemetry';
import { missionOf } from '@/game/session';
import { Chip, Meter } from '@/shared/ui/common';
import { usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

const CAT_COLORS: Record<string, string> = {
  compute: '#22d3ee',
  data: '#a78bfa',
  network: '#60a5fa',
  storage: '#34d399',
  observability: '#fbbf24',
  delivery: '#64748b',
  transfer: '#f472b6',
  messaging: '#fb923c',
  security: '#f87171',
};

export function CostPanel() {
  const { session, snap, report } = useLive();
  const mission = session ? missionOf(session.missionId) : undefined;
  const rows = useMemo(() => (session && snap ? costBreakdown(session.live, snap, session.workload) : []), [session, snap]);
  if (!session || !snap) return null;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const byCat = new Map<string, number>();
  rows.forEach((r) => r.lines.forEach((l) => byCat.set(l.category, (byCat.get(l.category) ?? 0) + l.usd)));
  const budget = mission?.constraints.budget;
  return (
    <div className="panel-body">
      <div className="cost-top">
        <div>
          <div className="big">
            {usd2(total)}
            <small>/ month</small>
          </div>
          <div className="muted tiny">Simulated estimate at current load — not AWS pricing.</div>
        </div>
        {budget && (
          <div className="cost-budget">
            <div className="row-between">
              <span>Budget {usd2(budget)}</span>
              <b className={total > budget ? 'crit' : 'ok'}>
                {total > budget ? `${usd2(total - budget)} over` : `${usd2(budget - total)} under`}
              </b>
            </div>
            <Meter value={total} max={budget} label="Budget used" />
          </div>
        )}
        {report && (
          <div className="cost-budget">
            <div className="row-between">
              <span>Cost tag coverage</span>
              <b className={report.costTagCoverage < 90 ? 'warn' : 'ok'}>{report.costTagCoverage.toFixed(0)}%</b>
            </div>
            <Meter value={report.costTagCoverage} max={100} kind={report.costTagCoverage >= 90 ? 'ok' : 'warn'} label="Tag coverage" />
          </div>
        )}
      </div>
      <div className="stackbar" role="img" aria-label="Cost by category">
        {Array.from(byCat.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => (
            <div
              key={c}
              style={{ width: `${(v / Math.max(1, total)) * 100}%`, background: CAT_COLORS[c] ?? '#64748b' }}
              title={`${c}: ${usd2(v)}`}
            />
          ))}
      </div>
      <div className="legend">
        {Array.from(byCat.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([c, v]) => (
            <span key={c}>
              <i style={{ background: CAT_COLORS[c] ?? '#64748b' }} />
              {c} {usd2(v)}
            </span>
          ))}
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Component</th>
            <th>Cost / mo</th>
            <th>Load</th>
            <th>Breakdown</th>
            <th>Owner tag</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const m = snap.nodes[r.node.id];
            const idle =
              m &&
              m.offered < 0.01 &&
              !['network', 'identity', 'delivery', 'observability'].includes(m.role) &&
              ['cache', 'search', 'db', 'compute', 'storage'].includes(m.role) &&
              r.total > 20;
            return (
              <tr key={r.node.id}>
                <td>
                  {r.node.label}{' '}
                  {idle && (
                    <Chip kind="warn" title="Costs money but receives no traffic">
                      idle?
                    </Chip>
                  )}
                </td>
                <td className="mono">
                  <b>{usd2(r.total)}</b>
                </td>
                <td className="mono">{m ? `${(m.util * 100).toFixed(0)}% util` : '—'}</td>
                <td className="tiny">{r.lines.map((l) => `${l.label} ${usd2(l.usd)}`).join(' · ')}</td>
                <td className="tiny">
                  {Object.prototype.hasOwnProperty.call(r.node.config, 'costTag')
                    ? r.node.config.costTag || <Chip kind="warn">untagged</Chip>
                    : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
