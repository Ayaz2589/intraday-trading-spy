import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { HELP_CONTENT } from '../help-content'
import {
  BacktestsIcon,
  DataIcon,
  InsightsIcon,
  StrategyIcon,
  ValidationIcon,
} from '../nav-icons'

// The Docs page: what this app is, how a trade happens, how an idea becomes
// deployable evidence, what each page does, and a searchable glossary.
// The glossary renders straight from HELP_CONTENT — the same source as every
// `?` tooltip in the app — so it can never drift from the UI.

function Card({
  title,
  sub,
  accent,
  children,
  testid,
}: {
  title: string
  sub?: string
  accent: string
  children: ReactNode
  testid?: string
}) {
  return (
    <section className="card" data-testid={testid}>
      <header className="card-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h3 className="card-title">
            <span className="card-accent" style={{ background: accent }} />
            {title}
          </h3>
          {sub && <span className="card-sub">{sub}</span>}
        </div>
      </header>
      {children}
    </section>
  )
}

function FlowStep({
  n,
  name,
  color,
  children,
}: {
  n: number
  name: string
  color: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${color}`,
        background: 'var(--surface-2)',
        borderRadius: 'var(--r-sm)',
        padding: '10px 12px',
      }}
    >
      <div className="stat-label" style={{ color, marginBottom: 4 }}>
        <span className="mono">{n}</span> · {name}
      </div>
      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {children}
      </p>
    </div>
  )
}

const PAGES: {
  name: string
  to: string
  icon: ReactNode
  what: string
  details: string
}[] = [
  {
    name: 'Strategy',
    to: '/strategies',
    icon: <StrategyIcon />,
    what: 'The strategy logic and your named risk configs.',
    details:
      'Read how the VWAP-pullback entry, stop, and target work, then tune named configs — ' +
      'create, duplicate, edit, and activate them. Exactly one config is active at a time, ' +
      'and the active one wears its health verdict badge; drafts suggested by Claude or the ' +
      'recommendation engine land here for human review before anything is created.',
  },
  {
    name: 'Backtests',
    to: '/runs',
    icon: <BacktestsIcon />,
    what: 'Every backtest run, including study children.',
    details:
      'Open any run to replay it: candlestick chart with VWAP and opening-range overlays, the ' +
      'full trade ledger (executed, rejected, lockouts, force-flat exits), summary metrics, and ' +
      'Monte Carlo path-risk on the realized trade sequence.',
  },
  {
    name: 'Validation',
    to: '/validation',
    icon: <ValidationIcon />,
    what: 'Walk-forward studies — the honesty machinery.',
    details:
      'Each study splits history into in-sample/out-of-sample windows, drills into every window ' +
      'as its own run, and computes the pooled gate and lockbox verdicts that decide whether a ' +
      'config is anything more than a curve fit.',
  },
  {
    name: 'Insights',
    to: '/insights',
    icon: <InsightsIcon />,
    what: 'The cross-run out-of-sample archive.',
    details:
      'Every OOS validation window across all studies, pooled: the edge time-series over market ' +
      "regimes, the per-config window distribution, gate verdicts, Claude's advisory read of " +
      'the evidence, and evidence-backed recommendations (health verdicts, candidate knob ' +
      'changes, the trial ledger) for what to try next.',
  },
  {
    name: 'Data',
    to: '/data',
    icon: <DataIcon />,
    what: 'The historical SPY 5-minute bar cache.',
    details:
      'Coverage span and completeness (down to exact missing days), backfill controls, and the ' +
      'job history with persistent failure reasons — the foundation every backtest stands on.',
  },
]

export function DocsPage() {
  const [query, setQuery] = useState('')

  const allTerms = Object.entries(HELP_CONTENT).sort((a, b) =>
    a[1].title.localeCompare(b[1].title),
  )
  const q = query.trim().toLowerCase()
  const terms = q
    ? allTerms.filter(
        ([, t]) =>
          t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
      )
    : allTerms

  return (
    <div data-testid="docs-page" style={{ padding: 'var(--sp-6) var(--sp-8) var(--sp-12)' }}>
      <div className="run-header">
        <header data-testid="docs-header">
          <div className="rh-main">
            <h1 className="rh-title" style={{ fontFamily: 'var(--font-sans)' }}>
              How this app works
            </h1>
          </div>
          <div className="rh-meta">
            <span>
              What each page does, how a trade happens, how an idea becomes deployable
              evidence — and what every term means.
            </span>
          </div>
        </header>
      </div>

      <div className="content">
        <Card
          title="What this is"
          sub="An educational research system that explains itself while enforcing safe defaults"
          accent="var(--accent)"
          testid="docs-intro"
        >
          <p style={{ margin: '0 0 10px', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', lineHeight: 1.55, maxWidth: 860 }}>
            A standalone SPY-only intraday trading research and paper-trading app. You tune a
            rule-based long-only strategy, backtest it against cached 5-minute bars, then push it
            through validation machinery designed to kill curve fits before they cost money.
            Live auto-trading is disabled by design — everything here is paper-first.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['SPY only', '5-minute bars', 'long-only v1', 'rule-based — no ML', 'paper-first'].map(
              (c) => (
                <span
                  key={c}
                  className="chip"
                  style={{ background: 'var(--surface-2)', color: 'var(--text-muted)' }}
                >
                  {c}
                </span>
              ),
            )}
          </div>
        </Card>

        <Card
          title="How a trade happens"
          sub="Four roles, strict order — the risk manager's veto is absolute"
          accent="var(--loss)"
          testid="docs-trade-flow"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 10,
            }}
          >
            <FlowStep n={1} name="Strategy suggests" color="var(--accent)">
              Watches the bars and emits a trade idea when its rules line up — close above the
              prior bar high, above VWAP, after a pullback. It never sizes positions and never
              places orders.
            </FlowStep>
            <FlowStep n={2} name="Risk manager approves or rejects" color="var(--loss)">
              Sizes the position from your config's risk-per-trade and checks every limit:
              position cap, consecutive-loss lockout, session cutoffs. Every approved trade
              carries a stop-loss and a take-profit. No stop-loss = no trade.
            </FlowStep>
            <FlowStep n={3} name="Broker executes" color="var(--info)">
              Fills only approved trades, net of slippage and fees. It refuses anything the risk
              manager didn't sign off on.
            </FlowStep>
            <FlowStep n={4} name="Journal logs everything" color="var(--warn)">
              Executions, rejections, skipped setups, force-flat exits — all recorded with full
              context. The trade ledger on a run page is this journal.
            </FlowStep>
          </div>
        </Card>

        <Card
          title="From idea to evidence"
          sub="The research pipeline — every step exists to make it harder to fool yourself"
          accent="var(--info)"
          testid="docs-research-flow"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 10,
            }}
          >
            <FlowStep n={1} name="Tune a config" color="var(--accent)">
              A config is a named bundle of risk knobs over the strategy — account size,
              risk-per-trade, risk:reward, opening-range minutes. Tune them on the Strategy page.
            </FlowStep>
            <FlowStep n={2} name="Backtest it" color="var(--accent)">
              Run it against the cached bars and inspect every trade and rejection on the run
              page. One good backtest proves nothing yet.
            </FlowStep>
            <FlowStep n={3} name="Walk-forward study" color="var(--info)">
              Splits history into rolling windows: parameters chosen in-sample, judged on the
              out-of-sample slice they never saw. Every OOS window persists as its own child run.
            </FlowStep>
            <FlowStep n={4} name="Pooled gate" color="var(--info)">
              Pools every OOS trade into one seeded, reproducible verdict: the bootstrap
              confidence interval on expectancy must exclude zero. Includes zero → not deployable.
            </FlowStep>
            <FlowStep n={5} name="Lockbox" color="var(--warn)">
              A final slice of history nothing was ever tuned on. It opens once per strategy —
              after that it's burned, and the result stands.
            </FlowStep>
            <FlowStep n={6} name="Insights & recommendations" color="var(--profit)">
              The whole OOS archive pooled across studies and configs — where you ask whether the
              edge is stable or regime-bound. Health verdicts and evidence-backed recommendations
              suggest what to try next (Claude narrates, advisory only); every accepted suggestion
              goes back through steps 3–5.
            </FlowStep>
          </div>
        </Card>

        <Card
          title="How recommendations work"
          sub="When a config stops performing, the archive's own evidence suggests what to try next — code computes, Claude narrates, you decide"
          accent="var(--profit)"
          testid="docs-recommendations"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
              gap: 10,
            }}
          >
            <FlowStep n={1} name="Health verdict" color="var(--loss)">
              Every config with out-of-sample history gets a deterministic verdict — ok,
              degrading (recent windows fell below the config's own baseline), failing (the
              pooled gate failed and recent windows are non-positive), or insufficient evidence.
              Computed from stored results with published thresholds; the exact numbers ride
              along with the badge. No AI involved.
            </FlowStep>
            <FlowStep n={2} name="Evidence → candidates" color="var(--accent)">
              An evidence pack is assembled read-only from what already exists — sensitivity
              neighborhoods, matched-window comparisons against sibling configs, per-regime
              results, gate intervals. Candidates come in three honest classes: a knob change
              the archive has actually measured, gather evidence when the data doesn't exist
              yet, and stop tuning when every gate in the family failed.
            </FlowStep>
            <FlowStep n={3} name="You decide" color="var(--info)">
              Recommendations are never applied automatically — auto-tuning is how systems fool
              their operators. The deterministic candidates render even with Claude paused;
              Claude's narrative is advisory commentary on top. The only action is
              Draft config →, which prefills the standard create form for your review.
            </FlowStep>
            <FlowStep n={4} name="The trial ledger" color="var(--warn)">
              Every drafted variant is counted against the archive it was tuned on — the trial
              ledger survives config deletion and is shown wherever recommendations are. Why:
              enough tries against the same out-of-sample data and something looks good by luck
              alone. The lockbox stays sealed as the final arbiter no recommendation can touch.
            </FlowStep>
          </div>
        </Card>

        <Card
          title="The pages"
          sub="What each side-nav surface is for"
          accent="var(--warn)"
          testid="docs-pages"
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 'var(--sp-3)',
            }}
          >
            {PAGES.map((p) => (
              <div
                key={p.to}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: 'var(--sp-3) var(--sp-4)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    aria-hidden
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      width: 30,
                      height: 30,
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--accent-soft)',
                      color: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  >
                    {p.icon}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <Link
                      to={p.to}
                      style={{
                        color: 'var(--text)',
                        fontWeight: 700,
                        fontSize: 'var(--fs-sm)',
                        textDecoration: 'none',
                      }}
                    >
                      {p.name} →
                    </Link>
                    <div className="stat-label mono">{p.to}</div>
                  </div>
                </div>
                <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 600 }}>{p.what}</div>
                <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {p.details}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Glossary"
          sub="Every term in the app — the same definitions behind each ? tooltip"
          accent="var(--profit)"
          testid="docs-glossary"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              marginBottom: 'var(--sp-4)',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="search"
              className="field"
              placeholder="Search terms…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ maxWidth: 320 }}
            />
            <span className="stat-label mono" data-testid="glossary-count">
              {terms.length} of {allTerms.length} terms
            </span>
          </div>
          {terms.length === 0 ? (
            <p className="stat-label">No terms match — try a different word.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 'var(--sp-3)',
              }}
            >
              {terms.map(([key, t]) => (
                <div
                  key={key}
                  id={`term-${key}`}
                  data-testid="glossary-entry"
                  style={{
                    borderLeft: '2px solid var(--border-strong)',
                    paddingLeft: 12,
                  }}
                >
                  <div style={{ fontSize: 'var(--fs-sm)', fontWeight: 700 }}>{t.title}</div>
                  <p style={{ margin: '3px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t.description}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
