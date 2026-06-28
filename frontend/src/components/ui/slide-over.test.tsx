import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { SlideOver } from './slide-over'

describe('SlideOver', () => {
  it('renders nothing when closed', () => {
    render(
      <SlideOver open={false} onClose={() => {}} title="Panel">
        <p>body</p>
      </SlideOver>,
    )
    expect(screen.queryByTestId('slide-over-panel')).toBeNull()
    expect(screen.queryByText('body')).toBeNull()
  })

  it('renders the panel with title + children when open', () => {
    render(
      <SlideOver open onClose={() => {}} title="Panel title">
        <p>body content</p>
      </SlideOver>,
    )
    expect(screen.getByTestId('slide-over-panel')).toBeInTheDocument()
    expect(screen.getByText('Panel title')).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
    expect(screen.getByTestId('slide-over-panel')).toHaveAttribute('role', 'dialog')
  })

  it('calls onClose when the overlay is clicked', () => {
    const onClose = vi.fn()
    render(<SlideOver open onClose={onClose} title="x">body</SlideOver>)
    fireEvent.click(screen.getByTestId('slide-over-overlay'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<SlideOver open onClose={onClose} title="x">body</SlideOver>)
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<SlideOver open onClose={onClose} title="x">body</SlideOver>)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
