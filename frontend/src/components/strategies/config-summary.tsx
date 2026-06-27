import type { CSSProperties } from 'react'
import { HelpTooltip } from '@/components/help-tooltip'
import type { ConfigHighlight } from '@/api/types'

// Feature 025 — the auto-derived, human-readable summary of what a config does
// (computed server-side from params). Rendered ALONGSIDE the technical name,
// never replacing it. `chips` renders the structured highlights as a chip row;
// otherwise the compact one-line `summary` is shown. `help` adds the
// educational HelpTooltip (Principle VI) explaining the summary is derived from
// the config's parameters.

const lineStyle: CSSProperties = {
  fontSize: 'var(--fs-sm)',
  color: 'var(--text-muted)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
}

const chipStyle: CSSProperties = {
  background: 'var(--surface-2, var(--surface))',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
}

export function ConfigSummary({
  summary,
  highlights,
  chips = false,
  help = false,
}: {
  summary?: string
  highlights?: ConfigHighlight[]
  chips?: boolean
  help?: boolean
}) {
  if (!summary) return null

  if (chips && highlights && highlights.length > 0) {
    return (
      <span data-testid="config-summary" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {highlights.map(h => (
          <span key={h.label} className="chip" style={chipStyle}>
            {h.label}&nbsp;
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{h.value}</span>
          </span>
        ))}
        {help && <HelpTooltip helpKey="config_summary" />}
      </span>
    )
  }

  return (
    <span data-testid="config-summary" style={lineStyle}>
      <span>{summary}</span>
      {help && <HelpTooltip helpKey="config_summary" />}
    </span>
  )
}
