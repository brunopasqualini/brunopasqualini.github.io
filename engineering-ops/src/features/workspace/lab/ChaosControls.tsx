import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';

/** Inject failures into the running sandbox. */
export function ChaosControls() {
  const { session } = useLive();
  const setChaos = useGame((s) => s.setChaosList);
  if (!session) return null;
  const chaos = session.chaos;
  const hasChaos = (t: string) => chaos.some((c) => c.type === t);
  const toggle = (c: (typeof chaos)[number]) =>
    setChaos(chaos.some((x) => x.type === c.type) ? chaos.filter((x) => x.type !== c.type) : [...chaos, c]);
  const dbNode = session.live.nodes.find((n) => ['db', 'kv'].includes(n.kind) || n.kind === 'rds');
  return (
    <section>
      <h4>Inject failure (chaos)</h4>
      <div className="row-gap">
        <button
          className={`btn btn-ghost btn-sm ${hasChaos('spike') ? 'is-on' : ''}`}
          aria-pressed={hasChaos('spike')}
          onClick={() => toggle({ type: 'spike', mult: 3 })}
        >
          Traffic ×3
        </button>
        <button
          className={`btn btn-ghost btn-sm ${hasChaos('az-outage') ? 'is-on' : ''}`}
          aria-pressed={hasChaos('az-outage')}
          onClick={() => toggle({ type: 'az-outage', az: 'a' })}
        >
          AZ-a outage
        </button>
        {dbNode && (
          <button
            className={`btn btn-ghost btn-sm ${hasChaos('slow') ? 'is-on' : ''}`}
            aria-pressed={hasChaos('slow')}
            onClick={() => toggle({ type: 'slow', nodeId: dbNode.id, mult: 6 })}
          >
            {dbNode.label} 6× slower
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={() => setChaos([])} disabled={!chaos.length}>
          Clear
        </button>
      </div>
      {chaos.length > 0 && <p className="tiny warn">Active: {chaos.map((c) => c.type).join(', ')}</p>}
    </section>
  );
}
