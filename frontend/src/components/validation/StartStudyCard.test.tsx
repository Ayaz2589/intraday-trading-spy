import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

// Ports the start-study-dialog contracts (config picker semantics, launch
// payloads) + the redesign's kind chips and animated status panel.

const startStudyMock = vi.fn()
const listConfigsMock = vi.fn()
const getStudyStatusMock = vi.fn()

vi.mock('@/api/validation', () => ({
  startStudy: (b: unknown) => startStudyMock(b),
  getStudyStatus: (id: string) => getStudyStatusMock(id),
}))
vi.mock('@/api/configs', () => ({ listConfigs: () => listConfigsMock() }))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(createElement(QueryClientProvider, { client }, ui))
}

beforeEach(() => {
  startStudyMock.mockReset()
  listConfigsMock.mockReset()
  getStudyStatusMock.mockReset()
})

const cfg = (name: string, is_active = false) => ({
  id: name, name, mode: 'backtest', timeframe: '5m', strategy_id: 's', params: {}, is_active,
})

describe('StartStudyCard', () => {
  it('lists saved configs and launches the chosen one', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('default'), cfg('aggressive')] })
    startStudyMock.mockResolvedValue({ study_id: 'x', status: 'queued', planned_evaluations: 24 })
    getStudyStatusMock.mockResolvedValue({ id: 'x', status: 'running', progress_completed: 4, progress_total: 24, failure_reason: null })
    const { StartStudyCard } = await import('./StartStudyCard')
    wrap(createElement(StartStudyCard))

    await waitFor(() => expect(screen.getByRole('option', { name: 'aggressive' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('config'), { target: { value: 'aggressive' } })
    fireEvent.click(screen.getByRole('button', { name: /launch study/i }))
    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(expect.objectContaining({ config_name: 'aggressive', kind: 'walk_forward' })),
    )
  })

  it('pre-selects the active config (SC-007)', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('default'), cfg('aggressive', true)] })
    startStudyMock.mockResolvedValue({ study_id: 'x', status: 'queued', planned_evaluations: 24 })
    getStudyStatusMock.mockResolvedValue({ id: 'x', status: 'running', progress_completed: 0, progress_total: 24, failure_reason: null })
    const { StartStudyCard } = await import('./StartStudyCard')
    wrap(createElement(StartStudyCard))
    await waitFor(() => expect(screen.getByRole('option', { name: 'aggressive' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /launch study/i }))
    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(expect.objectContaining({ config_name: 'aggressive' })),
    )
  })

  it('sensitivity chip switches the payload to a grid sweep', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('default', true)] })
    startStudyMock.mockResolvedValue({ study_id: 'x', status: 'queued', planned_evaluations: 8 })
    getStudyStatusMock.mockResolvedValue({ id: 'x', status: 'running', progress_completed: 0, progress_total: 8, failure_reason: null })
    const { StartStudyCard } = await import('./StartStudyCard')
    wrap(createElement(StartStudyCard))
    fireEvent.click(screen.getByTestId('kind-sensitivity'))
    fireEvent.click(screen.getByRole('button', { name: /launch study/i }))
    await waitFor(() =>
      expect(startStudyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'sensitivity',
          segment: 'train',
          grid: [{ knob: 'strategy.vwap_pullback.target.risk_reward', values: [1.5, 2.0, 2.5, 3.0] }],
        }),
      ),
    )
  })

  it('shows the animated status panel for the launched study', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('default', true)] })
    startStudyMock.mockResolvedValue({ study_id: 'study-9', status: 'queued', planned_evaluations: 24 })
    getStudyStatusMock.mockResolvedValue({ id: 'study-9', status: 'running', progress_completed: 16, progress_total: 24, failure_reason: null })
    const { StartStudyCard } = await import('./StartStudyCard')
    wrap(createElement(StartStudyCard))
    fireEvent.click(screen.getByRole('button', { name: /launch study/i }))
    await waitFor(() => expect(screen.getByTestId('study-status-panel')).toBeInTheDocument())
    const panel = screen.getByTestId('study-status-panel')
    expect(panel.textContent).toContain('default')
    expect(panel.textContent).toContain('16/24')
    expect(panel.textContent).toContain('67%')
    expect(screen.getByTestId('study-spinner')).toBeInTheDocument()
  })

  it('finished panel offers View results and dismisses via ×', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('default', true)] })
    startStudyMock.mockResolvedValue({ study_id: 'study-9', status: 'queued', planned_evaluations: 24 })
    getStudyStatusMock.mockResolvedValue({ id: 'study-9', status: 'finished', progress_completed: 24, progress_total: 24, failure_reason: null })
    const { StartStudyCard } = await import('./StartStudyCard')
    wrap(createElement(StartStudyCard))
    fireEvent.click(screen.getByRole('button', { name: /launch study/i }))
    await waitFor(() => expect(screen.getByTestId('study-status-panel')).toBeInTheDocument())
    expect(screen.queryByTestId('study-spinner')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /view results/i })).toHaveAttribute('href', '/validation/study-9')
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByTestId('study-status-panel')).not.toBeInTheDocument()
  })
})
