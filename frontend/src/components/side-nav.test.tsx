// SideNav redesign: the runs list moves out — the sidebar is now pure
// navigation (Validation / Data / Strategy / Backtests) with icons,
// collapsible to an icon rail. Delete-all-runs is removed (re-enabled later).
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, activeProps: _a, ...rest }: { children: React.ReactNode; to: string; activeProps?: unknown }) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useMatchRoute: () => () => false,
}))

import { SideNav } from './side-nav'

const LINKS: Array<[string, string]> = [
  ['Validation', '/validation'],
  ['Insights', '/insights'],
  ['Data', '/data'],
  ['Strategy', '/strategies'],
  ['Backtests', '/runs'],
]

describe('<SideNav />', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders the five nav links with labels when expanded', () => {
    render(<SideNav />)
    for (const [label, href] of LINKS) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(link).toHaveAttribute('href', href)
      expect(link.textContent).toContain(label)
    }
  })

  it('each nav link renders its SVG icon (user-provided icon set)', () => {
    render(<SideNav />)
    for (const [label] of LINKS) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
      expect(link.querySelector('svg')).not.toBeNull()
    }
  })

  it('contains no runs list and no delete-all button', () => {
    render(<SideNav />)
    expect(screen.queryByTestId('side-nav-runs-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('side-nav-delete-all')).not.toBeInTheDocument()
  })

  it('collapses to an icon rail — labels hidden, links still accessible', () => {
    localStorage.setItem('isb-sidebar', 'collapsed')
    render(<SideNav />)
    expect(screen.getByTestId('side-nav')).toHaveAttribute('data-collapsed', 'true')
    for (const [label, href] of LINKS) {
      const link = screen.getByRole('link', { name: new RegExp(label, 'i') })
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
