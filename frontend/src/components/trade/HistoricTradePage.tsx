import { useEffect, useMemo, useState } from 'react'
import {
  useCloseReplayPosition,
  useControlReplay,
  useReplayBars,
  useReplayDates,
  useReplayJournal,
  useReplayPerformance,
  useReplayState,
  useStartReplay,
  useStopReplay,
  useSubmitReplayOrder,
} from '@/hooks/useReplay'
import { ApiError } from '@/api/client'
import { HelpTooltip } from '../help-tooltip'
import { LineScatter } from '../charts/line-scatter'
import { LiveChart } from './LiveChart'
import { LiveJournalTable } from './LiveJournalTable'
import { ManualOrderForm } from './ManualOrderForm'
import { ReplayControls } from './ReplayControls'
import { buildReplayMarkers } from './replay-markers'

// Feature 022: the /trade/historic cockpit — replays a stored session through
// the backtest primitives. Reuses the live chart, journal table, and manual
// order form; the controls + recap are replay-specific. Unmistakably labeled a
// SIMULATION (FR-016): no brokerage, nothing persisted.

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h3 className="card-title">
          <span className="card-accent" style={{ background: 'var(--accent)' }} />
          {title}
        </h3>
      </header>
      {children}
    </section>
  )
}

const usd = (v: number) => `$${v.toFixed(2)}`
const rr = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}R`

export function HistoricTradePage() {
  const dates = useReplayDates()
  const state = useReplayState()
  const session = state.data?.session ?? null
  const active = session != null && session.status !== 'stopped'

  const [selectedDate, setSelectedDate] = useState('')
  const [startAutomation, setStartAutomation] = useState(false)
  const [startSpeed, setStartSpeed] = useState(60)

  useEffect(() => {
    if (!selectedDate && dates.data?.dates.length) {
      setSelectedDate(dates.data.dates[0])
    }
  }, [dates.data, selectedDate])

  const bars = useReplayBars(active)
  const journal = useReplayJournal(active)
  const perf = useReplayPerformance(active)

  // Markers redraw only when a new journal event arrives (not every poll).
  const lastSeq = journal.length ? journal[journal.length - 1].seq : 0
  const markers = useMemo(() => buildReplayMarkers(journal), [lastSeq]) // eslint-disable-line react-hooks/exhaustive-deps

  const start = useStartReplay()
  const control = useControlReplay()
  const stop = useStopReplay()
  const manual = useSubmitReplayOrder()
  const close = useCloseReplayPosition()

  const busy = start.isPending || control.isPending || stop.isPending

  const manualError =
    manual.error instanceof ApiError && typeof manual.error.body === 'object'
      ? String((manual.error.body as { message?: string }).message ?? 'rejected')
      : manual.error ? String(manual.error) : null

  const position = state.data?.position ?? null
  const today = state.data?.today

  return (
    <div data-testid="historic-trade-page" style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)' }}>
      <div className="run-header">
        <header>
          <div className="rh-main" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 className="rh-title" style={{ fontFamily: 'var(--font-sans)' }}>
              Historic trade
            </h1>
            <span
              data-testid="historic-sim-banner"
              className="chip"
              style={{ background: 'var(--warn-bg, #fff7ed)', color: 'var(--warn, #b45309)' }}
            >
              HISTORICAL SIMULATION
            </span>
            <HelpTooltip helpKey="replay" />
          </div>
          <div className="rh-meta">
            <span>
              Replay a real past SPY session bar-by-bar — watch it, trade it by
              hand, or watch the strategy. No broker, nothing saved.
            </span>
          </div>
        </header>
      </div>

      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Section title="Replay">
          <ReplayControls
            dates={dates.data?.dates ?? []}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            session={session}
            startAutomation={startAutomation}
            onToggleStartAutomation={setStartAutomation}
            startSpeed={startSpeed}
            onSelectStartSpeed={setStartSpeed}
            onStart={() =>
              start.mutate({ date: selectedDate, speed: startSpeed, automation: startAutomation })
            }
            onPlay={() => control.mutate({ action: 'play' })}
            onPause={() => control.mutate({ action: 'pause' })}
            onStop={() => stop.mutate()}
            onSpeed={(speed) => control.mutate({ action: 'speed', speed })}
            onToggleAutomation={(enabled) =>
              control.mutate({ action: 'automation', enabled })
            }
            busy={busy}
          />
        </Section>

        <Section title="Replayed SPY">
          <LiveChart view="5m" onView={() => {}} data={bars} markers={markers} />
        </Section>

        {active && (
          <Section title="Trade it">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div data-testid="replay-account" className="stat-label mono"
                   style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                <span>
                  position:{' '}
                  {position == null
                    ? 'flat'
                    : `${position.qty} @ ${position.avg_entry.toFixed(2)} · stop ${position.stop_loss.toFixed(2)} · target ${position.take_profit.toFixed(2)}`}
                </span>
                {today && (
                  <span>
                    today: {today.trades} trade{today.trades === 1 ? '' : 's'} ·{' '}
                    {usd(today.realized_pnl)} · {rr(today.realized_r)}
                  </span>
                )}
                <span>
                  simulated fill <HelpTooltip helpKey="simulated_fill" />
                </span>
              </div>
              <ManualOrderForm
                onSubmit={(body) => manual.mutate(body)}
                onClose={() => close.mutate()}
                hasPosition={position != null}
                error={manualError}
                busy={manual.isPending || close.isPending}
              />
            </div>
          </Section>
        )}

        {perf.data && perf.data.summary.trades > 0 && (
          <Section title="Recap">
            <ReplayRecap perf={perf.data} />
          </Section>
        )}

        <Section title="Journal">
          <LiveJournalTable events={journal} />
        </Section>
      </div>
    </div>
  )
}

function ReplayRecap({ perf }: { perf: NonNullable<ReturnType<typeof useReplayPerformance>['data']> }) {
  const s = perf.summary
  return (
    <div data-testid="replay-recap" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
        {([
          [String(s.trades), 'trades'],
          [s.win_rate == null ? '—' : `${Math.round(s.win_rate * 100)}%`, 'win rate'],
          [s.expectancy_r == null ? '—' : rr(s.expectancy_r), 'expectancy'],
          [rr(s.total_r), 'total R'],
          [usd(s.gross_pnl), 'gross P&L'],
        ] as Array<[string, string]>).map(([value, label]) => (
          <span key={label}>
            <span className="mono" style={{ fontWeight: 700, fontSize: 'var(--fs-lg, 17px)' }}>{value}</span>
            <span style={{ display: 'block', fontSize: 'var(--fs-xs, 10px)',
                           color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {label}
            </span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto' }}><HelpTooltip helpKey="session_recap" /></span>
      </div>
      <LineScatter
        height={160}
        series={[{
          id: 'equity',
          color: 'var(--accent)',
          points: perf.equity_curve
            .filter((p) => p.t != null)
            .map((p) => ({ x: Date.parse(p.t as string), y: p.equity, label: usd(p.equity) })),
        }]}
        formatY={(v) => `$${Math.round(v)}`}
        formatX={(v) => new Date(v).toLocaleTimeString()}
      />
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr><th>origin</th><th>qty</th><th>entry</th><th>exit</th><th>reason</th><th>R</th><th>P&L</th></tr>
          </thead>
          <tbody>
            {perf.trades.map((t, i) => (
              <tr key={i}>
                <td>{t.origin}</td>
                <td className="mono">{t.qty}</td>
                <td className="mono">{t.entry_price.toFixed(2)}</td>
                <td className="mono">{t.exit_price?.toFixed(2) ?? '—'}</td>
                <td>{t.exit_reason ?? '—'}</td>
                <td className="mono" style={{ color: (t.realized_r ?? 0) < 0 ? 'var(--loss)' : 'var(--profit)' }}>
                  {rr(Number(t.realized_r ?? 0))}
                </td>
                <td className="mono" style={{ color: (t.gross_pnl ?? 0) < 0 ? 'var(--loss)' : 'var(--profit)' }}>
                  {usd(Number(t.gross_pnl ?? 0))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
