import { useState } from 'react'
import { HelpTooltip } from '../help-tooltip'
import { ClaudeReadCard, flattenMetrics } from '../insights/ClaudeReadCard'
import { useConfigHealth, useEvidencePack } from '@/hooks/useRecommend'
import { HealthBadge } from './HealthBadge'
import { RecommendationCard } from './RecommendationCard'
import type { HealthVerdictView } from '@/api/types'

// Feature 018 (US2): the Recommendations panel — the determinism split made
// visible (FR-013). Left of the line: seeded verdicts + evidence-backed
// candidates that render with Claude on OR off (FR-009). Right of the line:
// the advisory narrative, reused from ClaudeReadCard with scope='recommend'
// (analyze U1) so pause/billing/snapshot behavior is inherited, not rebuilt.

const SEVERITY: Record<HealthVerdictView['verdict'], number> = {
  failing: 0,
  degrading: 1,
  insufficient_evidence: 2,
  ok: 3,
}

function citedLine(v: HealthVerdictView): string {
  const i = v.inputs
  const parts = [`${i.window_count} windows`]
  if (i.recent_median_r != null && i.baseline_median_r != null) {
    parts.push(
      `recent ${i.recent_median_r.toFixed(3)} R vs baseline ${i.baseline_median_r.toFixed(3)} R`,
    )
  }
  if (i.gate_passed != null) parts.push(`gate ${i.gate_passed ? 'passed' : 'failed'}`)
  return parts.join(' · ')
}

export function RecommendationsPanel({
  defaultOpen = true,
}: {
  // Accordion: the panel body collapses behind the header chevron.
  defaultOpen?: boolean
} = {}) {
  const [open, setOpen] = useState(defaultOpen)
  const health = useConfigHealth()
  const verdicts = [...(health.data?.verdicts ?? [])].sort(
    (a, b) =>
      SEVERITY[a.verdict] - SEVERITY[b.verdict] ||
      a.config_name.localeCompare(b.config_name),
  )

  // Default selection: the unhealthiest config — the panel exists for it.
  const [chosen, setChosen] = useState<string | null>(null)
  const selectedId = chosen ?? verdicts[0]?.config_id ?? null
  const selected = verdicts.find((v) => v.config_id === selectedId)

  const packQuery = useEvidencePack(selectedId)
  const pack = packQuery.data?.pack
  const candidates = packQuery.data?.candidates ?? []

  return (
    <section className="card" data-testid="recommendations-panel">
      <header className="card-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3 className="card-title">
            <span className="card-accent" style={{ background: 'var(--accent)' }} />
            Recommendations <HelpTooltip helpKey="evidence_pack" />
          </h3>
          <span className="card-sub">
            What the archive's evidence says to try next — hypotheses for the
            validation machinery, never auto-applied
          </span>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-expanded={open}
          aria-label={open ? 'Collapse recommendations' : 'Expand recommendations'}
          onClick={() => setOpen((o) => !o)}
          style={{ marginLeft: 'auto', padding: 4, fontSize: 14, alignSelf: 'flex-start' }}
        >
          {open ? '▾' : '▸'}
        </button>
      </header>

      {!open ? null : verdicts.length === 0 ? (
        <p className="stat-label">
          No configs with out-of-sample history yet — run a walk-forward study
          and health verdicts will appear here.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            {verdicts.map((v) => (
              <div
                key={v.config_id}
                data-testid={`rec-verdict-${v.config_name}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  flexWrap: 'wrap',
                  padding: '6px 10px',
                  borderRadius: 'var(--r-sm)',
                  border:
                    v.config_id === selectedId
                      ? '1px solid var(--border-accent, var(--accent))'
                      : '1px solid var(--border)',
                  background: v.config_id === selectedId ? 'var(--surface-2)' : undefined,
                }}
              >
                <button
                  type="button"
                  aria-label={`select ${v.config_name}`}
                  onClick={() => setChosen(v.config_id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    color: 'var(--text)',
                    fontWeight: 600,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 'var(--fs-sm)',
                  }}
                >
                  {v.config_name}
                </button>
                <HealthBadge verdict={v} />
                <span className="stat-label mono">{citedLine(v)}</span>
              </div>
            ))}
          </div>

          {selected && (
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <div
                className="stat-label"
                data-testid="rec-deterministic-label"
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                seeded · deterministic — same archive, same candidates{' '}
                <HelpTooltip helpKey="recommendation_classes" />
              </div>
              {/* US3: the data-snooping ledger — visible honesty about how
                  many variants this archive has already judged. */}
              {packQuery.data && (
                <div
                  className="stat-label"
                  data-testid="rec-trial-ledger"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                >
                  <span className="mono">
                    {packQuery.data.trial_counts.drafted} drafted ·{' '}
                    {packQuery.data.trial_counts.validated} validated against this archive
                  </span>
                  — every variant tried against the same windows erodes what
                  out-of-sample means <HelpTooltip helpKey="trial_count" />
                </div>
              )}
              {packQuery.isLoading && <p className="stat-label">assembling evidence…</p>}
              {candidates.length > 0 && (
                <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                  {candidates.map((c) => (
                    <RecommendationCard
                      key={`${c.rank}-${c.klass}`}
                      candidate={c}
                      baseConfigName={selected.config_name}
                      analysisId={null}
                    />
                  ))}
                </div>
              )}

              {/* Advisory side of the split — reused contract (U1). */}
              {pack && (
                <ClaudeReadCard
                  scope="recommend"
                  scopeId={selected.config_id}
                  draftBaseConfig={selected.config_name}
                  currentFingerprints={{ pack: pack.snapshot_fingerprint }}
                  metricValues={flattenMetrics({ ...pack, candidates })}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
