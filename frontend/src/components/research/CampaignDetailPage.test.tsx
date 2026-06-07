// Feature 019 T028b — per-campaign drill-down (FR-015/FR-016).
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const getMock = vi.fn()
vi.mock('@/api/research', () => ({
  listCampaigns: vi.fn(),
  getCampaign: (id: string) => getMock(id),
  startCampaign: vi.fn(),
  cancelCampaign: vi.fn(),
}))

import { CampaignDetailPage } from './CampaignDetailPage'

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(createElement(QueryClientProvider, { client }, ui))
}

const halted = {
  id: 'c-7', seq: 7, starting_config_name: 'default', budget: 4, trials_used: 1,
  status: 'halted', verdict: 'ready_for_lockbox',
  verdict_detail: { candidate: 'auto07-c1-risk_reward2.5', bar: { k: 3, level: 0.9833 } },
  thresholds: { base_alpha: 0.05 },
  cycles: [
    {
      cycle: 1, candidate_config_name: 'default', family: '',
      stages: [
        { stage: 'data', status: 'ok', detail: { backfill_job_id: null } },
        { stage: 'study', status: 'ok', detail: { study_id: 'study-11' } },
        { stage: 'gate', status: 'fail', detail: { k: 1, level: 0.95, ci_low: -0.41, ci_high: 1.92 } },
        { stage: 'act', status: 'ok', detail: { action: 'knob_delta', config_name: 'auto07-c1-risk_reward2.5' } },
      ],
    },
    {
      cycle: 2, candidate_config_name: 'auto07-c1-risk_reward2.5',
      family: 'strategy.vwap_pullback.target.risk_reward',
      stages: [
        { stage: 'study', status: 'ok', detail: { study_id: 'study-12' } },
        { stage: 'gate', status: 'pass', detail: { k: 3, level: 0.9833, ci_low: 0.12, ci_high: 2.4 } },
      ],
    },
  ],
  created_at: '2026-06-06T00:00:00Z', updated_at: '2026-06-06T01:00:00Z',
}

beforeEach(() => {
  getMock.mockReset()
  getMock.mockResolvedValue(halted)
})

describe('CampaignDetailPage', () => {
  it('renders the verdict hero with the candidate and human-gate guidance', async () => {
    wrap(<CampaignDetailPage campaignId="c-7" />)
    const hero = await screen.findByTestId('campaign-verdict')
    expect(hero.textContent).toMatch(/ready for lockbox/i)
    expect(within(hero).getByText('auto07-c1-risk_reward2.5')).toBeInTheDocument()
    // FR-016: no spend control (the educational `?` tooltip is allowed).
    expect(within(hero).queryByRole('button', { name: /run|spend|one-shot/i })).toBeNull()
  })

  it('renders one timeline entry per cycle with stage outcomes and study links', async () => {
    wrap(<CampaignDetailPage campaignId="c-7" />)
    const cycles = await screen.findAllByTestId(/campaign-cycle-/)
    expect(cycles).toHaveLength(2)
    expect(within(cycles[0]).getByRole('link', { name: /study/i })).toHaveAttribute(
      'href', '/validation/study-11',
    )
    expect(cycles[0].textContent).toMatch(/knob_delta|knob delta/i)
  })

  it('shows the gate CI against the bar applied (k, level) with its tooltip', async () => {
    wrap(<CampaignDetailPage campaignId="c-7" />)
    const cycles = await screen.findAllByTestId(/campaign-cycle-/)
    // cycle 2 gated at the tightened bar
    expect(cycles[1].textContent).toContain('k=3')
    expect(cycles[1].textContent).toMatch(/98\.33?%/)
    expect(cycles[1].textContent).toMatch(/0\.12/)
    expect(document.querySelector('[data-help-key="tightened_bar"]')).toBeTruthy()
  })
})
