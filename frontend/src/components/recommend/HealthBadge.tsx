import { HelpTooltip } from '../help-tooltip'
import { useConfigHealth } from '@/hooks/useRecommend'
import type { HealthVerdictView } from '@/api/types'

// Feature 018 (US1): the config health verdict badge — deterministic,
// seeded-by-construction, never LLM-derived (FR-001). The badge carries its
// cited inputs (FR-002) so the verdict is checkable where it is shown.

const VARIANT: Record<HealthVerdictView['verdict'], string> = {
  ok: 'badge-profit',
  degrading: 'badge-warn',
  failing: 'badge-loss',
  insufficient_evidence: 'badge-faint',
}

const LABEL: Record<HealthVerdictView['verdict'], string> = {
  ok: 'ok',
  degrading: 'degrading',
  failing: 'failing',
  insufficient_evidence: 'insufficient evidence',
}

function citedInputs(v: HealthVerdictView): string {
  const i = v.inputs
  const parts = [`${i.window_count} OOS windows`]
  if (i.recent_median_r != null) parts.push(`recent median ${i.recent_median_r.toFixed(3)} R`)
  if (i.baseline_median_r != null)
    parts.push(`baseline median ${i.baseline_median_r.toFixed(3)} R`)
  if (i.gate_passed == null) {
    parts.push('no pooled gate yet')
  } else {
    parts.push(
      `gate ${i.gate_passed ? 'passed' : 'failed'} ` +
        `[${i.gate_ci_low?.toFixed(2) ?? '—'}, ${i.gate_ci_high?.toFixed(2) ?? '—'}]`,
    )
  }
  return parts.join(' · ')
}

export function HealthBadge({ verdict }: { verdict: HealthVerdictView }) {
  return (
    <span data-testid="health-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span
        className={`badge badge-xs ${VARIANT[verdict.verdict] ?? 'badge-faint'}`}
        title={citedInputs(verdict)}
      >
        {LABEL[verdict.verdict] ?? verdict.verdict}
      </span>
      <HelpTooltip helpKey="health_verdict" />
    </span>
  )
}

// Connected variant for the Strategies active-config row: fetches all
// verdicts (one cheap call, cached) and renders this config's, or nothing
// when the config has no OOS history yet.
export function ActiveConfigHealthBadge({ configId }: { configId: string }) {
  const health = useConfigHealth()
  const verdict = (health.data?.verdicts ?? []).find((v) => v.config_id === configId)
  if (!verdict) return null
  return <HealthBadge verdict={verdict} />
}
