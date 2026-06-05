// Re-run UX fix (post-014): the header action swaps between the Re-run
// button (idle) and an inline progress bar (while the cloned study runs) —
// the current study's results stay on screen the whole time.
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RerunAction } from './RerunAction'

describe('RerunAction', () => {
  it('renders the button when idle and fires onRerun', () => {
    const onRerun = vi.fn()
    render(<RerunAction pending={false} progress={null} onRerun={onRerun} />)
    const btn = screen.getByRole('button', { name: /^↻ re-run study$/i })
    fireEvent.click(btn)
    expect(onRerun).toHaveBeenCalledOnce()
    expect(screen.getByLabelText(/help: re-run study/i)).toBeInTheDocument()
    expect(screen.queryByTestId('rerun-progress')).not.toBeInTheDocument()
  })

  it('disables the button while the mutation is pending', () => {
    render(<RerunAction pending={true} progress={null} onRerun={vi.fn()} />)
    expect(screen.getByRole('button', { name: /starting/i })).toBeDisabled()
  })

  it('shows the inline progress bar instead of the button while the clone runs', () => {
    render(
      <RerunAction pending={false} progress={{ completed: 5, total: 24 }} onRerun={vi.fn()} />,
    )
    const progress = screen.getByTestId('rerun-progress')
    expect(progress.textContent).toContain('5/24')
    expect(progress.textContent).toMatch(/re-running/i)
    expect(screen.queryByRole('button', { name: /re-run study/i })).not.toBeInTheDocument()
    // the fill is proportional
    const bar = screen.getByTestId('rerun-progress-bar')
    expect(bar.style.width).toBe('21%') // round(5/24*100)
  })
})
