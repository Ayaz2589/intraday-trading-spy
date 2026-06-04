import { useEffect, useState } from 'react'
import { PRESETS, presetRange, type PresetKey } from '@/lib/backfill-presets'
import { estimateWindows, estimateDurationMs, formatMs } from '@/lib/backfill-estimate'
import type { BackfillJobView } from '@/api/bars'

// Data-page redesign: the backfill launcher — preset chips, FROM→TO inputs,
// the pre-launch estimate ("N windows · est 1m 40s"), helper copy, and the
// live progress of the in-flight job (testids preserved from the old panel).

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// A finished panel celebrates briefly, then gets out of the way; a failed
// panel stays until dismissed (the job history keeps the record either way).
const SUCCESS_AUTO_DISMISS_MS = 6000

// Prominent live status for the in-flight (or just-completed) backfill:
// animated spinner + progress bar while running; green/red verdict after.
function JobStatusPanel({ job, onDismiss }: { job: BackfillJobView; onDismiss: () => void }) {
  const running = job.status === 'queued' || job.status === 'running'
  const failed = job.status === 'failed'
  const pct = job.windows_total > 0 ? Math.round((job.windows_done / job.windows_total) * 100) : 0

  // Success panels close themselves after a moment; failures wait for the ×.
  useEffect(() => {
    if (job.status !== 'finished') return
    const t = setTimeout(onDismiss, SUCCESS_AUTO_DISMISS_MS)
    return () => clearTimeout(t)
  }, [job.status, job.job_id, onDismiss])

  const accent = failed ? 'var(--neg, #b42318)' : running ? 'var(--accent, #2563eb)' : 'var(--pos, #1a7f37)'
  const tint = failed ? 'var(--neg-bg, #fdecea)' : running ? 'var(--accent-bg, #eef4fe)' : 'var(--pos-bg, #e6f4ea)'

  return (
    <div
      data-testid="backfill-progress"
      style={{
        marginTop: 12,
        padding: '12px 14px',
        borderRadius: 'var(--r-md, 10px)',
        border: `1px solid ${accent}`,
        background: tint,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {running ? (
          <span className="spinner" data-testid="backfill-spinner" aria-hidden />
        ) : (
          <span aria-hidden style={{ color: accent, fontWeight: 700, fontSize: 'var(--fs-base, 15px)' }}>
            {failed ? '✕' : '✓'}
          </span>
        )}
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>
          {running
            ? `Backfilling ${job.range_start} → ${job.range_end}…`
            : failed
              ? 'Backfill failed'
              : 'Backfill complete'}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 'var(--fs-sm, 13px)', color: accent, fontWeight: 700 }}>
          {running ? `${pct}%` : `+${job.bars_added.toLocaleString()} bars`}
        </span>
        {!running && (
          <button
            type="button"
            aria-label="dismiss"
            onClick={onDismiss}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: 'var(--fs-base, 15px)',
              lineHeight: 1,
              padding: '0 2px',
            }}
          >
            ×
          </button>
        )}
      </div>

      <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${failed ? 100 : pct}%`,
            height: '100%',
            borderRadius: 999,
            background: accent,
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <span className="mono">windows {job.windows_done}/{job.windows_total}</span>
        <span className="mono">{job.bars_added.toLocaleString()} bars added</span>
        {failed && job.failure_reason && (
          <span className="mono" style={{ color: 'var(--neg, #b42318)' }}>{job.failure_reason}</span>
        )}
      </div>
    </div>
  )
}

export function BackfillCard({
  onLaunch,
  busy,
  job,
  launchError,
  jobs,
  hasGaps,
}: {
  onLaunch: (start: string, end: string) => void
  busy: boolean
  job: BackfillJobView | undefined
  launchError: string | null
  jobs: BackfillJobView[]
  hasGaps: boolean | null // null = unknown (stats unavailable)
}) {
  const today = todayISO()
  const full = presetRange('full', today)
  const [start, setStart] = useState(full.start)
  const [end, setEnd] = useState(full.end)
  const [preset, setPreset] = useState<PresetKey | null>('full')
  const [dismissedJobId, setDismissedJobId] = useState<string | null>(null)

  const windows = estimateWindows(start, end)
  const estMs = estimateDurationMs(jobs, windows)

  function pick(key: PresetKey) {
    const r = presetRange(key, todayISO())
    setStart(r.start)
    setEnd(r.end)
    setPreset(key)
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        {PRESETS.map((p) => {
          const active = preset === p.key
          return (
            <button
              key={p.key}
              type="button"
              data-testid={`preset-${p.key}`}
              onClick={() => pick(p.key)}
              style={{
                padding: '3px 12px',
                borderRadius: 999,
                fontSize: 'var(--fs-xs, 11px)',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent, #2563eb)' : 'var(--border)'}`,
                background: active ? 'var(--accent-bg, #e8effd)' : 'var(--surface, #fff)',
                color: active ? 'var(--accent, #2563eb)' : 'var(--text-muted)',
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        <label style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          From{' '}
          <input
            data-testid="backfill-start"
            type="date"
            value={start}
            max={end}
            onChange={(e) => {
              setStart(e.target.value)
              setPreset(null)
            }}
            style={{ display: 'block', fontFamily: 'var(--mono)' }}
          />
        </label>
        <span aria-hidden style={{ color: 'var(--accent, #2563eb)', paddingBottom: 4 }}>→</span>
        <label style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          To{' '}
          <input
            data-testid="backfill-end"
            type="date"
            value={end}
            max={todayISO()}
            onChange={(e) => {
              setEnd(e.target.value)
              setPreset(null)
            }}
            style={{ display: 'block', fontFamily: 'var(--mono)' }}
          />
        </label>

        <div data-testid="backfill-estimate" style={{ fontSize: 'var(--fs-sm, 13px)' }}>
          <strong className="mono" style={{ fontSize: 'var(--fs-base, 15px)' }}>{windows}</strong> windows
          <span style={{ display: 'block', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
            {estMs != null ? `est. ${formatMs(estMs)} · ` : ''}cached sessions skipped
          </span>
        </div>

        <button
          data-testid="backfill-start-btn"
          type="button"
          disabled={busy}
          onClick={() => onLaunch(start, end)}
          style={{
            marginLeft: 'auto',
            padding: '7px 16px',
            borderRadius: 'var(--r-md, 8px)',
            border: '1px solid var(--border-strong, #ccc)',
            background: busy ? 'var(--surface-2, #eee)' : 'var(--accent, #2563eb)',
            color: busy ? 'var(--text-muted)' : '#fff',
            fontWeight: 600,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Backfilling…' : '↻ Backfill history'}
        </button>
      </div>

      <p style={{ marginTop: 8, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
        Already-cached sessions are skipped — only gaps are fetched from <strong>alpaca</strong>, falling back to{' '}
        <strong>yfinance</strong>.
        {hasGaps === false && ' The cache currently has no gaps, so a full backfill will add few or no bars.'}
      </p>

      {job && job.job_id !== dismissedJobId && (
        <JobStatusPanel job={job} onDismiss={() => setDismissedJobId(job.job_id)} />
      )}
      {launchError && (
        <div data-testid="backfill-error" style={{ marginTop: 8, color: 'var(--neg, #b42318)', fontSize: 'var(--fs-sm, 13px)' }}>
          Could not start backfill: {launchError}
        </div>
      )}
    </div>
  )
}
