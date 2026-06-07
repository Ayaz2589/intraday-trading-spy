# Research: Live Paper Trading + /trade Page (021)

All Technical Context unknowns resolved. Each decision: what / why /
alternatives.

## R1 — Live bar ingestion: Alpaca websocket stream, 1-minute bars, local 5-minute aggregation

**Decision**: Subscribe to SPY 1-minute bars over alpaca-py's
`StockDataStream` websocket (SIP feed — operator's tier provides it; the
existing `alpaca.feed` config key already selects sip/iex). Aggregate
completed 1-minute bars into 5-minute bars in-process; the strategy
evaluates ONLY on completed 5-minute bars (constitution timeframe,
comparability with the archive — spec Clarifications). The 1-minute bars
additionally feed the 1-minute chart view.

**Session warmup**: when automation starts (or the app reconnects)
mid-session, fetch today's bars so far via the existing
`StockHistoricalDataClient` path (`data/alpaca_source.py`) so VWAP and the
opening range are computed over the FULL session, not just from the moment
of subscription. Without this, session-anchored VWAP is silently wrong —
the highest-risk correctness trap in the whole feature.

**Staleness**: if no 1-minute bar arrives for `paper.stale_data_seconds`
(default 120) while the market clock says the session is open, pause new
entries (safety pause, journaled) until data resumes. Reconnect with
exponential backoff; journal the gap.

**Alternatives considered**: REST polling of latest bars as the primary
feed — rejected: higher latency, rate-limit pressure, and the operator
explicitly has high-uptime websocket entitlements. REST remains the warmup
+ gap-fill mechanism.

## R2 — Order execution: TradingClient bracket orders, paper endpoint pinned

**Decision**: Use alpaca-py `TradingClient(api_key, secret, paper=True)` —
`paper=True` is hard-coded at the construction site, not configurable.
Entries are **bracket orders**: market entry + take-profit limit leg +
stop-loss stop leg. The protective legs are broker-side resting orders
(spec assumption): a dead backend can never leave a position unprotected,
and Alpaca's OCO semantics natively satisfy the constitution's required
test gate "bracket exits are mutually exclusive (one fill cancels the
other)".

**Mode guard (constitution V)**: a startup assertion verifies the trading
client's base URL is the paper endpoint; any non-paper URL raises and
refuses to start the session. `live_auto_enabled` stays `Literal[False]`;
this feature never touches that flag. Tests assert the live path is
unreachable.

**Fill awareness**: subscribe to `TradingStream` (paper) for order-update
events (fill, partial_fill, cancel, reject) to journal exits promptly;
REST reconciliation (R5) remains the source of truth.

**Force-flat (15:55 ET)**: cancel open orders, then `close_position("SPY")`;
journal as force_flat. New-entry cutoff (15:30 ET) enforced by the same
`MarketClock.allow_new_trades` the backtests use.

**Alternatives considered**: app-side exit watching (simulate stops by
monitoring quotes) — rejected: violates the "never unprotected" assumption
and duplicates broker functionality. Separate non-bracket orders — rejected:
loses OCO atomicity.

## R3 — Engine: reuse the existing pipeline; recompute indicators per bar

**Decision**: new `live/` backend package with a `LiveSessionEngine` that
REUSES `VwapPullbackLong`, `RiskManager`, `MarketClock`, and the journal
taxonomy. It maintains the current session's 5-minute bars as a DataFrame;
on each completed 5-minute bar it calls the existing vectorized
`attach_indicators(df, or_minutes=…)` over the session (≤78 rows — trivially
cheap), snapshots the last row, and runs the identical
evaluate → risk.validate → order flow a backtest runs. No incremental
indicator implementation: recomputing the session keeps one indicator
code path (and one set of indicator tests) for backtest and live.

**Position management**: entries via R2 brackets; exits arrive as broker
fills (stop/target legs) or force-flat. `RiskState` (daily counters,
cooldowns, lockout, consecutive losses) is maintained live exactly as the
backtest engine maintains it, rolled per session date.

**Alternatives considered**: porting the `BacktestEngine` loop wholesale —
rejected: its fill simulation (`PaperBroker`) must NOT run live (Alpaca's
paper venue is the fill simulator now); a thin live engine that shares the
strategy/risk/journal pieces is smaller and honest about the difference.

## R4 — Process model: asyncio task in the API process; restart = interrupted

**Decision**: the automation session runs as an asyncio background task
inside the FastAPI app — the same operational model as campaign runs
(feature 019, `api/routers/research.py` BackgroundTasks + the `_lifespan`
reconcilers in `api/app.py`). A partial unique index enforces at most one
`running` session per user (same pattern as
`research_campaigns_one_running_idx`). On startup, a reconciler marks any
`running` session `interrupted` with a journaled event (FR-009 — no silent
resume); open positions remain protected by broker-side brackets.

**Multi-day**: per spec Clarifications, the session stays on until stopped:
the task loops across days — trading window → force-flat → idle until next
open (clock-driven sleep) → roll daily risk counters → resume.

**Alternatives considered**: separate worker process/daemon — rejected for
v1: new deployment surface, and the Docker dev stack + campaign precedent
already prove in-process background tasks work; restart semantics are
explicitly journaled rather than hidden.

## R5 — Account truth & reconciliation

**Decision**: the Alpaca paper account is the source of truth for position,
orders, and fill prices. A reconcile loop polls TradingClient every
`paper.reconcile_seconds` (default 5): position qty/avg price, open orders,
account equity. If the app's view disagrees with the broker (drift), the
mismatch is journaled, surfaced on /trade, and **new entries pause** until
the operator acknowledges (FR-016). Risk **sizing** uses the config's
`account_value` (spec Clarifications) — broker equity is display +
reconciliation only.

## R6 — Persistence: four new tables, migration 0129, RLS per convention

**Decision**: `paper_sessions`, `paper_orders`, `paper_trades`,
`paper_events` (see data-model.md), all user-scoped with the standard RLS
policies. Append-only events with a per-session sequence. Kept entirely
SEPARATE from `runs`/study tables (spec Clarifications): nothing here
feeds Insights aggregates, gates, or recommendations.

**Alternatives considered**: reusing the runs/journal tables with a
"paper" flag — rejected: every existing aggregate would need a filter, and
one missed filter silently contaminates the OOS archive. Separation is the
cheap, provable invariant.

## R7 — API + frontend transport: HTTP polling, app-standard cadences

**Decision**: `/api/trade/*` REST surface (contracts/trade-api.md);
the frontend polls — `POLLING_INFLIGHT_MS` (1s) while a session is
running/market open, `POLLING_LIST_MS` (5s) otherwise — matching how
campaigns/studies/runs already behave. Chart increments use a `since`
cursor so polls return only new bars. SC-006 (bar visible ≤5s after close)
is comfortably met at a 1s poll.

**Alternatives considered**: server-sent events / websocket to the browser
— rejected for v1: new infra + auth surface for a single-operator app the
polling pattern already serves; can be layered later without contract
changes.

## R8 — Frontend chart: reuse klinecharts with live appends

**Decision**: reuse the existing `klinecharts` (v10 beta) setup from
`price-chart.tsx` — including the already-registered custom VWAP indicator
— in a new `LiveChart` component driven by the polled bar increments
(klinecharts `applyNewData`/`updateData` supports appends). Four views:
1m (today, 1-minute bars), 5m (today, 5-minute bars), 1d (today, full
session), 30d (daily bars, no VWAP — labeled why). Position entry/stop/
target rendered as price-line overlays.

## R9 — Config block

**Decision**: new `paper:` block in `config.yaml` + `PaperConfig` Pydantic
model: `stale_data_seconds: 120`, `reconcile_seconds: 5`,
`warmup_lookback_days: 1`, `chart_30d_days: 30`. All thresholds in config,
none in source (constitution).

## R10 — What this feature deliberately does NOT do

- No live-money path of any kind (`live_auto_enabled` untouched, paper URL
  asserted, tests prove unreachability).
- No new strategy logic, no second symbol, no shorting.
- No promotion of forward results into the Insights archive (future
  feature, deliberate human decision).
- No browser-push infra (polling per R7).
