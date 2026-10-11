import { edgeClass, flowEdges, nodeById, roleOf } from '@/engine/arch';
import { Chip } from '@/shared/ui/common';
import { ms, num, pct } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { Section } from './shared';

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
