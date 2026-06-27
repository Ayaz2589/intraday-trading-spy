import { useEffect, useRef, useState } from 'react'
import {
  dispose, init, registerIndicator, registerOverlay,
  type Chart, type KLineData,
} from 'klinecharts'
import { HelpTooltip } from '../help-tooltip'
import type { TradeView } from '@/api/trade'
import type { LiveBars } from '@/hooks/useTrade'
import { TONE_COLOR, type ReplayMarker } from './replay-markers'

// Feature 021 (US2, FR-013/014/015): the live SPY chart. Bars arrive from
// the polled /api/trade/bars increments; VWAP values are the backend's
// (session-anchored), looked up per timestamp — the same pattern the
// run-viewer chart uses. Position levels render as price lines AND as a
// readable strip (the strip is also the testable surface).

const liveVwapByTs = new Map<number, number>()

registerIndicator({
  name: 'LiveVWAP',
  shortName: 'VWAP',
  precision: 2,
  figures: [
    {
      key: 'vwap',
      title: 'VWAP: ',
      type: 'line',
      // @ts-expect-error klinecharts figure styles callback signature varies
      styles: () => ({ color: '#f5a524', size: 2, style: 'solid' }),
    },
  ],
  calc: (data: KLineData[]) =>
    data.map((d) => ({ vwap: liveVwapByTs.get(d.timestamp) ?? null })),
})

// Feature 022: a small dot drawn on the chart at a trade/action point. Hover
// hit-testing + the detail popover live in the component; this just paints.
registerOverlay({
  name: 'replayMarkerDot',
  totalStep: 1,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates, overlay }) => {
    const c = coordinates?.[0]
    if (!c) return []
    const color = ((overlay?.extendData as { color?: string } | undefined)?.color) ?? '#8a96ab'
    return [{
      type: 'circle',
      attrs: { x: c.x, y: c.y, r: 5 },
      styles: { style: 'stroke_fill', color: '#ffffff', borderColor: color, borderSize: 2 },
    }]
  },
})

const VIEWS: TradeView[] = ['1m', '5m', '1d', '30d']

type HoverState = { marker: ReplayMarker; x: number; y: number } | null

export function LiveChart({
  view,
  onView,
  data,
  markers = [],
}: {
  view: TradeView
  onView(view: TradeView): void
  data: LiveBars
  markers?: ReplayMarker[]
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  const [hover, setHover] = useState<HoverState>(null)

  useEffect(() => {
    if (!elRef.current) return
    const chart = init(elRef.current)
    chartRef.current = chart
    chart?.setSymbol({ ticker: 'SPY', pricePrecision: 2, volumePrecision: 0 })
    chart?.setPeriod({ type: 'minute', span: 5 })
    // v10-beta2 quirk: isStack is required to attach to an existing pane id.
    chart?.createIndicator('LiveVWAP', {
      isStack: true,
      pane: { id: 'candle_pane' },
    })
    return () => {
      if (elRef.current) dispose(elRef.current)
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    liveVwapByTs.clear()
    const klines: KLineData[] = data.bars.map((b) => {
      const ts = Date.parse(b.t)
      if (b.vwap != null) liveVwapByTs.set(ts, b.vwap)
      return {
        timestamp: ts, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
      }
    })
    chart.setDataLoader({
      getBars: ({ callback }) => callback(klines, false),
    })
    // position levels as price lines
    chart.removeOverlay({ groupId: 'levels' })
    const levels = data.positionLevels
    if (levels) {
      const mk = (value: number | null, text: string, color: string) => {
        if (value == null) return
        chart.createOverlay({
          name: 'priceLine', groupId: 'levels',
          points: [{ value }],
          styles: { line: { color }, text: { color } },
          extendData: text,
        })
      }
      mk(levels.entry, 'entry', '#2563eb')
      mk(levels.stop, 'stop', '#dc2626')
      mk(levels.target, 'target', '#16a34a')
    }
  }, [data.bars, data.positionLevels])

  // Feature 022: trade/action markers (replay only — empty on the live page).
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay({ groupId: 'replay-markers' })
    for (const m of markers) {
      chart.createOverlay({
        name: 'replayMarkerDot', groupId: 'replay-markers',
        points: [{ timestamp: m.ts, value: m.value }],
        extendData: { color: TONE_COLOR[m.tone] },
      })
    }
    setHover(null)
  }, [markers, data.bars])

  // Hover hit-test: find the nearest marker to the cursor and show its detail.
  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const chart = chartRef.current
    const el = elRef.current
    if (!chart || !el || markers.length === 0 || typeof chart.convertToPixel !== 'function') return
    const rect = el.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let coords: unknown
    try {
      coords = chart.convertToPixel(
        markers.map((m) => ({ timestamp: m.ts, value: m.value })),
        { paneId: 'candle_pane' },
      )
    } catch {
      return
    }
    const arr = (Array.isArray(coords) ? coords : [coords]) as Array<{ x?: number; y?: number }>
    let best = -1
    let bestD = 12
    arr.forEach((c, i) => {
      if (c?.x == null || c?.y == null) return
      const d = Math.hypot(mx - c.x, my - c.y)
      if (d < bestD) { bestD = d; best = i }
    })
    setHover((prev) => {
      if (best < 0) return prev ? null : prev
      if (prev && prev.marker.seq === markers[best].seq) return prev
      const c = arr[best]
      return { marker: markers[best], x: c.x as number, y: c.y as number }
    })
  }

  return (
    <div data-testid="live-chart" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="seg" role="group" aria-label="Chart view">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? 'seg-on' : undefined}
              aria-pressed={view === v}
              onClick={() => onView(v)}
            >
              {v}
            </button>
          ))}
        </div>
        {data.vwapAvailable ? (
          <span className="stat-label" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: '#f5a524' }} />
            VWAP <HelpTooltip helpKey="vwap" />
          </span>
        ) : (
          <span className="stat-label">
            no VWAP on this view — {data.vwapReason} <HelpTooltip helpKey="vwap" />
          </span>
        )}
        {data.positionLevels && (
          <span
            data-testid="position-levels"
            className="mono stat-label"
            style={{ marginLeft: 'auto' }}
          >
            entry {data.positionLevels.entry.toFixed(2)}
            {' · '}stop {data.positionLevels.stop?.toFixed(2) ?? '—'}
            {' · '}target {data.positionLevels.target?.toFixed(2) ?? '—'}{' '}
            <HelpTooltip helpKey="protective_orders" />
          </span>
        )}
      </div>
      <div style={{ position: 'relative' }}>
        <div
          ref={elRef}
          data-chart-root="true"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          style={{ width: '100%', height: 380, background: 'var(--chart-bg)', borderRadius: 'var(--r-md)' }}
        />
        {hover && <MarkerPopover hover={hover} />}
      </div>
      {markers.length > 0 && (
        <span className="stat-label" data-testid="replay-marker-legend">
          ● markers show entries, exits, and skipped/rejected setups — hover any
          dot for details
        </span>
      )}
      {data.loading && <p className="stat-label">loading bars…</p>}
    </div>
  )
}

function MarkerPopover({ hover }: { hover: { marker: ReplayMarker; x: number; y: number } }) {
  const { marker, x, y } = hover
  const color = TONE_COLOR[marker.tone]
  return (
    <div
      role="dialog"
      aria-label="Marker detail"
      data-testid="replay-marker-popover"
      style={{
        position: 'absolute', left: x, top: y,
        transform: 'translate(-50%, calc(-100% - 12px))',
        pointerEvents: 'none', zIndex: 20, minWidth: 170,
        background: 'var(--surface)', border: '1px solid var(--border-strong, var(--border))',
        borderRadius: 'var(--r-md)', boxShadow: 'var(--shadow-pop, 0 8px 24px rgba(0,0,0,0.18))',
        padding: '8px 10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)', color: 'var(--text)' }}>
          {marker.title}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 12, rowGap: 3 }}>
        {marker.rows.map(([label, value]) => (
          <span key={label} style={{ display: 'contents' }}>
            <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>{label}</span>
            <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text)', textAlign: 'right' }}>
              {value}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
