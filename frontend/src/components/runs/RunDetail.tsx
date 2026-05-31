import { useEffect, useMemo, useState } from 'react'
import { useRun } from '@/hooks/useRun'
import { useRunBars } from '@/hooks/useRunBars'
import { useRunManifest } from '@/hooks/useRunManifest'
import { useRunSignals, flattenSignals } from '@/hooks/useRunSignals'
import { useRunTrades, flattenTrades } from '@/hooks/useRunTrades'
import { PriceChart } from '@/components/price-chart'
import { SessionPicker } from '@/components/session-picker'
import { JournalTable } from '@/components/journal-table'
import { buildMarkers } from '@/components/journal-markers'
import { RejectionBreakdownCard } from '@/components/rejection-breakdown-card'
import { StrategyConfigCard } from '@/components/strategy-config-card'
import { RunSummaryCards } from './RunSummaryCards'
import { HelpTooltip } from '@/components/help-tooltip'
import type { Bar, Run, Signal, Trade, UUID } from '@/api/types'
import type {
  BarView,
  JournalFilter,
  JournalRowView,
  RunManifestView,
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

  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [showRejections, setShowRejections] = useState(false)
  const [filter, setFilter] = useState<JournalFilter>('all')

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

  const legacyManifest = manifestQuery.data
    ? adaptLegacyManifest(run, manifestQuery.data.config.params)
    : null

  return (
    <div className="content" data-testid="run-detail" style={{ padding: 16, display: 'grid', gap: 12 }}>
      <RunHeaderSimple run={run} />
      <RunSummaryCards run={run} />
      {legacyManifest && <StrategyConfigCard manifest={legacyManifest} />}
      <RejectionBreakdownCard
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
      <JournalTable
        rows={journalRows}
        filter={filter}
        onFilterChange={setFilter}
      />
    </div>
  )
}

// ---------- Adapters ----------

function adaptLegacyManifest(run: Run, configParams: Record<string, unknown>): RunManifestView {
  return {
    run_id: run.id,
    run_started_at: run.started_at,
    run_ended_at: run.finished_at,
    code_version: run.app_version,
    config_snapshot: configParams,
    data_fingerprint: {
      sha256: run.data_fingerprint,
      bar_count: run.bar_count,
      earliest_timestamp: '',
      latest_timestamp: '',
      session_count: 0,
    },
    summary: {
      total_trades: run.summary.total_trades,
      wins: 0,
      losses: 0,
      win_rate: run.summary.win_rate,
      average_win_r: 0,
      average_loss_r: 0,
      average_r: 0,
      total_r: 0,
      profit_factor: null,
      max_drawdown_r: 0,
      best_trade_r: null,
      worst_trade_r: null,
      longest_consecutive_loss_streak: 0,
      rejected_signal_count: run.summary.rejected_signals,
      rejection_breakdown: {},
    },
  }
}

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

function RunHeaderSimple({ run }: { run: Run }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <h1 className="text-xl font-semibold flex items-center gap-2">
        Run {run.id.slice(0, 8)}…
        <span
          data-testid="run-detail-status"
          data-status={run.status}
          className="text-sm font-normal text-muted-foreground"
        >
          ({run.status})
        </span>
        <HelpTooltip helpKey="run_status" />
      </h1>
      <p className="text-xs text-muted-foreground" style={{ margin: 0 }}>
        {run.range_start} → {run.range_end} · {run.bar_count} bars
      </p>
    </header>
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
