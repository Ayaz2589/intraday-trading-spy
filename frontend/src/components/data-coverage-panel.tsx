import { useState } from 'react'
import { useBarsCoverage } from '@/hooks/useBarsCoverage'
import { useBarsStats } from '@/hooks/useBarsStats'
import { useBackfillJobs } from '@/hooks/useBackfillJobs'
import { useStartBackfill } from '@/hooks/useStartBackfill'
import { useBackfillStatus } from '@/hooks/useBackfillStatus'
import { HelpTooltip } from '@/components/help-tooltip'
import { CacheSummary } from '@/components/data/CacheSummary'
import { CacheHeatmap } from '@/components/data/CacheHeatmap'
import { JobHistoryTable } from '@/components/data/JobHistoryTable'

// Feature 009 (Phase 0 data foundation) — operator surface for data coverage
// and the bulk historical backfill. Feature 013 fleshes it out: cache summary
// strip, month-grid completeness heatmap, and the backfill job history.
// Sections fail independently (FR-011). Every concept ships a HelpTooltip
// (constitution VI).

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function DataCoveragePanel() {
  const coverage = useBarsCoverage()
  const stats = useBarsStats()
  const jobsQuery = useBackfillJobs()
  const startBackfill = useStartBackfill()
  const [jobId, setJobId] = useState<string | null>(null)
  const status = useBackfillStatus(jobId)
  const [start, setStart] = useState('2018-01-01')
  const [end, setEnd] = useState(todayISO())

  const job = status.data
  const running = job?.status === 'queued' || job?.status === 'running'
  const busy = startBackfill.isPending || running

  function onBackfill() {
    startBackfill.mutate(
      { start, end, source: 'alpaca' },
      { onSuccess: (r) => setJobId(r.job_id) },
    )
  }

  const earliest = coverage.data?.earliest
  const latest = coverage.data?.latest
  const regimes = coverage.data?.regimes ?? []

  return (
    <div data-testid="data-coverage-panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5, 20px)', maxWidth: 760 }}>
      {/* Coverage span */}
      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-lg, 18px)', fontWeight: 700, margin: 0 }}>
          Data coverage <HelpTooltip helpKey="data_coverage" />
        </h2>
        <p data-testid="coverage-span" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
          {coverage.isLoading
            ? 'Loading…'
            : earliest && latest
              ? `Cached SPY 5-min bars: ${earliest} → ${latest}`
              : 'No bars cached yet — run a backfill below.'}
        </p>
        {/* Feature 013: summary strip (totals + missing verdict + lineage).
            Best-effort — a stats failure only hides this strip (FR-011). */}
        {stats.data && stats.data.months.length > 0 && <CacheSummary stats={stats.data} />}
        {stats.isError && (
          <p data-testid="stats-error" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>
            Couldn't load cache stats — the rest of the page still works.
          </p>
        )}
      </section>

      {/* Feature 013: month-grid completeness heatmap */}
      {stats.data && stats.data.months.length > 0 && (
        <section>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-base, 15px)', fontWeight: 700, margin: 0 }}>
            Cache completeness <HelpTooltip helpKey="cache_heatmap" />
          </h3>
          <CacheHeatmap months={stats.data.months} />
        </section>
      )}

      {/* Per-regime completeness */}
      <section>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-base, 15px)', fontWeight: 700, margin: 0 }}>
          Regime completeness <HelpTooltip helpKey="regime_completeness" />
        </h3>
        <table data-testid="regime-table" style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 13px)' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}>
              <th style={{ padding: '4px 8px' }}>Regime</th>
              <th style={{ padding: '4px 8px' }}>Sessions</th>
              <th style={{ padding: '4px 8px' }}>Complete</th>
              <th style={{ padding: '4px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {regimes.map((r) => (
              <tr key={r.name} data-testid={`regime-row-${r.name}`} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}>{r.name}</td>
                <td style={{ padding: '4px 8px' }}>{r.present_sessions}/{r.expected_sessions}</td>
                <td style={{ padding: '4px 8px' }}>{r.completeness_pct}%</td>
                <td style={{ padding: '4px 8px' }}>
                  <span
                    data-testid={`regime-status-${r.name}`}
                    style={{
                      padding: '1px 8px',
                      borderRadius: 999,
                      fontWeight: 600,
                      color: r.covered ? 'var(--pos, #1a7f37)' : 'var(--neg, #b42318)',
                      background: r.covered ? 'var(--pos-bg, #e6f4ea)' : 'var(--neg-bg, #fdecea)',
                    }}
                  >
                    {r.covered ? 'covered' : 'gap'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Backfill trigger */}
      <section style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-4, 16px)' }}>
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-base, 15px)', fontWeight: 700, margin: 0 }}>
          Backfill history <HelpTooltip helpKey="backfill" /> <HelpTooltip helpKey="data_source" />
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 'var(--fs-sm, 13px)' }}>
            From{' '}
            <input data-testid="backfill-start" type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label style={{ fontSize: 'var(--fs-sm, 13px)' }}>
            To{' '}
            <input data-testid="backfill-end" type="date" value={end} max={todayISO()} onChange={(e) => setEnd(e.target.value)} />
          </label>
          <button
            data-testid="backfill-start-btn"
            type="button"
            disabled={busy}
            onClick={onBackfill}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--r-md, 8px)',
              border: '1px solid var(--border-strong, #ccc)',
              background: busy ? 'var(--surface-2, #eee)' : 'var(--accent, #2563eb)',
              color: busy ? 'var(--text-muted)' : '#fff',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            {busy ? 'Backfilling…' : 'Backfill history'}
          </button>
        </div>

        {job && (
          <div data-testid="backfill-progress" style={{ marginTop: 10, fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
            Status: <strong>{job.status}</strong> · windows {job.windows_done}/{job.windows_total} · {job.bars_added.toLocaleString()} bars added
            {job.status === 'failed' && job.failure_reason && (
              <div style={{ color: 'var(--neg, #b42318)' }}>Failed: {job.failure_reason}</div>
            )}
          </div>
        )}
        {startBackfill.isError && (
          <div data-testid="backfill-error" style={{ marginTop: 8, color: 'var(--neg, #b42318)', fontSize: 'var(--fs-sm, 13px)' }}>
            Could not start backfill: {startBackfill.error.message}
          </div>
        )}

        {/* Feature 013 US1: job history — failures stay visible (FR-002). */}
        <h4 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-sm, 13px)', fontWeight: 700, margin: '14px 0 0' }}>
          Job history <HelpTooltip helpKey="backfill_job_history" />
        </h4>
        {jobsQuery.isError ? (
          <p data-testid="jobs-error" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>
            Couldn't load the job history — the rest of the page still works.
          </p>
        ) : (
          <JobHistoryTable jobs={jobsQuery.data?.jobs ?? []} />
        )}
      </section>
    </div>
  )
}
