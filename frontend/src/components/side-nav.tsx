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
  const allRuns = flattenRuns(runsQuery.data)
  // Favorites sort to the top; the list returned by useRuns is already
  // newest-first, so within each group recency is preserved.
  const runs = [
    ...allRuns.filter(r => r.is_favorite),
    ...allRuns.filter(r => !r.is_favorite),
  ]
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

      {collapsed ? (
        // Collapsed rail: icon-only nav so the user can still jump to
        // the runs list (auto-routes to most recent) and trash everything.
        <div
          data-testid="side-nav-icon-rail"
          style={{ flex: 1, padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4 }}
        >
          <IconLink
            to="/runs"
            label="Runs"
            icon="◴"
            badge={runs.length > 0 ? runs.length : undefined}
          />
        </div>
      ) : (
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
        {runs.length > 0 &&
          (collapsed ? (
            <button
              type="button"
              onClick={() => setConfirmDeleteAllOpen(true)}
              data-testid="side-nav-delete-all"
              aria-label="Delete all runs"
              title="Delete all runs"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                color: 'var(--danger, #dc2626)',
                padding: '8px 10px',
                borderRadius: 'var(--r-sm)',
                cursor: 'pointer',
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              🗑
            </button>
          ) : (
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
          ))}
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

function IconLink({
  to,
  label,
  icon,
  badge,
}: {
  to: '/runs'
  label: string
  icon: string
  badge?: number
}) {
  return (
    <Link
      to={to}
      data-testid={`side-nav-icon-${to.slice(1)}`}
      activeProps={{ style: { background: 'var(--surface-2)', color: 'var(--text)' } }}
      title={label}
      aria-label={label}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 0',
        borderRadius: 'var(--r-sm)',
        color: 'var(--text-muted)',
        textDecoration: 'none',
      }}
    >
      <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
        {icon}
      </span>
      {badge != null && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            background: 'var(--accent, #2563eb)',
            color: 'white',
            fontSize: 9,
            fontWeight: 700,
            padding: '1px 5px',
            borderRadius: 999,
            lineHeight: 1.2,
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
