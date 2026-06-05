import {
  useClaudeAnalysis,
  useClaudeSettings,
  useGenerateClaudeAnalysis,
  useSetClaudeEnabled,
} from '@/hooks/useInsights'
import { HelpTooltip } from '../help-tooltip'

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

export function ClaudeReadCard({
  scope,
  scopeId,
  currentFingerprints,
  metricValues = {},
}: {
  scope: 'study' | 'insights'
  scopeId?: string
  currentFingerprints?: Record<string, string | null> | null
  metricValues?: Record<string, string | number>
}) {
  const settings = useClaudeSettings()
  const stored = useClaudeAnalysis(scope, scopeId)
  const generate = useGenerateClaudeAnalysis(scope, scopeId)
  const setEnabled = useSetClaudeEnabled()

  const cfg = settings.data
  const analysis = stored.data ?? generate.data ?? null
  const upToDate = sameFingerprints(analysis?.analysis?.fingerprints, currentFingerprints ?? undefined)

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
        never trades or tunes.
      </p>

      {cfg && !cfg.configured && (
        <p className="stat-label" data-testid="claude-unconfigured">
          Not configured — set ANTHROPIC_API_KEY on the backend to enable
          Claude analysis. Everything else works without it.
        </p>
      )}

      {cfg && cfg.configured && !cfg.claude_enabled && (
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

      {analysis && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <div>{analysis.analysis.summary}</div>

          {analysis.analysis.findings.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>claim</th>
                  <th>cited metric</th>
                  <th>conf.</th>
                </tr>
              </thead>
              <tbody>
                {analysis.analysis.findings.map((f, i) => (
                  <tr key={i}>
                    <td>{f.claim}</td>
                    <td className="mono">
                      {f.evidence_metric in metricValues ? (
                        <>
                          {f.evidence_metric}: <strong>{metricValues[f.evidence_metric]}</strong>
                        </>
                      ) : (
                        <span style={{ color: 'var(--loss)' }}>
                          ⚠ metric not found in payload ({f.evidence_metric})
                        </span>
                      )}
                    </td>
                    <td>{f.confidence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {analysis.analysis.risks.length > 0 && (
            <div className="stat-label">
              Risks: {analysis.analysis.risks.join(' · ')}
            </div>
          )}

          {analysis.analysis.suggested_experiments.length > 0 && (
            <div className="stat-label">
              Experiments to run:{' '}
              {analysis.analysis.suggested_experiments
                .map((e) => `${e.hypothesis} (${e.how_to_test})`)
                .join(' · ')}
            </div>
          )}

          <div className="stat-label mono" data-testid="claude-footer">
            snapshot {analysis.payload_hash.slice(0, 8)} · {analysis.model} ·{' '}
            {analysis.created_at?.slice(0, 10) ?? '—'}
            {analysis.truncated ? ' · time-series truncated' : ''}{' '}
            <HelpTooltip helpKey="snapshot_pin" />
          </div>
        </div>
      )}

      {generate.isError && (
        <div style={{ color: 'var(--loss)' }}>
          {(generate.error as Error)?.message ?? 'Failed'}
        </div>
      )}

      {cfg?.configured && cfg.claude_enabled && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', marginTop: 'var(--sp-3)' }}>
          {!analysis ? (
            <button
              type="button"
              className="btn btn-primary"
              disabled={generate.isPending}
              onClick={() => generate.mutate(false)}
            >
              {generate.isPending ? 'Analyzing…' : "Get Claude's read"}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              disabled={generate.isPending || upToDate}
              title={upToDate ? 'analysis is pinned to the current data — nothing changed' : undefined}
              onClick={() => generate.mutate(true)}
            >
              {generate.isPending ? 'Analyzing…' : 'Regenerate'}
            </button>
          )}
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
