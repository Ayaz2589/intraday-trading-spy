// T026 (Feature 014, FR-003) — the lockbox card links to its one-shot run
// when the ledger references one (post-014 spends); pre-014 entries show none.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LockboxCard } from './LockboxCard'
import type { LockboxStatus } from '@/api/types'

function status(over: Partial<LockboxStatus> = {}): LockboxStatus {
  return {
    lockbox_start: '2025-01-01', lockbox_end: '2026-12-31', state: 'spent',
    config_fingerprint: 'fp1', run_id: null, result: { total_trades: 9 },
    history: [], ...over,
  } as LockboxStatus
}

describe('LockboxCard run link', () => {
  it('links to the lockbox run when the ledger references one', () => {
    render(
      <LockboxCard
        status={status({ run_id: 'aaaa1111-0000-0000-0000-000000000000' })}
        configs={[]} running={false} onRun={vi.fn()}
      />,
    )
    expect(screen.getByRole('link', { name: /view lockbox run/i })).toHaveAttribute(
      'href', '/runs/aaaa1111-0000-0000-0000-000000000000',
    )
  })

  it('shows no run link for pre-014 ledger entries (run_id null)', () => {
    render(<LockboxCard status={status()} configs={[]} running={false} onRun={vi.fn()} />)
    expect(screen.queryByRole('link', { name: /view lockbox run/i })).not.toBeInTheDocument()
  })
})
