import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigWorkbench } from './config-manager'

const listConfigsMock = vi.fn()
const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
const deleteConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: () => listConfigsMock(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: (id: unknown) => deleteConfigMock(id),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (id: string, name: string, is_active = false) => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params: {},
  is_active,
})

beforeEach(() => {
  for (const m of [listConfigsMock, listPresetsMock, createConfigMock, deleteConfigMock]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [{ name: 'aggressive', description: 'more signals', params: {} }],
  })
})

describe('ConfigWorkbench', () => {
  it('starts with the slide-out closed; clicking a card opens that config', async () => {
    listConfigsMock.mockResolvedValue({
      configs: [cfg('1', 'default'), cfg('2', 'wf-rr3', true)],
    })
    wrap(<ConfigWorkbench />)
    // Cards render, but no detail editor is open by default.
    await waitFor(() => expect(screen.getByTestId('config-card-wf-rr3')).toBeInTheDocument())
    expect(screen.queryByTestId('config-editor-wf-rr3')).toBeNull()
    fireEvent.click(screen.getByLabelText('open wf-rr3'))
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-wf-rr3')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('config-editor-default')).toBeNull()
  })

  it('closes the slide-out and does not re-open it', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('1', 'default', true)] })
    wrap(<ConfigWorkbench />)
    await waitFor(() => expect(screen.getByTestId('config-card-default')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('open default'))
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-default')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() =>
      expect(screen.queryByTestId('config-editor-default')).toBeNull(),
    )
  })

  it('opens the slide-out for a freshly created config', async () => {
    listConfigsMock
      .mockResolvedValueOnce({ configs: [cfg('1', 'default', true)] })
      .mockResolvedValue({ configs: [cfg('1', 'default', true), cfg('3', 'my-aggro')] })
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    wrap(<ConfigWorkbench />)
    await waitFor(() => expect(screen.getByTestId('config-card-default')).toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-my-aggro')).toBeInTheDocument(),
    )
  })

  it('closes the slide-out cleanly when the open config is deleted', async () => {
    listConfigsMock
      .mockResolvedValueOnce({ configs: [cfg('1', 'default', true), cfg('2', 'wf-rr3')] })
      .mockResolvedValue({ configs: [cfg('1', 'default', true)] })
    deleteConfigMock.mockResolvedValue({ deleted: '2' })
    wrap(<ConfigWorkbench />)
    await waitFor(() => expect(screen.getByTestId('config-card-wf-rr3')).toBeInTheDocument())
    fireEvent.click(screen.getByLabelText('open wf-rr3'))
    await waitFor(() => expect(screen.getByTestId('config-editor-wf-rr3')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete wf-rr3' }))
    await waitFor(() => expect(screen.queryByTestId('config-card-wf-rr3')).toBeNull())
    // Stale expandedId must be cleared — slide-out closed, no crash.
    expect(screen.queryByTestId('config-editor-wf-rr3')).toBeNull()
  })
})

describe('ConfigWorkbench — Claude draft hosting (017 US2)', () => {
  it('renders the DraftConfigPanel for a valid ?draft= param', async () => {
    const { encodeDraft } = await import('@/lib/draft-config')
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
    wrap(<ConfigWorkbench draftParam={param} onDismissDraft={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByTestId('draft-config-panel')).toBeInTheDocument()
    )
  })

  it('shows a friendly notice (and a normal page) for a malformed draft param', async () => {
    listConfigsMock.mockResolvedValue({ configs: [] })
    listPresetsMock.mockResolvedValue({ presets: [] })
    wrap(<ConfigWorkbench draftParam="not-a-draft!!!" onDismissDraft={vi.fn()} />)
    await waitFor(() =>
      expect(screen.getByText(/draft link could not be read/i)).toBeInTheDocument()
    )
    expect(screen.queryByTestId('draft-config-panel')).not.toBeInTheDocument()
  })
})

describe('ConfigWorkbench — provenance display (017 US3)', () => {
  it('renders a config description muted beside its name', async () => {
    listConfigsMock.mockResolvedValue({ configs: [
      { id: '11111111-1111-1111-1111-111111111111', name: 'wf-rr3-exp-1', mode: 'backtest',
        timeframe: '5m', strategy_id: '22222222-2222-2222-2222-222222222222',
        params: {}, is_active: false,
        description: 'Drafted from Claude analysis d7e75317 · experiment 1: Test rr 2.5' },
    ] })
    listPresetsMock.mockResolvedValue({ presets: [] })
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByText(/drafted from claude analysis d7e75317/i)).toBeInTheDocument()
    )
  })
})
