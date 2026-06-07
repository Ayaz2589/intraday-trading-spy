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
  TradeIcon,
  ValidationIcon,
} from '@/components/nav-icons'

// SideNav — pure navigation (redesigned post-014). The runs list moved out of
// the sidebar (year-spanning study children made it unscalable); the rail now
// links the app's four surfaces, collapsing to icons only. Delete-all-runs is
// intentionally removed for now (will be re-enabled later, likely with 015's
// soft-delete retention).

// Feature 021 IA: Trade is the primary surface (the live cockpit); the
// research surfaces (Validation / Insights / Backtests) nest under
// Strategy — they all study the same strategy artifact.
const NAV_ITEMS = [
  { to: '/trade', label: 'Trade', icon: <TradeIcon />, depth: 0 },
  { to: '/strategies', label: 'Strategy', icon: <StrategyIcon />, depth: 0 },
  { to: '/validation', label: 'Validation', icon: <ValidationIcon />, depth: 1 },
  { to: '/insights', label: 'Insights', icon: <InsightsIcon />, depth: 1 },
  { to: '/runs', label: 'Backtests', icon: <BacktestsIcon />, depth: 1 },
  { to: '/data', label: 'Data', icon: <DataIcon />, depth: 0 },
  { to: '/docs', label: 'Docs', icon: <DocsIcon />, depth: 0 },
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
    // The wipe can take a while (the whole bar cache goes) — swap the confirm
    // dialog for the blocking progress overlay below until it resolves.
    setConfirmOpen(false)
    setResetting(true)
    setResetError(null)
    try {
      await postFactoryReset()
      window.location.assign('/data')
    } catch (e) {
      setResetError((e as Error)?.message ?? 'reset failed')
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
        {NAV_ITEMS.map(({ to, label, icon, depth }) => (
          <Link
            key={to}
            to={to}
            aria-label={label}
            title={label}
            data-depth={depth}
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
              // nested research surfaces indent under Strategy (icon rail
              // stays flat — depth is meaningless at icon size)
              marginLeft: collapsed ? 0 : depth * 18,
              fontSize: depth > 0 ? 'var(--fs-xs, 12px)' : 'var(--fs-sm, 13px)',
              borderRadius: 'var(--r-sm, 6px)',
              color: 'var(--text-muted)',
              textDecoration: 'none',
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
        confirmLabel="Delete everything"
        cancelLabel="Cancel"
        onConfirm={runFactoryReset}
        onCancel={() => setConfirmOpen(false)}
      />

      {/* Blocking progress overlay: the wipe is global and irreversible, so no
          interaction with soon-to-be-stale pages while it runs. Stays up until
          the hard reload onto /data (success) or the error lands (failure). */}
      {resetting && (
        <div
          data-testid="factory-reset-overlay"
          role="alert"
          aria-busy="true"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'color-mix(in srgb, var(--surface, #fff) 72%, transparent)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              padding: '18px 22px',
              maxWidth: 420,
              boxShadow: 'var(--shadow-lg, 0 8px 30px rgba(0,0,0,0.18))',
            }}
          >
            <span className="spinner" aria-hidden />
            <div>
              <div style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>Deleting all data…</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)', marginTop: 2 }}>
                Wiping runs, studies, configs, ledgers and the SPY bar cache — this can
                take a little while. You&apos;ll land on the Data page when it&apos;s done.
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
