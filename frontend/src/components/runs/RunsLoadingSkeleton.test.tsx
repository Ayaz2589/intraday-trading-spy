import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('<RunsLoadingSkeleton />', () => {
  it('exposes an accessible loading status with the runs-landing-loading testid', async () => {
    const { RunsLoadingSkeleton } = await import('./RunsLoadingSkeleton')
    render(<RunsLoadingSkeleton />)
    const status = screen.getByRole('status', { name: /loading runs/i })
    expect(status).toBeInTheDocument()
    expect(status).toHaveAttribute('data-testid', 'runs-landing-loading')
  })

  it('renders shimmer skeleton placeholders', async () => {
    const { RunsLoadingSkeleton } = await import('./RunsLoadingSkeleton')
    const { container } = render(<RunsLoadingSkeleton />)
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
  })
})
