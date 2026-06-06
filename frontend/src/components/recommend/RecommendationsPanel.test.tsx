import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// Feature 018 (US2): the Recommendations panel — per-config verdict rows,
// deterministic candidates (rendered with Claude on OR off, FR-009/SC-005),
// and the advisory narrative via the reused ClaudeReadCard scope='recommend'.

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const getHealthMock = vi.fn()
const getPackMock = vi.fn()
vi.mock('@/api/recommend', () => ({
  getRecommendHealth: (...a: unknown[]) => getHealthMock(...a),
  getRecommendPack: (...a: unknown[]) => getPackMock(...a),
}))

const getAnalysisMock = vi.fn()
const postAnalysisMock = vi.fn()
const getSettingsMock = vi.fn()
const patchSettingsMock = vi.fn()
vi.mock('@/api/insights', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/api/insights')>()
  return {
    ...real,
    getClaudeAnalysis: (...a: unknown[]) => getAnalysisMock(...a),
    postClaudeAnalysis: (...a: unknown[]) => postAnalysisMock(...a),
    getClaudeSettings: (...a: unknown[]) => getSettingsMock(...a),
    patchClaudeSettings: (...a: unknown[]) => patchSettingsMock(...a),
  }
})

const createConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  createConfig: (...a: unknown[]) => createConfigMock(...a),
}))

import { RecommendationsPanel } from './RecommendationsPanel'

const RR = 'strategy.vwap_pullback.target.risk_reward'

const VERDICTS = {
  verdicts: [
    {
      config_id: 'c1',
      config_name: 'wf-rr3',
      strategy_id: 's1',
      verdict: 'failing',
      inputs: {
        window_count: 8,
        recent_median_r: -0.01,
        baseline_median_r: 0.025,
        gate_passed: false,
        gate_ci_low: -0.71,
        gate_ci_high: 2.6,
      },
      thresholds: { min_windows: 6, recent_windows: 4, degradation_margin_r: 0.02 },
    },
    {
      config_id: 'c2',
      config_name: 'default',
      strategy_id: 's1',
      verdict: 'ok',
      inputs: {
        window_count: 8,
        recent_median_r: 0.03,
        baseline_median_r: 0.028,
        gate_passed: null,
        gate_ci_low: null,
        gate_ci_high: null,
      },
      thresholds: { min_windows: 6, recent_windows: 4, degradation_margin_r: 0.02 },
    },
  ],
}

const PACK = {
  pack: {
    config_id: 'c1',
    config_name: 'wf-rr3',
    strategy_id: 's1',
    snapshot_fingerprint: 'fp-pack-1',
    trial_counts: { drafted: 0, validated: 0 },
    sensitivity: [],
    matched: [],
    windows: [],
    gates: [],
    regime_bleed: [],
    health: VERDICTS.verdicts[0],
    knobs: {},
  },
  candidates: [
    {
      klass: 'knob_delta',
      rank: 1,
      score: 0.042,
      changes: [{ knob_path: RR, value: 2.5 }],
      evidence: [{ metric_path: 'sensitivity.0.values.2.neighborhood_mean', value: 0.0223 }],
      already_tried: null,
      narrative_hint: 'plateau at 2.5',
    },
    {
      klass: 'stop_tuning',
      rank: 2,
      score: 0,
      changes: [],
      evidence: [],
      already_tried: null,
      narrative_hint: 'every computed pooled gate in this family includes zero',
    },
  ],
  trial_counts: { drafted: 0, validated: 0 },
  snapshot_fingerprint: 'fp-pack-1',
}

const SETTINGS_ON = { claude_enabled: true, disabled_reason: null, configured: true }
const SETTINGS_PAUSED = { claude_enabled: false, disabled_reason: 'manual', configured: true }

function wrap(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  for (const m of [
    navigateMock, getHealthMock, getPackMock, getAnalysisMock,
    postAnalysisMock, getSettingsMock, patchSettingsMock, createConfigMock,
  ]) m.mockReset()
  getHealthMock.mockResolvedValue(VERDICTS)
  getPackMock.mockResolvedValue(PACK)
  getAnalysisMock.mockResolvedValue(null)
  getSettingsMock.mockResolvedValue(SETTINGS_ON)
})

describe('RecommendationsPanel', () => {
  it('lists per-config verdict rows with their cited inputs (FR-002/U4)', async () => {
    wrap(<RecommendationsPanel />)
    const row = await screen.findByTestId('rec-verdict-wf-rr3')
    expect(row).toHaveTextContent(/failing/i)
    expect(row).toHaveTextContent(/8 windows/i)
    expect(row).toHaveTextContent(/-0\.010/)
    expect(row).toHaveTextContent(/0\.025/)
    expect(screen.getByTestId('rec-verdict-default')).toHaveTextContent(/ok/i)
  })

  it('selects the unhealthiest config first and renders its candidates deterministically labeled (FR-013)', async () => {
    wrap(<RecommendationsPanel />)
    await waitFor(() => expect(getPackMock).toHaveBeenCalledWith('c1'))
    expect(await screen.findAllByTestId('recommendation-card')).toHaveLength(2)
    // the determinism split is visible
    expect(screen.getByTestId('rec-deterministic-label')).toHaveTextContent(/deterministic/i)
  })

  it('renders candidates fully while Claude is paused — only narrative absent (FR-009/SC-005)', async () => {
    getSettingsMock.mockResolvedValue(SETTINGS_PAUSED)
    wrap(<RecommendationsPanel />)
    expect(await screen.findAllByTestId('recommendation-card')).toHaveLength(2)
    expect(screen.getByTestId('rec-deterministic-label')).toBeInTheDocument()
  })

  it("renders the advisory narrative through ClaudeReadCard scope='recommend' (U1)", async () => {
    wrap(<RecommendationsPanel />)
    await screen.findAllByTestId('recommendation-card')
    // the reused card is present and scoped to the selected config
    expect(screen.getByTestId('claude-read')).toBeInTheDocument()
    await waitFor(() =>
      expect(getAnalysisMock).toHaveBeenCalledWith('recommend', 'c1'),
    )
  })

  it('enables Regenerate when the stored analysis is stale vs the pack fingerprint', async () => {
    getAnalysisMock.mockResolvedValue({
      id: 'ia1',
      scope: 'recommend',
      scope_id: 'c1',
      payload_hash: 'h-old',
      model: 'claude-opus-4-8',
      analysis: {
        summary: 'Stale read.',
        findings: [],
        risks: [],
        suggested_experiments: [],
        truncated: false,
        fingerprints: { pack: 'fp-OLD' },
      },
      created_at: '2026-06-05T10:00:00Z',
      truncated: false,
    })
    wrap(<RecommendationsPanel />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /regenerate/i })).toBeEnabled(),
    )
  })

  it('explains itself: recommendation_classes + evidence_pack tooltips (FR-014)', async () => {
    const { container } = wrap(<RecommendationsPanel />)
    await screen.findAllByTestId('recommendation-card')
    expect(container.querySelector('[data-help-key="recommendation_classes"]')).toBeTruthy()
    expect(container.querySelector('[data-help-key="evidence_pack"]')).toBeTruthy()
  })

  it('switching the selected config refetches its pack', async () => {
    wrap(<RecommendationsPanel />)
    await screen.findAllByTestId('recommendation-card')
    fireEvent.click(
      within(screen.getByTestId('rec-verdict-default')).getByRole('button', {
        name: /select default/i,
      }),
    )
    await waitFor(() => expect(getPackMock).toHaveBeenCalledWith('c2'))
  })

  it('never invokes config-create from any panel surface (FR-010/C2)', async () => {
    wrap(<RecommendationsPanel />)
    await screen.findAllByTestId('recommendation-card')
    fireEvent.click(screen.getByRole('button', { name: /draft config/i }))
    expect(createConfigMock).not.toHaveBeenCalled()
  })

  it('says so plainly when no config has OOS history yet', async () => {
    getHealthMock.mockResolvedValue({ verdicts: [] })
    wrap(<RecommendationsPanel />)
    expect(
      await screen.findByText(/no configs with out-of-sample history/i),
    ).toBeInTheDocument()
  })
})

describe('RecommendationsPanel — trial ledger (018 US3)', () => {
  it('surfaces the family trial counts with the data-snooping warning', async () => {
    getPackMock.mockResolvedValue({
      ...PACK,
      pack: { ...PACK.pack, trial_counts: { drafted: 9, validated: 4 } },
      trial_counts: { drafted: 9, validated: 4 },
    })
    const { container } = wrap(<RecommendationsPanel />)
    const ledger = await screen.findByTestId('rec-trial-ledger')
    expect(ledger).toHaveTextContent(/9 drafted/i)
    expect(ledger).toHaveTextContent(/4 validated/i)
    expect(ledger).toHaveTextContent(/against this archive/i)
    expect(container.querySelector('[data-help-key="trial_count"]')).toBeTruthy()
  })

  it('renders zero-trial families without the scary warning tone', async () => {
    wrap(<RecommendationsPanel />)
    const ledger = await screen.findByTestId('rec-trial-ledger')
    expect(ledger).toHaveTextContent(/0 drafted/i)
  })
})
