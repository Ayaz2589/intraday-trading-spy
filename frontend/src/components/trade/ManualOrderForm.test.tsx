// Feature 021 T042 — manual paper orders, risk-gated (US4).
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ManualOrderForm } from './ManualOrderForm'

describe('ManualOrderForm', () => {
  it('requires both stop and target before submitting', () => {
    const onSubmit = vi.fn()
    render(<ManualOrderForm onSubmit={onSubmit} onClose={vi.fn()}
           hasPosition={false} error={null} />)
    const btn = screen.getByRole('button', { name: /buy spy/i })
    fireEvent.click(btn)
    expect(onSubmit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText(/stop/i), { target: { value: '524.2' } })
    fireEvent.change(screen.getByLabelText(/target/i), { target: { value: '526.9' } })
    fireEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledWith({ stop_loss: 524.2, take_profit: 526.9 })
  })

  it('surfaces the risk rejection reason', () => {
    render(<ManualOrderForm onSubmit={vi.fn()} onClose={vi.fn()}
           hasPosition={false} error="position_already_open" />)
    expect(screen.getByText(/position_already_open/)).toBeInTheDocument()
  })

  it('offers Close position when one is open', () => {
    const onClose = vi.fn()
    render(<ManualOrderForm onSubmit={vi.fn()} onClose={onClose}
           hasPosition={true} error={null} />)
    fireEvent.click(screen.getByRole('button', { name: /close position/i }))
    expect(onClose).toHaveBeenCalled()
  })

  it('pairs the manual-order concept with a HelpTooltip', () => {
    const { container } = render(<ManualOrderForm onSubmit={vi.fn()}
      onClose={vi.fn()} hasPosition={false} error={null} />)
    expect(container.querySelector('[data-help-key="manual_order"]')).toBeTruthy()
  })
})
