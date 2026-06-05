import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigWorkbench } from './config-manager'

const listConfigsMock = vi.fn()
const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: () => listConfigsMock(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
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
  for (const m of [listConfigsMock, listPresetsMock, createConfigMock]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [{ name: 'aggressive', description: 'more signals', params: {} }],
  })
})

describe('ConfigWorkbench', () => {
  it('expands the active config by default', async () => {
    listConfigsMock.mockResolvedValue({
      configs: [cfg('1', 'default'), cfg('2', 'wf-rr3', true)],
    })
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-wf-rr3')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('config-editor-default')).toBeNull()
  })

  it('collapses an expanded row and does not re-expand it', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('1', 'default', true)] })
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-default')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'toggle default' }))
    await waitFor(() =>
      expect(screen.queryByTestId('config-editor-default')).toBeNull(),
    )
  })

  it('auto-expands a freshly created config', async () => {
    listConfigsMock
      .mockResolvedValueOnce({ configs: [cfg('1', 'default', true)] })
      .mockResolvedValue({ configs: [cfg('1', 'default', true), cfg('3', 'my-aggro')] })
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-default')).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-my-aggro')).toBeInTheDocument(),
    )
  })
})
