import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const listConfigsMock = vi.fn()
const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
const duplicateConfigMock = vi.fn()
const activateConfigMock = vi.fn()
const patchConfigMock = vi.fn()
const deleteConfigMock = vi.fn()

vi.mock('@/api/configs', () => ({
  listConfigs: () => listConfigsMock(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: (id: string, name: string) => duplicateConfigMock(id, name),
  activateConfig: (id: string) => activateConfigMock(id),
  patchConfig: (id: string, patch: unknown) => patchConfigMock(id, patch),
  deleteConfig: (id: string) => deleteConfigMock(id),
}))
// StrategyList (sibling on the page) isn't under test here, but the manager
// imports nothing from it — useStrategies is unused by ConfigManager.

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(createElement(QueryClientProvider, { client }, ui))
}

const cfg = (id: string, name: string, is_active = false) => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params: { risk: { max_position_value_pct: 400 } },
  is_active,
})

beforeEach(() => {
  for (const m of [
    listConfigsMock, listPresetsMock, createConfigMock,
    duplicateConfigMock, activateConfigMock, patchConfigMock, deleteConfigMock,
  ]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [{ name: 'aggressive', description: 'more signals', params: {} }],
  })
})

async function mountWithConfigs(configs: ReturnType<typeof cfg>[]) {
  listConfigsMock.mockResolvedValue({ configs })
  const { ConfigManager } = await import('./config-manager')
  wrap(createElement(ConfigManager))
  // Wait for the query to resolve and the rows to render (the container itself
  // renders immediately, so wait on a real config name).
  await waitFor(() =>
    expect(screen.getByRole('button', { name: configs[0].name })).toBeInTheDocument(),
  )
}

describe('ConfigManager', () => {
  it('lists configs and marks the active one', async () => {
    await mountWithConfigs([cfg('1', 'default', true), cfg('2', 'aggressive')])
    expect(screen.getByTestId('active-badge-default')).toHaveTextContent('active')
    // The non-active config offers "Set active".
    expect(screen.getAllByRole('button', { name: 'Set active' })).toHaveLength(1)
  })

  it('creates a config from a preset', async () => {
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    await mountWithConfigs([cfg('1', 'default', true)])
    await waitFor(() => expect(screen.getByRole('option', { name: 'aggressive' })).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() =>
      expect(createConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-aggro', source: 'preset', preset_name: 'aggressive' }),
      ),
    )
  })

  it('duplicates an existing config', async () => {
    duplicateConfigMock.mockResolvedValue(cfg('3', 'copy'))
    await mountWithConfigs([cfg('1', 'default', true)])
    fireEvent.change(screen.getByLabelText('source'), { target: { value: 'duplicate' } })
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'copy' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await waitFor(() => expect(duplicateConfigMock).toHaveBeenCalledWith('1', 'copy'))
  })

  it('activates a config', async () => {
    activateConfigMock.mockResolvedValue(cfg('2', 'aggressive', true))
    await mountWithConfigs([cfg('1', 'default', true), cfg('2', 'aggressive')])
    fireEvent.click(screen.getByRole('button', { name: 'Set active' }))
    await waitFor(() => expect(activateConfigMock).toHaveBeenCalledWith('2'))
  })

  it('renames a config', async () => {
    patchConfigMock.mockResolvedValue(cfg('2', 'renamed'))
    await mountWithConfigs([cfg('1', 'default', true), cfg('2', 'aggressive')])
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    fireEvent.change(screen.getByLabelText('rename aggressive'), { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledWith('2', { name: 'renamed' }))
  })

  it('deletes a config behind a confirm step, and blocks deleting the last one', async () => {
    deleteConfigMock.mockResolvedValue({ deleted: '2' })
    await mountWithConfigs([cfg('1', 'default', true), cfg('2', 'aggressive')])
    // Two configs -> delete enabled. Confirm flow.
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete aggressive' }))
    await waitFor(() => expect(deleteConfigMock).toHaveBeenCalledWith('2'))
  })

  it('disables delete when only one config remains', async () => {
    await mountWithConfigs([cfg('1', 'default', true)])
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('renders educational tooltips for config-management concepts', async () => {
    await mountWithConfigs([cfg('1', 'default', true)])
    // Always-visible concepts (T018/T028/C1).
    for (const key of ['saved_config', 'active_config', 'duplicate_vs_edit', 'position_cap', 'buying_power']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })

  it('saves edited knobs for the selected config', async () => {
    patchConfigMock.mockResolvedValue(cfg('1', 'default', true))
    await mountWithConfigs([cfg('1', 'default', true)])
    fireEvent.click(screen.getByRole('button', { name: 'save default' }))
    await waitFor(() =>
      expect(patchConfigMock).toHaveBeenCalledWith('1', expect.objectContaining({ params: expect.any(Object) })),
    )
  })
})

describe('ConfigManager — Claude draft hosting (017 US2)', () => {
  it('renders the DraftConfigPanel for a valid ?draft= param', async () => {
    const { encodeDraft } = await import('@/lib/draft-config')
    const { ConfigManager } = await import('./config-manager')
    listConfigsMock.mockResolvedValue({ configs: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'wf-rr3', mode: 'backtest',
        timeframe: '5m', strategy_id: '22222222-2222-2222-2222-222222222222',
        params: {}, is_active: true },
    ] })
    listPresetsMock.mockResolvedValue({ presets: [] })
    const param = encodeDraft({
      base_config_name: 'wf-rr3',
      changes: [{ knob_path: 'strategy.vwap_pullback.target.risk_reward', value: 2.5 }],
      analysis_id: 'd7e75317-4fd5-4d23-967d-a326c62c9c5b',
      experiment_index: 0,
      hypothesis: 'Test rr 2.5',
    })
    wrap(createElement(ConfigManager, { draftParam: param, onDismissDraft: vi.fn() } as never))
    await waitFor(() =>
      expect(screen.getByTestId('draft-config-panel')).toBeInTheDocument()
    )
  })

  it('shows a friendly notice (and a normal page) for a malformed draft param', async () => {
    const { ConfigManager } = await import('./config-manager')
    listConfigsMock.mockResolvedValue({ configs: [] })
    listPresetsMock.mockResolvedValue({ presets: [] })
    wrap(createElement(ConfigManager, { draftParam: 'not-a-draft\!\!\!', onDismissDraft: vi.fn() } as never))
    await waitFor(() =>
      expect(screen.getByText(/draft link could not be read/i)).toBeInTheDocument()
    )
    expect(screen.queryByTestId('draft-config-panel')).not.toBeInTheDocument()
  })
})

describe('ConfigManager — provenance display (017 US3)', () => {
  it('renders a config description muted under its name', async () => {
    const { ConfigManager } = await import('./config-manager')
    listConfigsMock.mockResolvedValue({ configs: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'wf-rr3-exp-1', mode: 'backtest',
        timeframe: '5m', strategy_id: '22222222-2222-2222-2222-222222222222',
        params: {}, is_active: false,
        description: 'Drafted from Claude analysis d7e75317 · experiment 1: Test rr 2.5' },
    ] })
    listPresetsMock.mockResolvedValue({ presets: [] })
    wrap(createElement(ConfigManager))
    await waitFor(() =>
      expect(screen.getByText(/drafted from claude analysis d7e75317/i)).toBeInTheDocument()
    )
  })
})
