import { HelpTooltip } from '@/components/help-tooltip'
import type { BarsStatsResponse } from '@/api/bars'

// Data-page redesign: the status strip under the stat cards — the explicit
// missing-sessions verdict (SC-004), symbol/interval/last-updated, and the
// light lineage line (SC-007). Replaces the old CacheSummary.

function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—'
}

export function StatusStrip({ stats }: { stats: BarsStatsResponse }) {
  const { totals, months, lineage } = stats
  const missingCount = months.reduce((n, m) => n + m.missing_dates.length, 0)
  const ok = missingCount === 0

  return (
    <div
      data-testid="status-strip"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '8px 12px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md, 10px)',
        background: 'var(--surface, #fff)',
        fontSize: 'var(--fs-sm, 13px)',
      }}
    >
      <span
        data-testid="missing-summary"
        style={{
          padding: '2px 10px',
          borderRadius: 999,
          fontWeight: 600,
          color: ok ? 'var(--pos, #1a7f37)' : 'var(--neg, #b42318)',
          background: ok ? 'var(--pos-bg, #e6f4ea)' : 'var(--neg-bg, #fdecea)',
        }}
      >
        {ok
          ? '✓ No missing sessions — every NYSE trading day present'
          : `${missingCount} missing trading day${missingCount === 1 ? '' : 's'} — see the orange months below`}
      </span>
      <span style={{ color: 'var(--text-muted)' }}>
        Symbol <strong className="mono">SPY</strong> · Interval <strong className="mono">5 min</strong> · Updated {fmtWhen(totals.last_updated)}
      </span>
      <span data-testid="lineage-line" style={{ marginLeft: 'auto', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {lineage.runs_count > 0 ? (
          <span>
            Feeds <strong>{lineage.runs_count}</strong> backtests + <strong>{lineage.studies_count}</strong> studies
            {lineage.latest_run_at && <> · latest {fmtWhen(lineage.latest_run_at)}</>}
          </span>
        ) : (
          <span>No backtests yet — this cache is waiting to be used.</span>
        )}
        <a href="/runs" style={{ color: 'var(--accent, #2563eb)' }}>
          Runs →
        </a>
        <HelpTooltip helpKey="data_lineage" />
      </span>
    </div>
  )
}
