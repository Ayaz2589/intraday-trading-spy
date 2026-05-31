import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/hooks/useHealth', () => ({
  useHealth: () => ({ state: 'healthy' }),
}))
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => ({
    user: { email: 'jane@example.com' },
    signOut: vi.fn(),
  }),
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useNavigate: () => vi.fn(),
  useMatchRoute: () => () => false,
}))

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{node}</QueryClientProvider>
}

describe('<AuthenticatedTopbar />', () => {
  it('renders connection status, theme toggle, and sign-out menu', async () => {
    const { AuthenticatedTopbar } = await import('./authenticated-topbar')
    render(wrap(<AuthenticatedTopbar />))
    expect(screen.getByTestId('authenticated-topbar')).toBeInTheDocument()
    expect(screen.getByTestId('connection-status')).toBeInTheDocument()
    expect(screen.getByTestId('signout-menu-trigger')).toBeInTheDocument()
  })

  it('renders the strategy/config breadcrumb when provided', async () => {
    const { AuthenticatedTopbar } = await import('./authenticated-topbar')
    render(wrap(<AuthenticatedTopbar strategyLabel="vwap_pullback_long" configLabel="default" />))
    const crumb = screen.getByTestId('strategy-config-breadcrumb')
    expect(crumb.textContent).toMatch(/vwap_pullback_long/)
    expect(crumb.textContent).toMatch(/default/)
  })
})
