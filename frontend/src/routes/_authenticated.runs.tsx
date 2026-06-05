import { createFileRoute } from '@tanstack/react-router'
import { RunsList } from '@/components/runs/RunsList'

// SideNav redesign: the sidebar no longer lists runs, so /runs is now the
// backtests LIST page (the 007-era RunsList finally wired in) instead of a
// redirect-to-first-run.
export const Route = createFileRoute('/_authenticated/runs')({
  component: RunsLanding,
})

function RunsLanding() {
  return (
    <div style={{ padding: 'var(--sp-5, 20px)' }}>
      <section style={{ marginBottom: 12 }}>
        <h2 style={{ fontSize: 'var(--fs-lg, 18px)', fontWeight: 700, margin: 0 }}>Backtests</h2>
        <p style={{ margin: '2px 0 0', fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
          Every saved run — open one to inspect its trades, journal, and chart
        </p>
      </section>
      <RunsList />
    </div>
  )
}
