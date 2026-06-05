import type { SensitivitySurface, ValidationStudy, WalkForwardResult } from '@/api/types'

// Feature 014 (FR-011): study detail stat cards. Walk-forward: mean OOS
// expectancy, IS→OOS gap, windows, OOS trades. Sensitivity: metric, grid
// points, best point. Renders nothing without a finished result.

const cardStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 160,
  padding: '12px 14px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md, 10px)',
  background: 'var(--surface, #fff)',
}

const labelStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xs, 11px)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
}

const valueStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xl, 22px)',
  fontWeight: 700,
  fontFamily: 'var(--mono)',
  margin: '2px 0',
}

const hintStyle: React.CSSProperties = {
  fontSize: 'var(--fs-xs, 11px)',
  color: 'var(--text-muted)',
}

function Card({ label, value, hint, color }: { label: string; value: string; hint: string; color?: string }) {
  return (
    <div style={cardStyle}>
      <div style={labelStyle}>{label}</div>
      <div style={{ ...valueStyle, color }}>{value}</div>
      <div style={hintStyle}>{hint}</div>
    </div>
  )
}

const signed = (v: number, fmt: (n: number) => string) => `${v >= 0 ? '+' : '-'}${fmt(Math.abs(v))}`

export function StudyStatCards({ study }: { study: ValidationStudy }) {
  if (study.status !== 'finished' || !study.result) return null

  let cards: React.ReactNode = null

  if (study.kind === 'walk_forward' && 'windows' in (study.result as object)) {
    const r = study.result as WalkForwardResult
    const oos = r.mean_oos?.expectancy_dollars
    const gap = r.mean_gap?.expectancy_r
    const oosTrades = (r.windows ?? []).reduce((n, w) => n + (w.out_of_sample?.total_trades ?? 0), 0)
    cards = (
      <>
        <Card
          label="Mean OOS expectancy"
          value={oos == null ? '—' : signed(oos, (n) => `$${n.toFixed(2)}`)}
          hint="per trade, out-of-sample"
          color={oos != null && oos < 0 ? 'var(--neg, #b42318)' : 'var(--pos, #1a7f37)'}
        />
        <Card
          label="IS→OOS gap"
          value={gap == null ? '—' : `${signed(gap, (n) => n.toFixed(4))}R`}
          hint="small gap = generalizes"
          color={gap != null && gap < 0 ? 'var(--neg, #b42318)' : undefined}
        />
        <Card label="Windows" value={String((r.windows ?? []).length)} hint={`${r.mode} walk-forward`} />
        <Card label="OOS trades" value={oosTrades.toLocaleString()} hint="across all windows" />
      </>
    )
  } else if (study.kind === 'sensitivity' && 'points' in (study.result as object)) {
    const r = study.result as SensitivitySurface
    const points = r.points ?? []
    const best = points.reduce<(typeof points)[number] | null>(
      (acc, p) => (p.metric != null && (acc?.metric == null || p.metric > acc.metric) ? p : acc),
      null,
    )
    const bestCoords = best
      ? Object.entries(best.coords).map(([k, v]) => `${k.split('.').pop()}=${v}`).join(' · ')
      : ''
    cards = (
      <>
        <Card label="Metric" value={r.metric_name} hint={`segment ${r.segment}`} />
        <Card label="Grid points" value={String(points.length)} hint={r.knobs.join(' × ')} />
        <Card
          label="Best point"
          value={best?.metric == null ? '—' : best.metric.toFixed(2)}
          hint={bestCoords || 'no defined metric'}
          color="var(--pos, #1a7f37)"
        />
      </>
    )
  }

  if (!cards) return null

  return (
    <div data-testid="study-stat-cards" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {cards}
    </div>
  )
}
