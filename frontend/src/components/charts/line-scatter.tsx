import { useEffect, useRef, useState } from 'react'

type Hover = { left: number; top: number; lines: string[] }

// Feature 016: reusable hand-rolled SVG multi-series line/scatter chart
// (equity-curve precedent — no chart dependency). Points are clickable;
// a dashed zero line is drawn when the values cross zero.
//
// 016-polish round 2: the SVG is sized to the measured container width
// (uniform scaling — no preserveAspectRatio stretch distorting points and
// labels), with y-axis ticks + gridlines and deduped x-axis ticks.

export type LineScatterPoint = {
  x: number
  // Optional range end: the point renders at the midpoint with a horizontal
  // extent bar spanning [x, xEnd] (e.g. a validation window's date range).
  xEnd?: number
  y: number
  label?: string
  // Rich hover-tooltip lines (custom tooltip; faster than the native title).
  detail?: string[]
  datum?: unknown
}

export type LineScatterSeries = {
  id: string
  color: string
  points: LineScatterPoint[]
}

// Shaded x-ranges (e.g. labeled market regimes) drawn behind the series.
// Bands outside the x-domain are skipped; partial overlaps clamp.
export type LineScatterBand = {
  from: number
  to: number
  label: string
}

export function LineScatter({
  series,
  bands = [],
  onPointClick,
  formatY = (v) => String(Math.round(v * 100) / 100),
  formatX = (v) => String(v),
  height = 220,
  legend = true,
}: {
  series: LineScatterSeries[]
  bands?: LineScatterBand[]
  onPointClick?(datum: unknown): void
  formatY?(v: number): string
  formatX?(v: number): string
  height?: number
  // Set false when the caller renders its own (e.g. toggleable) legend.
  legend?: boolean
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 800)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const all = series.flatMap((s) => s.points)
  if (all.length === 0) return null

  const xs = all.flatMap((p) => (p.xEnd != null ? [p.x, p.xEnd] : [p.x]))
  const ys = all.map((p) => p.y)
  const xMin = Math.min(...xs)
  const xMax = Math.max(...xs)
  const yMin = Math.min(...ys, 0)
  const yMax = Math.max(...ys, 0)
  const W = width
  const H = height
  const PAD_L = 56
  const PAD_R = 12
  const PAD_T = 20
  const PAD_B = 24
  const x = (v: number) => PAD_L + ((v - xMin) / (xMax - xMin || 1)) * (W - PAD_L - PAD_R)
  const y = (v: number) => H - PAD_B - ((v - yMin) / (yMax - yMin || 1)) * (H - PAD_T - PAD_B)
  const crossesZero = yMin < 0 && yMax > 0

  // Evenly spaced y ticks (gridlines + labels) — denser on tall charts.
  const yTickCount = H >= 300 ? 7 : 5
  const yTicks = Array.from({ length: yTickCount }, (_, i) =>
    yMin + (i / (yTickCount - 1)) * (yMax - yMin),
  )

  // 6 evenly spaced x ticks; consecutive duplicate labels collapse (years).
  const xTickValues = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) => xMin + t * (xMax - xMin))
  const xTicks: { v: number; label: string }[] = []
  for (const v of xTickValues) {
    const label = formatX(v)
    if (xTicks.length === 0 || xTicks[xTicks.length - 1].label !== label) {
      xTicks.push({ v, label })
    }
  }

  const visibleBands = bands
    .map((b) => ({ ...b, from: Math.max(b.from, xMin), to: Math.min(b.to, xMax) }))
    .filter((b) => b.from < b.to)

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
        {visibleBands.map((b, i) => (
          <g key={i}>
            <rect
              data-testid="ls-band"
              x={x(b.from)}
              y={PAD_T - 6}
              width={Math.max(x(b.to) - x(b.from), 1)}
              height={H - PAD_T - PAD_B + 6}
              fill="var(--text-muted)"
              opacity={0.06}
            />
            <text
              x={x(b.from) + 5}
              y={PAD_T + 4}
              fontSize={9}
              fill="var(--text-muted)"
              opacity={0.8}
              style={{ letterSpacing: '0.4px', textTransform: 'uppercase' }}
            >
              {b.label}
            </text>
          </g>
        ))}

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              data-testid="ls-grid"
              x1={PAD_L}
              y1={y(t)}
              x2={W - PAD_R}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth={0.5}
            />
            <text
              data-testid="ls-ytick"
              x={PAD_L - 8}
              y={y(t) + 3}
              fontSize={10}
              textAnchor="end"
              fill="var(--text-muted)"
            >
              {formatY(t)}
            </text>
          </g>
        ))}

        {xTicks.map((t, i) => (
          <text
            key={i}
            data-testid="ls-xtick"
            x={x(t.v)}
            y={H - 8}
            fontSize={10}
            textAnchor="middle"
            fill="var(--text-muted)"
          >
            {t.label}
          </text>
        ))}

        {crossesZero && (
          <line
            data-testid="ls-zero"
            x1={PAD_L}
            y1={y(0)}
            x2={W - PAD_R}
            y2={y(0)}
            stroke="var(--border-strong)"
            strokeDasharray="4 3"
          />
        )}

        {series.map((s) => {
          const cx = (p: LineScatterPoint) => x(p.xEnd != null ? (p.x + p.xEnd) / 2 : p.x)
          const last = s.points[s.points.length - 1]
          return (
            <g key={s.id}>
              <polyline
                points={s.points.map((p) => `${cx(p)},${y(p.y)}`).join(' ')}
                stroke={s.color}
                strokeWidth={1.5}
                fill="none"
                opacity={0.7}
              />
              {s.points.map((p, i) =>
                p.xEnd != null ? (
                  <line
                    key={`e${i}`}
                    data-testid="ls-extent"
                    x1={x(p.x)}
                    y1={y(p.y)}
                    x2={x(p.xEnd)}
                    y2={y(p.y)}
                    stroke={s.color}
                    strokeWidth={2.5}
                    opacity={0.3}
                  />
                ) : null,
              )}
              {s.points.map((p, i) => (
                <circle
                  key={i}
                  data-testid="ls-point"
                  cx={cx(p)}
                  cy={y(p.y)}
                  r={4.5}
                  fill={s.color}
                  style={{ cursor: onPointClick ? 'pointer' : undefined }}
                  onClick={() => onPointClick?.(p.datum)}
                  onMouseEnter={() =>
                    p.detail &&
                    setHover({ left: cx(p), top: y(p.y), lines: p.detail })
                  }
                  onMouseLeave={() => setHover(null)}
                >
                  {p.label && <title>{p.label}</title>}
                </circle>
              ))}
              {last && (
                <text
                  data-testid="ls-series-label"
                  x={cx(last) + 8}
                  y={y(last.y) + 3}
                  fontSize={10}
                  fill={s.color}
                  fontWeight={600}
                >
                  {s.id}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      {hover && (
        <div
          data-testid="ls-tooltip"
          className="mono"
          style={{
            position: 'absolute',
            left: Math.min(hover.left + 12, W - 220),
            top: Math.max(hover.top - 10, 0),
            background: 'var(--bg-elevated, #fff)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)',
            padding: '6px 10px',
            fontSize: 'var(--fs-xs, 11px)',
            pointerEvents: 'none',
            zIndex: 5,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          {hover.lines.map((l, i) => (
            <div key={i} style={i === 0 ? { fontWeight: 700 } : undefined}>
              {l}
            </div>
          ))}
        </div>
      )}
      {legend && (
      <div
        className="stat-label"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-4)', marginTop: 4 }}
      >
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
      )}
    </div>
  )
}
