import { SECURITY_PENALTY, securityBreakdown } from '@/engine/analysis';
import { useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { edgeClass, flowEdges, nodeById, ofKind, roleOf } from '@/engine/arch';
import { explainFlow, type FlowResult } from '@/engine/net';
import { alertHistory, costBreakdown, dbQueryStats, generateLogs, generateTraces } from '@/engine/telemetry';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Chip, Empty, Meter } from '@/shared/ui/common';
import { ago, clock, dur, ms, num, pct, usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

const AX = { stroke: '#42557a', fontSize: 10, tickLine: false } as const;
const TIP = {
  contentStyle: { background: '#0a1224', border: '1px solid #243557', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#9fb2d3' },
};

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="psec">
      <header>
        <h4>{title}</h4>
        {right}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
export function LogsPanel() {
  const { session } = useLive();
  const mode = useGame((s) => s.settings.mode);
  const [level, setLevel] = useState<'ALL' | 'WARN' | 'ERROR'>('ALL');
  const [node, setNode] = useState('');
  const [q, setQ] = useState('');
  const tick = useGame((s) => s.tick);
  const logs = useMemo(() => {
    if (!session) return [];
    const mission = missionOf(session.missionId);
    return generateLogs(session.live, session.history, { seed: mission.seed, mode: session.mode, workload: session.workload, window: 10 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session]);
  if (!session) return null;
  const filtered = logs
    .filter(
      (l) =>
        (level === 'ALL' || (level === 'WARN' ? l.level !== 'INFO' : l.level === 'ERROR')) &&
        (!node || l.node === node) &&
        (!q || l.msg.toLowerCase().includes(q.toLowerCase())),
    )
    .slice(0, 160);
  return (
    <div className="panel-body">
      <div className="toolbar">
        <select aria-label="Log level" value={level} onChange={(e) => setLevel(e.target.value as 'ALL')}>
          <option value="ALL">All levels</option>
          <option value="WARN">Warn + error</option>
          <option value="ERROR">Errors</option>
        </select>
        <select aria-label="Component" value={node} onChange={(e) => setNode(e.target.value)}>
          <option value="">All components</option>
          {session.live.nodes
            .filter((n) => roleOf(n) !== 'network')
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
        </select>
        <input placeholder="Search logs…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search logs" />
        <span className="muted tiny">Application & infrastructure logs · last 10 simulated minutes</span>
      </div>
      {mode === 'beginner' && (
        <p className="tip">
          Tip: repeated ERROR lines point at a failing component. Look at <i>which</i> component logs them and what they say — not just that
          something failed.
        </p>
      )}
      <div className="logs" role="log" aria-label="Logs">
        {filtered.map((l, i) => (
          <div key={i} className={`log log-${l.level}`}>
            <span className="t">{clock(l.t)}</span>
            <span className="lv">{l.level}</span>
            <span className="src">{l.source === 'infra' ? 'infra' : 'app'}</span>
            <span className="nd">{l.label}</span>
            <span className="msg">{l.msg}</span>
          </div>
        ))}
        {filtered.length === 0 && <Empty title="No log lines match">Try a different filter, or advance the simulation.</Empty>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
export function DependenciesPanel() {
  const { session, snap } = useLive();
  if (!session || !snap) return null;
  const arch = session.live;
  const edges = flowEdges(arch).filter((e) => nodeById(arch, e.source) && nodeById(arch, e.target));
  // critical path: follow the child with the largest latency contribution
  const path: string[] = [];
  const src = arch.nodes.find((n) => roleOf(n) === 'source');
  let cur = src?.id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    const next = edges
      .filter((e) => e.source === cur && edgeClass(arch, e) === 'traffic')
      .sort(
        (a, b) =>
          (snap.nodes[b.target]?.latencyMs ?? 0) * (snap.edges[b.id]?.rps ?? 0) -
          (snap.nodes[a.target]?.latencyMs ?? 0) * (snap.edges[a.id]?.rps ?? 0),
      )[0];
    cur = next?.target;
  }
  return (
    <div className="panel-body">
      <Section title="Critical request path">
        <div className="pathline">
          {path.map((id, i) => (
            <span key={id}>
              <Chip kind={snap.nodes[id]?.status === 'healthy' ? 'ok' : snap.nodes[id]?.status === 'idle' ? 'neutral' : 'warn'}>
                {nodeById(arch, id)?.label}
              </Chip>
              {i < path.length - 1 && <span className="arrow">→</span>}
            </span>
          ))}
        </div>
      </Section>
      <table className="tbl">
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>Kind</th>
            <th>Rate</th>
            <th>Retry ×</th>
            <th>Target errors</th>
            <th>Target latency</th>
            <th>Timeout / retries</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((e) => {
            const em = snap.edges[e.id];
            const t = snap.nodes[e.target];
            return (
              <tr key={e.id} className={em?.blocked ? 'row-crit' : ''}>
                <td>{nodeById(arch, e.source)?.label}</td>
                <td>{nodeById(arch, e.target)?.label}</td>
                <td>{edgeClass(arch, e)}</td>
                <td className="mono">{num(em?.rps ?? 0)}/s</td>
                <td className={`mono ${em && em.amplification > 1.25 ? 'warn' : ''}`}>×{(em?.amplification ?? 1).toFixed(2)}</td>
                <td className={`mono ${t && t.errorRate > 0.05 ? 'crit' : ''}`}>{pct(t?.errorRate ?? 0)}</td>
                <td className="mono">{ms(t?.latencyMs ?? 0)}</td>
                <td className="mono">
                  {e.config.timeoutMs}ms / {e.config.retries}
                  {em?.breakerOpen ? ' ⚡' : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted tiny">
        Dependencies carry traffic, events or data. A component only helps if every synchronous dependency behind it is healthy — a shared
        database defeats redundant application tiers.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
export function SecurityPanel() {
  const { report } = useLive();
  if (!report) return null;
  const breakdown = securityBreakdown(report.findings);
  return (
    <div className="panel-body">
      <div className="row-between">
        <h4>Security findings</h4>
        <span>
          Score <b className={report.securityScore < 60 ? 'crit' : report.securityScore < 90 ? 'warn' : 'ok'}>{report.securityScore}</b>/100
        </span>
      </div>
      {breakdown.items.length > 0 && (
        <p className="muted tiny">
          Score = 100 − findings: {breakdown.items.map((i) => `${i.finding.severity} −${i.points}`).join(', ')}. Resolving a finding adds
          its points back.
        </p>
      )}
      {report.findings.length === 0 && (
        <Empty title="No findings">Nothing in the configuration violates the simulated security rules. Real reviews go much further.</Empty>
      )}
      <ul className="findings">
        {report.findings
          .sort(
            (a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.severity) - ['critical', 'high', 'medium', 'low'].indexOf(b.severity),
          )
          .map((f) => (
            <li key={f.id}>
              <div className="f-head">
                <Chip
                  kind={f.severity === 'critical' ? 'crit' : f.severity === 'high' ? 'warn' : f.severity === 'medium' ? 'info' : 'neutral'}
                >
                  {f.severity}
                </Chip>
                <b>{f.title}</b>
              </div>
              <p>{f.detail}</p>
              <p className="muted tiny">Costs {SECURITY_PENALTY[f.severity]} points.</p>
              <p className="fix">
                <b>Fix:</b> {f.fix}
              </p>
            </li>
          ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
function Steps({ r }: { r: FlowResult }) {
  return (
    <ol className="steps">
      {r.steps.map((s, i) => (
        <li key={i} className={s.ok ? 'ok' : 'bad'}>
          <span className="mark">{s.ok ? '✓' : '✕'}</span>
          <div>
            <b>{s.label}</b>
            <p>{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function NetworkPanel() {
  const { session } = useLive();
  const [pick, setPick] = useState(0);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [port, setPort] = useState(443);
  const arch = session?.live;
  const flows = useMemo(() => {
    if (!arch) return [];
    const out: { label: string; res: FlowResult; port: number }[] = [];
    for (const e of flowEdges(arch)) {
      const s = nodeById(arch, e.source)!;
      const t = nodeById(arch, e.target)!;
      if (!s || !t) continue;
      const sr = roleOf(s);
      const tr = roleOf(t);
      let p = 0;
      let res: FlowResult | undefined;
      if (sr === 'source' && t.config.subnet) {
        p = 443;
        res = explainFlow(arch, s.id, t.id, 443);
      } else if (tr === 'external') {
        p = 443;
        res = explainFlow(arch, s.id, t.id, 443);
      } else if (tr === 'storage' && sr === 'compute' && s.config.subnet) {
        p = 443;
        res = t.config.vpcEndpoint
          ? {
              ok: true,
              steps: [
                {
                  label: 'Gateway VPC endpoint',
                  ok: true,
                  detail: `${t.label} is reached through a gateway endpoint: no NAT gateway or internet path is needed (and no per-GB NAT charge).`,
                },
              ],
            }
          : explainFlow(arch, s.id, t.id, 443);
      } else if (sr === 'lb' && tr === 'compute' && (s.config.sg || t.config.sg)) {
        p = 8080;
        res = explainFlow(arch, s.id, t.id, 8080);
      } else if (tr === 'db' && t.config.sg) {
        p = 5432;
        res = explainFlow(arch, s.id, t.id, 5432);
      }
      if (res) out.push({ label: `${s.label} → ${t.label} (tcp/${p})`, res, port: p });
    }
    return out;
  }, [arch]);
  if (!session || !arch) return null;
  const custom = from && to ? explainFlow(arch, from, to, port) : undefined;
  const cur = flows[Math.min(pick, flows.length - 1)];
  const nodes = arch.nodes.filter((n) => roleOf(n) !== 'network' && roleOf(n) !== 'identity' && roleOf(n) !== 'delivery');
  if (!flows.length && !arch.nodes.some((n) => roleOf(n) === 'network'))
    return (
      <Empty title="No VPC network modelled">
        Add a VPC, subnets, security groups and an internet/NAT gateway, then place components in subnets from the inspector to inspect
        reachability here.
      </Empty>
    );
  return (
    <div className="panel-body netpanel">
      <div className="net-list">
        <h5>Paths in this architecture</h5>
        <ul>
          {flows.map((f, i) => (
            <li key={i}>
              <button className={i === pick ? 'on' : ''} onClick={() => setPick(i)}>
                <span className={f.res.ok ? 'ok' : 'bad'}>{f.res.ok ? '✓' : '✕'}</span>
                {f.label}
              </button>
            </li>
          ))}
          {flows.length === 0 && <li className="muted">No placed components yet.</li>}
        </ul>
        <h5>Custom check</h5>
        <div className="custom-check">
          <select aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">From…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <select aria-label="To" value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">To…</option>
            {nodes.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <input aria-label="Port" type="number" value={port} onChange={(e) => setPort(Number(e.target.value))} />
        </div>
      </div>
      <div className="net-detail">
        {cur && (
          <>
            <h5>
              {cur.label} <Chip kind={cur.res.ok ? 'ok' : 'crit'}>{cur.res.ok ? 'reachable' : `blocked at ${cur.res.blockedAt}`}</Chip>
            </h5>
            <Steps r={cur.res} />
          </>
        )}
        {custom && (
          <>
            <h5>
              Custom: {nodeById(arch, from)?.label} → {nodeById(arch, to)?.label}:{port}{' '}
              <Chip kind={custom.ok ? 'ok' : 'crit'}>{custom.ok ? 'reachable' : 'blocked'}</Chip>
            </h5>
            <Steps r={custom} />
          </>
        )}
        <p className="muted tiny">
          Each layer must allow the traffic: route table → gateway placement → security group (stateful) → network ACL (stateless, incl.
          return traffic) → IAM. Fixing one layer often reveals the next.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export function NotesPanel() {
  const { session } = useLive();
  if (!session) return null;
  const m = missionOf(session.missionId);
  if (session.missionId === 'lab')
    return (
      <Empty title="Sandbox">
        Build freely. Use the Plan tab to review and deploy your changes, and the Lab controls to change workload and inject failures.
      </Empty>
    );
  return (
    <div className="panel-body notes">
      <Section title="Scenario">
        <p>{m.story}</p>
        <p>
          <b>Business context:</b> {m.business.context}
        </p>
        <p>
          <b>Impact:</b> {m.business.impact}
        </p>
      </Section>
      {m.notes.map((n, i) => (
        <Section key={i} title={n.title}>
          <p>{n.body}</p>
        </Section>
      ))}
    </div>
  );
}
