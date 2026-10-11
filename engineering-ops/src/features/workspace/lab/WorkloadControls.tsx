import { SHAPE_BY_ID, TRAFFIC_SHAPES, matchShape, profilePeak, shapePatch } from '@/content/trafficShapes';
import { ShapePreview } from '@/features/workspace/ShapePreview';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';

/** "90 minutes", "24 hours" … for a cycle length in virtual minutes. */
function cycleLabel(min: number): string {
  if (min % 1440 === 0) return `${min / 1440} day${min === 1440 ? '' : 's'}`;
  if (min >= 120 && min % 60 === 0) return `${min / 60} hours`;
  return `${min} minutes`;
}

/** One labelled range input for a workload setting. */
function Slider({
  label,
  display,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  display: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span>
        {label} <b>{display}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

/** Traffic shape plus the sliders that describe the workload. */
export function WorkloadControls() {
  const { session } = useLive();
  const setWorkload = useGame((s) => s.setWorkload);
  const w = session?.workload;
  if (!session || !w) return null;
  const shape = matchShape(w);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
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
      <Slider
        label="Base traffic"
        display={`${w.baseRps} rps`}
        value={w.baseRps}
        min={10}
        max={1500}
        step={10}
        onChange={(v) => setWorkload({ baseRps: v })}
      />
      <Slider
        label="Read ratio"
        display={pct(w.readRatio)}
        value={w.readRatio * 100}
        min={0}
        max={100}
        onChange={(v) => setWorkload({ readRatio: v / 100 })}
      />
      <Slider
        label="Cacheable reads"
        display={pct(w.cacheableShare)}
        value={w.cacheableShare * 100}
        min={0}
        max={100}
        onChange={(v) => setWorkload({ cacheableShare: v / 100 })}
      />
      <Slider
        label="Slow unindexed queries"
        display={pct(w.slowQueryShare)}
        value={w.slowQueryShare * 100}
        min={0}
        max={60}
        onChange={(v) => setWorkload({ slowQueryShare: v / 100 })}
      />
      <Slider
        label="Response size"
        display={`${w.payloadKB} KB`}
        value={w.payloadKB}
        min={1}
        max={200}
        onChange={(v) => setWorkload({ payloadKB: v })}
      />
      <Slider
        label="Poison messages"
        display={pct(w.poisonShare)}
        value={w.poisonShare * 100}
        min={0}
        max={20}
        onChange={(v) => setWorkload({ poisonShare: v / 100 })}
      />
      <Slider
        label="Message processing time"
        display={`${w.avgProcessMs} ms`}
        value={w.avgProcessMs}
        min={20}
        max={5000}
        step={20}
        onChange={(v) => setWorkload({ avgProcessMs: v })}
      />
    </section>
  );
}
