// Feature 021 T038 — the live journal (rejections first-class).
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LiveJournalTable } from './LiveJournalTable'
import type { PaperEvent } from '@/api/trade'

const EVENTS: PaperEvent[] = [
  { seq: 1, trading_day: '2026-06-08', timestamp: '2026-06-08T13:30:00Z',
    kind: 'session_started', payload: { config_name: 'default' } },
  { seq: 2, trading_day: '2026-06-08', timestamp: '2026-06-08T14:00:00Z',
    kind: 'rejected', payload: { rejection_check: 'cooldown_active',
                                 reason: 'cooldown_active' } },
  { seq: 3, trading_day: '2026-06-08', timestamp: '2026-06-08T14:05:00Z',
    kind: 'executed', payload: { actual_entry: 525.8, quantity: 19 } },
]

describe('LiveJournalTable', () => {
  it('renders taxonomy and lifecycle kinds with payload context', () => {
    render(<LiveJournalTable events={EVENTS} />)
    const t = screen.getByTestId('live-journal')
    expect(t).toHaveTextContent('session_started')
    expect(t).toHaveTextContent('executed')
    expect(t).toHaveTextContent('525.8')
  })

  it('rejections show their reason code, first-class', () => {
    render(<LiveJournalTable events={EVENTS} />)
    expect(screen.getByText('cooldown_active')).toBeInTheDocument()
  })

  it('shows the empty state with no events', () => {
    render(<LiveJournalTable events={[]} />)
    expect(screen.getByText(/no journal events yet/i)).toBeInTheDocument()
  })

  it('pairs the journal with a HelpTooltip', () => {
    const { container } = render(<LiveJournalTable events={EVENTS} />)
    expect(container.querySelector('[data-help-key="live_journal"]')).toBeTruthy()
  })
})
