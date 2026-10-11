import { SECURITY_PENALTY, securityBreakdown } from '@/engine/analysis';
import { Chip, Empty } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';

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
