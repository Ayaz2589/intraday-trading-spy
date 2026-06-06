import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useSidebarMode } from '@/lib/sidebar-mode'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { HelpTooltip } from '@/components/help-tooltip'
import { postFactoryReset } from '@/api/reset'
import {
  BacktestsIcon,
  DataIcon,
  DocsIcon,
  InsightsIcon,
  StrategyIcon,
  ValidationIcon,
} from '@/components/nav-icons'

// SideNav — pure navigation (redesigned post-014). The runs list moved out of
// the sidebar (year-spanning study children made it unscalable); the rail now
// links the app's four surfaces, collapsing to icons only. Delete-all-runs is
// intentionally removed for now (will be re-enabled later, likely with 015's
// soft-delete retention).

const NAV_ITEMS = [
  { to: '/validation', label: 'Validation', icon: <ValidationIcon /> },
  { to: '/insights', label: 'Insights', icon: <InsightsIcon /> },
  { to: '/data', label: 'Data', icon: <DataIcon /> },
  { to: '/strategies', label: 'Strategy', icon: <StrategyIcon /> },
  { to: '/runs', label: 'Backtests', icon: <BacktestsIcon /> },
  { to: '/docs', label: 'Docs', icon: <DocsIcon /> },
] as const

export function SideNav() {
  const { mode, toggle } = useSidebarMode()
  const collapsed = mode === 'collapsed'

  // Feature 018.1: the full factory reset — confirm-gated, journaled
  // server-side, then a hard reload onto the Data page so every cache
  // (react-query included) starts as fresh as the database.
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  async function runFactoryReset() {
    setResetting(true)
    setResetError(null)
    try {
      await postFactoryReset()
      window.location.assign('/data')
    } catch (e) {
      setResetError((e as Error)?.message ?? 'reset failed')
      setConfirmOpen(false)
      setResetting(false)
    }
  }

  return (
    <aside
      data-testid="side-nav"
      data-collapsed={collapsed}
      style={{
        width: collapsed ? 56 : 200,
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
          justifyContent: collapsed ? 'center' : 'flex-end',
          padding: '8px 10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
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

      <nav
        aria-label="Primary"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 6px',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            title={label}
            data-testid={`side-nav-link-${to.slice(1)}`}
            activeProps={{
              style: {
                background: 'var(--surface-2, #f6f7f9)',
                color: 'var(--text)',
                fontWeight: 700,
              },
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 10,
              padding: collapsed ? '10px 0' : '8px 10px',
              borderRadius: 'var(--r-sm, 6px)',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              fontSize: 'var(--fs-sm, 13px)',
              fontWeight: 600,
            }}
          >
            <span aria-hidden style={{ display: 'inline-flex', lineHeight: 1 }}>
              {icon}
            </span>
            {!collapsed && <span>{label}</span>}
          </Link>
        ))}
      </nav>

      {/* 018.1: Delete all data — pinned to the bottom of the rail. */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 6px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 4,
          }}
        >
          <button
            type="button"
            className="btn btn-danger-ghost btn-sm"
            data-testid="side-nav-delete-all"
            aria-label="Delete all data"
            title="Delete all data (factory reset)"
            disabled={resetting}
            onClick={() => setConfirmOpen(true)}
            style={{ flex: collapsed ? undefined : 1, justifyContent: 'flex-start' }}
          >
            <span aria-hidden>🗑</span>
            {!collapsed && <span>Delete all data</span>}
          </button>
          {!collapsed && <HelpTooltip helpKey="delete_all_data" />}
        </div>
        {resetError && (
          <div style={{ color: 'var(--loss)', fontSize: 'var(--fs-xs)', padding: '4px 6px' }}>
            {resetError}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        variant="destructive"
        title="Delete ALL data?"
        message={
          'Every run, trade, study, Claude analysis, the trial ledger, the ' +
          'lockbox ledger, all configs, job history, the journal, AND the ' +
          'entire SPY bar cache will be permanently deleted. This cannot be ' +
          "undone. A fresh 'default' config is re-seeded and you'll land on " +
          'the Data page to backfill from scratch.'
        }
        confirmLabel={resetting ? 'Deleting…' : 'Delete everything'}
        cancelLabel="Cancel"
        onConfirm={runFactoryReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </aside>
  )
}
