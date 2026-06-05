import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
        description: 'Bigger risk per trade, looser loss lockout, wider VWAP band.',
        params: {},
      },
    ],
  })
})

async function mount(onCreated = vi.fn()) {
  wrap(
    <NewConfigSection configs={[cfg('1', 'default')]} activeConfigId="1" onCreated={onCreated} />,
  )
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'aggressive' })).toBeInTheDocument(),
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

  it('shows the selected preset as a chip with its description', async () => {
    await mount()
    expect(screen.getByText('aggressive')).toBeInTheDocument()
    expect(
      screen.getByText('Bigger risk per trade, looser loss lockout, wider VWAP band.'),
    ).toBeInTheDocument()
  })

  it('renders the duplicate_vs_edit tooltip', async () => {
    await mount()
    expect(document.querySelector('[data-help-key="duplicate_vs_edit"]')).toBeTruthy()
  })
})
