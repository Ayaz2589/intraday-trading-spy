import { useState } from 'react'
import {
  useAckPause,
  useClosePosition,
  useStartAutomation,
  useStopAutomation,
  useSubmitManualOrder,
  useTradeBars,
  useTradeJournal,
  useTradePerformance,
  useTradeState,
} from '@/hooks/useTrade'
import type { TradeView } from '@/api/trade'
import { ApiError } from '@/api/client'
import { TradeControls } from './TradeControls'
import { LiveChart } from './LiveChart'
import { AccountPanel } from './AccountPanel'
import { ManualOrderForm } from './ManualOrderForm'
import { ForwardPerformance } from './ForwardPerformance'
import { LiveJournalTable } from './LiveJournalTable'

// Feature 021: the /trade cockpit — live paper trading. With the historical
// lockbox spent (Experiment 011), the forward record this page accumulates
// is the project's only remaining honest out-of-sample evidence.

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

export function TradePage() {
  const state = useTradeState()
  const [view, setView] = useState<TradeView>('5m')
  const bars = useTradeBars(view)
  const perf = useTradePerformance()
  const journal = useTradeJournal(state.data?.session?.id ?? null)

  const start = useStartAutomation()
  const stop = useStopAutomation()
  const ack = useAckPause()
  const manual = useSubmitManualOrder()
  const close = useClosePosition()

  const manualError =
    manual.error instanceof ApiError && typeof manual.error.body === 'object'
      ? String((manual.error.body as { message?: string }).message ?? 'rejected')
      : manual.error ? String(manual.error) : null

  return (
    <div data-testid="trade-page" style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)' }}>
      <div className="run-header">
        <header>
          <div className="rh-main">
            <h1 className="rh-title" style={{ fontFamily: 'var(--font-sans)' }}>
              Paper trading
            </h1>
          </div>
          <div className="rh-meta">
            <span>
              The strategy pipeline running live against the Alpaca paper
              account — forward out-of-sample evidence, one session at a time.
            </span>
          </div>
        </header>
      </div>

      <div className="content" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {state.data && (
          <Section title="Automation">
            <TradeControls
              state={state.data}
              busy={start.isPending || stop.isPending || ack.isPending}
              onStart={() => start.mutate()}
              onStop={() => stop.mutate()}
              onAck={() => ack.mutate()}
            />
          </Section>
        )}

        <Section title="Live SPY">
          <LiveChart view={view} onView={setView} data={bars} />
        </Section>

        {state.data && (
          <Section title="Account">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <AccountPanel state={state.data} />
              <ManualOrderForm
                onSubmit={(body) => manual.mutate(body)}
                onClose={() => close.mutate()}
                hasPosition={state.data.position != null}
                error={manualError}
                busy={manual.isPending || close.isPending}
              />
            </div>
          </Section>
        )}

        {perf.data && (
          <Section title="Forward record">
            <ForwardPerformance perf={perf.data} />
          </Section>
        )}

        <Section title="Live journal">
          <LiveJournalTable events={journal} />
        </Section>
      </div>
    </div>
  )
}
