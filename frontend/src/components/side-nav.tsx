import { useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { useSidebarMode } from '@/lib/sidebar-mode'
import { useRuns, flattenRuns } from '@/hooks/useRuns'
import { useDeleteAllRuns } from '@/hooks/useDeleteRun'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { RunMiniCard } from '@/components/runs/RunMiniCard'

export function SideNav() {
  const { mode, toggle } = useSidebarMode()
  const collapsed = mode === 'collapsed'
  const runsQuery = useRuns()
  const runs = flattenRuns(runsQuery.data)
  const matchRoute = useMatchRoute()
  const currentRun = matchRoute({ to: '/runs/$runId', fuzzy: false }) as
    | { runId: string }
    | false
  const currentRunId = currentRun && typeof currentRun === 'object' ? currentRun.runId : null

  const [confirmDeleteAllOpen, setConfirmDeleteAllOpen] = useState(false)
  const deleteAll = useDeleteAllRuns()

  return (
    <aside
      data-testid="side-nav"
      data-collapsed={collapsed}
      style={{
        width: collapsed ? 56 : 240,
        borderRight: '1px solid var(--border)',
        background: 'var(--surface-1)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 120ms ease',
        flexShrink: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {!collapsed && (
          <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
            Runs {runs.length > 0 && <span style={{ opacity: 0.6 }}>· {runs.length}</span>}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand' : 'Collapse'}
          data-testid="side-nav-toggle"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: 'var(--fs-sm)',
            padding: 4,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {!collapsed && (
        <div
          data-testid="side-nav-runs-list"
          style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 4px' }}
        >
          {runsQuery.isLoading ? (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 8 }}>Loading…</p>
          ) : runs.length === 0 ? (
            <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', padding: 8 }}>
              No backtests yet. Open the Strategy dropdown to run one.
            </p>
          ) : (
            runs.map(run => (
              <RunMiniCard key={run.id} run={run} active={run.id === currentRunId} />
            ))
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 'auto',
          borderTop: '1px solid var(--border)',
          padding: '8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        <Link
          to="/data"
          data-testid="side-nav-link-data"
          activeProps={{ style: { background: 'var(--surface-2)', fontWeight: 600 } }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px 10px',
            borderRadius: 'var(--r-sm)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--text)',
            textDecoration: 'none',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
          title={collapsed ? 'Data' : undefined}
        >
          <span aria-hidden style={{ fontSize: 16, lineHeight: 1, width: 18, textAlign: 'center' }}>≣</span>
          {!collapsed && <span>Data</span>}
        </Link>
        {!collapsed && runs.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmDeleteAllOpen(true)}
            data-testid="side-nav-delete-all"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--danger, #dc2626)',
              fontSize: 'var(--fs-xs)',
              padding: '6px 10px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            Delete all runs
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDeleteAllOpen}
        title={`Delete all ${runs.length} backtests?`}
        message="This permanently deletes every run and all its trades, signals, and journal events. This cannot be undone."
        confirmLabel={deleteAll.isPending ? 'Deleting…' : 'Delete all'}
        variant="destructive"
        onConfirm={() =>
          deleteAll.mutate(undefined, {
            onSuccess: () => setConfirmDeleteAllOpen(false),
          })
        }
        onCancel={() => setConfirmDeleteAllOpen(false)}
      />
    </aside>
  )
}
