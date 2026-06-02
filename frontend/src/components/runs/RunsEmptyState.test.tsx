import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('<RunsEmptyState />', () => {
  it('renders the "No backtests yet" heading', async () => {
    const { RunsEmptyState } = await import('./RunsEmptyState')
    render(<RunsEmptyState onCreateRun={() => {}} />)
    expect(
      screen.getByRole('heading', { name: /no backtests yet/i }),
    ).toBeInTheDocument()
  })

  it('calls onCreateRun when the primary CTA is clicked', async () => {
    const onCreateRun = vi.fn()
    const { RunsEmptyState } = await import('./RunsEmptyState')
    render(<RunsEmptyState onCreateRun={onCreateRun} />)
    fireEvent.click(
      screen.getByRole('button', { name: /run your first backtest/i }),
    )
    expect(onCreateRun).toHaveBeenCalledTimes(1)
  })
})
