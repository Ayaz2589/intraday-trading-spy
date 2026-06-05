import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import {
  useClaudeAnalysis,
  useClaudeSettings,
  useGenerateClaudeAnalysis,
  useSetClaudeEnabled,
} from '@/hooks/useInsights'
import { HelpTooltip } from '../help-tooltip'
import { knobLabel } from '@/lib/config-knobs'
import { encodeDraft } from '@/lib/draft-config'

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
  // Optional per-config pooled-gate CIs — rendered as number-lines inside the
  // banner so "the CI includes zero" is visible, not just stated.
  gates?: { name: string; low: number; high: number; passed: boolean }[]
}

// De-densify (2026-06-05): one CI number-line per gated config, on a shared
// domain so intervals are comparable. The zero marker is the whole point —
// an interval straddling it IS the failed lockbox precondition.
function GateCiStrips({ gates }: { gates: NonNullable<VerdictBanner['gates']> }) {
  const lo = Math.min(0, ...gates.map((g) => g.low))
  const hi = Math.max(0, ...gates.map((g) => g.high))
  const span = hi - lo || 1
  const pad = span * 0.06
  const x = (v: number) => ((v - (lo - pad)) / (span + 2 * pad)) * 100
  return (
    <div className="ci-list" data-testid="gate-ci-list">
      {gates.map((g) => (
        <div className="ci-row" key={g.name} data-testid="gate-ci-row">
          <span className="ci-name mono">{g.name}</span>
          <span className="ci-val mono">{g.low.toFixed(2)}</span>
          <div className="ci-track">
            <span
              className={`ci-int${g.passed ? ' ci-pass' : ''}`}
              style={{ left: `${x(g.low)}%`, width: `${Math.max(x(g.high) - x(g.low), 1)}%` }}
            />
            <span className="ci-zero" style={{ left: `${x(0)}%` }} title="zero" />
          </div>
          <span className="ci-val mono">{g.high.toFixed(2)}</span>
          <span className="ci-tag">{g.passed ? 'excludes 0' : 'includes 0'}</span>
        </div>
      ))}
    </div>
  )
}

export function ClaudeReadCard({
  scope,
  scopeId,
  banner,
  draftBaseConfig,
  currentFingerprints,
  metricValues = {},
}: {
  scope: 'study' | 'insights'
  scopeId?: string
  banner?: VerdictBanner
  // Feature 017: the config name a drafted experiment should base itself on
  // (study scope: the study's config). Absent -> the panel uses the active.
  draftBaseConfig?: string
  currentFingerprints?: Record<string, string | null> | null
  metricValues?: Record<string, string | number>
}) {
  const navigate = useNavigate()
  const settings = useClaudeSettings()
  const stored = useClaudeAnalysis(scope, scopeId)
  const generate = useGenerateClaudeAnalysis(scope, scopeId)
  const setEnabled = useSetClaudeEnabled()

  // Progressive disclosure (de-densify, 2026-06-05 round 2): findings show
  // the top 3 by confidence; findings/risks/experiments live behind section
  // tabs (one visible at a time); long summaries clamp to two lines.
  const [showAllFindings, setShowAllFindings] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [section, setSection] = useState<'findings' | 'risks' | 'experiments'>('findings')

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
  // Handoff redesign: soft-tinted confidence chips (badge pattern). High
  // keeps the profit color — pass/quality semantics, like gate verdicts.
  const CONF_COLOR = {
    high: 'var(--profit)',
    medium: 'var(--warn)',
    low: 'var(--text-muted)',
  } as const
  const CONF_BG = {
    high: 'var(--profit-soft)',
    medium: 'var(--warn-soft)',
    low: 'var(--surface-3)',
  } as const
  const leafOf = (path: string) => path.replace(/\[(\d+)\]/g, '.$1').split('.').pop() ?? path


  return (
    <section className="card" data-testid="claude-read">
      <header className="card-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3 className="card-title">
            <span className="card-accent" style={{ background: 'var(--warn)' }} />
            🤖 Claude's read <HelpTooltip helpKey="claude_advisory" />
          </h3>
          <span className="card-sub">
            Advisory only — verify every claim against its cited metric. Claude
            never trades or tunes, and unlike the seeded gate numbers this text
            is non-deterministic.
          </span>
        </div>
      </header>

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
            background: 'var(--warn-soft)',
            border: '1px solid color-mix(in srgb, var(--warn) 25%, transparent)',
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
          className={`verdict-banner verdict-${banner.tone}`}
        >
          <div className="verdict-icon" aria-hidden>
            {banner.tone === 'pass' ? '✓' : '✕'}
          </div>
          <div>
            <div className="verdict-title">{banner.title}</div>
            <div className="stat-label">
              {banner.text} <span>(derived from the seeded gates — not Claude)</span>
            </div>
            {banner.gates && banner.gates.length > 0 && <GateCiStrips gates={banner.gates} />}
          </div>
        </div>
      )}

      {analysis && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {(() => {
            const summary = analysis.analysis.summary
            const longSummary = summary.length > 220
            return (
              <div>
                <div
                  data-testid="claude-summary"
                  className={longSummary && !summaryOpen ? 'clamp-2' : undefined}
                >
                  {summary}
                </div>
                {longSummary && (
                  <button
                    type="button"
                    onClick={() => setSummaryOpen((v) => !v)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--accent)',
                      fontWeight: 600,
                      fontSize: 'var(--fs-xs)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {summaryOpen ? 'less' : 'more'}
                  </button>
                )}
              </div>
            )
          })()}

          {(() => {
            const findings = analysis.analysis.findings
            const risks = analysis.analysis.risks
            const experiments = analysis.analysis.suggested_experiments
            const tabs = [
              { key: 'findings' as const, label: 'Findings', count: findings.length },
              { key: 'risks' as const, label: 'Risks', count: risks.length },
              { key: 'experiments' as const, label: 'Experiments', count: experiments.length },
            ].filter((t) => t.count > 0)
            const active = tabs.some((t) => t.key === section) ? section : tabs[0]?.key
            if (tabs.length === 0) return null

            const sorted = [...findings].sort(
              (a, b) => (CONF_RANK[a.confidence] ?? 3) - (CONF_RANK[b.confidence] ?? 3),
            )
            const visible = showAllFindings ? sorted : sorted.slice(0, 3)

            return (
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }} data-testid="claude-tabs">
                  {tabs.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className={`tab${active === t.key ? ' tab-on' : ''}`}
                      onClick={() => setSection(t.key)}
                    >
                      {t.label} <span className="tab-count">{t.count}</span>
                    </button>
                  ))}
                </div>

                {active === 'findings' && (
                  <div>
                    <div
                      className="stat-label"
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}
                    >
                      <span>cited values are computed from our data — not Claude's</span>
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
                    <div className="finding-grid">
                      {visible.map((f, i) => {
                        const value = resolveMetric(f.evidence_metric)
                        return (
                          <div key={i} className="finding-card" data-testid="claude-finding">
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 8,
                              }}
                            >
                              <span
                                className="stat-label mono"
                                title={f.evidence_metric}
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {leafOf(f.evidence_metric)}
                              </span>
                              <span
                                className="badge badge-xs mono"
                                style={{
                                  color: CONF_COLOR[f.confidence] ?? 'var(--text-muted)',
                                  background: CONF_BG[f.confidence] ?? 'var(--surface-3)',
                                  textTransform: 'uppercase',
                                  flexShrink: 0,
                                }}
                              >
                                {f.confidence}
                              </span>
                            </div>
                            {value !== undefined ? (
                              <div className="finding-value">{value}</div>
                            ) : (
                              <div
                                className="finding-value"
                                style={{ color: 'var(--loss)', fontSize: 'var(--fs-sm)' }}
                              >
                                ⚠ metric not found
                              </div>
                            )}
                            <div className="finding-claim clamp-2" title={f.claim}>
                              {f.claim}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {active === 'risks' && (
                  <div data-testid="claude-risks">
                    {risks.map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, padding: '3px 0' }}>
                        <span style={{ color: 'var(--loss)' }}>●</span>
                        <span>{r}</span>
                      </div>
                    ))}
                  </div>
                )}

                {active === 'experiments' && (
                  <div data-testid="claude-experiments" style={{ display: 'grid', gap: 6 }}>
                    <div className="stat-label">
                      hypotheses to test next — drafts are human-gated{' '}
                      <HelpTooltip helpKey="claude_experiment_draft" />
                    </div>
                    {experiments.map((e, i) => (
                      <div
                        key={i}
                        style={{
                          background: 'var(--surface-2)',
                          border: '1px solid var(--border)',
                          borderLeft: '2px solid var(--accent)',
                          borderRadius: 'var(--r-sm)',
                          padding: 'var(--sp-2) var(--sp-3)',
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{e.hypothesis}</div>
                        <div className="stat-label">{e.how_to_test}</div>
                        {(e.suggested_config_changes?.length ?? 0) > 0 && (
                          <div
                            style={{
                              display: 'flex',
                              gap: 6,
                              flexWrap: 'wrap',
                              marginTop: 6,
                              alignItems: 'center',
                            }}
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
                            {/* 017: the draft travels in the URL only — Claude
                                never writes; the operator reviews + creates. */}
                            <button
                              type="button"
                              className="btn"
                              style={{ fontSize: 'var(--fs-xs, 11px)', padding: '1px 10px' }}
                              onClick={() =>
                                navigate({
                                  to: '/strategies',
                                  search: {
                                    draft: encodeDraft({
                                      base_config_name: draftBaseConfig ?? '',
                                      changes: e.suggested_config_changes ?? [],
                                      analysis_id: analysis?.id ?? '',
                                      experiment_index: i,
                                      hypothesis: e.hypothesis,
                                    }),
                                  },
                                })
                              }
                            >
                              Draft config →
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

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
              <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={generate.isPending || upToDate}
                  title={upToDate ? 'analysis is pinned to the current data — nothing changed' : undefined}
                  onClick={() => generate.mutate(true)}
                >
                  ↻ {generate.isPending ? 'Analyzing…' : 'Regenerate'}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
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
