import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Run } from '@/api/types'

const navigateMock = vi.fn()
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigateMock,
}))

const baseRun: Run = {
  id: 'r1',
  started_at: '2026-06-04T14:11:00Z',
  finished_at: '2026-06-04T14:12:00Z',
  status: 'finished',
  range_start: '2026-01-01',
  range_end: '2026-03-31',
  bar_count: 78,
  summary: {
    pnl: '$120.50',
    win_rate: 0.6,
    sharpe: 1.5,
    max_drawdown: '$50.00',
    total_trades: 5,
    total_signals: 10,
    rejected_signals: 5,
  },
  data_fingerprint: 'fp',
  app_version: '0.1.0',
  is_favorite: false,
  failure_reason: null,
}

describe('<RunOriginBadge />', () => {
  beforeEach(() => navigateMock.mockClear())

  it('renders kind · segment · window for a walk-forward child', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's1',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 3,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · OOS · w3')
  })

  it('labels train segment as IS and omits a missing window (sensitivity)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's2',
      study_kind: 'sensitivity' as const,
      segment: 'train' as const,
      window_index: null,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('sensitivity · IS')
  })

  it('omits a null segment (combined train+validation child)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's3',
      study_kind: 'walk_forward' as const,
      segment: null,
      window_index: 4,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('walk-forward · w4')
  })

  it('still renders segment/window when the parent study was deleted (kind null)', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's4',
      study_kind: null,
      segment: 'train' as const,
      window_index: 3,
    }
    render(<RunOriginBadge run={run} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('IS · w3')
  })

  it('navigates to the study and suppresses the row link on click', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = {
      ...baseRun,
      study_id: 's5',
      study_kind: 'walk_forward' as const,
      segment: 'validation' as const,
      window_index: 0,
    }
    render(<RunOriginBadge run={run} />)
    fireEvent.click(screen.getByTestId('run-origin-badge'))
    expect(navigateMock).toHaveBeenCalledWith({
      to: '/validation/$studyId',
      params: { studyId: 's5' },
    })
  })

  it('renders a lockbox tag without a link', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    const run = { ...baseRun, segment: 'lockbox' as const }
    render(<RunOriginBadge run={run} />)
    const badge = screen.getByTestId('run-origin-badge')
    expect(badge).toHaveTextContent('lockbox')
    expect(badge.tagName).toBe('SPAN')
  })

  it('renders "CLI run" for a standalone run', async () => {
    const { RunOriginBadge } = await import('./RunOriginBadge')
    render(<RunOriginBadge run={baseRun} />)
    expect(screen.getByTestId('run-origin-badge')).toHaveTextContent('CLI run')
  })
})
