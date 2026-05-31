import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useHealthMock = vi.fn()
vi.mock('@/hooks/useHealth', () => ({
  useHealth: () => useHealthMock(),
}))

describe('<ConnectionStatus />', () => {
  beforeEach(() => useHealthMock.mockReset())

  it('renders green dot when healthy', async () => {
    useHealthMock.mockReturnValue({ state: 'healthy' })
    const { ConnectionStatus } = await import('./connection-status')
    render(<ConnectionStatus />)
    const node = screen.getByTestId('connection-status')
    expect(node).toHaveAttribute('data-state', 'healthy')
    expect(screen.getByLabelText(/API connected/i)).toBeInTheDocument()
  })

  it('renders red dot when unhealthy', async () => {
    useHealthMock.mockReturnValue({ state: 'unhealthy' })
    const { ConnectionStatus } = await import('./connection-status')
    render(<ConnectionStatus />)
    const node = screen.getByTestId('connection-status')
    expect(node).toHaveAttribute('data-state', 'unhealthy')
    expect(screen.getByLabelText(/API unreachable/i)).toBeInTheDocument()
  })

  it('renders neutral state when unknown', async () => {
    useHealthMock.mockReturnValue({ state: 'unknown' })
    const { ConnectionStatus } = await import('./connection-status')
    render(<ConnectionStatus />)
    const node = screen.getByTestId('connection-status')
    expect(node).toHaveAttribute('data-state', 'unknown')
  })
})
