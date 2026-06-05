import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigsSection } from './config-list'
import type { Config } from '@/api/types'

const activateConfigMock = vi.fn()
const patchConfigMock = vi.fn()
const deleteConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: vi.fn(),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: (id: string) => activateConfigMock(id),
  patchConfig: (id: string, patch: unknown) => patchConfigMock(id, patch),
  deleteConfig: (id: string) => deleteConfigMock(id),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (
  id: string,
  name: string,
  is_active = false,
  params: Record<string, unknown> = {},
): Config => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
  is_active,
})

// cap 100 + R:R 3 → "2 off default" (defaults are 400 / 2).
const offDefaultParams = {
  risk: { max_position_value_pct: 100 },
  strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
}

beforeEach(() => {
  for (const m of [activateConfigMock, patchConfigMock, deleteConfigMock]) m.mockReset()
})

describe('ConfigsSection', () => {
  it('shows the count subtitle and knob summary chips per row', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText('2 configs · click one to edit its knobs')).toBeInTheDocument()
    const row = screen.getByTestId('config-row-default')
    expect(within(row).getByText('risk')).toBeInTheDocument()
    expect(within(row).getByText('0.1%')).toBeInTheDocument()
    expect(within(row).getByText('400%')).toBeInTheDocument()
    expect(within(row).getByText('lockout')).toBeInTheDocument()
  })

  it('shows "N off default" only for rows that differ', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('off-default-wf-rr3')).toHaveTextContent('2 off default')
    expect(screen.queryByTestId('off-default-default')).toBeNull()
  })

  it('marks the active config and activates another', async () => {
    activateConfigMock.mockResolvedValue(cfg('2', 'wf-rr3', true))
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('active-badge-default')).toHaveTextContent('ACTIVE')
    expect(screen.getAllByRole('button', { name: 'Set active' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Set active' }))
    await waitFor(() => expect(activateConfigMock).toHaveBeenCalledWith('2'))
  })

  it('toggles a row via its header button', () => {
    const onToggle = vi.fn()
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true)]}
        expandedId={null}
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'toggle default' }))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('renders the inline editor only for the expanded row', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId="1"
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('config-editor-default')).toBeInTheDocument()
    expect(screen.queryByTestId('config-editor-wf-rr3')).toBeNull()
  })

  it('renames a config', async () => {
    patchConfigMock.mockResolvedValue(cfg('2', 'renamed'))
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    fireEvent.change(screen.getByLabelText('rename wf-rr3'), { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledWith('2', { name: 'renamed' }))
  })

  it('deletes behind a confirm step and blocks deleting the last config', async () => {
    deleteConfigMock.mockResolvedValue({ deleted: '2' })
    const { unmount } = wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    expect(document.querySelector('[data-help-key="delete_safe"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete wf-rr3' }))
    await waitFor(() => expect(deleteConfigMock).toHaveBeenCalledWith('2'))
    unmount()

    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId={null} onToggle={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('renders saved_config and active_config tooltips in the section title', () => {
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId={null} onToggle={() => {}} />,
    )
    for (const key of ['saved_config', 'active_config']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })

  it('shows the updated name when renaming again after a successful rename', async () => {
    patchConfigMock.mockResolvedValue(cfg('2', 'renamed'))
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    const view = render(
      <QueryClientProvider client={client}>
        <ConfigsSection
          configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
          expandedId={null}
          onToggle={() => {}}
        />
      </QueryClientProvider>,
    )
    // Open rename, type a partial edit, then cancel — leaving name state as 'partial'
    // (different from the eventual refetched config.name).
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    fireEvent.change(screen.getByLabelText('rename wf-rr3'), { target: { value: 'partial' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    // Simulate an out-of-band refetch that delivers a new name ('renamed') —
    // the row is keyed by stable id so no remount happens.
    view.rerender(
      <QueryClientProvider client={client}>
        <ConfigsSection
          configs={[cfg('1', 'default', true), cfg('2', 'renamed')]}
          expandedId={null}
          onToggle={() => {}}
        />
      </QueryClientProvider>,
    )
    // Reopen rename: input MUST show the new name, not the stale 'partial'.
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    expect(screen.getByLabelText('rename renamed')).toHaveValue('renamed')
  })

  it('does not call rename when Save name is clicked with the unchanged name', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(patchConfigMock).not.toHaveBeenCalled()
  })
})
