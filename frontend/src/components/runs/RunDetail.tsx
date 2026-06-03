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
import { resolveSession } from '@/lib/run-session'
import { riskKnobsFromParams } from '@/lib/run-config'
import { useReplay, clampCursor } from '@/lib/replay'
import { computeReplaySummary } from '@/lib/replay-summary'
import { PlaybackControls } from '@/components/playback-controls'
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

  const [pickedSession, setPickedSession] = useState<string | null>(null)
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

  // Resolve the displayed session from the user's pick, falling back to the
  // first session. Switching runs re-renders this view without remounting, so
  // the pick can be a date from the previous run that doesn't exist in the new
  // run's bars — which would filter the chart down to nothing (blank chart).
  const selectedSession = resolveSession(sessions, pickedSession)

  // ---- Replay ----
  // Bars for the selected session; the playhead (cursor) indexes into these.
  const sessionBars = useMemo(
    () => bars.filter(b => sessionDate(b.timestamp) === selectedSession),
    [bars, selectedSession],
  )
  const { state: replay, dispatch: replayDispatch } = useReplay(sessionBars.length)
  // Reset playback to fully-revealed when the session (or its bar count) changes.
  useEffect(() => {
    replayDispatch({ type: 'RESET' })
  }, [selectedSession, sessionBars.length, replayDispatch])

  // Until the user engages the timeline, show the full session (cursor pinned
  // to the last bar) — the chart loads fully finished and only "replays" on
  // explicit interaction.
  const cursor = replay.active
    ? clampCursor(replay.cursor, sessionBars.length)
    : Math.max(0, sessionBars.length - 1)
  const revealedBars = sessionBars.slice(0, cursor + 1)
  const cutoffMs =
    revealedBars.length > 0
      ? new Date(revealedBars[revealedBars.length - 1].timestamp).getTime()
      : 0
  // Journal rows revealed so far in the selected session (drives the chart
  // markers, the journal table, and the live summary).
  const revealedJournal = useMemo(
    () =>
      journalRows.filter(
        r =>
          sessionDate(r.timestamp) === selectedSession &&
          new Date(r.timestamp).getTime() <= cutoffMs,
      ),
    [journalRows, selectedSession, cutoffMs],
  )
  const liveSummary = useMemo(() => computeReplaySummary(revealedJournal), [revealedJournal])
  // Replay is "active" while playing or while the playhead isn't at the end;
  // that flag tells PriceChart to keep a stable candle width + follow the head.
  const inReplay = replay.active && (replay.isPlaying || cursor < sessionBars.length - 1)

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
          This run does not exist or belongs to a different user.
        </p>
      </div>
    )
  }

  const run = runQuery.data
  if (!run) return null

  // Account value + position cap for the chart's sizing rationale come from the
  // run's own config snapshot (falls back to defaults for legacy runs).
  const { accountValue, positionCapPct } = riskKnobsFromParams(
    manifestQuery.data?.config.params,
  )

  const pendingStatus =
    run.status === 'queued' || run.status === 'running' ? run.status : null

  return (
    <div className="content" data-testid="run-detail" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <RunHeader run={run} />
      {pendingStatus ? (
        <PendingSkeleton status={pendingStatus} />
      ) : (
        <>
          <RunSummaryCards summary={liveSummary} />
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
            <>
              <RunChart
                bars={revealedBars}
                journal={revealedJournal}
                sessions={sessions}
                selectedSession={selectedSession}
                onSessionChange={setPickedSession}
                showRejections={showRejections}
                onToggleRejections={() => setShowRejections(v => !v)}
                fitBarCount={sessionBars.length}
                replay={inReplay}
                accountValue={accountValue}
                positionCapPct={positionCapPct}
              />
              <PlaybackControls
                cursor={cursor}
                count={sessionBars.length}
                isPlaying={replay.isPlaying}
                speed={replay.speed}
                direction={replay.direction}
                barTime={sessionBars[cursor]?.timestamp}
                onToggle={() => replayDispatch({ type: 'TOGGLE' })}
                onStep={d => replayDispatch({ type: 'STEP', dir: d })}
                onScrub={c => replayDispatch({ type: 'SCRUB', cursor: c })}
                onReverse={() => replayDispatch({ type: 'REVERSE' })}
                onFastForward={() => replayDispatch({ type: 'FAST_FORWARD' })}
                onReset={() => replayDispatch({ type: 'RESET' })}
              />
            </>
          )}
        </>
      )}
      {!pendingStatus && (
        <JournalTable
          rows={revealedJournal}
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
  fitBarCount,
  replay,
  accountValue,
  positionCapPct,
}: {
  // `bars`/`journal` are already filtered to the selected session and sliced to
  // the replay playhead by RunDetail — RunChart just derives the chart inputs.
  bars: BarView[]
  journal: JournalRowView[]
  sessions: string[]
  selectedSession: string | null
  onSessionChange(s: string): void
  showRejections: boolean
  onToggleRejections(): void
  fitBarCount?: number
  replay?: boolean
  accountValue: number
  positionCapPct: number
}) {
  if (!selectedSession || sessions.length === 0) return null

  // VWAP / opening-range / markers are derived from the (revealed) bars+journal,
  // so they reveal progressively during replay. VWAP is cumulative and thus
  // prefix-stable; the opening range forms then locks as bars are revealed.
  const vwap = computeSessionVwap(bars)
  const or = computeOpeningRange(bars, 15)
  const markers = buildMarkers(journal, { showRejections })

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <SessionPicker
        sessions={sessions}
        selected={selectedSession}
        onChange={onSessionChange}
      />
      <PriceChart
        bars={bars}
        vwap={vwap}
        or={or}
        markers={markers}
        journal={journal}
        accountValue={accountValue}
        positionCapPct={positionCapPct}
        showRejections={showRejections}
        onToggleRejections={onToggleRejections}
        fitBarCount={fitBarCount}
        replay={replay}
      />
    </div>
  )
}
