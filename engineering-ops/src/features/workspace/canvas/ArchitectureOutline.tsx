import { nodeById } from '@/engine/arch';
import { entryOf } from '@/engine/catalog';
import { useGame } from '@/game/store';

/** The diagram as text: what exists, how it is doing, and what it calls. The canvas itself is a picture to a screen reader. */
export function ArchitectureOutline() {
  const draft = useGame((s) => s.session?.draft);
  const snap = useGame((s) => s.session?.history[s.session.history.length - 1]);
  if (!draft) return null;
  return (
    <section className="sr-only" aria-label="Architecture outline">
      <h2>Architecture outline</h2>
      <p>
        {draft.nodes.length} components, {draft.edges.length} connections. Select a component with the keyboard to edit its settings and
        connections in the panel on the right.
      </p>
      <ul>
        {draft.nodes.map((n) => {
          const to = draft.edges.filter((e) => e.source === n.id).map((e) => nodeById(draft, e.target)?.label ?? e.target);
          const status = snap?.nodes[n.id]?.status;
          return (
            <li key={n.id}>
              {n.label}, {entryOf(n.kind).name}
              {status ? `, ${status}` : ''}
              {to.length ? `, connects to ${to.join(', ')}` : ', no outgoing connections'}.
            </li>
          );
        })}
      </ul>
    </section>
  );
}
