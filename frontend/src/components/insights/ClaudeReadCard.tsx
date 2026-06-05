import { useState } from 'react'
import {
  useClaudeAnalysis,
  useClaudeSettings,
  useGenerateClaudeAnalysis,
  useSetClaudeEnabled,
} from '@/hooks/useInsights'
import { HelpTooltip } from '../help-tooltip'
import { knobLabel } from '@/lib/config-knobs'

// Feature 016 (US3): the advisory Claude narrative — shared by the Insights
// right rail (scope='insights') and the pooled gate panel (scope='study').
// Strictly advisory: every claim cites a payload metric, and the cited value
// renders FROM OUR DATA beside the claim. Analyses are snapshot-pinned;
// Regenerate only makes sense when the underlying data changed.


// Flatten a payload-shaped object into "a.b.0.c" -> primitive value pairs so
// cited evidence_metric paths resolve to the app's own numbers. Capped to
// keep render maps sane; anything uncited simply renders as unverifiable.
export function flattenMetrics(
  obj: unknown,
  prefix = '',
  out: Record<string, string | number> = {},
  depth = 0,
): Record<string, string | number> {
  if (depth > 6 || out === null) return out
  if (obj === null || obj === undefined) return out
  if (typeof obj === 'number' || typeof obj === 'string' || typeof obj === 'boolean') {
    if (Object.keys(out).length < 500) out[prefix] = typeof obj === 'boolean' ? String(obj) : obj
    return out
  }
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flattenMetrics(v, prefix ? `${prefix}.${i}` : String(i), out, depth + 1))
    return out
  }
  if (typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flattenMetrics(v, prefix ? `${prefix}.${k}` : k, out, depth + 1)
    }
  }
  return out
}

function sameFingerprints(
  a?: Record<string, string | null> | null,
  b?: Record<string, string | null> | null,
): boolean {
  if (!a || !b) return false
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) if (a[k] !== b[k]) return false
  return true
}

// Redesign 2026-06-05: a verdict banner DERIVED FROM THE SEEDED GATES (not
// Claude) can headline the card — the page computes it from gate chips.
export type VerdictBanner = {
  tone: 'pass' | 'fail'
  title: string
  text: string
}

export function ClaudeReadCard({
  scope,
  scopeId,
  banner,
  currentFingerprints,
  metricValues = {},
}: {
  scope: 'study' | 'insights'
  scopeId?: string
  banner?: VerdictBanner
  currentFingerprints?: Record<string, string | null> | null
  metricValues?: Record<string, string | number>
}) {
  const settings = useClaudeSettings()
  const stored = useClaudeAnalysis(scope, scopeId)
  const generate = useGenerateClaudeAnalysis(scope, scopeId)
  const setEnabled = useSetClaudeEnabled()

  // Progressive disclosure (declutter, 2026-06-05): findings show the top 3
  // by confidence; risks/experiments collapse behind count headers.
  const [showAllFindings, setShowAllFindings] = useState(false)
  const [risksOpen, setRisksOpen] = useState(false)
  const [experimentsOpen, setExperimentsOpen] = useState(false)

  const cfg = settings.data
  const analysis = stored.data ?? generate.data ?? null
  const upToDate = sameFingerprints(analysis?.analysis?.fingerprints, currentFingerprints ?? undefined)

  // Claude cites paths like "rows[0].pnl_q50"; the flatten map keys are
  // dot-indexed ("rows.0.pnl_q50") — normalize before declaring unverifiable.
  const resolveMetric = (path: string): string | number | undefined => {
    if (path in metricValues) return metricValues[path]
    const normalized = path.replace(/\[(\d+)\]/g, '.$1')
    return normalized in metricValues ? metricValues[normalized] : undefined
  }

  const CONF_RANK = { high: 0, medium: 1, low: 2 } as const
  const CONF_COLOR = {
    high: 'var(--profit)',
    medium: 'var(--border-strong)',
    low: 'var(--text-muted)',
  } as const
  const leafOf = (path: string) => path.replace(/\[(\d+)\]/g, '.$1').split('.').pop() ?? path


  return (
    <section className="card" data-testid="claude-read">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--info)' }} />
          🤖 Claude's read <HelpTooltip helpKey="claude_advisory" />
        </h3>
      </header>

      <p className="stat-label">
        Advisory only — verify every claim against its cited metric. Claude
        never trades or tunes, and unlike the seeded gate numbers this text is
        non-deterministic.
      </p>

      {cfg && !cfg.configured && (
        <p className="stat-label" data-testid="claude-unconfigured">
          Not configured — set ANTHROPIC_API_KEY on the backend to enable
          Claude analysis. Everything else works without it.
        </p>
      )}

      {cfg && cfg.configured && !cfg.claude_enabled && !banner && (
        <div
          data-testid="claude-paused"
          className="stat-label"
          style={{
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-2) var(--sp-3)',
            marginBottom: 'var(--sp-3)',
          }}
        >
          {cfg.disabled_reason === 'billing' ? (
            <>
              ⚠ Claude analysis is paused — your Anthropic API credit ran out.
              Top up at console.anthropic.com → Plans &amp; Billing, then
              re-enable.
            </>
          ) : (
            <>Claude analysis is paused (manually).</>
          )}{' '}
          <button
            type="button"
            className="btn"
            disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate(true)}
          >
            Re-enable
          </button>
        </div>
      )}

      {banner && (
        <div
          data-testid="insights-verdict-banner"
          style={{
            border: `1px solid ${banner.tone === 'pass' ? 'var(--profit)' : 'var(--loss)'}`,
            borderRadius: 'var(--r-md)',
            padding: 'var(--sp-3) var(--sp-4)',
            marginBottom: 'var(--sp-3)',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: banner.tone === 'pass' ? 'var(--profit)' : 'var(--loss)',
            }}
          >
            {banner.tone === 'pass' ? '✓' : '✕'} {banner.title}
          </div>
          <div className="stat-label">
            {banner.text} <span>(derived from the seeded gates — not Claude)</span>
          </div>
        </div>
      )}

      {analysis && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <div>{analysis.analysis.summary}</div>

          {analysis.analysis.findings.length > 0 &&
            (() => {
              const sorted = [...analysis.analysis.findings].sort(
                (a, b) => (CONF_RANK[a.confidence] ?? 3) - (CONF_RANK[b.confidence] ?? 3),
              )
              const visible = showAllFindings ? sorted : sorted.slice(0, 3)
              return (
                <div>
                  <div
                    className="stat-label"
                    style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}
                  >
                    <span>FINDINGS ({sorted.length}) — each tied to a cited metric</span>
                    {sorted.length > 3 && (
                      <button
                        type="button"
                        className="btn"
                        style={{ fontSize: 'var(--fs-xs, 11px)', padding: '0 8px' }}
                        onClick={() => setShowAllFindings((v) => !v)}
                      >
                        {showAllFindings ? 'show top 3' : `show all ${sorted.length}`}
                      </button>
                    )}
                  </div>
                  <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                    <tbody>
                      {visible.map((f, i) => {
                        const value = resolveMetric(f.evidence_metric)
                        return (
                          <tr key={i} data-testid="claude-finding">
                            <td
                              title={f.claim}
                              style={{
                                maxWidth: 0,
                                width: '55%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {f.claim}
                            </td>
                            <td className="mono" title={f.evidence_metric}>
                              {value !== undefined ? (
                                <>
                                  <span className="stat-label">{leafOf(f.evidence_metric)}</span>{' '}
                                  <strong style={{ color: 'var(--info)' }}>← {value}</strong>
                                </>
                              ) : (
                                <span style={{ color: 'var(--loss)' }}>
                                  ⚠ metric not found ({leafOf(f.evidence_metric)})
                                </span>
                              )}
                            </td>
                            <td style={{ width: 74 }}>
                              <span
                                className="mono"
                                style={{
                                  color: CONF_COLOR[f.confidence] ?? 'var(--text-muted)',
                                  border: `1px solid ${CONF_COLOR[f.confidence] ?? 'var(--border-strong)'}`,
                                  borderRadius: 'var(--r-md)',
                                  padding: '0 6px',
                                  textTransform: 'uppercase',
                                  fontSize: 'var(--fs-xs, 10px)',
                                }}
                              >
                                {f.confidence}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )
            })()}

          <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            {analysis.analysis.risks.length > 0 && (
              <div>
                <button
                  type="button"
                  className="stat-label"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setRisksOpen((v) => !v)}
                >
                  {risksOpen ? '▾' : '▸'} RISKS ({analysis.analysis.risks.length})
                </button>
                {risksOpen && (
                  <div data-testid="claude-risks">
                    {analysis.analysis.risks.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                        <span style={{ color: 'var(--loss)' }}>●</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {analysis.analysis.suggested_experiments.length > 0 && (
              <div>
                <button
                  type="button"
                  className="stat-label"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  onClick={() => setExperimentsOpen((v) => !v)}
                >
                  {experimentsOpen ? '▾' : '▸'} EXPERIMENTS TO RUN (
                  {analysis.analysis.suggested_experiments.length})
                </button>
                {experimentsOpen && (
                  <div
                    data-testid="claude-experiments"
                    style={{ display: 'grid', gap: 6, marginTop: 4 }}
                  >
                    {analysis.analysis.suggested_experiments.map((e, i) => (
                      <div
                        key={i}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-md)',
                          padding: 'var(--sp-2) var(--sp-3)',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{e.hypothesis}</div>
                        <div className="stat-label">{e.how_to_test}</div>
                        {(e.suggested_config_changes?.length ?? 0) > 0 && (
                          <div
                            style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}
                          >
                            {e.suggested_config_changes?.map((c, j) => (
                              <span
                                key={j}
                                data-testid="exp-change-chip"
                                className="mono stat-label"
                                title={c.knob_path}
                                style={{
                                  border: '1px solid var(--info)',
                                  borderRadius: 'var(--r-md)',
                                  padding: '0 8px',
                                }}
                              >
                                {knobLabel(c.knob_path)} → {c.value}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div
            data-testid="claude-footer-row"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--sp-3)',
              flexWrap: 'wrap',
            }}
          >
            <div className="stat-label mono" data-testid="claude-footer">
              snapshot {analysis.payload_hash.slice(0, 8)} · {analysis.model} ·{' '}
              {analysis.created_at?.slice(0, 10) ?? '—'}
              {analysis.truncated ? ' · time-series truncated' : ''}{' '}
              <HelpTooltip helpKey="snapshot_pin" />
            </div>
            {cfg && cfg.configured && !cfg.claude_enabled && banner && (
              <div
                data-testid="claude-paused-inline"
                className="stat-label"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}
              >
                {cfg.disabled_reason === 'billing'
                  ? '⚠ paused — API credit ran out; top up, then re-enable'
                  : 'paused (manually)'}
                <button
                  type="button"
                  className="btn"
                  disabled={setEnabled.isPending}
                  onClick={() => setEnabled.mutate(true)}
                >
                  Re-enable
                </button>
              </div>
            )}
            {cfg?.configured && cfg.claude_enabled && (
              <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
                <button
                  type="button"
                  className="btn"
                  disabled={generate.isPending || upToDate}
                  title={upToDate ? 'analysis is pinned to the current data — nothing changed' : undefined}
                  onClick={() => generate.mutate(true)}
                >
                  {generate.isPending ? 'Analyzing…' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={setEnabled.isPending}
                  onClick={() => setEnabled.mutate(false)}
                >
                  Pause
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {generate.isError && (
        <div style={{ color: 'var(--loss)' }}>
          {(generate.error as Error)?.message ?? 'Failed'}
        </div>
      )}

      {/* No stored analysis yet: the primary call-to-action (footer owns the
          actions once an analysis exists). */}
      {cfg?.configured && cfg.claude_enabled && !analysis && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={generate.isPending}
            onClick={() => generate.mutate(false)}
          >
            {generate.isPending ? 'Analyzing…' : "Get Claude's read"}
          </button>
          <button
            type="button"
            className="btn"
            disabled={setEnabled.isPending}
            onClick={() => setEnabled.mutate(false)}
          >
            Pause
          </button>
        </div>
      )}
    </section>
  )
}
