import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NewConfigSection } from './new-config-form'
import type { Config } from '@/api/types'

const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
const duplicateConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: (id: string, name: string) => duplicateConfigMock(id, name),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (id: string, name: string): Config => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params: {},
})

beforeEach(() => {
  for (const m of [listPresetsMock, createConfigMock, duplicateConfigMock]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [
      {
        name: 'aggressive',
        label: 'Aggressive — bigger swings',
        description: 'Bigger risk per trade, looser loss lockout, wider VWAP band.',
        params: {
          risk: { max_risk_per_trade_pct: 1.0, max_position_value_pct: 1200, max_consecutive_losses: 4 },
          strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
        },
      },
    ],
  })
})

async function mount(onCreated = vi.fn()) {
  wrap(
    <NewConfigSection configs={[cfg('1', 'default')]} activeConfigId="1" onCreated={onCreated} />,
  )
  // Options carry the human-readable label; the value stays the canonical name.
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'Aggressive — bigger swings' })).toBeInTheDocument(),
  )
  return onCreated
}

describe('NewConfigSection', () => {
  it('creates from a preset and reports the new id', async () => {
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    const onCreated = await mount()
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() =>
      expect(createConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-aggro', source: 'preset', preset_name: 'aggressive' }),
      ),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('3'))
  })

  it('duplicates an existing config', async () => {
    duplicateConfigMock.mockResolvedValue(cfg('3', 'copy'))
    const onCreated = await mount()
    fireEvent.change(screen.getByLabelText('source'), { target: { value: 'duplicate' } })
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'copy' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() => expect(duplicateConfigMock).toHaveBeenCalledWith('1', 'copy'))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('3'))
  })

  it('disables the create button while the name is empty', async () => {
    await mount()
    expect(screen.getByRole('button', { name: '+ Create config' })).toBeDisabled()
  })

  it('shows the selected preset as a labeled chip with its description', async () => {
    await mount()
    const desc = screen.getByTestId('preset-desc')
    expect(within(desc).getByText('Aggressive — bigger swings')).toBeInTheDocument()
    expect(
      within(desc).getByText('Bigger risk per trade, looser loss lockout, wider VWAP band.'),
    ).toBeInTheDocument()
  })

  it("shows the selected preset's changed knob values as accent chips", async () => {
    await mount()
    const desc = screen.getByTestId('preset-desc')
    // The aggressive preset's off-default knobs, same chip language as config rows.
    expect(within(desc).getByText('risk')).toBeInTheDocument()
    expect(within(desc).getByText('1%')).toBeInTheDocument()
    expect(within(desc).getByText('1200%')).toBeInTheDocument()
    expect(within(desc).getByText('R:R')).toBeInTheDocument()
    expect(within(desc).getByText('3')).toBeInTheDocument()
    expect(within(desc).getByText('lockout')).toBeInTheDocument()
    expect(within(desc).getByText('risk').closest('.chip')?.className).toContain('chip-accent')
    // Unchanged knobs (e.g. stop buffer) get no chip.
    expect(within(desc).queryByText('stop')).toBeNull()
  })

  it('renders the duplicate_vs_edit tooltip', async () => {
    await mount()
    expect(document.querySelector('[data-help-key="duplicate_vs_edit"]')).toBeTruthy()
  })

  // Strategy-page cleanup: balanced creator row (prototype: 1.4fr 1fr 1fr auto)
  // — the name field must not absorb the whole card while the selects shrink.
  it('lays out name and source as proportional cells with full-width selects', async () => {
    await mount()
    const name = screen.getByLabelText('new config name')
    const source = screen.getByLabelText('source')
    expect((name.parentElement as HTMLElement).style.flex).toBe('1.4 1 200px')
    expect((source.parentElement as HTMLElement).style.flex).toBe('1 1 170px')
    expect(source).toHaveStyle({ width: '100%' })
    expect(screen.getByLabelText('preset')).toHaveStyle({ width: '100%' })
  })
})
