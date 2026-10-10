import type { ReactNode } from 'react';

export { Modal } from './Dialog';
export { Tabs } from './Tabs';

export function Chip({
  kind = 'neutral',
  children,
  title,
}: {
  kind?: 'neutral' | 'ok' | 'warn' | 'crit' | 'info' | 'purple';
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className={`chip chip-${kind}`} title={title}>
      {children}
    </span>
  );
}

export function Meter({
  value,
  max = 1,
  kind,
  label,
}: {
  value: number;
  max?: number;
  kind?: 'ok' | 'warn' | 'crit' | 'info';
  label?: string;
}) {
  const f = Math.max(0, Math.min(1, value / max));
  const k = kind ?? (f >= 1 ? 'crit' : f > 0.8 ? 'warn' : 'ok');
  return (
    <div className="meter" role="meter" aria-valuenow={Math.round(f * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`meter-fill meter-${k}`} style={{ width: `${f * 100}%` }} />
    </div>
  );
}

export function Sparkline({
  values,
  color = 'var(--cyan)',
  height = 28,
  width = 96,
  min,
  max,
}: {
  values: number[];
  color?: string;
  height?: number;
  width?: number;
  min?: number;
  max?: number;
}) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const span = hi - lo || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * width).toFixed(1)},${(height - 2 - ((v - lo) / span) * (height - 4)).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  sub,
  kind,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  kind?: 'ok' | 'warn' | 'crit' | 'info';
}) {
  return (
    <div className={`kpi ${kind ? `kpi-${kind}` : ''}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

export const diffClass = (d: 'add' | 'remove' | 'change' | 'connect' | 'disconnect') =>
  d === 'add' || d === 'connect' ? 'diff-add' : d === 'remove' || d === 'disconnect' ? 'diff-rem' : 'diff-chg';
