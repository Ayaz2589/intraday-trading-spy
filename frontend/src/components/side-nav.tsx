import { Link } from '@tanstack/react-router'
import { useSidebarMode } from '@/lib/sidebar-mode'

interface NavItem {
  to: '/runs' | '/strategies' | '/data'
  label: string
  icon: string
}

const ITEMS: NavItem[] = [
  { to: '/runs', label: 'Runs', icon: '◴' },
  { to: '/strategies', label: 'Strategies', icon: '◈' },
  { to: '/data', label: 'Data', icon: '≣' },
]

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
          padding: '12px',
          color: 'var(--text-muted)',
          textAlign: collapsed ? 'center' : 'right',
          fontSize: 'var(--fs-sm)',
        }}
      >
        {collapsed ? '›' : '‹'}
      </button>

      <nav aria-label="Primary" style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 6px' }}>
        {ITEMS.map(item => (
          <Link
            key={item.to}
            to={item.to}
            data-testid={`side-nav-link-${item.to.slice(1)}`}
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
            title={collapsed ? item.label : undefined}
          >
            <span aria-hidden style={{ fontSize: 16, lineHeight: 1, width: 18, textAlign: 'center' }}>
              {item.icon}
            </span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
