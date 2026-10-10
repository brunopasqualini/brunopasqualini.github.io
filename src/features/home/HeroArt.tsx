/** Decorative miniature of the product: a tiny live architecture. Purely illustrative, hidden from assistive tech. */
const TILES = [
  { x: 4, y: 40, tone: 'source', label: 'Users', glyph: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0' },
  { x: 29, y: 40, tone: 'edge', label: 'ALB', glyph: 'M6 6h12M6 12h12M6 18h12' },
  { x: 54, y: 14, tone: 'compute', label: 'API', glyph: 'M4 8l8-4 8 4v8l-8 4-8-4z' },
  { x: 54, y: 66, tone: 'compute', label: 'API', glyph: 'M4 8l8-4 8 4v8l-8 4-8-4z' },
  { x: 80, y: 40, tone: 'data', label: 'DB', glyph: 'M5 7c0-2 14-2 14 0v10c0 2-14 2-14 0zM5 12c0 2 14 2 14 0' },
] as const;

export function HeroArt() {
  return (
    <div className="heroart" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="heroart-edges">
        <path d="M14 50 H29" />
        <path d="M39 50 C46 50 46 24 54 24" />
        <path d="M39 50 C46 50 46 76 54 76" />
        <path d="M64 24 C72 24 72 50 80 50" />
        <path d="M64 76 C72 76 72 50 80 50" />
      </svg>
      {TILES.map((t, i) => (
        <div key={i} className={`heroart-tile tone-${t.tone}`} style={{ left: `${t.x}%`, top: `${t.y}%` }}>
          <span>
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={t.glyph} />
            </svg>
          </span>
          <em>{t.label}</em>
        </div>
      ))}
      <div className="heroart-chip heroart-chip-a">p95 142 ms</div>
      <div className="heroart-chip heroart-chip-b">99.98% available</div>
      <div className="heroart-chip heroart-chip-c">$412 / mo</div>
    </div>
  );
}
