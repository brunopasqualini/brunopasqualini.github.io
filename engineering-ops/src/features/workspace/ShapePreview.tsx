import { profilePeak, sampleProfile } from '@/content/trafficShapes';
import type { Workload } from '@/engine/types';

const W = 220;
const H = 48;
const PAD = 4;

/**
 * A small drawing of the traffic profile over one cycle, with a dashed line at the base level and a playhead
 * showing where the simulation clock is now. Works for a library shape or a scenario's own profile.
 */
export function ShapePreview({
  profile,
  cycle,
  minute,
  baseRps,
}: {
  profile: Workload['profile'];
  cycle?: number;
  minute: number;
  baseRps: number;
}) {
  const samples = sampleProfile(profile, cycle, 64);
  const top = Math.max(1, ...samples);
  const y = (v: number) => H - PAD - (v / top) * (H - PAD * 2);
  const x = (i: number) => PAD + (i / (samples.length - 1)) * (W - PAD * 2);
  const line = samples.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  const span = cycle && cycle > 0 ? cycle : Math.max(1, profile[profile.length - 1]?.t ?? 1);
  const at = cycle && cycle > 0 ? minute % cycle : Math.min(minute, span);
  const px = PAD + (at / span) * (W - PAD * 2);
  const peak = profilePeak({ profile });
  return (
    <svg
      className="shape-preview"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Traffic over one ${cycle ? 'cycle' : 'run'}: peak ${Math.round(baseRps * peak)} requests per second, ${peak === 1 ? 'constant' : `${peak} times the base level`}`}
    >
      <line x1={PAD} x2={W - PAD} y1={y(1)} y2={y(1)} className="sp-base" />
      <path d={`${line} L${W - PAD} ${H - PAD} L${PAD} ${H - PAD} Z`} className="sp-fill" />
      <path d={line} className="sp-line" />
      <line x1={px} x2={px} y1={PAD} y2={H - PAD} className="sp-now" />
    </svg>
  );
}
