import { EmptyState } from '@/components/empty-state'
import { VERDICT_CHIP_CLASS, VERDICT_LABEL } from './AutoResearchCard'
import type { Campaign } from '@/api/types'

// Feature 019 (FR-015): past campaigns, newest first (API order), each linking
// to its cycle-by-cycle detail page.

export function CampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) {
    return (
      <EmptyState
        icon="⟳"
        title="No campaigns yet"
        text="Start one above to watch the loop hunt for an edge — every cycle, candidate, and verdict lands here."
        testid="campaigns-empty"
      />
    )
  }
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
      {campaigns.map(c => (
        <li
          key={c.id}
          className="card"
          data-testid={`campaign-row-${c.id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 12px' }}
        >
          <a
            href={`/validation/campaigns/${c.id}`}
            className="mono"
            style={{ fontWeight: 700, color: 'var(--text)', fontSize: 'var(--fs-md, 14px)' }}
          >
            campaign {String(c.seq).padStart(2, '0')}
          </a>
          <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)' }}>
            from {c.starting_config_name}
          </span>
          {c.status === 'running' ? (
            <span className="chip chip-accent">running</span>
          ) : (
            <span className={VERDICT_CHIP_CLASS[c.verdict ?? 'failed']}>
              {VERDICT_LABEL[c.verdict ?? 'failed']}
            </span>
          )}
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
            {c.trials_used}/{c.budget} trials · {c.cycles.length} cycle{c.cycles.length === 1 ? '' : 's'}
          </span>
        </li>
      ))}
    </ul>
  )
}
