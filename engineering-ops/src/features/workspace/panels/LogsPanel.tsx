import { useMemo, useState } from 'react';
import { roleOf } from '@/engine/arch';
import { generateLogs } from '@/engine/telemetry';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Empty } from '@/shared/ui/common';
import { clock } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

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
