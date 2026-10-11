import { FlaskConical, Save, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { buildReport } from '@/engine/analysis';
import { emptyState, solve } from '@/engine/engine';
import type { Arch, Workload } from '@/engine/types';
import { TEMPLATES } from '@/content/templates';
import { GameDayPanel } from './GameDayPanel';
import { TRAFFIC_SHAPES, SHAPE_BY_ID, atPeak, matchShape, profilePeak, shapePatch } from '@/content/trafficShapes';
import { ShapePreview } from '@/features/workspace/ShapePreview';
import { useGame } from '@/game/store';
import { Chip, useConfirm } from '@/shared/ui/common';
import { ms, usd2 } from '@/shared/lib/fmt';
import { useLive } from '@/game/hooks';

export function evaluateDesign(arch: Arch, workload: Workload) {
  let st = emptyState();
  const win = [];
  for (let i = 0; i < 12; i++) {
    const r = solve(arch, workload, i, st);
    st = r.next;
    win.push(r.snapshot);
  }
  return buildReport(arch, win.slice(-5), workload).metrics;
}

export function LabPanel() {
  const { session } = useLive();
  const tick = useGame((s) => s.tick);
  const progress = useGame((s) => s.progress);
  const setWorkload = useGame((s) => s.setWorkload);
  const setChaos = useGame((s) => s.setChaosList);
  const saveDesign = useGame((s) => s.saveDesign);
  const deleteDesign = useGame((s) => s.deleteDesign);
  const loadDesign = useGame((s) => s.loadDesign);
  const openMission = useGame((s) => s.openMission);
  const recordExperiment = useGame((s) => s.recordExperiment);
  const drill = useGame((s) => s.drill);
  const { ask, dialog } = useConfirm();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const w = session?.workload;
  const shape = w ? matchShape(w) : undefined;
  const chaos = session?.chaos ?? [];

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
  const hasChaos = (t: string) => chaos.some((c) => c.type === t);
  const toggle = (c: (typeof chaos)[number]) =>
    setChaos(chaos.some((x) => x.type === c.type) ? chaos.filter((x) => x.type !== c.type) : [...chaos, c]);
  const dbNode = session.live.nodes.find((n) => ['db', 'kv'].includes(n.kind) || n.kind === 'rds');

  return (
    <div className="lab-panel">
      {dialog}
      {drill && (
        <div className="callout callout-warn">
          <strong>Drill: {drill.title}</strong>
          <p>{drill.goal}</p>
        </div>
      )}
      <section>
        <h4>Template</h4>
        <select
          aria-label="Template"
          onChange={(e) => {
            const id = e.target.value;
            const tpl = TEMPLATES.find((x) => x.id === id);
            e.target.value = '';
            if (!tpl) return;
            ask(
              {
                title: `Load “${tpl.name}”?`,
                message: 'This replaces the sandbox. Your current sandbox is kept only if you saved it as a design.',
                confirmLabel: 'Replace sandbox',
              },
              () => openMission('lab', { template: tpl.id, fresh: true }),
            );
          }}
          defaultValue=""
        >
          <option value="">Load a template…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </section>
      <section>
        <h4>Workload</h4>
        <div className="shape-pick">
          <label>
            <span className="sr-only">Traffic shape</span>
            <select
              aria-label="Traffic shape"
              value={shape?.id ?? 'custom'}
              onChange={(e) => {
                const s = SHAPE_BY_ID[e.target.value];
                if (s) setWorkload(shapePatch(s));
              }}
            >
              {!shape && (
                <option value="custom" disabled>
                  Custom (this scenario&rsquo;s own profile)
                </option>
              )}
              {TRAFFIC_SHAPES.map((s) => (
                <option key={s.id} value={s.id}>
                  Traffic: {s.name}
                </option>
              ))}
            </select>
          </label>
          <ShapePreview profile={w.profile} cycle={w.profileCycle} minute={session.minute} baseRps={w.baseRps} />
          <div className="shape-meta">
            <span>
              Peak <b>{Math.round(w.baseRps * profilePeak(w))} rps</b>
            </span>
            <span>{w.profileCycle ? `repeats every ${cycleLabel(w.profileCycle)}` : 'plays once, then holds'}</span>
          </div>
          {shape && <p className="muted tiny">{shape.blurb}</p>}
        </div>
        <label className="slider">
          <span>
            Base traffic <b>{w.baseRps} rps</b>
          </span>
          <input
            type="range"
            min={10}
            max={1500}
            step={10}
            value={w.baseRps}
            onChange={(e) => setWorkload({ baseRps: Number(e.target.value) })}
          />
        </label>
        <label className="slider">
          <span>
            Read ratio <b>{Math.round(w.readRatio * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={w.readRatio * 100}
            onChange={(e) => setWorkload({ readRatio: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="slider">
          <span>
            Cacheable reads <b>{Math.round(w.cacheableShare * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={w.cacheableShare * 100}
            onChange={(e) => setWorkload({ cacheableShare: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="slider">
          <span>
            Slow unindexed queries <b>{Math.round(w.slowQueryShare * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={60}
            value={w.slowQueryShare * 100}
            onChange={(e) => setWorkload({ slowQueryShare: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="slider">
          <span>
            Response size <b>{w.payloadKB} KB</b>
          </span>
          <input type="range" min={1} max={200} value={w.payloadKB} onChange={(e) => setWorkload({ payloadKB: Number(e.target.value) })} />
        </label>
        <label className="slider">
          <span>
            Poison messages <b>{Math.round(w.poisonShare * 100)}%</b>
          </span>
          <input
            type="range"
            min={0}
            max={20}
            value={w.poisonShare * 100}
            onChange={(e) => setWorkload({ poisonShare: Number(e.target.value) / 100 })}
          />
        </label>
        <label className="slider">
          <span>
            Message processing time <b>{w.avgProcessMs} ms</b>
          </span>
          <input
            type="range"
            min={20}
            max={5000}
            step={20}
            value={w.avgProcessMs}
            onChange={(e) => setWorkload({ avgProcessMs: Number(e.target.value) })}
          />
        </label>
      </section>
      <GameDayPanel />
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
      <p className="muted tiny">
        All behaviour here is simulated. Costs are estimates, not AWS prices, and nothing touches a real cloud account.{' '}
        <Chip kind="info">sandbox</Chip>
      </p>
    </div>
  );
}

/** "90 minutes", "24 hours" … for a cycle length in virtual minutes. */
function cycleLabel(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min >= 120 && min % 60 === 0) return `${min / 60} hours`;
  return `${min} minutes`;
}
