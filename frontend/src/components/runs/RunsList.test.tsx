import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

// Post-wipe no-data view: the Backtests page teaches where runs come from
// (validation studies) and links straight to the next step.

let queryState: Record<string, unknown>
vi.mock('@/hooks/useRuns', () => ({
  useRuns: () => queryState,
  flattenRuns: (data: unknown) =>
    (data as { pages?: { runs: unknown[] }[] } | undefined)?.pages?.flatMap(
      (p) => p.runs,
    ) ?? [],
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

import { RunsList } from './RunsList'

describe('RunsList — empty state', () => {
  it('renders the design-system empty card linking to Validation', () => {
    queryState = { data: { pages: [{ runs: [] }] }, isLoading: false, isError: false }
    render(<RunsList />)
    const empty = screen.getByTestId('runs-list-empty')
    expect(empty.querySelector('.empty-state-card')).toBeTruthy()
    expect(empty).toHaveTextContent(/no backtests yet/i)
    expect(empty).toHaveTextContent(/walk-forward/i)
    const link = empty.querySelector('a[href="/validation"]')
    expect(link).toBeTruthy()
    expect(link!).toHaveTextContent(/study/i)
    // the CLI escape hatch stays documented
    expect(empty).toHaveTextContent(/--push-to-supabase/)
  })
})
