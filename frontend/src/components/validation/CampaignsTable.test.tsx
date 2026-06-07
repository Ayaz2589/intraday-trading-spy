// Feature 019 T028a — campaign history list (FR-015).
import { render, screen, within } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { CampaignsTable } from './CampaignsTable'
import type { Campaign } from '@/api/types'

const campaign = (over: Partial<Campaign>): Campaign => ({
  id: 'c-1', seq: 1, starting_config_name: 'default', budget: 4, trials_used: 2,
  status: 'halted', verdict: 'stop_tuning', verdict_detail: null,
  thresholds: { base_alpha: 0.05 }, cycles: [],
  created_at: '2026-06-06T00:00:00Z', updated_at: '2026-06-06T00:00:00Z', ...over,
})

describe('CampaignsTable', () => {
  it('lists campaigns with verdict chips and detail links', () => {
    render(
      <CampaignsTable
        campaigns={[
          campaign({ id: 'c-2', seq: 2, verdict: 'ready_for_lockbox', status: 'halted' }),
          campaign({ id: 'c-1', seq: 1 }),
        ]}
      />,
    )
    const rows = screen.getAllByTestId(/campaign-row-/)
    expect(rows).toHaveLength(2)
    // newest (as given by the API) first; each links to its detail page
    expect(within(rows[0]).getByRole('link')).toHaveAttribute(
      'href', '/validation/campaigns/c-2',
    )
    expect(rows[0].textContent).toMatch(/ready for lockbox/i)
    expect(rows[1].textContent).toMatch(/stop tuning/i)
    expect(rows[1].textContent).toMatch(/2\/4/) // trials_used / budget
  })

  it('renders the teaching empty state when no campaign has run', () => {
    render(<CampaignsTable campaigns={[]} />)
    expect(screen.getByText(/no campaigns yet/i)).toBeInTheDocument()
  })
})

describe('CampaignsTable — pagination', () => {
  it('paginates past 10 campaigns', () => {
    const campaigns = Array.from({ length: 13 }, (_, i) =>
      campaign({ id: `c-${i}`, seq: i }),
    )
    render(<CampaignsTable campaigns={campaigns} />)
    expect(screen.getAllByTestId(/campaign-row-/)).toHaveLength(10)
    const next = screen.getByRole('button', { name: /next/i })
    next.click?.()
  })

  it('shows no pager when few campaigns', () => {
    render(<CampaignsTable campaigns={[campaign({})]} />)
    expect(screen.queryByTestId('pager')).toBeNull()
  })
})
