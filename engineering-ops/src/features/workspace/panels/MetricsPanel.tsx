import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { roleOf } from '@/engine/arch';
import { useGame } from '@/game/store';
import { clock } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { AX, TIP } from './shared';

export function MetricsPanel() {
  const { session } = useLive();
  const sel = useGame((s) => s.selection);
  const tick = useGame((s) => s.tick);
  const data = useMemo(() => {
    if (!session) return [];
    return session.history.slice(-70).map((h) => {
      const row: Record<string, number> = {
        t: h.minute,
        success: +(h.system.successRate * 100).toFixed(2),
        errors: +(h.system.errorRate * 100).toFixed(2),
        p50: +h.system.p50.toFixed(0),
        p95: +h.system.p95.toFixed(0),
        rps: +h.system.rps.toFixed(1),
        thr: +h.system.throughput.toFixed(1),
        cost: +h.system.costMonthly.toFixed(0),
        backlog: +h.system.queueBacklog.toFixed(0),
        conn: +(h.system.dbConnPct * 100).toFixed(0),
      };
      for (const n of Object.values(h.nodes))
        if (['compute', 'worker', 'db', 'cache', 'kv'].includes(n.role)) row[`u:${n.id}`] = +(Math.min(n.util, 2) * 100).toFixed(0);
      return row;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session]);
  if (!session) return null;
  const deploys = session.events.filter((e) => e.kind === 'deploy' || e.kind === 'action').map((e) => e.minute);
  const utilNodes = session.live.nodes.filter((n) => ['compute', 'worker', 'db', 'cache', 'kv'].includes(roleOf(n)));
  const palette = ['#22d3ee', '#f59e0b', '#a78bfa', '#34d399', '#f472b6', '#60a5fa', '#fb923c'];
  const hasQueue = session.live.nodes.some((n) => roleOf(n) === 'queue');
  const hasDb = session.live.nodes.some((n) => roleOf(n) === 'db');
  const marks = deploys.map((m, i) => <ReferenceLine key={i} x={m} stroke="#60a5fa" strokeDasharray="3 3" />);
  const sn = sel.type === 'node' ? session.history[session.history.length - 1]?.nodes[sel.id!] : undefined;
  void sn;
  return (
    <div className="panel-body charts">
      <div className="chart">
        <h5>Success rate (%)</h5>
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={data}>
            <CartesianGrid stroke="#17233f" />
            <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
            <YAxis {...AX} domain={[0, 100]} />
            <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
            <Area dataKey="success" stroke="#34d399" fill="#34d399" fillOpacity={0.15} isAnimationActive={false} />
            {marks}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="chart">
        <h5>Latency (ms)</h5>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid stroke="#17233f" />
            <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
            <YAxis {...AX} />
            <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
            <Line dataKey="p50" stroke="#22d3ee" dot={false} isAnimationActive={false} name="p50" />
            <Line dataKey="p95" stroke="#f59e0b" dot={false} isAnimationActive={false} name="p95" />
            {marks}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart">
        <h5>Traffic (req/s)</h5>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid stroke="#17233f" />
            <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
            <YAxis {...AX} />
            <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
            <Line dataKey="rps" stroke="#60a5fa" dot={false} isAnimationActive={false} name="offered" />
            <Line dataKey="thr" stroke="#34d399" dot={false} isAnimationActive={false} name="served" />
            {marks}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart">
        <h5>Utilisation by component (%)</h5>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid stroke="#17233f" />
            <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
            <YAxis {...AX} domain={[0, 'auto']} />
            <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
            {utilNodes.map((n, i) => (
              <Line
                key={n.id}
                dataKey={`u:${n.id}`}
                name={n.label}
                stroke={palette[i % palette.length]}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="4 4" />
            {marks}
          </LineChart>
        </ResponsiveContainer>
        <div className="legend">
          {utilNodes.map((n, i) => (
            <span key={n.id}>
              <i style={{ background: palette[i % palette.length] }} />
              {n.label}
            </span>
          ))}
        </div>
      </div>
      {hasDb && (
        <div className="chart">
          <h5>DB connections used (% of limit)</h5>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data}>
              <CartesianGrid stroke="#17233f" />
              <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
              <YAxis {...AX} domain={[0, 100]} />
              <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
              <Area dataKey="conn" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.15} isAnimationActive={false} />
              <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="4 4" />
              {marks}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      {hasQueue && (
        <div className="chart">
          <h5>Queue backlog (messages)</h5>
          <ResponsiveContainer width="100%" height={150}>
            <AreaChart data={data}>
              <CartesianGrid stroke="#17233f" />
              <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
              <YAxis {...AX} />
              <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
              <Area dataKey="backlog" stroke="#f472b6" fill="#f472b6" fillOpacity={0.15} isAnimationActive={false} />
              {marks}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="chart">
        <h5>Estimated monthly cost ($)</h5>
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data}>
            <CartesianGrid stroke="#17233f" />
            <XAxis dataKey="t" {...AX} tickFormatter={(v) => `${v}m`} />
            <YAxis {...AX} />
            <Tooltip {...TIP} labelFormatter={(v) => clock(Number(v))} />
            <Line dataKey="cost" stroke="#fbbf24" dot={false} isAnimationActive={false} />
            {marks}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="muted tiny span-all">
        Dashed blue lines mark your deployments and actions. Costs are simulated estimates, not AWS prices.
      </p>
    </div>
  );
}
