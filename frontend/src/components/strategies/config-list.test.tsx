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

// Feature 018 (US1): the active config carries its health verdict badge.
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

// cap 100 + R:R 3 → "2 customized" (defaults are 400 / 2).
const offDefaultParams = {
  risk: { max_position_value_pct: 100 },
  strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
}

beforeEach(() => {
  for (const m of [activateConfigMock, patchConfigMock, deleteConfigMock]) m.mockReset()
  getHealthMock.mockReset()
  getHealthMock.mockResolvedValue({ verdicts: [] })
})

// --- the wrapped card grid (collapsed; no slide-out open) --------------------

describe('ConfigsSection — card grid', () => {
  it('shows the count subtitle and knob summary chips per card', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText('2 configs · click one to edit its knobs')).toBeInTheDocument()
    const card = screen.getByTestId('config-card-default')
    expect(within(card).getByText('risk')).toBeInTheDocument()
    expect(within(card).getByText('0.1%')).toBeInTheDocument()
    expect(within(card).getByText('400%')).toBeInTheDocument()
    expect(within(card).getByText('lockout')).toBeInTheDocument()
  })

  it('shows the health badge on the active config card only (018 US1)', async () => {
    getHealthMock.mockResolvedValue({
      verdicts: [
        {
          config_id: '1', config_name: 'default', strategy_id: 's', verdict: 'degrading',
          inputs: { window_count: 8, recent_median_r: 0.01, baseline_median_r: 0.035, gate_passed: null, gate_ci_low: null, gate_ci_high: null },
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
    const active = screen.getByTestId('config-card-default')
    await waitFor(() => expect(within(active).getByTestId('health-badge')).toBeInTheDocument())
    expect(within(active).getByTestId('health-badge')).toHaveTextContent(/degrading/i)
    expect(within(screen.getByTestId('config-card-wf-rr3')).queryByTestId('health-badge')).toBeNull()
  })

  it('shows "N customized" only for cards that differ', () => {
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
    const card = screen.getByTestId('config-card-tweaked')
    expect(within(card).getByText('100%').closest('.chip')?.className).toContain('chip-accent')
    expect(within(card).getByText('lockout').closest('.chip')?.className).not.toContain('chip-accent')
    const stop = within(card).getByText('stop')
    expect(stop.closest('.chip')?.className).toContain('chip-accent')
    expect(within(card).getByText('0.2%')).toBeInTheDocument()
    expect(within(screen.getByTestId('config-card-default')).queryByText('stop')).toBeNull()
  })

  it('renders the customized count pill muted, not accent', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('off-default-wf-rr3').className).not.toContain('chip-accent')
  })

  it('pins the active config first regardless of name order', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('c1', 'auto04-c1-buffer'), cfg('c2', 'zz-experimental', true), cfg('c3', 'deep-combo')]}
        expandedId={null}
        onToggle={vi.fn()}
      />,
    )
    const cards = screen.getAllByRole('button').filter(b => b.getAttribute('aria-label')?.startsWith('open '))
    expect(cards[0]).toHaveAttribute('aria-label', 'open zz-experimental')
  })

  // Feature 025 — summary on the card next to the technical name.
  it('renders the summary next to the technical name on the card (025 US1)', () => {
    const SUMMARY = 'VWAP pullback · 0.2% stop buffer · 2:1 R:R'
    wrap(
      <ConfigsSection
        configs={[{ ...cfg('1', 'auto09-c3-buffer_pct0.2', true), summary: SUMMARY }]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    const card = screen.getByTestId('config-card-auto09-c3-buffer_pct0.2')
    expect(within(card).getByText('auto09-c3-buffer_pct0.2')).toBeInTheDocument()
    expect(within(card).getByTestId('config-summary')).toHaveTextContent(SUMMARY)
  })

  it('shows the config_summary educational help tooltip on the card (025 US3)', () => {
    wrap(
      <ConfigsSection
        configs={[{ ...cfg('1', 'auto09-c3', true), summary: 'VWAP pullback' }]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(document.querySelector('[data-help-key="config_summary"]')).toBeTruthy()
  })
})

// --- clicking a card opens the slide-out ------------------------------------

describe('ConfigsSection — open interaction', () => {
  it('clicking a card requests it open (onToggle with id)', () => {
    const onToggle = vi.fn()
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByLabelText('open wf-rr3'))
    expect(onToggle).toHaveBeenCalledWith('2')
  })

  it('does not open the slide-out when none is expanded', () => {
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId={null} onToggle={() => {}} />,
    )
    expect(screen.queryByTestId('slide-over-panel')).toBeNull()
    expect(screen.queryByTestId('config-editor-default')).toBeNull()
  })
})

// --- the slide-out detail (a config is expanded) ----------------------------

describe('ConfigsSection — detail slide-out', () => {
  it('shows the editor for the expanded config only', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId="2"
        onToggle={() => {}}
      />,
    )
    const panel = screen.getByTestId('slide-over-panel')
    expect(within(panel).getByTestId('config-editor-wf-rr3')).toBeInTheDocument()
    expect(screen.queryByTestId('config-editor-default')).toBeNull()
  })

  it('closing the slide-out toggles the open config off', () => {
    const onToggle = vi.fn()
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]} expandedId="2" onToggle={onToggle} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(onToggle).toHaveBeenCalledWith('2')
  })

  it('sets a config active from the slide-out', async () => {
    activateConfigMock.mockResolvedValue(cfg('2', 'wf-rr3', true))
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]} expandedId="2" onToggle={() => {}} />,
    )
    const panel = screen.getByTestId('slide-over-panel')
    fireEvent.click(within(panel).getByRole('button', { name: 'Set active' }))
    await waitFor(() => expect(activateConfigMock).toHaveBeenCalledWith('2'))
  })

  it('renames a config from the slide-out', async () => {
    patchConfigMock.mockResolvedValue(cfg('2', 'renamed'))
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]} expandedId="2" onToggle={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.change(screen.getByLabelText('rename wf-rr3'), { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledWith('2', { name: 'renamed' }))
  })

  it('does not call rename when Save name is clicked with the unchanged name', () => {
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]} expandedId="2" onToggle={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    expect(patchConfigMock).not.toHaveBeenCalled()
  })

  it('deletes behind a confirm step and blocks deleting the last config', async () => {
    deleteConfigMock.mockResolvedValue({ deleted: '2' })
    const { unmount } = wrap(
      <ConfigsSection configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]} expandedId="2" onToggle={() => {}} />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(document.querySelector('[data-help-key="delete_safe"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete wf-rr3' }))
    await waitFor(() => expect(deleteConfigMock).toHaveBeenCalledWith('2'))
    unmount()

    // last config → delete disabled
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId="1" onToggle={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })
})
