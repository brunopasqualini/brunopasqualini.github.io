import { FlaskConical, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { atPeak, profilePeak } from '@/content/trafficShapes';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { ms, usd2 } from '@/shared/lib/fmt';
import { evaluateDesign } from './evaluateDesign';

/** Save designs, compare them under the same workload, and log what the comparison taught you. */
export function DesignsCompare() {
  const { session } = useLive();
  const tick = useGame((s) => s.tick);
  const progress = useGame((s) => s.progress);
  const saveDesign = useGame((s) => s.saveDesign);
  const deleteDesign = useGame((s) => s.deleteDesign);
  const loadDesign = useGame((s) => s.loadDesign);
  const recordExperiment = useGame((s) => s.recordExperiment);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const w = session?.workload;

  const compare = useMemo(() => {
    if (!session || !w) return [];
    const rows: { id: string; name: string; m: Record<string, number> }[] = [
      { id: 'draft', name: 'Current draft', m: evaluateDesign(session.draft, atPeak(w)) },
    ];
    for (const d of progress.designs.filter((x) => picked.includes(x.id)))
      rows.push({ id: d.id, name: d.name, m: evaluateDesign(d.arch, atPeak(w)) });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, session?.draft, picked, w, progress.designs]);
  if (!session || !w) return null;
  return (
    <section>
      <h4>Designs &amp; comparison</h4>
      <div className="row-gap">
        <input aria-label="Design name" placeholder="Name this design…" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            saveDesign(name);
            setName('');
          }}
        >
          <Save size={14} /> Save draft
        </button>
      </div>
      <ul className="designs">
        {progress.designs.map((d) => (
          <li key={d.id}>
            <label>
              <input
                type="checkbox"
                checked={picked.includes(d.id)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, d.id] : picked.filter((x) => x !== d.id))}
              />{' '}
              {d.name}
            </label>
            <span>
              <button className="link" onClick={() => loadDesign(d.id)}>
                load
              </button>{' '}
              <button className="icon-btn" aria-label={`Delete ${d.name}`} onClick={() => deleteDesign(d.id)}>
                <Trash2 size={13} />
              </button>
            </span>
          </li>
        ))}
        {progress.designs.length === 0 && <li className="muted">Save designs to compare them under the same workload.</li>}
      </ul>
      {compare.length > 0 && (
        <div className="cmp">
          <table className="tbl">
            <thead>
              <tr>
                <th>Design</th>
                <th>Avail.</th>
                <th>p95</th>
                <th>Cost</th>
                <th>Sec.</th>
                <th>Ops cx</th>
                <th>AZ</th>
              </tr>
            </thead>
            <tbody>
              {compare.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td className="mono">{r.m.availability.toFixed(1)}%</td>
                  <td className="mono">{ms(r.m.p95)}</td>
                  <td className="mono">{usd2(r.m.cost)}</td>
                  <td className="mono">{r.m.securityScore.toFixed(0)}</td>
                  <td className="mono">{r.m.opComplexity.toFixed(0)}</td>
                  <td className="mono">{r.m.azSurvival.toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {profilePeak(w) !== 1 && (
            <p className="muted tiny">
              Compared with traffic held at this shape&rsquo;s peak ({Math.round(w.baseRps * profilePeak(w))} rps), the hardest moment.
            </p>
          )}
          <div className="row-gap">
            <input
              aria-label="Experiment note"
              placeholder="What did this experiment teach you?"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                recordExperiment(`Comparison of ${compare.map((c) => c.name).join(' vs ')}`, note, compare[0].m);
                setNote('');
              }}
            >
              <FlaskConical size={14} /> Log experiment
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
