import { Globe2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { REGIONS, SLOW_P95_MS, USER_MIXES, analyzeGeography, type RegionId } from '@/engine/geo';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { ms, usd2 } from '@/shared/lib/fmt';

const KEY = 'eo-geo';
interface Setup {
  mix: string;
  primary: RegionId;
  secondary: RegionId;
}
const DEFAULT: Setup = { mix: 'global', primary: 'us-east-1', secondary: 'eu-west-1' };

function load(): Setup {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as Partial<Setup> | null;
    return {
      mix: USER_MIXES.some((m) => m.id === raw?.mix) ? raw!.mix! : DEFAULT.mix,
      primary: REGIONS.some((r) => r.id === raw?.primary) ? raw!.primary! : DEFAULT.primary,
      secondary: REGIONS.some((r) => r.id === raw?.secondary) ? raw!.secondary! : DEFAULT.secondary,
    };
  } catch {
    return DEFAULT;
  }
}

const regionName = (id: RegionId) => `${id} (${REGIONS.find((r) => r.id === id)!.name})`;
const minutesLabel = (m: number) =>
  m < 1 ? '<1 min' : m < 90 ? `${Math.round(m)} min` : m < 60 * 48 ? `${(m / 60).toFixed(1)} h` : `${Math.round(m / 1440)} days`;
const MODE_LABEL: Record<string, string> = {
  'single-region': 'Single Region: everyone is served from the primary.',
  'active-active-routed': 'Active/active with latency routing: each user is served from the nearest Region.',
  'active-active-split': 'Active/active with weighted routing: users are split 50/50 whatever their location.',
  'active-active-unrouted': 'Active/active, but DNS sends everyone to the primary.',
};

/**
 * Where your users are and what that does to them: latency by geography, how DNS routes, what a Region loss costs in minutes,
 * how far the replica runs behind, and what the replication traffic costs. It analyses the deployed design with a simple
 * explicit network model (typical round-trip times); nothing here changes your run.
 */
export function GeographyPanel() {
  const { session, snap } = useLive();
  const tick = useGame((s) => s.tick);
  const [setup, setSetup] = useState<Setup>(load);
  const update = (patch: Partial<Setup>) =>
    setSetup((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  const measured = snap?.system.p95;
  const report = useMemo(() => {
    if (!session) return undefined;
    const mix = USER_MIXES.find((m) => m.id === setup.mix)!.share;
    return analyzeGeography(session.live, session.workload, {
      primary: setup.primary,
      secondary: setup.secondary,
      mix,
      backendP95Ms: measured ?? 100,
    });
    // the session is edited in place (deploy replaces its live design), so the tick signals a change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session, setup, measured]);
  if (!session || !report) return null;

  return (
    <section className="geo-panel" aria-label="Multi-Region traffic">
      <h4>
        <Globe2 size={14} /> Users and Regions
      </h4>
      <div className="geo-controls">
        <label>
          <span>Where your users are</span>
          <select aria-label="Where your users are" value={setup.mix} onChange={(e) => update({ mix: e.target.value })}>
            {USER_MIXES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Primary Region</span>
          <select aria-label="Primary Region" value={setup.primary} onChange={(e) => update({ primary: e.target.value as RegionId })}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {regionName(r.id)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Second Region (DR / active)</span>
          <select aria-label="Second Region" value={setup.secondary} onChange={(e) => update({ secondary: e.target.value as RegionId })}>
            {REGIONS.map((r) => (
              <option key={r.id} value={r.id}>
                {regionName(r.id)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="muted tiny">{MODE_LABEL[report.mode]}</p>
      <ul className="geo-rows">
        {report.rows.map((r) => (
          <li key={r.geo} className="geo-row" data-geo={r.geo} data-served={r.servedFrom.join(',')} data-p95={Math.round(r.p95)}>
            <div className="geo-line">
              <b>{r.name}</b>
              <span className="muted tiny">{Math.round(r.share * 100)}% of users</span>
            </div>
            <div className="muted tiny">
              served from <span className="mono">{r.servedFrom.join(' + ')}</span> · {Math.round(r.rtt)} ms round trip
            </div>
            <div className="tiny">
              p95 <b className={`mono ${r.slow ? 'geo-slow' : ''}`}>{ms(r.p95)}</b>
              <span className="muted"> · if primary lost </span>
              <b className={`mono ${r.p95AfterFailover > SLOW_P95_MS ? 'geo-slow' : ''}`}>{ms(r.p95AfterFailover)}</b>
            </div>
          </li>
        ))}
      </ul>
      <p className="tiny">
        Weighted p95 <b className="mono">{ms(report.weightedP95)}</b>
        {report.slowShare > 0 && (
          <>
            {' '}
            ·{' '}
            <span className="geo-slow">
              {Math.round(report.slowShare * 100)}% of users above {SLOW_P95_MS} ms
            </span>
          </>
        )}
        {measured === undefined && <span className="muted"> · run the simulation for a measured backend time (100 ms assumed)</span>}
      </p>

      <div className="geo-block">
        <b>If {setup.primary} were lost</b>
        <p className="tiny">
          {report.failover.path === 'none' ? (
            <>
              No place to fail over to: users wait about <b>{minutesLabel(report.failover.minutes)}</b> for the Region to return.
            </>
          ) : (
            <>
              {report.failover.path === 'automatic' ? 'Automatic' : 'Manual'} failover: users are served again in about{' '}
              <b>{minutesLabel(report.failover.minutes)}</b>.
            </>
          )}
        </p>
        <ol className="geo-steps">
          {report.failover.steps.map((s) => (
            <li key={s.label}>
              {s.label} <span className="muted">{minutesLabel(s.minutes)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="geo-block">
        <b>Between the Regions</b>
        {report.replicationLagSec === null ? (
          <p className="tiny muted">
            Nothing is replicated continuously. Add a cross-Region replica on the database to keep a second copy.
          </p>
        ) : (
          <p className="tiny">
            Replica runs about <b>{report.replicationLagSec.toFixed(2)} s</b> behind, which is the data a Region loss could cost you.
            Replication moves about <b>{report.transferGBMonthly.toFixed(0)} GB/month</b> between Regions, roughly{' '}
            <b>{usd2(report.transferCostMonthly)}</b>/month in transfer.
          </p>
        )}
      </div>

      {report.notes.length > 0 && (
        <ul className="geo-notes">
          {report.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <p className="muted tiny">
        Round-trip times are typical figures between these places, rounded, not measurements. They are the same for every design, so
        comparing designs is fair.
      </p>
    </section>
  );
}
