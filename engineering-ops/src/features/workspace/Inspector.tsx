import { Copy, Network, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { clone, edgeClass, nodeById, uid } from '@/engine/arch';
import { visualStatus } from '@/engine/analysis';
import { entryOf } from '@/engine/catalog';
import { costBreakdown } from '@/engine/telemetry';
import { useGame } from '@/game/store';
import { Chip, Meter } from '@/shared/ui/common';
import { ms, num, pct, usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';
import { NodeIcon } from '@/shared/ui/icons';
import { ConnectionsEditor } from '@/features/workspace/ConnectionsEditor';
import { FieldEditor } from '@/features/workspace/FieldEditor';

const SCOPE: Record<string, string> = { global: 'Global', regional: 'Regional', zonal: 'Zonal (AZ)', vpc: 'VPC-scoped', none: '' };

const statusKind = (s: string) =>
  (s === 'healthy'
    ? 'ok'
    : s === 'idle'
      ? 'neutral'
      : s === 'degraded' || s === 'misconfigured'
        ? 'warn'
        : s === 'insecure'
          ? 'purple'
          : 'crit') as 'ok' | 'neutral' | 'warn' | 'purple' | 'crit';

export function Inspector() {
  const { session, snap, report } = useLive();
  const selection = useGame((s) => s.selection);
  const mode = useGame((s) => s.settings.mode);
  const editDraft = useGame((s) => s.editDraft);
  const select = useGame((s) => s.select);
  useGame((s) => s.tick);

  const node = session && selection.type === 'node' ? nodeById(session.draft, selection.id!) : undefined;
  const edge = session && selection.type === 'edge' ? session.draft.edges.find((e) => e.id === selection.id) : undefined;
  const costs = useMemo(() => (session && snap ? costBreakdown(session.live, snap, session.workload) : []), [session, snap]);

  if (!session) return null;

  if (edge) {
    const s = nodeById(session.draft, edge.source);
    const t = nodeById(session.draft, edge.target);
    const cls = edgeClass(session.draft, edge);
    const em = snap?.edges[edge.id];
    const patch = (c: Partial<typeof edge.config>) =>
      editDraft((a) => {
        const e = a.edges.find((x) => x.id === edge.id);
        if (e) Object.assign(e.config, c);
      });
    return (
      <div className="inspector">
        <header className="insp-head">
          <div className="insp-title">
            <h3>
              {s?.label} → {t?.label}
            </h3>
            <Chip kind="info">{cls} connection</Chip>
          </div>
        </header>
        {cls === 'traffic' || cls === 'async' ? (
          <>
            {em && (
              <div className="grid2">
                <div className="mini">
                  <span>Traffic</span>
                  <b>{num(em.rps)} /s</b>
                </div>
                <div className="mini">
                  <span>Retry amplification</span>
                  <b className={em.amplification > 1.25 ? 'warn' : ''}>×{em.amplification.toFixed(2)}</b>
                </div>
                <div className="mini">
                  <span>Target error rate</span>
                  <b className={em.errorRate > 0.05 ? 'crit' : ''}>{pct(em.errorRate)}</b>
                </div>
                <div className="mini">
                  <span>Circuit breaker</span>
                  <b>{em.breakerOpen ? 'OPEN' : 'closed'}</b>
                </div>
              </div>
            )}
            {em?.blocked && (
              <div className="callout callout-crit">
                <strong>Blocked by the network</strong>
                <p>{em.blocked}</p>
              </div>
            )}
            <h4>Call behaviour</h4>
            <div className="fields">
              <div className="field">
                <label htmlFor="e-w">Calls per request</label>
                <input
                  id="e-w"
                  type="number"
                  min={0}
                  step={0.1}
                  value={edge.config.weight}
                  onChange={(e) => patch({ weight: Number(e.target.value) })}
                />
                <p className="help">Queries or calls the source makes to the target for each request it handles.</p>
              </div>
              {cls === 'traffic' && (
                <>
                  <div className="field">
                    <label htmlFor="e-t">Timeout</label>
                    <div className="num-wrap">
                      <input
                        id="e-t"
                        type="number"
                        min={50}
                        step={50}
                        value={edge.config.timeoutMs}
                        onChange={(e) => patch({ timeoutMs: Number(e.target.value) })}
                      />
                      <span className="unit">ms</span>
                    </div>
                    <p className="help">Calls slower than this count as failed. Timeouts must be shorter than the caller’s own deadline.</p>
                  </div>
                  <div className="field">
                    <label htmlFor="e-r">Retries</label>
                    <input
                      id="e-r"
                      type="number"
                      min={0}
                      max={10}
                      value={edge.config.retries}
                      onChange={(e) => patch({ retries: Number(e.target.value) })}
                    />
                    <p className="help">Retries rescue transient errors but multiply load on a struggling dependency.</p>
                  </div>
                  <div className="field field-row">
                    <label>Circuit breaker</label>
                    <button
                      role="switch"
                      aria-checked={edge.config.circuitBreaker}
                      className={`switch ${edge.config.circuitBreaker ? 'on' : ''}`}
                      onClick={() => patch({ circuitBreaker: !edge.config.circuitBreaker })}
                    >
                      <span />
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="muted">
            {cls === 'attach'
              ? 'Attached policy / observability / identity link.'
              : 'Deployment link: this pipeline component delivers to the service.'}
          </p>
        )}
        <div className="insp-actions">
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              editDraft((a) => {
                a.edges = a.edges.filter((x) => x.id !== edge.id);
              });
              select(null);
            }}
          >
            <Trash2 size={14} /> Disconnect
          </button>
        </div>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="inspector inspector-empty">
        <h3>Inspector</h3>
        <p className="muted">
          Select a component or connection on the canvas to see its configuration, dependencies, limits, cost and live behaviour.
        </p>
        {mode === 'beginner' && (
          <ul className="tips">
            <li>
              <b>Click</b> a component to inspect it.
            </li>
            <li>
              <b>Drag</b> from a right-hand handle to another component to connect them.
            </li>
            <li>
              <b>Change</b> its settings, then open the <b>Plan</b> tab and press <b>Deploy</b>.
            </li>
            <li>
              <b>Delete</b> removes the selected item.
            </li>
          </ul>
        )}
        {report && (
          <>
            <h4>System findings</h4>
            <ul className="list">
              {report.findings.slice(0, 4).map((f) => (
                <li key={f.id}>
                  <Chip kind={f.severity === 'critical' ? 'crit' : f.severity === 'high' ? 'warn' : 'neutral'}>{f.severity}</Chip> {f.title}
                </li>
              ))}
              {report.findings.length === 0 && <li className="muted">No security findings.</li>}
            </ul>
          </>
        )}
      </div>
    );
  }

  const entry = entryOf(node.kind);
  const live = nodeById(session.live, node.id);
  const m = snap?.nodes[node.id];
  const flag = report?.flags[node.id];
  const status = m ? visualStatus(m.status, flag) : 'idle';
  const cost = costs.find((c) => c.node.id === node.id);
  const setConfig = (k: string, v: any) =>
    editDraft((a) => {
      const n = nodeById(a, node.id);
      if (n) n.config[k] = v;
    });
  const remove = () =>
    editDraft((a) => {
      a.nodes = a.nodes.filter((n) => n.id !== node.id);
      a.edges = a.edges.filter((e) => e.source !== node.id && e.target !== node.id);
      a.nodes.forEach((n) => {
        for (const k of Object.keys(n.config)) if (n.config[k] === node.id) n.config[k] = '';
      });
    });
  const duplicate = () => {
    const id = uid(node.kind);
    editDraft((a) => {
      const c = clone(node);
      a.nodes.push({
        ...c,
        id,
        label: `${node.label} copy`,
        position: { x: node.position.x + 40, y: node.position.y + 60 },
        faults: undefined,
      });
    });
    select('node', id);
  };
  const isSource = entry.role === 'source';

  return (
    <div className="inspector">
      <header className="insp-head">
        <div className={`insp-ico st-${status}`}>
          <NodeIcon name={entry.icon} size={20} />
        </div>
        <div className="insp-title">
          <input
            className="title-input"
            aria-label="Component name"
            value={node.label}
            onChange={(e) =>
              editDraft((a) => {
                const n = nodeById(a, node.id);
                if (n) n.label = e.target.value;
              })
            }
          />
          <div className="chips">
            <Chip kind={statusKind(status)}>{status}</Chip>
            <Chip>{entry.name}</Chip>
            {entry.aws && <Chip kind="info">AWS · {SCOPE[entry.scope] || 'service'}</Chip>}
            {!live && <Chip kind="warn">pending deploy</Chip>}
          </div>
        </div>
      </header>
      <p className="desc">{entry.desc}</p>
      {(mode === 'beginner' || mode === 'intermediate') && entry.learn && (
        <details className="concept" open={mode === 'beginner'}>
          <summary>Engineering concept</summary>
          <p>{entry.learn}</p>
        </details>
      )}

      {m && !isSource && m.role !== 'network' && (
        <>
          <h4>Live behaviour</h4>
          <div className="grid2">
            <div className="mini">
              <span>Offered load</span>
              <b>{num(m.offered)} /s</b>
            </div>
            <div className="mini">
              <span>Capacity</span>
              <b>{m.capacity < 1e8 ? `${num(m.capacity)} /s` : '∞'}</b>
            </div>
            <div className="mini">
              <span>Utilisation</span>
              <b className={m.util >= 1 ? 'crit' : m.util > 0.8 ? 'warn' : ''}>{(m.util * 100).toFixed(0)}%</b>
              <Meter value={m.util} label="Utilisation" />
            </div>
            <div className="mini">
              <span>Latency (p50 / p95)</span>
              <b>
                {ms(m.latencyMs)} / {ms(m.p95Ms)}
              </b>
            </div>
            <div className="mini">
              <span>Error rate</span>
              <b className={m.errorRate > 0.05 ? 'crit' : m.errorRate > 0.01 ? 'warn' : ''}>{pct(m.errorRate)}</b>
            </div>
            <div className="mini">
              <span>Est. cost / month</span>
              <b>{usd2(m.costMonthly)}</b>
            </div>
            {m.connMax != null && (
              <div className="mini">
                <span>DB connections</span>
                <b className={(m.connUsed ?? 0) / m.connMax > 0.9 ? 'crit' : (m.connUsed ?? 0) / m.connMax > 0.75 ? 'warn' : ''}>
                  {(m.connUsed ?? 0).toFixed(0)} / {m.connMax}
                </b>
                <Meter value={m.connUsed ?? 0} max={m.connMax} label="Connections" />
              </div>
            )}
            {m.hitRate != null && (
              <div className="mini">
                <span>Hit rate</span>
                <b>{pct(m.hitRate, 0)}</b>
              </div>
            )}
            {m.queueDepth != null && !node.config.isDlq && (
              <div className="mini">
                <span>Queue depth / age</span>
                <b>
                  {num(m.queueDepth)} / {(m.queueDelaySec ?? 0).toFixed(0)}s
                </b>
              </div>
            )}
            {m.drainRate != null && (
              <div className="mini">
                <span>Arrivals vs drain</span>
                <b>
                  {num(m.arrivalRate ?? 0)} vs {num(m.drainRate)} /s
                </b>
              </div>
            )}
          </div>
          {m.reasons.length > 0 && (
            <div className="diag">
              <h4>Why is it like this?</h4>
              <ul>
                {m.reasons.map((r, i) => (
                  <li key={i} className={`r-${r.severity}`}>
                    {r.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {flag?.insecure && (
        <div className="callout callout-purple">
          <strong>Security finding</strong>
          <p>{flag.insecure}. See the Security panel for the remediation.</p>
        </div>
      )}
      {flag?.misconfigured && (
        <div className="callout callout-warn">
          <strong>Misconfiguration</strong>
          <p>{flag.misconfigured}</p>
        </div>
      )}

      {entry.fields.length > 0 && (
        <>
          <h4>Configuration</h4>
          <div className="fields">
            {entry.fields.map((f) => (
              <FieldEditor
                key={f.key}
                field={f}
                value={node.config[f.key]}
                arch={session.draft}
                onChange={(v) => setConfig(f.key, v)}
                changed={!!live && JSON.stringify(live.config[f.key]) !== JSON.stringify(node.config[f.key])}
              />
            ))}
          </div>
        </>
      )}

      <ConnectionsEditor nodeId={node.id} />

      {cost && cost.lines.length > 0 && (
        <>
          <h4>
            Cost breakdown <span className="muted tiny">(simulated estimate)</span>
          </h4>
          <ul className="list cost-lines">
            {cost.lines.map((l, i) => (
              <li key={i}>
                <span>{l.label}</span>
                <b>{usd2(l.usd)}</b>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="insp-actions">
        {entry.aws && ['ec2', 'ecs', 'eks', 'lambda', 'alb'].includes(node.kind) && (
          <button className="btn btn-ghost btn-sm" onClick={() => useGame.getState().setDock('network')}>
            <Network size={14} /> Trace network path
          </button>
        )}
        {!isSource && (
          <button className="btn btn-ghost btn-sm" onClick={duplicate}>
            <Copy size={14} /> Duplicate
          </button>
        )}
        {!isSource && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              remove();
              select(null);
            }}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}
