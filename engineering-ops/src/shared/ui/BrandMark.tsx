/** The Engineering Ops mark: a hexagon holding a tiny service graph. */
export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="brandmark">
      <defs>
        <linearGradient id="eo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <path
        d="M20 2.5 35.5 11.2v17.6L20 37.5 4.5 28.8V11.2z"
        fill="rgba(34,211,238,0.08)"
        stroke="url(#eo-g)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M13 24 20 15l7 9M13 24h14" fill="none" stroke="url(#eo-g)" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="20" cy="14.5" r="3" fill="url(#eo-g)" />
      <circle cx="12.5" cy="24.5" r="2.6" fill="url(#eo-g)" />
      <circle cx="27.5" cy="24.5" r="2.6" fill="#a78bfa" />
    </svg>
  );
}
