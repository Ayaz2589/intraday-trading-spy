import { useState } from 'react'
import { useCreateConfig } from '@/hooks/useConfigs'
import { get, knobLabel } from '@/lib/config-knobs'
import { HelpTooltip } from '../help-tooltip'
import type { Config } from '@/api/types'
import type { DraftConfig } from '@/lib/draft-config'

// Feature 017 (US2): the badged, pre-filled create panel for a Claude-drafted
// experiment. Constitution II: this panel is the ONLY place a draft becomes a
// config, and only via the operator's explicit Create on the standard
// endpoint — Claude never writes. Dismiss leaves no trace (URL-only draft).

function setPath(obj: Record<string, unknown>, path: string[], value: number): void {
  let cur = obj
  for (const k of path.slice(0, -1)) {
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}
    cur = cur[k] as Record<string, unknown>
  }
  cur[path[path.length - 1]] = value
}

function suggestName(base: string, experimentIndex: number, taken: Set<string>): string {
  let n = experimentIndex + 1
  while (taken.has(`${base}-exp-${n}`)) n += 1
  return `${base}-exp-${n}`
}

export function DraftConfigPanel({
  draft,
  configs,
  activeConfig,
  onDismiss,
}: {
  draft: DraftConfig
  configs: Config[]
  activeConfig: Config | undefined
  onDismiss(): void
}) {
  const cited = configs.find((c) => c.name === draft.base_config_name)
  const base = cited ?? activeConfig
  const create = useCreateConfig()
  const [name, setName] = useState(() =>
    suggestName(
      base?.name ?? draft.base_config_name ?? 'config',
      draft.experiment_index,
      new Set(configs.map((c) => c.name)),
    ),
  )

  if (!base) {
    return (
      <section className="card" data-testid="draft-config-panel">
        <p className="stat-label">
          The draft's base config "{draft.base_config_name}" no longer exists
          and no active config is available — create a config first.
        </p>
        <button type="button" className="btn" onClick={onDismiss}>
          Dismiss
        </button>
      </section>
    )
  }

  const provenance =
    `Drafted from Claude analysis ${draft.analysis_id.slice(0, 8)} · ` +
    `experiment ${draft.experiment_index + 1}: ${draft.hypothesis.slice(0, 120)}`

  const mergedParams = () => {
    const merged = JSON.parse(JSON.stringify(base.params ?? {})) as Record<string, unknown>
    for (const c of draft.changes) setPath(merged, c.knob_path.split('.'), c.value)
    return merged
  }

  return (
    <section
      className="card"
      data-testid="draft-config-panel"
      style={{ border: '1px solid var(--info)' }}
    >
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--info)' }} />
          Draft config from Claude's experiment <HelpTooltip helpKey="claude_experiment_draft" />
        </h3>
        <span
          className="stat-label mono"
          style={{
            border: '1px solid var(--info)',
            borderRadius: 'var(--r-md)',
            padding: '0 8px',
            color: 'var(--info)',
          }}
        >
          review before creating — Claude suggests, you create
        </span>
      </header>

      <p className="stat-label">{provenance}</p>

      {!cited && (
        <p className="stat-label" style={{ color: 'var(--loss)' }}>
          The cited base config "{draft.base_config_name}" no longer exists —
          using the active config "{base.name}" instead.
        </p>
      )}

      <table className="data-table" style={{ margin: 'var(--sp-3) 0' }}>
        <thead>
          <tr>
            <th>knob</th>
            <th>base ({base.name})</th>
            <th>suggested</th>
          </tr>
        </thead>
        <tbody>
          {draft.changes.map((c) => {
            const baseValue = get(base.params, c.knob_path.split('.'))
            return (
              <tr key={c.knob_path} data-testid={`draft-row-${c.knob_path}`}>
                <td title={c.knob_path}>{knobLabel(c.knob_path)}</td>
                <td className="mono">{baseValue == null ? 'default' : String(baseValue)}</td>
                <td className="mono">
                  <strong style={{ color: 'var(--info)' }}>{c.value}</strong>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="stat-label" htmlFor="draft-config-name">
          config name
        </label>
        <input
          id="draft-config-name"
          aria-label="config name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={create.isPending || !name.trim()}
          onClick={() =>
            create.mutate(
              {
                name: name.trim(),
                source: 'scratch',
                params: mergedParams(),
                description: provenance,
              },
              { onSuccess: () => onDismiss() },
            )
          }
        >
          {create.isPending ? 'Creating…' : 'Create'}
        </button>
        <button type="button" className="btn" onClick={onDismiss}>
          Dismiss
        </button>
        {create.isError && (
          <span style={{ color: 'var(--loss)' }}>
            {(create.error as Error)?.message ?? 'Failed'}
          </span>
        )}
      </div>
    </section>
  )
}
