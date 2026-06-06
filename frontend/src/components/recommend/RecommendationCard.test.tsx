import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { CandidateView } from '@/api/types'

// Feature 018 (US2): one recommendation card per candidate — class-specific
// rendering, cited evidence, and the ONLY actuation being 017's human-gated
// Draft config → navigation (FR-010).

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}))

const createConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  createConfig: (...a: unknown[]) => createConfigMock(...a),
}))

import { RecommendationCard } from './RecommendationCard'
import { decodeDraft } from '@/lib/draft-config'

const RR = 'strategy.vwap_pullback.target.risk_reward'

const candidate = (over: Partial<CandidateView> = {}): CandidateView => ({
  klass: 'knob_delta',
  rank: 1,
  score: 0.042,
  changes: [{ knob_path: RR, value: 2.5 }],
  evidence: [
    { metric_path: 'sensitivity.0.values.2.neighborhood_mean', value: 0.0223 },
    { metric_path: 'sensitivity.0.current_value', value: 2 },
  ],
  already_tried: null,
  narrative_hint: 'sensitivity neighborhood at risk_reward=2.5 averages 0.022 vs 0.012',
  ...over,
})

beforeEach(() => {
  navigateMock.mockReset()
  createConfigMock.mockReset()
})

describe('RecommendationCard — knob_delta', () => {
  it('renders knob chips via the registry labels and cited evidence values', () => {
    render(
      <RecommendationCard candidate={candidate()} baseConfigName="default" analysisId={null} />,
    )
    const card = screen.getByTestId('recommendation-card')
    expect(card).toHaveTextContent(/risk:reward target → 2.5/)
    expect(card).toHaveTextContent('neighborhood_mean')
    expect(card).toHaveTextContent('0.0223')
  })

  it('Draft config → encodes the 017 draft and navigates to /strategies', () => {
    render(
      <RecommendationCard candidate={candidate()} baseConfigName="default" analysisId="ia-9" />,
    )
    fireEvent.click(screen.getByRole('button', { name: /draft config/i }))
    expect(navigateMock).toHaveBeenCalledTimes(1)
    const arg = navigateMock.mock.calls[0][0]
    expect(arg.to).toBe('/strategies')
    const draft = decodeDraft(arg.search.draft)
    expect(draft).not.toBeNull()
    expect(draft?.base_config_name).toBe('default')
    expect(draft?.changes).toEqual([{ knob_path: RR, value: 2.5 }])
    expect(draft?.analysis_id).toBe('ia-9')
  })

  it('already-tried candidates link the existing config and offer NO draft', () => {
    render(
      <RecommendationCard
        candidate={candidate({ already_tried: { config_id: 'c9', config_name: 'wf-rr3' } })}
        baseConfigName="default"
        analysisId={null}
      />,
    )
    const card = screen.getByTestId('recommendation-card')
    expect(card).toHaveTextContent(/already tried/i)
    expect(card).toHaveTextContent('wf-rr3')
    expect(screen.queryByRole('button', { name: /draft config/i })).toBeNull()
  })

  it('never calls config-create — drafting is navigation only (FR-010)', () => {
    render(
      <RecommendationCard candidate={candidate()} baseConfigName="default" analysisId={null} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /draft config/i }))
    expect(createConfigMock).not.toHaveBeenCalled()
  })
})

describe('RecommendationCard — other classes', () => {
  it('renders gather_evidence as guidance with no draft action', () => {
    render(
      <RecommendationCard
        candidate={candidate({
          klass: 'gather_evidence',
          changes: [],
          narrative_hint: 'no sensitivity sweep exists for this family — run a sensitivity study',
        })}
        baseConfigName="default"
        analysisId={null}
      />,
    )
    const card = screen.getByTestId('recommendation-card')
    expect(card).toHaveTextContent(/gather evidence/i)
    expect(card).toHaveTextContent(/run a sensitivity study/i)
    expect(screen.queryByRole('button', { name: /draft config/i })).toBeNull()
  })

  it('renders stop_tuning as the honest stop signal', () => {
    render(
      <RecommendationCard
        candidate={candidate({
          klass: 'stop_tuning',
          changes: [],
          narrative_hint: 'every computed pooled gate in this family includes zero',
        })}
        baseConfigName="default"
        analysisId={null}
      />,
    )
    const card = screen.getByTestId('recommendation-card')
    expect(card).toHaveTextContent(/stop tuning/i)
    expect(card).toHaveTextContent(/includes zero/i)
    expect(screen.queryByRole('button', { name: /draft config/i })).toBeNull()
  })
})
