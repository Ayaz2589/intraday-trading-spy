// SideNav redesign: the runs list moves out — the sidebar is now pure
// navigation (Validation / Data / Strategy / Backtests) with icons,
// collapsible to an icon rail. Delete-all-runs is removed (re-enabled later).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, activeProps: _a, ...rest }: { children: React.ReactNode; to: string; activeProps?: unknown }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useMatchRoute: () => () => false,
}))

// Feature 018.1: the side-nav Delete-all-data button (full factory reset).
const factoryResetMock = vi.fn()
vi.mock('@/api/reset', () => ({
  postFactoryReset: (...a: unknown[]) => factoryResetMock(...a),
}))

import { SideNav } from './side-nav'

const LINKS: Array<[string, string]> = [
  ['Trade', '/trade'],
  ['Historic Trade', '/trade/historic'],
  ['Strategy', '/strategies'],
  ['Validation', '/validation'],
  ['Insights', '/insights'],
  ['Backtests', '/runs'],
  ['Data', '/data'],
  ['Docs', '/docs'],
]

// Exact-name matcher — "Trade" must not also match "Historic Trade".
const exact = (label: string) => new RegExp(`^${label}$`, 'i')

describe('<SideNav />', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('puts Trade first, nests Historic Trade under it, then Strategy group', () => {
    render(<SideNav />)
    const nav = screen.getByRole('navigation', { name: /primary/i })
    const hrefs = Array.from(nav.querySelectorAll('a')).map(a => a.getAttribute('href'))
    expect(hrefs[0]).toBe('/trade')
    expect(hrefs[1]).toBe('/trade/historic')
    // group order: Strategy parent immediately followed by its sub-items
    expect(hrefs.slice(2, 6)).toEqual(['/strategies', '/validation', '/insights', '/runs'])
    // sub-items are visually nested (depth attribute drives the indent)
    for (const sub of ['validation', 'insights', 'runs']) {
      expect(screen.getByTestId(`side-nav-link-${sub}`)).toHaveAttribute('data-depth', '1')
    }
    expect(screen.getByTestId('side-nav-link-trade/historic')).toHaveAttribute('data-depth', '1')
    expect(screen.getByTestId('side-nav-link-strategies')).toHaveAttribute('data-depth', '0')
  })

  it('renders the nav links with labels when expanded', () => {
    render(<SideNav />)
    for (const [label, href] of LINKS) {
      const link = screen.getByRole('link', { name: exact(label) })
      expect(link).toHaveAttribute('href', href)
      expect(link.textContent).toContain(label)
    }
  })

  it('each nav link renders its SVG icon (user-provided icon set)', () => {
    render(<SideNav />)
    for (const [label] of LINKS) {
      const link = screen.getByRole('link', { name: exact(label) })
      expect(link.querySelector('svg')).not.toBeNull()
    }
  })

  it('contains no runs list', () => {
    render(<SideNav />)
    expect(screen.queryByTestId('side-nav-runs-list')).not.toBeInTheDocument()
  })

  it('collapses to an icon rail — labels hidden, links still accessible', () => {
    localStorage.setItem('isb-sidebar', 'collapsed')
    render(<SideNav />)
    expect(screen.getByTestId('side-nav')).toHaveAttribute('data-collapsed', 'true')
    for (const [label, href] of LINKS) {
      const link = screen.getByRole('link', { name: exact(label) })
      expect(link).toHaveAttribute('href', href)
      expect(link.textContent).not.toContain(label) // icon only
    }
  })

  it('the toggle flips between expanded and collapsed', () => {
    render(<SideNav />)
    expect(screen.getByTestId('side-nav')).toHaveAttribute('data-collapsed', 'false')
    fireEvent.click(screen.getByTestId('side-nav-toggle'))
    expect(screen.getByTestId('side-nav')).toHaveAttribute('data-collapsed', 'true')
    fireEvent.click(screen.getByTestId('side-nav-toggle'))
    expect(screen.getByTestId('side-nav')).toHaveAttribute('data-collapsed', 'false')
  })
})

describe('<SideNav /> — Delete all data (018.1 factory reset)', () => {
  beforeEach(() => {
    localStorage.clear()
    factoryResetMock.mockReset()
  })

  it('renders the danger button at the bottom with its HelpTooltip', () => {
    const { container } = render(<SideNav />)
    const btn = screen.getByTestId('side-nav-delete-all')
    expect(btn).toHaveTextContent(/delete all data/i)
    expect(container.querySelector('[data-help-key="delete_all_data"]')).toBeTruthy()
  })

  it('asks for confirmation before doing anything; cancel deletes nothing', () => {
    render(<SideNav />)
    fireEvent.click(screen.getByTestId('side-nav-delete-all'))
    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /cancel|keep/i }))
    expect(factoryResetMock).not.toHaveBeenCalled()
  })

  it('confirm runs the reset and hard-reloads to /data for the backfill', async () => {
    factoryResetMock.mockResolvedValue({
      deleted: { runs: 12, bars: 168424 },
      default_config: 'default',
    })
    const assign = vi.fn()
    const original = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    })
    try {
      render(<SideNav />)
      fireEvent.click(screen.getByTestId('side-nav-delete-all'))
      fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
      await waitFor(() => expect(factoryResetMock).toHaveBeenCalledTimes(1))
      await waitFor(() => expect(assign).toHaveBeenCalledWith('/data'))
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original })
    }
  })

  it('surfaces a failure without reloading', async () => {
    factoryResetMock.mockRejectedValue(new Error('reset failed: db unreachable'))
    render(<SideNav />)
    fireEvent.click(screen.getByTestId('side-nav-delete-all'))
    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))
    expect(await screen.findByText(/reset failed/i)).toBeInTheDocument()
  })

  // Wiping 168k bar rows takes a while — the user must see that the delete is
  // running, not a frozen page. Confirm swaps the dialog for a blocking
  // full-screen overlay with a spinner until the reset resolves.
  it('shows a blocking deleting overlay with a spinner while the wipe runs', async () => {
    let rejectReset!: (e: Error) => void
    factoryResetMock.mockReturnValue(
      new Promise((_resolve, reject) => { rejectReset = reject }),
    )
    render(<SideNav />)
    fireEvent.click(screen.getByTestId('side-nav-delete-all'))
    fireEvent.click(screen.getByRole('button', { name: /delete everything/i }))

    const overlay = await screen.findByTestId('factory-reset-overlay')
    expect(overlay).toHaveTextContent(/deleting all data/i)
    expect(overlay.querySelector('.spinner')).not.toBeNull()
    // the confirm dialog has given way to the overlay
    expect(screen.queryByText(/cannot be undone/i)).not.toBeInTheDocument()

    // failure clears the overlay and surfaces the error in the rail
    rejectReset(new Error('reset failed: db unreachable'))
    expect(await screen.findByText(/reset failed/i)).toBeInTheDocument()
    expect(screen.queryByTestId('factory-reset-overlay')).not.toBeInTheDocument()
  })
})
