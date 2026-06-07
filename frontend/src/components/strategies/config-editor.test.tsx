import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigEditor } from './config-editor'
import type { Config } from '@/api/types'

const patchConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: vi.fn(),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: (id: string, patch: unknown) => patchConfigMock(id, patch),
  deleteConfig: vi.fn(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (params: Record<string, unknown> = {}): Config => ({
  id: '1',
  name: 'wf-rr3',
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
})

// cap 100 + R:R 3 — two knobs off their defaults (400 / 2).
const offDefaultParams = {
  risk: { max_position_value_pct: 100 },
  strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
}

beforeEach(() => patchConfigMock.mockReset())

describe('ConfigEditor', () => {
  it('renders SIZING and SIGNAL groups with default hints', () => {
    wrap(<ConfigEditor config={cfg()} />)
    expect(screen.getByText('Sizing')).toBeInTheDocument()
    expect(screen.getByText('Signal')).toBeInTheDocument()
    expect(screen.getByText('default 25,000')).toBeInTheDocument()
    expect(screen.getByText('default 0.05%')).toBeInTheDocument()
    expect(screen.getByText('default 15min')).toBeInTheDocument()
  })

  it('marks only off-default fields', () => {
    wrap(<ConfigEditor config={cfg(offDefaultParams)} />)
    expect(screen.getByTestId('off-default-max_position_value_pct')).toBeInTheDocument()
    expect(screen.getByTestId('off-default-risk_reward')).toBeInTheDocument()
    expect(screen.queryByTestId('off-default-account_value')).toBeNull()
  })

  it('starts clean: "No changes", Save and Revert disabled', () => {
    wrap(<ConfigEditor config={cfg()} />)
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save wf-rr3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled()
  })

  it('tracks dirty count and Revert restores saved values', () => {
    wrap(<ConfigEditor config={cfg()} />)
    fireEvent.change(screen.getByLabelText('Position cap'), { target: { value: '500' } })
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save wf-rr3' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(screen.getByLabelText('Position cap')).toHaveValue(400)
  })

  it('Reset to defaults sets all knobs to defaults (still needs Save)', () => {
    wrap(<ConfigEditor config={cfg(offDefaultParams)} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }))
    expect(screen.getByLabelText('Position cap')).toHaveValue(400)
    expect(screen.getByLabelText('Risk : reward')).toHaveValue(2)
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()
    expect(patchConfigMock).not.toHaveBeenCalled()
  })

  it('saves edited knobs via PATCH params', async () => {
    patchConfigMock.mockResolvedValue(cfg())
    wrap(<ConfigEditor config={cfg()} />)
    fireEvent.change(screen.getByLabelText('Position cap'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'save wf-rr3' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledTimes(1))
    const [id, patch] = patchConfigMock.mock.calls[0] as [
      string,
      { params: { risk: { max_position_value_pct: number }; strategy: { enabled_setup: string } } },
    ]
    expect(id).toBe('1')
    expect(patch.params.risk.max_position_value_pct).toBe(500)
    expect(patch.params.strategy.enabled_setup).toBe('vwap_pullback_long')
  })

  it('renders position-cap educational tooltips', () => {
    wrap(<ConfigEditor config={cfg()} />)
    for (const key of ['position_cap', 'buying_power']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })
})

// ---- Feature 020: entry-window fields ------------------------------------------

describe('ConfigEditor entry window (020)', () => {
  it('renders both window fields in the Signal group with default hints and tooltip', () => {
    wrap(<ConfigEditor config={cfg()} />)
    expect(screen.getByLabelText('Entry from (min after open)')).toHaveValue(0)
    expect(screen.getByLabelText('Entry until (min after open)')).toHaveValue(390)
    expect(screen.getByText('default 0min')).toBeInTheDocument()
    expect(screen.getByText('default 390min')).toBeInTheDocument()
    expect(document.querySelector('[data-help-key="entry_window"]')).toBeTruthy()
  })

  it('flags off-default window values and saves them into nested params', async () => {
    patchConfigMock.mockResolvedValue(cfg())
    wrap(<ConfigEditor config={cfg()} />)
    fireEvent.change(screen.getByLabelText('Entry from (min after open)'), { target: { value: '30' } })
    fireEvent.change(screen.getByLabelText('Entry until (min after open)'), { target: { value: '270' } })
    expect(screen.getByTestId('off-default-entry_start_minutes')).toBeInTheDocument()
    expect(screen.getByTestId('off-default-entry_end_minutes')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'save wf-rr3' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalled())
    const params = patchConfigMock.mock.calls[0][1].params as {
      strategy: { vwap_pullback: { entry_window: Record<string, number> } }
    }
    expect(params.strategy.vwap_pullback.entry_window).toEqual({
      start_minutes_after_open: 30,
      end_minutes_after_open: 270,
    })
  })
})
