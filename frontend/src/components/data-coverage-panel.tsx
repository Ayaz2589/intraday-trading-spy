import { useState } from 'react'
import { useBarsCoverage } from '@/hooks/useBarsCoverage'
import { useBarsStats } from '@/hooks/useBarsStats'
import { useBackfillJobs } from '@/hooks/useBackfillJobs'
import { useStartBackfill } from '@/hooks/useStartBackfill'
import { useBackfillStatus } from '@/hooks/useBackfillStatus'
import { HelpTooltip } from '@/components/help-tooltip'
import { DataStatCards } from '@/components/data/DataStatCards'
import { StatusStrip } from '@/components/data/StatusStrip'
import { CacheBarChart } from '@/components/data/CacheBarChart'
import { RegimeCards } from '@/components/data/RegimeCards'
import { BackfillCard } from '@/components/data/BackfillCard'
import { JobHistoryTable } from '@/components/data/JobHistoryTable'
import { SectionTitle, cardSection } from '@/components/section-title'

// The Data page (Features 009 + 013, redesigned to the 2026-06-04 mockup).
// Thin composer: stat cards → status strip → monthly bar chart → regime cards
// → backfill launcher → job history. Sections fail independently (FR-011);
// every concept keeps its HelpTooltip (constitution VI).

export function DataCoveragePanel() {
  const coverage = useBarsCoverage()
  const stats = useBarsStats()
  const jobsQuery = useBackfillJobs()
  const startBackfill = useStartBackfill()
  const [jobId, setJobId] = useState<string | null>(null)
  const status = useBackfillStatus(jobId)

  const job = status.data
  const running = job?.status === 'queued' || job?.status === 'running'
  const busy = startBackfill.isPending || running

  function launch(start: string, end: string) {
    startBackfill.mutate(
      { start, end, source: 'alpaca' },
      { onSuccess: (r) => setJobId(r.job_id) },
    )
  }

  const regimes = coverage.data?.regimes ?? []
  const jobs = jobsQuery.data?.jobs ?? []
  const months = stats.data?.months ?? []
  const missingCount = months.reduce((n, m) => n + m.missing_dates.length, 0)

  return (
    <div data-testid="data-coverage-panel" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4, 16px)' }}>
      {/* Header */}
      <section>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--fs-lg, 18px)', fontWeight: 700, margin: 0 }}>
          Data coverage <HelpTooltip helpKey="data_coverage" />
        </h2>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
          Historical SPY 5-min bar cache — backfill, completeness, and job history
        </p>
        {/* Fallback span line: only when the stats snapshot is unavailable. */}
        {!stats.data && (
          <p data-testid="coverage-span" style={{ color: 'var(--text-muted)', marginTop: 6 }}>
            {coverage.isLoading || stats.isLoading
              ? 'Loading…'
              : coverage.data?.earliest && coverage.data?.latest
                ? `Cached SPY 5-min bars: ${coverage.data.earliest} → ${coverage.data.latest}`
                : 'No bars cached yet — run a backfill below.'}
          </p>
        )}
        {stats.isError && (
          <p data-testid="stats-error" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>
            Couldn't load cache stats — the rest of the page still works.
          </p>
        )}
      </section>

      {/* Stat cards + status strip */}
      {stats.data && months.length > 0 && (
        <>
          <DataStatCards stats={stats.data} />
          <StatusStrip stats={stats.data} />
        </>
      )}

      {/* Monthly completeness bar chart */}
      {months.length > 0 && (
        <section style={cardSection}>
          <SectionTitle title="Cache completeness" subtitle="Sessions cached per month across the full span">
            <HelpTooltip helpKey="cache_heatmap" />
          </SectionTitle>
          <CacheBarChart months={months} />
        </section>
      )}

      {/* Regime completeness */}
      {regimes.length > 0 && (
        <section style={cardSection}>
          <SectionTitle title="Regime completeness" subtitle="Coverage within each labeled market regime">
            <HelpTooltip helpKey="regime_completeness" />
          </SectionTitle>
          <RegimeCards regimes={regimes} />
        </section>
      )}

      {/* Backfill */}
      <section style={cardSection}>
        <SectionTitle title="Backfill history" subtitle="Fetch and cache any missing 5-min bars for a date range">
          <HelpTooltip helpKey="backfill" /> <HelpTooltip helpKey="data_source" />
        </SectionTitle>
        <BackfillCard
          onLaunch={launch}
          busy={busy}
          job={job}
          launchError={startBackfill.isError ? startBackfill.error.message : null}
          jobs={jobs}
          hasGaps={stats.data ? missingCount > 0 : null}
        />
      </section>

      {/* Job history */}
      <section style={cardSection}>
        <SectionTitle title="Job history" subtitle="Your 20 most recent backfill jobs">
          <HelpTooltip helpKey="backfill_job_history" />
        </SectionTitle>
        {jobsQuery.isError ? (
          <p data-testid="jobs-error" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-sm, 13px)' }}>
            Couldn't load the job history — the rest of the page still works.
          </p>
        ) : (
          <JobHistoryTable jobs={jobs} onRetry={launch} retryPending={busy} />
        )}
      </section>
    </div>
  )
}
