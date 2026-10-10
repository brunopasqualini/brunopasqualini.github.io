import { securityBreakdown } from '@/engine/analysis';
import type { Finding } from '@/engine/net';
import {
  FastForward,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  StepForward,
} from 'lucide-react';
import { LAB_ID, missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Sparkline } from '@/shared/ui/common';
import { clock, ms, pct0, usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function CanvasHeader({
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
}: {
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
}) {
  const { session, snap, report } = useLive();
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const setRunning = useGame((s) => s.setRunning);
  const setSpeed = useGame((s) => s.setSpeed);
  const step = useGame((s) => s.step);
  const submit = useGame((s) => s.submit);
  if (!session) return null;
  const mission = missionOf(session.missionId);
  const isLab = session.missionId === LAB_ID;
  const sys = snap?.system;
  const spark = session.history.slice(-40).map((h) => h.system.successRate * 100);
  const health = !sys ? 'idle' : sys.successRate > 0.99 && sys.maxUtil < 0.9 ? 'ok' : sys.successRate > 0.9 ? 'warn' : 'crit';
  const budget = mission.constraints.budget;

  const errPct = sys ? (1 - sys.successRate) * 100 : 0;
  return (
    <header className="canvas-head">
      <div className="ch-row">
        <button
          className="icon-btn"
          onClick={onToggleLeft}
          aria-label={leftOpen ? 'Hide mission panel' : 'Show mission panel'}
          aria-pressed={!leftOpen}
          title={leftOpen ? 'Hide mission panel' : 'Show mission panel'}
        >
          {leftOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
        </button>
        <h2 className="ch-title">
          <Network size={17} aria-hidden="true" /> Architecture Canvas
        </h2>
        <span className={`live-pill ${running ? 'live' : ''}`}>
          <i /> {running ? 'Live' : 'Paused'}
        </span>
        <div className="sb-sim" role="group" aria-label="Simulation controls">
          <button
            className="btn btn-primary btn-icon"
            onClick={() => setRunning(!running)}
            aria-label={running ? 'Pause simulation' : 'Run simulation'}
          >
            {running ? <Pause size={16} /> : <Play size={16} />}
            <span>{running ? 'Pause' : 'Run'}</span>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => step(1)}
            aria-label="Advance one minute"
            title="Advance one simulated minute (.)"
          >
            <StepForward size={16} />
            <span>+1m</span>
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => step(10)}
            aria-label="Advance ten minutes"
            title="Advance ten simulated minutes"
          >
            <FastForward size={16} />
            <span>+10m</span>
          </button>
          <div className="speed" role="radiogroup" aria-label="Simulation speed">
            {([1, 4, 16] as const).map((s) => (
              <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
          <div className={`clock ${running ? 'live' : ''}`} aria-live="off">
            <span className="dot" />
            {clock(session.minute)}
            <small title="virtual time">sim</small>
          </div>
        </div>
        {!isLab && (
          <button
            className="btn btn-accent"
            onClick={submit}
            title="Run a verification load test and score your solution against the requirements"
          >
            Verify &amp; submit
          </button>
        )}
        <button
          className="icon-btn"
          onClick={onToggleRight}
          aria-label={rightOpen ? 'Hide components panel' : 'Show components panel'}
          aria-pressed={!rightOpen}
          title={rightOpen ? 'Hide components panel' : 'Show components panel'}
        >
          {rightOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
      <div className="ch-kpis" aria-label="System health">
        <div className="hk">
          <span>Traffic</span>
          <b>{sys ? `${sys.rps.toFixed(0)} rps` : '—'}</b>
        </div>
        <div className={`hk ${sys && sys.p95 > 1000 ? 'hk-warn' : ''}`}>
          <span>Latency p95</span>
          <b>{sys ? ms(sys.p95) : '—'}</b>
        </div>
        <div className={`hk hk-${health}`}>
          <span>Error rate</span>
          <b>{sys ? `${errPct < 10 ? errPct.toFixed(1) : errPct.toFixed(0)}%` : '—'}</b>
        </div>
        <div
          className={`hk hk-${health} hk-spark`}
          title="Availability: how the system performs right now. It says nothing about what would happen if a zone failed (Resilience) or how fast service would come back (Recovery)."
        >
          <span>Availability</span>
          <b>{sys ? pct0(sys.successRate * 100) : '—'}</b>
          <Sparkline
            values={spark}
            color={health === 'ok' ? '#34d399' : health === 'warn' ? '#f59e0b' : '#ef4444'}
            min={0}
            max={100}
            width={64}
            height={18}
          />
        </div>
        <div className={`hk ${budget && sys && sys.costMonthly > budget ? 'hk-crit' : ''}`}>
          <span>Cost{budget ? ` / ${usd2(budget)}` : ''}</span>
          <b>{sys ? `${usd2(sys.costMonthly)} / mo` : '—'}</b>
        </div>
        <div
          className={`hk ${report && report.azSurvival < 95 ? 'hk-warn' : ''}`}
          title="Resilience: the share of traffic still served if one availability zone is lost. Measured by simulating the failure, not read from current health."
        >
          <span>Resilience</span>
          <b>{report ? `${report.azSurvival.toFixed(0)}%` : '—'}</b>
        </div>
        <div
          className={`hk ${report && report.recovery.rtoMinutes > 120 ? 'hk-warn' : ''}`}
          title="Recovery time (RTO): how long restoring service would take and how much data could be lost (RPO), from your backup and disaster-recovery setup."
        >
          <span>Recovery</span>
          <b>{report ? duration(report.recovery.rtoMinutes) : '—'}</b>
        </div>
        <div
          className={`hk ${report && report.counts.critical > 0 ? 'hk-crit' : report && report.counts.high > 0 ? 'hk-warn' : ''}`}
          title={securityTitle(report)}
        >
          <span>Security</span>
          <b>{report ? report.securityScore : '—'}</b>
        </div>
      </div>
    </header>
  );
}

function duration(min: number): string {
  if (min < 60) return `${Math.round(min)}m`;
  if (min < 60 * 48) return `${(min / 60).toFixed(min % 60 ? 1 : 0)}h`;
  return `${Math.round(min / 1440)}d`;
}

function securityTitle(report?: { findings: Finding[] }): string {
  if (!report) return 'Security score';
  const top = securityBreakdown(report.findings).items.slice(0, 3);
  if (!top.length) return 'Security score 100: no findings against the simulated rules.';
  return (
    'Security score is lowered by: ' +
    top.map((i) => `${i.finding.title} (−${i.points})`).join('; ') +
    '. Open the Security panel for the fix.'
  );
}
