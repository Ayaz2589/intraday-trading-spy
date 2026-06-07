// Feature 019 T027 — the Auto-research launch/progress card (FR-015..FR-017).
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'

const listMock = vi.fn()
const getMock = vi.fn()
const startMock = vi.fn()
const cancelMock = vi.fn()
vi.mock('@/api/research', () => ({
  listCampaigns: () => listMock(),
  getCampaign: (id: string) => getMock(id),
  startCampaign: (b: unknown) => startMock(b),
  cancelCampaign: (id: string) => cancelMock(id),
}))
const listConfigsMock = vi.fn()
vi.mock('@/api/configs', () => ({ listConfigs: () => listConfigsMock() }))

import { AutoResearchCard } from './AutoResearchCard'

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(createElement(QueryClientProvider, { client }, ui))
}

const cfg = (name: string, is_active = false) => ({
  id: name, name, mode: 'backtest', timeframe: '5m', strategy_id: 's', params: {}, is_active,
})

const campaign = (over: Record<string, unknown> = {}) => ({
  id: 'c-1', seq: 1, starting_config_name: 'default', budget: 4, trials_used: 1,
  status: 'running', verdict: null, verdict_detail: null,
  thresholds: { base_alpha: 0.05 },
  cycles: [{
    cycle: 1, candidate_config_name: 'default', family: '',
    stages: [
      { stage: 'data', status: 'ok', detail: {} },
      { stage: 'study', status: 'ok', detail: { study_id: 's-1' } },
      { stage: 'gate', status: 'fail', detail: { k: 1, level: 0.95, ci_low: -0.4, ci_high: 1.2 } },
    ],
  }],
  created_at: '2026-06-06T00:00:00Z', updated_at: '2026-06-06T00:00:00Z', ...over,
})

beforeEach(() => {
  for (const m of [listMock, getMock, startMock, cancelMock, listConfigsMock]) m.mockReset()
  listConfigsMock.mockResolvedValue({ configs: [cfg('default', true), cfg('wf-rr3')] })
})

describe('AutoResearchCard — launch', () => {
  it('seeds the budget from default_budget and pre-selects the active config', async () => {
    listMock.mockResolvedValue({ campaigns: [], default_budget: 6 })
    wrap(<AutoResearchCard />)
    await waitFor(() => expect(screen.getByLabelText('campaign budget')).toHaveValue(6))
    expect(screen.getByLabelText('campaign config')).toHaveValue('default')
  })

  it('launches with the chosen config and budget', async () => {
    listMock.mockResolvedValue({ campaigns: [], default_budget: 6 })
    startMock.mockResolvedValue(campaign())
    wrap(<AutoResearchCard />)
    await waitFor(() => expect(screen.getByLabelText('campaign budget')).toHaveValue(6))
    fireEvent.change(screen.getByLabelText('campaign config'), { target: { value: 'wf-rr3' } })
    fireEvent.change(screen.getByLabelText('campaign budget'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: /start campaign/i }))
    await waitFor(() =>
      expect(startMock).toHaveBeenCalledWith({ config_name: 'wf-rr3', budget: 3 }),
    )
  })

  it('surfaces an already-running rejection', async () => {
    listMock.mockResolvedValue({ campaigns: [], default_budget: 6 })
    startMock.mockRejectedValue(new Error('a campaign is already running'))
    wrap(<AutoResearchCard />)
    await waitFor(() => expect(screen.getByLabelText('campaign budget')).toHaveValue(6))
    fireEvent.click(screen.getByRole('button', { name: /start campaign/i }))
    expect(await screen.findByText(/already running/i)).toBeInTheDocument()
  })

  it('explains the new concepts with HelpTooltips (FR-017)', async () => {
    listMock.mockResolvedValue({ campaigns: [], default_budget: 6 })
    wrap(<AutoResearchCard />)
    await waitFor(() => expect(screen.getByLabelText('campaign budget')).toBeInTheDocument())
    for (const key of ['auto_research_campaign', 'trial_budget', 'stopping_rules']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })
})

describe('AutoResearchCard — live progress & verdicts', () => {
  it('shows the running campaign cycle/stage strip with a cancel button', async () => {
    listMock.mockResolvedValue({ campaigns: [campaign()], default_budget: 6 })
    getMock.mockResolvedValue(campaign())
    cancelMock.mockResolvedValue({ cancel_requested: true })
    wrap(<AutoResearchCard />)
    const panel = await screen.findByTestId('campaign-progress')
    expect(panel.textContent).toMatch(/cycle 1/i)
    expect(panel.textContent).toMatch(/gate/i)
    expect(panel.textContent).toMatch(/1\/4/)         // trials_used / budget
    fireEvent.click(screen.getByRole('button', { name: /cancel campaign/i }))
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith('c-1'))
  })

  it('ready_for_lockbox names the candidate, links to the lockbox, offers NO spend control', async () => {
    const halted = campaign({
      status: 'halted', verdict: 'ready_for_lockbox',
      verdict_detail: { candidate: 'auto01-c1-risk_reward2.5', bar: { k: 2, level: 0.975 } },
    })
    listMock.mockResolvedValue({ campaigns: [halted], default_budget: 6 })
    getMock.mockResolvedValue(halted)
    wrap(<AutoResearchCard />)
    const verdict = await screen.findByTestId('campaign-verdict')
    expect(verdict.textContent).toMatch(/ready for lockbox/i)
    expect(within(verdict).getByText('auto01-c1-risk_reward2.5')).toBeInTheDocument()
    // FR-016: the campaign surface NEVER offers to spend the lockbox — no
    // run/spend control (the educational `?` tooltip is required and allowed).
    expect(within(verdict).queryByRole('button', { name: /run|spend|one-shot/i })).toBeNull()
    expect(verdict.textContent).toMatch(/when you decide|your one-shot|you decide/i)
  })

  it('stop_tuning surfaces the engine rationale', async () => {
    const halted = campaign({
      status: 'halted', verdict: 'stop_tuning',
      verdict_detail: { reason: 'no_novel_candidates', hint: 'no setting in this family shows deployable edge' },
    })
    listMock.mockResolvedValue({ campaigns: [halted], default_budget: 6 })
    getMock.mockResolvedValue(halted)
    wrap(<AutoResearchCard />)
    const verdict = await screen.findByTestId('campaign-verdict')
    expect(verdict.textContent).toMatch(/stop tuning/i)
    expect(verdict.textContent).toMatch(/deployable edge/i)
  })
})
