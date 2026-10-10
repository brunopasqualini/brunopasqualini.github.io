import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';
import { nodeById, roleOf } from '@/engine/arch';
import { generateLogs } from '@/engine/telemetry';
import type { NodeStatus } from '@/engine/types';
import { useLive } from '@/game/hooks';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { clock, ms, num } from '@/shared/lib/fmt';

const trend = (now: number, before: number | undefined, invert = false) => {
  if (before === undefined || before === 0) return null;
  const d = ((now - before) / Math.abs(before)) * 100;
  if (Math.abs(d) < 1) return null;
  const bad = invert ? d > 0 : d < 0;
  return { d, bad };
};

function Tile({ label, value, delta }: { label: string; value: string; delta: { d: number; bad: boolean } | null }) {
  return (
    <div className="ov-tile">
      <span>{label}</span>
      <b>{value}</b>
      {delta ? (
        <em className={delta.bad ? 'dn' : 'up'}>
          {delta.d > 0 ? '↑' : '↓'} {Math.abs(delta.d).toFixed(0)}%
        </em>
      ) : (
        <em className="flat">steady</em>
      )}
    </div>
  );
}

function norm(values: number[]) {
  const max = Math.max(...values, 1e-9);
  return values.map((v) => (v / max) * 100);
}

function Waiting({ title }: { title: string }) {
  return (
    <section className="card-panel ov-card" aria-label={title}>
      <h3 className="cp-title">{title}</h3>
      <p className="muted tiny pad">Run the simulation to see live data here.</p>
    </section>
  );
}

function SystemMetricsCard() {
  const { session, snap } = useLive();
  const rows = useMemo(() => {
    if (!session) return [];
    const h = session.history.slice(-24);
    const rps = norm(h.map((x) => x.system.rps));
    const lat = norm(h.map((x) => x.system.p95));
    const err = norm(h.map((x) => x.system.errorRate * 100));
    return h.map((x, i) => ({ t: x.minute, rps: rps[i], lat: lat[i], err: err[i] }));
  }, [session, session?.minute]);
  if (!session) return null;
  if (!snap) return <Waiting title="System Metrics" />;
  const past = session.history[Math.max(0, session.history.length - 6)]?.system;
  const s = snap.system;
  return (
    <section className="card-panel ov-card" aria-label="System metrics">
      <h3 className="cp-title">System Metrics</h3>
      <div className="ov-tiles">
        <Tile label="Req / sec" value={num(s.rps)} delta={trend(s.rps, past?.rps)} />
        <Tile label="p95" value={ms(s.p95)} delta={trend(s.p95, past?.p95, true)} />
        <Tile label="Errors" value={`${(s.errorRate * 100).toFixed(1)}%`} delta={trend(s.errorRate, past?.errorRate, true)} />
        <Tile label="Peak util" value={`${(Math.min(s.maxUtil, 9.99) * 100).toFixed(0)}%`} delta={trend(s.maxUtil, past?.maxUtil, true)} />
      </div>
      <div className="ov-chart" aria-label="Trends over the last 24 simulated minutes (each line scaled to its own peak)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: 6 }}>
            <YAxis hide domain={[0, 105]} />
            <Line type="monotone" dataKey="rps" stroke="#38bdf8" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="lat" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="err" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend ov-legend">
        <span>
          <i style={{ background: '#38bdf8' }} />
          Traffic
        </span>
        <span>
          <i style={{ background: '#f59e0b' }} />
          Latency
        </span>
        <span>
          <i style={{ background: '#ef4444' }} />
          Errors
        </span>
        <span className="muted">each scaled to its own peak</span>
      </div>
    </section>
  );
}

function LogsEventsCard() {
  const { session } = useLive();
  const tick = useGame((s) => s.tick);
  const setDock = useGame((s) => s.setDock);
  const lines = useMemo(() => {
    if (!session) return [];
    const mission = missionOf(session.missionId);
    return generateLogs(session.live, session.history, {
      seed: mission.seed,
      mode: session.mode,
      workload: session.workload,
      window: 4,
    }).slice(0, 9);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session]);
  if (!session) return null;
  return (
    <section className="card-panel ov-card" aria-label="Logs and events">
      <h3 className="cp-title">
        Logs &amp; Events
        <button className="link ov-more" onClick={() => setDock('logs')}>
          open logs
        </button>
      </h3>
      <div className="ov-logs" role="log">
        {lines.length === 0 && <p className="muted tiny pad">No log lines yet. Run the simulation.</p>}
        {lines.map((l, i) => (
          <div key={i} className={`ov-log log-${l.level}`}>
            <time>{clock(l.t).slice(2)}</time>
            <span className="lv">{l.level === 'INFO' ? 'info' : l.level.toLowerCase()}</span>
            <span className="msg" title={`${l.label}: ${l.msg}`}>
              <b>{l.label}</b> {l.msg}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const DOT: Record<NodeStatus, 'ok' | 'warn' | 'crit' | 'idle'> = {
  healthy: 'ok',
  idle: 'idle',
  degraded: 'warn',
  misconfigured: 'warn',
  insecure: 'warn',
  overloaded: 'crit',
  unavailable: 'crit',
};

/** Where the running components live: availability zones inside the simulated region, with health per component. */
function RegionCard() {
  const { session, snap } = useLive();
  if (!session) return null;
  if (!snap) return <Waiting title="Region View" />;
  const arch = session.live;
  const outage = new Set(session.chaos.filter((c) => c.type === 'az-outage').map((c) => (c as { az: string }).az));
  const comps = arch.nodes.filter(
    (n) => !['network', 'identity', 'policy', 'observability', 'source', 'delivery', 'resilience'].includes(roleOf(n)),
  );
  const zoneOf = (n: (typeof comps)[number]) => {
    const sub = n.config.subnet ? nodeById(arch, n.config.subnet) : undefined;
    return sub?.config.az as string | undefined;
  };
  const zones = Array.from(new Set(['a', 'b', ...comps.map(zoneOf).filter(Boolean)] as string[])).sort();
  const regional = comps.filter((n) => !zoneOf(n));
  const statusOf = (id: string): NodeStatus => snap.nodes[id]?.status ?? 'idle';
  const pill = (n: (typeof comps)[number], note?: string) => (
    <li key={`${n.id}${note ?? ''}`} title={`${n.label}: ${statusOf(n.id)}`}>
      <i className={`dot-${DOT[statusOf(n.id)]}`} />
      <span>{n.label}</span>
      {note && <em>{note}</em>}
    </li>
  );
  return (
    <section className="card-panel ov-card" aria-label="Region view">
      <h3 className="cp-title">Region View</h3>
      <div className="region">
        <div className="region-name">
          us-east-1 <small>simulated</small>
        </div>
        <div className="zones" style={{ gridTemplateColumns: `repeat(${zones.length}, minmax(0, 1fr))` }}>
          {zones.map((z) => {
            const here = comps.filter((n) => zoneOf(n) === z);
            // a Multi-AZ database keeps its synchronous standby in the second zone
            const standby = z === zones[1] ? comps.filter((n) => !zoneOf(n) && n.config.multiAZ && roleOf(n) === 'db') : [];
            return (
              <div key={z} className={`zone ${outage.has(z) ? 'zone-out' : ''}`}>
                <header>
                  AZ {z.toUpperCase()}
                  <span className={outage.has(z) ? 'crit' : 'ok'}>{outage.has(z) ? 'outage' : 'up'}</span>
                </header>
                <ul>
                  {here.map((n) => pill(n))}
                  {standby.map((n) => pill(n, 'standby'))}
                  {here.length + standby.length === 0 && <li className="muted tiny">nothing placed</li>}
                </ul>
              </div>
            );
          })}
        </div>
        {regional.length === comps.length && comps.length > 0 && (
          <p className="muted tiny">Place components in subnets (Inspector → Subnet) to see which availability zone each one lives in.</p>
        )}
        {regional.length > 0 && (
          <div className="zone zone-regional">
            <header>
              Regional / not placed <span className="muted">no AZ pinned</span>
            </header>
            <ul>{regional.map((n) => pill(n))}</ul>
          </div>
        )}
      </div>
      <div className="legend ov-legend">
        <span>
          <i className="dot-ok" />
          Healthy
        </span>
        <span>
          <i className="dot-warn" />
          Warning
        </span>
        <span>
          <i className="dot-crit" />
          Critical
        </span>
      </div>
    </section>
  );
}

export function OverviewPanel() {
  return (
    <div className="overview">
      <SystemMetricsCard />
      <LogsEventsCard />
      <RegionCard />
    </div>
  );
}
