import { Link } from '@tanstack/react-router'
import { useSidebarMode } from '@/lib/sidebar-mode'
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
    </aside>
  )
}
