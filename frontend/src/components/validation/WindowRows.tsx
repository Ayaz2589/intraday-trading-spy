import { Fragment, useState } from 'react'
import { HelpTooltip } from '../help-tooltip'
import { SectionTitle, cardSection } from '../section-title'
import type { WalkForwardResult, WindowMetrics } from '@/api/types'

// Feature 014 (FR-007/FR-011, design Option B): expandable walk-forward window
// rows. Collapsed = the OOS verdict (expectancy, gap, trades, ⚠ thin sample);
// expanded = the in-sample / out-of-sample detail pair, each with a
// "View run →" link gated on `persisted` (pre-014 studies and failed pushes
// render no link — one rule, no dead links).

function money(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v < 0 ? '-' : '+'}$${Math.abs(v).toFixed(2)}`
}

function pct(v: number | null | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(0)}%`
}

function SegmentPanel({ label, m }: { label: string; m: WindowMetrics }) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: 220,
        padding: '10px 12px',
        borderRadius: 'var(--r-md, 8px)',
        border: '1px solid var(--border)',
        background: 'var(--surface-2, #f6f7f9)',
        fontSize: 'var(--fs-sm, 13px)',
      }}
    >
      <div style={{ fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
        {m.range_start} → {m.range_end}
      </div>
      <div className="mono" style={{ marginTop: 4 }}>
        {money(m.expectancy_dollars)}/trade · WR {pct(m.win_rate)} · PF{' '}
        {m.profit_factor == null ? '—' : m.profit_factor.toFixed(2)}
      </div>
      <div className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', marginTop: 2 }}>
        {m.total_trades} trades · net {money(m.total_net_pnl_dollars)}
        {m.low_confidence ? ' · ⚠ thin sample' : ''}
      </div>
      {m.persisted === true && (
        <a
          href={`/runs/${m.run_id}`}
          style={{ display: 'inline-block', marginTop: 8, color: 'var(--accent, #2563eb)', fontWeight: 600, fontSize: 'var(--fs-sm, 13px)' }}
        >
          View run →
        </a>
      )}
    </div>
  )
}

export function WindowRows({ result }: { result: WalkForwardResult }) {
  const [expanded, setExpanded] = useState<number | null>(null)
  const windows = result.windows ?? []

  return (
    <section style={cardSection}>
      <SectionTitle
        title="Windows"
        subtitle="each window's out-of-sample verdict — expand for the IS/OOS pair and its runs"
      >
        <HelpTooltip helpKey="study_drilldown" />
      </SectionTitle>

      {windows.length === 0 ? (
        <p style={{ fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
          No windows — the study produced no walk-forward windows.
        </p>
      ) : (
        <div>
          {windows.map((w) => {
            const isOpen = expanded === w.window_index
            const oos = w.out_of_sample
            const gapR = w.gap?.expectancy_r
            return (
              <Fragment key={w.window_index}>
                <div
                  data-testid={`window-row-${w.window_index}`}
                  onClick={() => setExpanded(isOpen ? null : w.window_index)}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 10,
                    padding: '7px 8px',
                    borderTop: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: 'var(--fs-sm, 13px)',
                    background: isOpen ? 'var(--surface-2, #f6f7f9)' : undefined,
                  }}
                >
                  <span aria-hidden style={{ color: 'var(--text-muted)' }}>{isOpen ? '▾' : '▸'}</span>
                  <span style={{ fontWeight: 600 }}>Window {w.window_index}</span>
                  <span className="mono">
                    OOS {money(oos?.expectancy_dollars)}/trade
                  </span>
                  <span className="mono" style={{ color: gapR != null && gapR < 0 ? 'var(--neg, #b42318)' : 'var(--text-muted)' }}>
                    gap {gapR == null ? '—' : `${gapR >= 0 ? '+' : ''}${gapR.toFixed(4)}R`}
                  </span>
                  <span className="mono" style={{ color: 'var(--text-muted)' }}>
                    {oos?.total_trades ?? 0} trades{oos?.low_confidence ? ' ⚠' : ''}
                  </span>
                </div>
                {isOpen && (
                  <div
                    data-testid={`window-detail-${w.window_index}`}
                    style={{ display: 'flex', gap: 10, flexWrap: 'wrap', padding: '10px 8px 14px' }}
                  >
                    <SegmentPanel label="In-sample" m={w.in_sample} />
                    <SegmentPanel label="Out-of-sample" m={w.out_of_sample} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      )}
    </section>
  )
}
