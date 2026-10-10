import { ArrowLeft, FastForward, Pause, Play, StepForward } from 'lucide-react';
import { LAB_ID, missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Chip, Sparkline } from '@/shared/ui/common';
import { clock, ms, pct0, usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { go } from '@/app/router';

export function StatusBar() {
  const { session, snap, report } = useLive();
  const running = useGame((s) => s.running);
  const speed = useGame((s) => s.speed);
  const setRunning = useGame((s) => s.setRunning);
  const setSpeed = useGame((s) => s.setSpeed);
  const step = useGame((s) => s.step);
  const submit = useGame((s) => s.submit);
  const closeSession = useGame((s) => s.closeSession);
  if (!session) return null;
  const mission = missionOf(session.missionId);
  const isLab = session.missionId === LAB_ID;
  const sys = snap?.system;
  const spark = session.history.slice(-40).map((h) => h.system.successRate * 100);
  const health = !sys ? 'idle' : sys.successRate > 0.99 && sys.maxUtil < 0.9 ? 'ok' : sys.successRate > 0.9 ? 'warn' : 'crit';
  const budget = mission.constraints.budget;

  return (
    <header className="statusbar">
      <div className="sb-left">
        <button className="icon-btn" aria-label="Back to mission list" onClick={() => { closeSession(); go(isLab ? '/' : mission.kind === 'incident' ? '/incidents' : '/missions'); }}><ArrowLeft size={18} /></button>
        <div className="sb-title">
          <b>{isLab ? 'Architecture Lab' : `Mission ${mission.number}: ${mission.title}`}</b>
          <div className="chips">
            {!isLab && <Chip kind={mission.kind === 'incident' ? 'crit' : 'info'}>{mission.kind}</Chip>}
            {!isLab && <Chip>{mission.difficulty}</Chip>}
            <Chip>{session.mode}</Chip>
            {session.failed && <Chip kind="crit">impact budget exceeded</Chip>}
          </div>
        </div>
      </div>
      <div className="sb-sim" role="group" aria-label="Simulation controls">
        <button className="btn btn-primary btn-icon" onClick={() => setRunning(!running)} aria-label={running ? 'Pause simulation' : 'Run simulation'}>{running ? <Pause size={16} /> : <Play size={16} />}<span>{running ? 'Pause' : 'Run'}</span></button>
        <button className="btn btn-ghost btn-icon" onClick={() => step(1)} aria-label="Advance one minute" title="Advance one simulated minute (.)"><StepForward size={16} /><span>+1m</span></button>
        <button className="btn btn-ghost btn-icon" onClick={() => step(10)} aria-label="Advance ten minutes" title="Advance ten simulated minutes"><FastForward size={16} /><span>+10m</span></button>
        <div className="speed" role="radiogroup" aria-label="Simulation speed">
          {([1, 4, 16] as const).map((s) => <button key={s} role="radio" aria-checked={speed === s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
        <div className={`clock ${running ? 'live' : ''}`} aria-live="off"><span className="dot" />{clock(session.minute)}<small title="virtual time">sim</small></div>
      </div>
      <div className="sb-health" aria-label="System health">
        <div className={`hk hk-${health}`}><span>Availability</span><b>{sys ? pct0(sys.successRate * 100) : '—'}</b><Sparkline values={spark} color={health === 'ok' ? '#34d399' : health === 'warn' ? '#f59e0b' : '#ef4444'} min={0} max={100} width={64} height={20} /></div>
        <div className="hk"><span>p95</span><b>{sys ? ms(sys.p95) : '—'}</b></div>
        <div className="hk"><span>Traffic</span><b>{sys ? `${sys.rps.toFixed(0)}/s` : '—'}</b></div>
        <div className={`hk ${budget && sys && sys.costMonthly > budget ? 'hk-crit' : ''}`}><span>Cost/mo</span><b>{sys ? usd2(sys.costMonthly) : '—'}</b></div>
        <div className={`hk ${report && report.counts.critical > 0 ? 'hk-crit' : report && report.counts.high > 0 ? 'hk-warn' : ''}`}><span>Security</span><b>{report ? report.securityScore : '—'}</b></div>
      </div>
      {!isLab && <button className="btn btn-accent" onClick={submit} title="Run a verification load test and score your solution against the requirements">Verify &amp; submit</button>}
    </header>
  );
}
