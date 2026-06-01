import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRun } from '@/hooks/useRun'
import { useRunBars } from '@/hooks/useRunBars'
import { useRunManifest } from '@/hooks/useRunManifest'
import { useRunSignals, flattenSignals } from '@/hooks/useRunSignals'
import { useRunTrades, flattenTrades } from '@/hooks/useRunTrades'
import { PriceChart } from '@/components/price-chart'
import { SessionPicker } from '@/components/session-picker'
import { JournalTable } from '@/components/journal-table'
import { buildMarkers } from '@/components/journal-markers'
import { Skeleton } from '@/components/skeleton'
import { humanize } from '@/lib/format'
import { RunSummaryCards } from './RunSummaryCards'
import { HelpTooltip } from '@/components/help-tooltip'
import type { Bar, Run, Signal, Trade, UUID } from '@/api/types'
import type {
  BarView,
  JournalFilter,
  JournalRowView,
} from '@/api/legacy-types'

interface Props {
  runId: UUID
  defaultTab?: 'summary' | 'trades' | 'signals' | 'journal'
  onTabChange?(tab: 'summary' | 'trades' | 'signals' | 'journal'): void
}

const sessionDate = (iso: string) => iso.slice(0, 10)

export function RunDetail({ runId }: Props) {
  const runQuery = useRun(runId)
  const manifestQuery = useRunManifest(runId)
  const barsQuery = useRunBars(runId)
  const signalsQuery = useRunSignals(runId)
  const tradesQuery = useRunTrades(runId)
  const queryClient = useQueryClient()

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [showRejections, setShowRejections] = useState(false)
  const [filter, setFilter] = useState<JournalFilter>('all')

  // Child queries (bars/signals/trades) don't poll on their own. When the run
  // transitions queued/running → finished, force a refetch so the skeletons
  // swap out for real data immediately instead of waiting for the next mount.
  const runStatus = runQuery.data?.status
  useEffect(() => {
    if (runStatus === 'finished') {
      queryClient.invalidateQueries({ queryKey: ['runs', 'detail', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs', 'signals', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs', 'trades', runId] })
      queryClient.invalidateQueries({ queryKey: ['runs', 'journal', runId] })
    }
  }, [runStatus, runId, queryClient])

  const bars: BarView[] = useMemo(
    () => (barsQuery.data?.bars ?? []).map(adaptBar),
    [barsQuery.data]
  )

  const signals: Signal[] = useMemo(
    () => flattenSignals(signalsQuery.data),
    [signalsQuery.data]
  )

  const trades: Trade[] = useMemo(
    () => flattenTrades(tradesQuery.data),
    [tradesQuery.data]
  )

  const journalRows: JournalRowView[] = useMemo(
    () => buildJournalRows(signals, trades),
    [signals, trades]
  )

  const rejectionBreakdown = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of signals) {
      if (s.executed) continue
      const reason = s.rejection_reason ?? 'other'
      out[reason] = (out[reason] ?? 0) + 1
    }
    return out
  }, [signals])

  const rejectedTotal = useMemo(
    () => Object.values(rejectionBreakdown).reduce((a, b) => a + b, 0),
    [rejectionBreakdown]
  )

  const sessions = useMemo(
    () => Array.from(new Set(bars.map(b => sessionDate(b.timestamp)))),
    [bars]
  )

  useEffect(() => {
    if (sessions.length > 0 && !selectedSession) setSelectedSession(sessions[0])
  }, [sessions, selectedSession])

  if (runQuery.isLoading) {
    return (
      <div className="p-8" data-testid="run-detail-loading">
        Loading run…
      </div>
    )
  }

  if (runQuery.isError) {
    return (
      <div className="p-8" data-testid="run-detail-not-found">
        <h2 className="text-lg font-semibold">Run not found</h2>
        <p className="text-sm text-muted-foreground">
          This run doesn't exist or belongs to a different user.
        </p>
      </div>
    )
  }

  const run = runQuery.data
  if (!run) return null

  const isPending = run.status === 'queued' || run.status === 'running'

  return (
    <div className="content" data-testid="run-detail" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <RunHeader run={run} />
      {isPending ? (
        <PendingSkeleton status={run.status} />
      ) : (
        <>
          <RunSummaryCards run={run} />
          {manifestQuery.data && (
            <ConfigStrip
              params={manifestQuery.data.config.params}
              strategyName={manifestQuery.data.strategy.display_name}
            />
          )}
          <RejectionStrip
            breakdown={rejectionBreakdown}
            total={rejectedTotal}
            show={showRejections}
            onToggle={() => setShowRejections(v => !v)}
          />
          {bars.length === 0 ? (
            <div className="p-8 text-sm text-muted-foreground">
              {barsQuery.isLoading ? 'Loading bars…' : 'No bar data available for this run.'}
            </div>
          ) : (
            <RunChart
              bars={bars}
              journal={journalRows}
              sessions={sessions}
              selectedSession={selectedSession}
              onSessionChange={setSelectedSession}
              showRejections={showRejections}
              onToggleRejections={() => setShowRejections(v => !v)}
            />
          )}
        </>
      )}
      {!isPending && (
        <JournalTable
          rows={journalRows}
          filter={filter}
          onFilterChange={setFilter}
        />
      )}
    </div>
  )
}

function PendingSkeleton({ status }: { status: 'queued' | 'running' }) {
  return (
    <div data-testid="run-pending" style={{ display: 'grid', gap: 12 }}>
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 'var(--r-sm)',
          background: 'color-mix(in srgb, var(--info, #2563eb) 14%, transparent)',
          color: 'var(--info, #2563eb)',
          fontSize: 'var(--fs-xs)',
          fontWeight: 600,
          width: 'fit-content',
        }}
      >
        <Spinner />
        {status === 'queued' ? 'Queued — waiting to start' : 'Running backtest…'}
      </div>
      {/* Summary cards row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 'var(--r-md)' }}>
            <Skeleton width="50%" height={10} />
            <div style={{ marginTop: 8 }}>
              <Skeleton width="70%" height={18} />
            </div>
          </div>
        ))}
      </div>
      {/* Config strip placeholder */}
      <Skeleton width="100%" height={36} rounded="sm" />
      {/* Chart placeholder */}
      <div
        style={{
          padding: 12,
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} width={42} height={20} rounded="sm" />
          ))}
        </div>
        <Skeleton width="100%" height={420} />
      </div>
      {/* Journal placeholder */}
      <div style={{ display: 'grid', gap: 6 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} width="100%" height={20} />
        ))}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        border: '1.5px solid currentColor',
        borderRightColor: 'transparent',
        display: 'inline-block',
        animation: 'spin 700ms linear infinite',
      }}
    />
  )
}

// ---------- Adapters ----------

function computeSessionVwap(sessionBars: BarView[]): { time: string; value: number }[] {
  let cumPV = 0
  let cumV = 0
  const out: { time: string; value: number }[] = []
  for (const b of sessionBars) {
    const typical = (b.high + b.low + b.close) / 3
    cumPV += typical * b.volume
    cumV += b.volume
    if (cumV > 0) out.push({ time: b.timestamp, value: cumPV / cumV })
  }
  return out
}

function computeOpeningRange(
  sessionBars: BarView[],
  windowMinutes: number,
): { high: number; low: number; from: string; to: string } | null {
  if (sessionBars.length === 0) return null
  const firstTs = new Date(sessionBars[0].timestamp).getTime()
  const cutoffMs = firstTs + windowMinutes * 60_000
  const orBars = sessionBars.filter(b => new Date(b.timestamp).getTime() < cutoffMs)
  if (orBars.length === 0) return null
  return {
    high: Math.max(...orBars.map(b => b.high)),
    low: Math.min(...orBars.map(b => b.low)),
    from: sessionBars[0].timestamp,
    to: sessionBars[sessionBars.length - 1].timestamp,
  }
}

function adaptBar(b: Bar): BarView {
  return {
    symbol: 'SPY',
    timestamp: b.timestamp,
    open: Number(b.open),
    high: Number(b.high),
    low: Number(b.low),
    close: Number(b.close),
    volume: b.volume,
  }
}

function buildJournalRows(signals: Signal[], trades: Trade[]): JournalRowView[] {
  const rows: JournalRowView[] = []
  let seq = 0

  for (const s of signals) {
    const ctx = (s.indicator_context ?? {}) as Record<string, unknown>
    const num = (v: unknown) => (v == null ? null : Number(v))
    rows.push({
      row_seq: seq++,
      timestamp: s.emitted_at,
      status: s.executed ? 'executed' : 'rejected',
      setup: null,
      direction: 'long',
      planned_entry: Number(s.entry_price),
      stop_loss: s.stop_price == null ? null : Number(s.stop_price),
      take_profit: s.target_price == null ? null : Number(s.target_price),
      quantity: null,
      planned_risk_dollars: null,
      actual_entry: s.executed ? Number(s.entry_price) : null,
      actual_exit: null,
      exit_reason: null,
      realized_pnl: null,
      realized_r: null,
      vwap: num(ctx.vwap),
      or_high: num(ctx.opening_range_high),
      or_low: num(ctx.opening_range_low),
      distance_from_vwap_pct: null,
      prior_bar_close: null,
      reason: s.reason_text,
      rejection_check: s.rejection_reason,
      same_bar_tiebreak: null,
    })
  }

  for (const t of trades) {
    const exitReason = mapExitReason(t.exit_reason)
    rows.push({
      row_seq: seq++,
      timestamp: t.exit_at,
      status: exitReason === 'force_flat' ? 'force_flat' : 'exited',
      setup: null,
      direction: 'long',
      planned_entry: Number(t.entry_price),
      stop_loss: Number(t.stop_price),
      take_profit: Number(t.target_price),
      quantity: Number(t.quantity),
      planned_risk_dollars: null,
      actual_entry: Number(t.entry_price),
      actual_exit: Number(t.exit_price),
      exit_reason: exitReason,
      realized_pnl: Number(t.pnl),
      realized_r: Number(t.r_multiple),
      vwap: null,
      or_high: null,
      or_low: null,
      distance_from_vwap_pct: null,
      prior_bar_close: null,
      reason: '',
      rejection_check: null,
      same_bar_tiebreak: null,
    })
  }

  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return rows
}

function mapExitReason(r: Trade['exit_reason']): JournalRowView['exit_reason'] {
  if (r === 'stop' || r === 'target' || r === 'force_flat') return r
  return 'force_flat'
}

// ---------- Sub-components ----------

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

function formatDateRange(start: string, end: string): string {
  if (start === end) return formatDate(start)
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd}–${ed}, ${sy}`
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} → ${MONTHS[em - 1]} ${ed}, ${sy}`
  return `${formatDate(start)} → ${formatDate(end)}`
}

const STATUS_TONE: Record<Run['status'], string> = {
  queued: 'var(--muted, #9ca3af)',
  running: 'var(--info, #2563eb)',
  finished: 'var(--success, #16a34a)',
  failed: 'var(--danger, #dc2626)',
}

function RunHeader({ run }: { run: Run }) {
  const dateRange = formatDateRange(run.range_start, run.range_end)
  const trades = run.summary.total_trades
  return (
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1
          className="text-xl font-semibold"
          style={{ margin: 0, display: 'flex', alignItems: 'baseline', gap: 8 }}
        >
          {dateRange} backtest
          <span
            data-testid="run-detail-status"
            data-status={run.status}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--fs-xs)',
              fontWeight: 600,
              color: STATUS_TONE[run.status],
              textTransform: 'capitalize',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: STATUS_TONE[run.status],
              }}
            />
            {run.status}
          </span>
        </h1>
        <span
          className="text-xs text-muted-foreground"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--fs-xs)',
          }}
        >
          {trades} {trades === 1 ? 'trade' : 'trades'} · {run.bar_count} bars ·
          <code className="mono" style={{ opacity: 0.7 }}>
            {run.id.slice(0, 8)}
          </code>
          <HelpTooltip helpKey="run_status" />
        </span>
      </div>
      {run.status === 'failed' && run.failure_reason && (
        <div
          data-testid="run-detail-failure-reason"
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--r-sm)',
            background: 'color-mix(in srgb, var(--danger, #dc2626) 12%, transparent)',
            color: 'var(--danger, #dc2626)',
            fontSize: 'var(--fs-xs)',
            border: '1px solid color-mix(in srgb, var(--danger, #dc2626) 30%, transparent)',
          }}
        >
          <strong style={{ fontWeight: 600 }}>Run failed:</strong> {run.failure_reason}
        </div>
      )}
    </header>
  )
}

function RejectionStrip({
  breakdown,
  total,
  show,
  onToggle,
}: {
  breakdown: Record<string, number>
  total: number
  show: boolean
  onToggle(): void
}) {
  const items = Object.entries(breakdown).sort(([, a], [, b]) => b - a)
  if (total === 0) return null
  return (
    <section
      data-testid="rejection-strip"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 14px',
        padding: '8px 12px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        fontSize: 'var(--fs-xs)',
      }}
    >
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: 'rgba(245, 158, 11, 0.12)',
          color: 'var(--warn, #d97706)',
          fontWeight: 600,
        }}
      >
        {total} rejected
      </span>
      {items.map(([reason, count]) => (
        <span key={reason} style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: 'var(--text-muted)' }}>{humanize(reason)}</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {count}
          </span>
        </span>
      ))}
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={show}
        className={`btn btn-ghost btn-sm${show ? ' is-on' : ''}`}
        style={{ marginLeft: 'auto', fontSize: 'var(--fs-xs)' }}
      >
        {show ? 'Hide on chart' : 'Show on chart'}
      </button>
    </section>
  )
}

function ConfigStrip({
  params,
  strategyName,
}: {
  params: Record<string, unknown>
  strategyName: string
}) {
  const risk = (params.risk as Record<string, unknown>) ?? {}
  const strategy = (params.strategy as Record<string, unknown>) ?? {}
  const vwap = (strategy.vwap_pullback as Record<string, unknown>) ?? {}
  const stop = (vwap.stop as Record<string, unknown>) ?? {}
  const target = (vwap.target as Record<string, unknown>) ?? {}
  const or = (strategy.opening_range as Record<string, unknown>) ?? {}

  const items: Array<{ label: string; value: string }> = []
  const push = (label: string, value: unknown, format: (v: unknown) => string = String) => {
    if (value == null) return
    items.push({ label, value: format(value) })
  }
  push('Account', risk.account_value, v => `$${Number(v).toLocaleString()}`)
  push('Risk/Trade', risk.max_risk_per_trade_pct, v => `${v}%`)
  push('Cap', risk.max_position_value_pct, v => `${v}%`)
  push('OR', or.minutes, v => `${v}min`)
  push('R:R', target.risk_reward)
  push('Stop', stop.buffer_pct, v => `${v}%`)
  push('Max dist VWAP', vwap.max_distance_from_vwap_pct, v => `${v}%`)
  push('Max consec losses', risk.max_consecutive_losses)

  if (items.length === 0) return null

  return (
    <section
      data-testid="config-strip"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '8px 14px',
        padding: '8px 12px',
        borderRadius: 'var(--r-sm)',
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        fontSize: 'var(--fs-xs)',
      }}
    >
      <span
        style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: 'var(--accent-soft, rgba(37,99,235,0.12))',
          color: 'var(--accent, #2563eb)',
          fontWeight: 600,
        }}
      >
        {strategyName}
      </span>
      {items.map(it => (
        <span key={it.label} style={{ display: 'inline-flex', gap: 4, alignItems: 'baseline' }}>
          <span style={{ color: 'var(--text-muted)' }}>{it.label}</span>
          <span className="mono" style={{ fontWeight: 600 }}>
            {it.value}
          </span>
        </span>
      ))}
    </section>
  )
}

function RunChart({
  bars,
  journal,
  sessions,
  selectedSession,
  onSessionChange,
  showRejections,
  onToggleRejections,
}: {
  bars: BarView[]
  journal: JournalRowView[]
  sessions: string[]
  selectedSession: string | null
  onSessionChange(s: string): void
  showRejections: boolean
  onToggleRejections(): void
}) {
  if (!selectedSession || sessions.length === 0) return null

  const sessionBars = bars.filter(b => sessionDate(b.timestamp) === selectedSession)
  const sessionJournal = journal.filter(r => sessionDate(r.timestamp) === selectedSession)

  // VWAP is a deterministic function of the bars themselves — typical price
  // × volume, running sum, divided by running sum of volume, reset per
  // session. Computing it here (instead of reading stale `indicator_context`
  // from old signals) guarantees VWAP always matches the candles, even for
  // legacy runs whose stored signals reference different (synthetic-fixture)
  // prices than the cached bars.
  const vwap = computeSessionVwap(sessionBars)

  // Opening range: first 15 minutes of session bars. The strategy default
  // is 15min; using a fixed window matches `backend/config/config.yaml`
  // strategy.opening_range.minutes. Derived from bars (not stored signals)
  // for the same reason as VWAP.
  const or = computeOpeningRange(sessionBars, 15)

  const markers = buildMarkers(sessionJournal, { showRejections })

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <SessionPicker
        sessions={sessions}
        selected={selectedSession}
        onChange={onSessionChange}
      />
      <PriceChart
        bars={sessionBars}
        vwap={vwap}
        or={or}
        markers={markers}
        journal={sessionJournal}
        accountValue={25000}
        positionCapPct={100}
        showRejections={showRejections}
        onToggleRejections={onToggleRejections}
      />
    </div>
  )
}
