import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { EmptyState } from './empty-state'

// The shared no-data view (design-system .empty-state pattern): every empty
// page teaches the next step in the pipeline instead of rendering a blank.

describe('EmptyState', () => {
  it('renders icon badge, title, text inside the design-system card', () => {
    render(
      <EmptyState
        testid="x-empty"
        icon="◎"
        title="Nothing here yet"
        text="Run a study and this fills itself."
      />,
    )
    const root = screen.getByTestId('x-empty')
    expect(root.className).toContain('empty-state')
    expect(root.querySelector('.empty-state-card')).toBeTruthy()
    expect(root.querySelector('.icon-badge')).toBeTruthy()
    expect(root.querySelector('.empty-state-title')!).toHaveTextContent('Nothing here yet')
    expect(root.querySelector('.empty-state-text')!).toHaveTextContent(/fills itself/)
  })

  it('renders the optional action and hint', () => {
    render(
      <EmptyState
        icon="◎"
        title="t"
        text="x"
        action={<button type="button" className="btn btn-primary">Go →</button>}
        hint="needs cached bars first"
      />,
    )
    expect(screen.getByRole('button', { name: /go/i })).toBeInTheDocument()
    expect(screen.getByText(/needs cached bars/i).className).toContain('empty-state-hint')
  })
})
