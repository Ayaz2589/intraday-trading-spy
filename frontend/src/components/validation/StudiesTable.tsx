import { Fragment, useState } from 'react'
import { HelpTooltip } from '../help-tooltip'
import { EmptyState } from '@/components/empty-state'
import { ValidationIcon } from '@/components/nav-icons'
import type { ValidationStudy, WalkForwardResult, SensitivitySurface } from '@/api/types'

// Validation-page redesign: the studies table — stats row, kind chips, config
// column, mini progress bars, status pills, and rows that expand to a detail
// grid with a result summary + link to the full results page.

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  finished: { color: 'var(--pos, #1a7f37)', bg: 'var(--pos-bg, #e6f4ea)' },
  failed: { color: 'var(--neg, #b42318)', bg: 'var(--neg-bg, #fdecea)' },
  running: { color: 'var(--accent, #2563eb)', bg: 'var(--accent-bg, #e8effd)' },
  queued: { color: 'var(--text-muted)', bg: 'var(--surface-2, #eee)' },
}

const KIND_LABEL: Record<string, string> = {
  walk_forward: 'walk-forward',
  sensitivity: 'sensitivity',
}

function started(s: ValidationStudy): string {
  const d = new Date(s.created_at)
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : '—'
}

/** A one-line takeaway from a finished study's result JSON. */
export function resultSummary(s: ValidationStudy): string | null {
  if (s.status !== 'finished' || !s.result) return null
  if (s.kind === 'walk_forward') {
    const r = s.result as WalkForwardResult
    const oos = r.mean_oos?.expectancy_dollars
    const gap = r.mean_gap?.expectancy_r
    if (oos == null) return null
    const gapTxt = gap == null ? '' : ` · IS→OOS gap ${gap >= 0 ? '+' : ''}${gap.toFixed(4)}R`
    return `mean OOS expectancy ${oos >= 0 ? '+' : ''}$${oos.toFixed(2)}/trade${gapTxt}`
  }
  const r = s.result as SensitivitySurface
  if (!r.points) return null
  return `${r.metric_name ?? 'metric'} across ${r.points.length} grid points`
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span>
      <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </span>
      <span className={mono ? 'mono' : undefined} style={{ wordBreak: 'break-all' }}>{value}</span>
    </span>
  )
}

export function StudiesTable({
  studies,
  onRerun,
}: {
  studies: ValidationStudy[]
  // Feature 014 (FR-010): when provided, expanded rows offer "Re-run study".
  onRerun?: (studyId: string) => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (studies.length === 0) {
    return (
      <div data-testid="studies-table">
        <EmptyState
          icon={<ValidationIcon />}
          title="No studies yet"
          text="A walk-forward study is the honesty machinery: parameters chosen in-sample, judged on out-of-sample windows they never saw. Configure one above — its windows feed the gates, Insights, and recommendations."
          hint="Needs cached bars to evaluate — backfill on the Data page first."
        />
      </div>
    )
  }

  const finished = studies.filter((s) => s.status === 'finished').length
  const failed = studies.filter((s) => s.status === 'failed').length
  const evals = studies.reduce((n, s) => n + s.progress_completed, 0)

  return (
    <div data-testid="studies-table" style={{ marginTop: 8 }}>
      <div data-testid="studies-stats" style={{ display: 'flex', gap: 22, marginBottom: 8 }}>
        {(
          [
            [String(studies.length), 'total', 'var(--text)'],
            [String(finished), 'finished', 'var(--pos, #1a7f37)'],
            [String(failed), 'failed', failed > 0 ? 'var(--neg, #b42318)' : 'var(--text-muted)'],
            [evals.toLocaleString(), 'evaluations', 'var(--text)'],
          ] as Array<[string, string, string]>
        ).map(([value, label, color]) => (
          <span key={label}>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 'var(--fs-lg, 17px)', color }}>{value}</span>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {label}
            </span>
          </span>
        ))}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--fs-sm, 13px)' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: 'var(--fs-xs, 11px)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <th style={{ padding: '4px 8px' }}>Started</th>
            <th style={{ padding: '4px 8px' }}>Kind</th>
            <th style={{ padding: '4px 8px' }}>Config</th>
            <th style={{ padding: '4px 8px' }}>Progress</th>
            <th style={{ padding: '4px 8px' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {studies.map((s) => {
            const isOpen = expanded === s.id
            const pct = s.progress_total > 0 ? Math.round((s.progress_completed / s.progress_total) * 100) : 0
            const style = STATUS_STYLE[s.status] ?? STATUS_STYLE.queued
            const summary = resultSummary(s)
            return (
              <Fragment key={s.id}>
                <tr
                  data-testid={`study-row-${s.id}`}
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: isOpen ? 'var(--surface-2, #f6f7f9)' : undefined }}
                >
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <span aria-hidden style={{ color: 'var(--text-muted)', marginRight: 4 }}>{isOpen ? '▾' : '▸'}</span>
                    {started(s)}
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ padding: '1px 8px', borderRadius: 999, fontSize: 'var(--fs-xs, 11px)', fontWeight: 600, border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      {KIND_LABEL[s.kind] ?? s.kind}
                    </span>
                  </td>
                  <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)' }}>{s.config_name ?? '—'}</td>
                  <td style={{ padding: '6px 8px' }}>
                    <div style={{ minWidth: 90 }}>
                      <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
                        {s.progress_completed}/{s.progress_total}
                      </span>
                      <div style={{ height: 3, borderRadius: 999, background: 'var(--surface-2, #eee)', overflow: 'hidden', marginTop: 2 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: s.status === 'failed' ? 'var(--neg, #b42318)' : 'var(--pos, #16a34a)' }} />
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '6px 8px' }}>
                    <span style={{ padding: '1px 8px', borderRadius: 999, fontWeight: 600, fontSize: 'var(--fs-xs, 11px)', color: style.color, background: style.bg }}>
                      {s.status}
                    </span>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5} style={{ padding: '0 8px 12px' }}>
                      <div
                        data-testid={`study-detail-${s.id}`}
                        style={{ padding: '10px 12px', borderRadius: 'var(--r-md, 8px)', border: '1px solid var(--border)', background: 'var(--surface, #fff)', display: 'flex', flexDirection: 'column', gap: 10 }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, fontSize: 'var(--fs-sm, 13px)' }}>
                          <Detail label="Study ID" value={s.id} mono />
                          <Detail label="Kind" value={KIND_LABEL[s.kind] ?? s.kind} />
                          <Detail label="Config" value={s.config_name ?? '—'} mono />
                          <Detail label="Started" value={started(s)} />
                          <Detail label="Evaluations" value={`${s.progress_completed}/${s.progress_total}`} mono />
                          {summary && <Detail label="Result" value={summary} mono />}
                        </div>
                        {s.status === 'failed' && s.failure_reason && (
                          <div
                            data-testid={`study-failure-${s.id}`}
                            style={{ padding: '8px 12px', borderRadius: 'var(--r-md, 8px)', border: '1px solid var(--neg, #b42318)', background: 'var(--neg-bg, #fdecea)', fontSize: 'var(--fs-sm, 13px)' }}
                          >
                            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)', color: 'var(--neg, #b42318)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Failure reason
                            </span>
                            <span className="mono">{s.failure_reason}</span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <a href={`/validation/${s.id}`} style={{ color: 'var(--accent, #2563eb)', fontWeight: 600, fontSize: 'var(--fs-sm, 13px)' }}>
                            Open full results →
                          </a>
                          {onRerun && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onRerun(s.id)
                                }}
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: 'var(--r-sm, 6px)',
                                  border: '1px solid var(--border)',
                                  background: 'var(--surface-2, #f6f7f9)',
                                  color: 'var(--text)',
                                  fontSize: 'var(--fs-xs, 11px)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                ↻ Re-run study
                              </button>
                              <HelpTooltip helpKey="rerun_study" />
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
