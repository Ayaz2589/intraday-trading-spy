import { HelpTooltip } from '@/components/help-tooltip'
import type { BarsStatsResponse } from '@/api/bars'

// Feature 013 US2/US3/US4: the cache summary strip — totals, the explicit
// missing-sessions verdict (SC-004: never make the operator infer), and the
// light lineage line connecting the data to the research built on it.

function fmtWhen(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—'
}

export function CacheSummary({ stats }: { stats: BarsStatsResponse }) {
  const { totals, months, lineage } = stats
  const missingCount = months.reduce((n, m) => n + m.missing_dates.length, 0)

  return (
    <div
      data-testid="cache-summary"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '10px 12px',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md, 8px)',
        background: 'var(--surface, #fff)',
        fontSize: 'var(--fs-sm, 13px)',
      }}
    >
      <div>
        <strong>{totals.bars.toLocaleString()}</strong> bars · <strong>{totals.sessions.toLocaleString()}</strong> sessions
        {totals.earliest && totals.latest && (
          <>
            {' '}· <span className="mono">{totals.earliest} → {totals.latest}</span>
          </>
        )}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>
        Source: {totals.sources.length > 0 ? totals.sources.join(' + ') : '—'} · Last updated: {fmtWhen(totals.last_updated)}
      </div>
      <div data-testid="missing-summary" style={{ color: missingCount === 0 ? 'var(--pos, #1a7f37)' : 'var(--neg, #b42318)', fontWeight: 600 }}>
        {missingCount === 0
          ? 'No missing sessions — every NYSE trading day in the cached span is present ✓'
          : `${missingCount} missing trading day${missingCount === 1 ? '' : 's'} — hover the orange months below for the exact dates`}
      </div>
      <div data-testid="lineage-line" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
      </div>
    </div>
  )
}
