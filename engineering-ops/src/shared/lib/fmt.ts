export const usd = (v: number) => (v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v.toFixed(0)}`);
export const usd2 = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
export const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
export const pct0 = (v: number) => `${v.toFixed(v >= 99.95 || v < 0.05 ? 0 : v >= 99 ? 2 : 1)}%`;
export const ms = (v: number) => (v >= 10000 ? `${(v / 1000).toFixed(0)}s` : v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v.toFixed(0)}ms`);
export const num = (v: number) =>
  v >= 1e6
    ? `${(v / 1e6).toFixed(1)}M`
    : v >= 1e4
      ? `${(v / 1e3).toFixed(0)}k`
      : v >= 1e3
        ? `${(v / 1e3).toFixed(1)}k`
        : v >= 100
          ? v.toFixed(0)
          : v.toFixed(1);
export const clock = (minute: number) => {
  const m = Math.max(0, Math.floor(minute));
  const h = Math.floor(m / 60);
  return `T+${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
export const dur = (sec: number) =>
  sec >= 3600 ? `${(sec / 3600).toFixed(1)} h` : sec >= 120 ? `${(sec / 60).toFixed(0)} min` : `${sec.toFixed(0)} s`;
export const ago = (minute: number) => {
  const m = -minute;
  return m < 60 ? `${Math.max(1, Math.round(m))}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
export const when = (t: number) =>
  new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
