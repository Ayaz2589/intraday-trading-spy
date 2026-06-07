import { useEffect, useRef } from 'react'
import { dispose, init, registerIndicator, type Chart, type KLineData } from 'klinecharts'
import { HelpTooltip } from '../help-tooltip'
import type { TradeView } from '@/api/trade'
import type { LiveBars } from '@/hooks/useTrade'

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

const VIEWS: TradeView[] = ['1m', '5m', '1d', '30d']

export function LiveChart({
  view,
  onView,
  data,
}: {
  view: TradeView
  onView(view: TradeView): void
  data: LiveBars
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)

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
      <div
        ref={elRef}
        data-chart-root="true"
        style={{ width: '100%', height: 380, background: 'var(--chart-bg)', borderRadius: 'var(--r-md)' }}
      />
      {data.loading && <p className="stat-label">loading bars…</p>}
    </div>
  )
}
