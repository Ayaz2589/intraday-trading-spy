import { useState } from 'react'
import { PRESETS, presetRange, type PresetKey } from '@/lib/backfill-presets'
import { estimateWindows, estimateDurationMs, formatMs } from '@/lib/backfill-estimate'
import type { BackfillJobView } from '@/api/bars'

// Data-page redesign: the backfill launcher — preset chips, FROM→TO inputs,
// the pre-launch estimate ("N windows · est 1m 40s"), helper copy, and the
// live progress of the in-flight job (testids preserved from the old panel).

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
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

      {job && (
        <div data-testid="backfill-progress" style={{ marginTop: 8, fontSize: 'var(--fs-sm, 13px)', color: 'var(--text-muted)' }}>
          Status: <strong>{job.status}</strong> · windows {job.windows_done}/{job.windows_total} · {job.bars_added.toLocaleString()} bars added
          {job.status === 'failed' && job.failure_reason && (
            <div style={{ color: 'var(--neg, #b42318)' }}>Failed: {job.failure_reason}</div>
          )}
        </div>
      )}
      {launchError && (
        <div data-testid="backfill-error" style={{ marginTop: 8, color: 'var(--neg, #b42318)', fontSize: 'var(--fs-sm, 13px)' }}>
          Could not start backfill: {launchError}
        </div>
      )}
    </div>
  )
}
