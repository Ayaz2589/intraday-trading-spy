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

// Feature 018 (US1): the active config row carries its health verdict badge.
const getHealthMock = vi.fn()
vi.mock('@/api/recommend', () => ({
  getRecommendHealth: (...a: unknown[]) => getHealthMock(...a),
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
  getHealthMock.mockReset()
  getHealthMock.mockResolvedValue({ verdicts: [] })
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

  it('shows the health badge on the active config row only (018 US1)', async () => {
    getHealthMock.mockResolvedValue({
      verdicts: [
        {
          config_id: '1',
          config_name: 'default',
          strategy_id: 's',
          verdict: 'degrading',
          inputs: {
            window_count: 8,
            recent_median_r: 0.01,
            baseline_median_r: 0.035,
            gate_passed: null,
            gate_ci_low: null,
            gate_ci_high: null,
          },
          thresholds: { min_windows: 6, recent_windows: 4, degradation_margin_r: 0.02 },
        },
      ],
    })
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    const active = screen.getByTestId('config-row-default')
    await waitFor(() =>
      expect(within(active).getByTestId('health-badge')).toBeInTheDocument(),
    )
    expect(within(active).getByTestId('health-badge')).toHaveTextContent(/degrading/i)
    // inactive rows never fetch-render the badge
    expect(
      within(screen.getByTestId('config-row-wf-rr3')).queryByTestId('health-badge'),
    ).toBeNull()
  })

  it('shows "N off default" only for rows that differ', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('off-default-wf-rr3')).toHaveTextContent('2 customized')
    expect(screen.queryByTestId('off-default-default')).toBeNull()
  })

  // Strategy-page cleanup: rows must be tellable apart at a glance — changed
  // knobs render as accent chips (prototype kchip.diff), non-summary diffs get
  // their own chip, and the count pill stays muted so ACTIVE is the only blue.
  it('highlights off-default knob chips in accent, including non-summary knobs', () => {
    const params = {
      risk: { max_position_value_pct: 100 },
      strategy: { vwap_pullback: { stop: { buffer_pct: 0.2 } } },
    }
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'tweaked', false, params)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    const row = screen.getByTestId('config-row-tweaked')
    // changed summary knob → accent chip
    expect(within(row).getByText('100%').closest('.chip')?.className).toContain('chip-accent')
    // unchanged summary knob → muted chip
    expect(within(row).getByText('lockout').closest('.chip')?.className).not.toContain('chip-accent')
    // off-default NON-summary knob gets its own accent chip
    const stop = within(row).getByText('stop')
    expect(stop.closest('.chip')?.className).toContain('chip-accent')
    expect(within(row).getByText('0.2%')).toBeInTheDocument()
    // the all-defaults row shows no extra chips
    expect(within(screen.getByTestId('config-row-default')).queryByText('stop')).toBeNull()
  })

  it('renders the off-default count pill muted, not accent', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('off-default-wf-rr3').className).not.toContain('chip-accent')
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

describe('ConfigsSection — ordering', () => {
  it('pins the active config to the top regardless of name order', () => {
    wrap(
      <ConfigsSection
        configs={[
          cfg('c1', 'auto04-c1-buffer'),
          cfg('c2', 'zz-experimental', true),
          cfg('c3', 'deep-combo'),
        ]}
        expandedId={null}
        onToggle={vi.fn()}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows[0].textContent).toContain('zz-experimental')
    // the rest keep their alphabetical order
    expect(rows[1].textContent).toContain('auto04-c1-buffer')
    expect(rows[2].textContent).toContain('deep-combo')
  })
})

// Feature 025 — the auto-derived human-readable summary appears next to the
// cryptic technical name, with an educational help tooltip.
describe('ConfigsSection — config summary (025)', () => {
  const SUMMARY = 'VWAP pullback · 0.2% stop buffer · 2:1 R:R'

  it('renders the summary next to the technical name without replacing it (US1)', () => {
    wrap(
      <ConfigsSection
        configs={[{ ...cfg('1', 'auto09-c3-buffer_pct0.2', true), summary: SUMMARY }]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    const row = screen.getByTestId('config-row-auto09-c3-buffer_pct0.2')
    // technical name still present
    expect(within(row).getByText('auto09-c3-buffer_pct0.2')).toBeInTheDocument()
    // summary present alongside it
    expect(within(row).getByTestId('config-summary')).toHaveTextContent(SUMMARY)
  })

  it('shows the config_summary educational help tooltip (US3)', () => {
    wrap(
      <ConfigsSection
        configs={[{ ...cfg('1', 'auto09-c3', true), summary: SUMMARY }]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(document.querySelector('[data-help-key="config_summary"]')).toBeTruthy()
  })
})
