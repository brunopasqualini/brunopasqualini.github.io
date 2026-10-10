import { useMemo } from 'react';
import { compareDesigns, type DesignProfile } from '@/engine/compare';
import { createSession, missionOf, type Session } from '@/game/session';
import { usd2 } from '@/shared/lib/fmt';

const pct = (v: number) => `${(v * 100).toFixed(v > 0.99 ? 2 : 1)}%`;
const ms = (v: number) => `${v.toFixed(0)}ms`;
const dur = (min: number) => (min < 60 ? `${Math.round(min)}m` : `${(min / 60).toFixed(1)}h`);

interface Row {
  label: string;
  hint?: string;
  before: string;
  after: string;
  /** > 0 when the final design is better, < 0 when worse, 0 when the same. */
  delta: number;
}

function rows(b: DesignProfile, a: DesignProfile): Row[] {
  const out: Row[] = [];
  for (const [i, s] of a.scenarios.entries()) {
    const o = b.scenarios[i];
    out.push({ label: `${s.label}: success`, before: pct(o.successRate), after: pct(s.successRate), delta: s.successRate - o.successRate });
    out.push({ label: `${s.label}: p95 latency`, before: ms(o.p95), after: ms(s.p95), delta: o.p95 - s.p95 });
  }
  const peakB = b.scenarios[1];
  const peakA = a.scenarios[1];
  out.push({
    label: 'Capacity headroom at peak',
    hint: 'Highest utilisation of any component at the mission peak. Lower is more headroom.',
    before: `${(peakB.maxUtil * 100).toFixed(0)}% used`,
    after: `${(peakA.maxUtil * 100).toFixed(0)}% used`,
    delta: peakB.maxUtil - peakA.maxUtil,
  });
  out.push({
    label: 'Monthly cost (estimate)',
    before: usd2(b.costMonthly),
    after: usd2(a.costMonthly),
    delta: b.costMonthly - a.costMonthly,
  });
  out.push({
    label: 'Security score',
    before: `${b.securityScore} (${b.seriousFindings} serious)`,
    after: `${a.securityScore} (${a.seriousFindings} serious)`,
    delta: a.securityScore - b.securityScore,
  });
  out.push({
    label: 'Resilience to a zone loss',
    before: `${b.resilience.toFixed(0)}%`,
    after: `${a.resilience.toFixed(0)}%`,
    delta: a.resilience - b.resilience,
  });
  out.push({
    label: 'Region loss: time to restore (RTO)',
    before: dur(b.rtoMinutes),
    after: dur(a.rtoMinutes),
    delta: b.rtoMinutes - a.rtoMinutes,
  });
  out.push({
    label: 'Region loss: data lost (RPO)',
    before: dur(b.rpoMinutes),
    after: dur(a.rpoMinutes),
    delta: b.rpoMinutes - a.rpoMinutes,
  });
  return out;
}

/** Where you started against where you finished, both replayed against the same workload and the same zone failure. */
export function CompareTab({ session }: { session: Session }) {
  const mission = missionOf(session.missionId);
  const result = useMemo(() => {
    const start = createSession(session.missionId, session.mode, session.attempt, undefined, session.inherited).live;
    return compareDesigns(start, session.live, session.workload, {
      from: Math.max(session.minute, mission.verifyAt),
      minutes: mission.verifyMinutes,
      squads: mission.squads,
    });
  }, [session, mission]);
  const table = rows(result.before, result.after);
  return (
    <div className="learn">
      <p className="muted">
        Both designs run the same workload, over the same window, with the same zone failure. The only difference between the columns is the
        architecture you built.
      </p>
      <table className="compare">
        <thead>
          <tr>
            <th scope="col">Measure</th>
            <th scope="col">Where you started</th>
            <th scope="col">Where you finished</th>
            <th scope="col">
              <span className="sr-only">Change</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((r) => (
            <tr key={r.label} title={r.hint}>
              <th scope="row">{r.label}</th>
              <td className="mono">{r.before}</td>
              <td className="mono">{r.after}</td>
              <td className={Math.abs(r.delta) < 1e-9 ? 'muted' : r.delta > 0 ? 'ok' : 'crit'}>
                {Math.abs(r.delta) < 1e-9 ? 'same' : r.delta > 0 ? 'better' : 'worse'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted tiny">
        A “worse” row is not a mistake by itself. It is the price of the rows that improved; the question is whether you chose it knowingly.
      </p>
    </div>
  );
}
