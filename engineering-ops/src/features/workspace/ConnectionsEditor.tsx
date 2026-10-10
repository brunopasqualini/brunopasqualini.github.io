import { Link2, X } from 'lucide-react';
import { useId, useState } from 'react';
import { defaultEdgeWeight, edgeClass, makeEdge, nodeById } from '@/engine/arch';
import { canConnect } from '@/engine/catalog';
import { useGame } from '@/game/store';

/**
 * Connections as a form, not only as drag handles: everything the canvas can do with a mouse
 * (inspect, add, remove a connection) is available from the keyboard and to screen readers here.
 */
export function ConnectionsEditor({ nodeId }: { nodeId: string }) {
  const draft = useGame((s) => s.session?.draft);
  const editDraft = useGame((s) => s.editDraft);
  const select = useGame((s) => s.select);
  const toast = useGame((s) => s.toast);
  const [target, setTarget] = useState('');
  const selectId = useId();
  const node = draft ? nodeById(draft, nodeId) : undefined;
  if (!draft || !node) return null;

  const incoming = draft.edges.filter((e) => e.target === node.id);
  const outgoing = draft.edges.filter((e) => e.source === node.id);
  const options = draft.nodes.filter(
    (t) => t.id !== node.id && !draft.edges.some((e) => e.source === node.id && e.target === t.id) && canConnect(node.kind, t.kind).ok,
  );
  const label = (id: string) => nodeById(draft, id)?.label ?? id;

  const add = () => {
    const t = nodeById(draft, target);
    if (!t) return;
    editDraft((a) => {
      a.edges.push(makeEdge(node.id, t.id, { weight: defaultEdgeWeight(t.kind) }));
    });
    toast(`Connected ${node.label} → ${t.label}.`, 'info');
    setTarget('');
  };
  const remove = (id: string, from: string, to: string) => {
    editDraft((a) => {
      a.edges = a.edges.filter((e) => e.id !== id);
    });
    toast(`Removed the connection ${label(from)} → ${label(to)}.`, 'info');
  };

  return (
    <section aria-label="Connections">
      <h4>Connections</h4>
      <ul className="list deps">
        {incoming.map((e) => (
          <li key={e.id}>
            <button className="link" onClick={() => select('edge', e.id)}>
              ← {label(e.source)}
            </button>{' '}
            <span className="muted">({edgeClass(draft, e)})</span>
            <button
              className="icon-btn conn-x"
              aria-label={`Remove connection from ${label(e.source)} to ${node.label}`}
              onClick={() => remove(e.id, e.source, e.target)}
            >
              <X size={13} />
            </button>
          </li>
        ))}
        {outgoing.map((e) => {
          const t = nodeById(draft, e.target);
          const bad = t && !canConnect(node.kind, t.kind).ok;
          return (
            <li key={e.id}>
              <button className="link" onClick={() => select('edge', e.id)}>
                → {label(e.target)}
              </button>{' '}
              <span className="muted">
                ({edgeClass(draft, e)}
                {bad ? ', invalid' : ''})
              </span>
              <button
                className="icon-btn conn-x"
                aria-label={`Remove connection from ${node.label} to ${label(e.target)}`}
                onClick={() => remove(e.id, e.source, e.target)}
              >
                <X size={13} />
              </button>
            </li>
          );
        })}
        {incoming.length + outgoing.length === 0 && <li className="muted">Not connected to anything yet.</li>}
      </ul>
      {options.length > 0 ? (
        <div className="conn-add">
          <label htmlFor={selectId} className="tiny muted">
            Connect {node.label} to
          </label>
          <div className="row-gap">
            <select id={selectId} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">Choose a component…</option>
              {options.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
            <button className="btn btn-ghost btn-sm" disabled={!target} onClick={add}>
              <Link2 size={14} /> Connect
            </button>
          </div>
        </div>
      ) : (
        <p className="help">No other component can receive a connection from {node.label} right now.</p>
      )}
    </section>
  );
}
