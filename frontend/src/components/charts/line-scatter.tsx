// Feature 016: reusable hand-rolled SVG multi-series line/scatter chart
// (equity-curve precedent — no chart dependency). Points are clickable;
// a dashed zero line is drawn when the values cross zero.

export type LineScatterPoint = {
  x: number
  y: number
  label?: string
  datum?: unknown
}

export type LineScatterSeries = {
  id: string
  color: string
  points: LineScatterPoint[]
}

export function LineScatter({
  series,
  onPointClick,
  height = 180,
}: {
  series: LineScatterSeries[]
  onPointClick?(datum: unknown): void
  height?: number
}) {
  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null

  const xs = all.map((p) => p.x)
  const ys = all.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys, 0)
  const yMax = Math.max(...ys, 0)
  const W = 600
  const H = height
  const PAD = 8
  const x = (v: number) => PAD + ((v - xMin) / (xMax - xMin || 1)) * (W - 2 * PAD)
  const y = (v: number) => H - PAD - ((v - yMin) / (yMax - yMin || 1)) * (H - 2 * PAD)
  const crossesZero = yMin < 0 && yMax > 0

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height, display: 'block' }}
      >
        {crossesZero && (
          <line
            data-testid="ls-zero"
            x1={0}
            y1={y(0)}
            x2={W}
            y2={y(0)}
            stroke="var(--border-strong)"
            strokeDasharray="4 3"
          />
        )}
        {series.map((s) => (
          <g key={s.id}>
            <polyline
              points={s.points.map((p) => `${x(p.x)},${y(p.y)}`).join(' ')}
              stroke={s.color}
              strokeWidth={1.5}
              fill="none"
              opacity={0.7}
            />
            {s.points.map((p, i) => (
              <circle
                key={i}
                data-testid="ls-point"
                cx={x(p.x)}
                cy={y(p.y)}
                r={4}
                fill={s.color}
                style={{ cursor: onPointClick ? 'pointer' : undefined }}
                onClick={() => onPointClick?.(p.datum)}
              >
                {p.label && <title>{p.label}</title>}
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="stat-label" style={{ display: 'flex', gap: 'var(--sp-4)', marginTop: 4 }}>
        {series.map((s) => (
          <span key={s.id}>
            <span
              style={{
                display: 'inline-block',
                width: 9,
                height: 9,
                borderRadius: 9,
                background: s.color,
                marginRight: 5,
              }}
            />
            {s.id}
          </span>
        ))}
      </div>
    </div>
  )
}
