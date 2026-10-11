import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { nodeById, roleOf } from '@/engine/arch';
import { useGame } from '@/game/store';
import { Chip, Empty } from '@/shared/ui/common';
import { clock, dur, num, pct } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { AX, TIP, Section } from './shared';

export function QueuesPanel() {
  const { session, snap } = useLive();
  const tick = useGame((s) => s.tick);
  if (!session || !snap) return null;
  const queues = session.live.nodes.filter((n) => roleOf(n) === 'queue' && !n.config.isDlq);
  if (!queues.length) return <Empty title="No queues">Add a message queue to see depth, age and consumer health.</Empty>;
  return (
    <div className="panel-body">
      {queues.map((q) => {
        const m = snap.nodes[q.id];
        const consumers = session.live.edges
          .filter((e) => e.source === q.id)
          .map((e) => nodeById(session.live, e.target)!)
          .filter((n) => n && roleOf(n) !== 'queue');
        const dlq = session.live.edges
          .filter((e) => e.source === q.id)
          .map((e) => nodeById(session.live, e.target)!)
          .find((n) => n && roleOf(n) === 'queue');
        const series = session.history.slice(-60).map((h) => ({
          t: h.minute,
          depth: Math.round(h.nodes[q.id]?.queueDepth ?? 0),
          arr: +(h.nodes[q.id]?.arrivalRate ?? 0).toFixed(1),
          drain: +(h.nodes[q.id]?.drainRate ?? 0).toFixed(1),
        }));
        void tick;
        return (
          <Section
            key={q.id}
            title={`${q.label}`}
            right={m && <Chip kind={m.status === 'healthy' ? 'ok' : m.status === 'degraded' ? 'warn' : 'crit'}>{m.status}</Chip>}
          >
            {m && (
              <div className="grid4">
                <div className="mini">
                  <span>Backlog</span>
                  <b>{num(m.queueDepth ?? 0)} msgs</b>
                </div>
                <div className="mini">
                  <span>Oldest message age</span>
                  <b className={(m.queueDelaySec ?? 0) > 120 ? 'crit' : ''}>{dur(m.queueDelaySec ?? 0)}</b>
                </div>
                <div className="mini">
                  <span>Arrivals vs drain</span>
                  <b>
                    {num(m.arrivalRate ?? 0)} vs {num(m.drainRate ?? 0)} /s
                  </b>
                </div>
                <div className="mini">
                  <span>Consumer capacity</span>
                  <b>{num(m.capacity)} /s</b>
                </div>
                <div className="mini">
                  <span>Visibility timeout</span>
                  <b>{q.config.visibilityTimeoutSec}s</b>
                </div>
                <div className="mini">
                  <span>Redelivery rate</span>
                  <b className={(m.dupRate ?? 0) > 0.02 ? 'warn' : ''}>{pct(m.dupRate ?? 0, 0)}</b>
                </div>
                <div className="mini">
                  <span>Dead-letter queue</span>
                  <b>{dlq ? `${num(snap.nodes[dlq.id]?.queueDepth ?? 0)} parked` : 'none'}</b>
                </div>
                <div className="mini">
                  <span>Max receives</span>
                  <b>{q.config.maxReceiveCount}</b>
                </div>
              </div>
            )}
            <div className="chart">
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={series}>
                  <CartesianGrid stroke="#17233f" />
                  <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
                  <YAxis {...AX} />
                  <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
                  <Area dataKey="depth" name="backlog" stroke="#f472b6" fill="#f472b6" fillOpacity={0.15} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <h5>Consumers</h5>
            <ul className="list">
              {consumers.map((c) => {
                const cm = snap.nodes[c.id];
                return (
                  <li key={c.id}>
                    {c.label}: {c.config.replicas ?? 1} replicas × {c.config.concurrency ?? '—'} concurrency ·{' '}
                    {(cm?.util ?? 0) * 100 > 0 ? `${((cm?.util ?? 0) * 100).toFixed(0)}% busy` : 'idle'} ·{' '}
                    {c.config.idempotent ? <Chip kind="ok">idempotent</Chip> : <Chip kind="warn">not idempotent</Chip>}
                  </li>
                );
              })}
            </ul>
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
