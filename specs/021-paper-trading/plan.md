# Implementation Plan: Live Paper Trading + /trade Page

**Branch**: `021-paper-trading` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/021-paper-trading/spec.md`

## Summary

Turn the existing strategy → risk → broker → journal pipeline into a live
loop against the **Alpaca paper account**: a multi-day automation session
(asyncio task in the API process, campaign-style) consumes 1-minute SPY
bars over websocket, aggregates to 5-minute decision bars, reuses the
existing strategy/risk/indicators/clock verbatim, places **bracket orders**
(broker-side stop + target — never an unprotected position), journals
every outcome in the backtest taxonomy to new append-only `paper_*`
tables (separate from the runs/Insights archive), and exposes it all on a
new **/trade** page: start/stop controls, live klinecharts chart
(1m/5m/1d/30d + VWAP), broker-reconciled account state, risk-gated manual
orders, and the forward performance record. With the lockbox spent
(Exp 011), this forward record is the project's only remaining honest
out-of-sample evidence — and Alpaca-paper is the constitution's prescribed
next step in the build order.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript/React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, alpaca-py ≥0.30 (already a
dependency — adds `TradingClient`, `StockDataStream`, `TradingStream`
usage), pandas; React + TanStack Router/Query, klinecharts v10. **No new
package dependencies.**

**Storage**: Supabase Postgres — migration `0129_paper_trading.sql`, four
new RLS tables (`paper_sessions`, `paper_orders`, `paper_trades`,
`paper_events`); broker account state is read live, never persisted as
truth.

**Testing**: pytest (offline; websocket/trading clients faked via injected
interfaces — same socket-blocker discipline as the rest of the suite);
Vitest + RTL + MSW for the frontend.

**Target Platform**: existing Docker dev stack (API :8001, Vite :5173);
single-operator deployment.

**Project Type**: web application (existing backend + frontend monorepo).

**Performance Goals**: new bar visible on the chart ≤5s after bar close
(SC-006; 1s poll while running); reconcile cadence 5s; engine work per 5m
bar is trivial (vectorized indicators over ≤78 rows).

**Constraints**: paper endpoint only (hard-asserted); decisions on 5-minute
bars only; ET clock authority = existing MarketClock; all thresholds in
`config.yaml` (`paper:` block); forward record append-only and separate
from the OOS archive.

**Scale/Scope**: one symbol, one operator, one running session; ~78
decision bars/day; years of forward records remain trivially small.

## Constitution Check

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument | yes | Stream subscribes SPY only; order schema has no symbol field (SPY implied); any non-SPY broker payload journaled `broker_reject` and refused; tests cover the rejection path. |
| II | Long-Only, Rule-Based v1 | yes | Reuses `VwapPullbackLong` unchanged; entry side is structurally 'buy' (sell rows exist only as protective/close legs); strategy module still never sizes or places orders — the live engine calls risk → broker exactly like the backtest engine. |
| III | Risk Manager Has Absolute Veto | yes | Every signal (strategy AND manual, FR-018) passes `RiskManager.validate`; entries are bracket orders so stop+target exist broker-side from acceptance (SC-002); no order is sent unless `RiskDecision.approved`; all limits stay in config. |
| IV | Test-First Everywhere | yes | Every implementation task in tasks.md is preceded by a failing-test task; live engine tested against faked stream/trading interfaces offline; the constitution's bracket-exclusivity gate gets an explicit test; frontend components TDD'd per app convention. |
| V | Paper-First, Live Trading Disabled by Default | yes | This IS the prescribed build-order step (backtest → internal paper → **Alpaca paper**). `TradingClient(paper=True)` at a single construction site + startup assertion that the endpoint is paper; `live_auto_enabled` remains `Literal[False]` and untouched; a test asserts the live path is unreachable with default config. |
| VI | Educational UI | yes | Every new /trade concept (automation session, bracket order, unrealized P&L, reconciliation, safety pause, paper account, force-flat) ships with a HelpTooltip (FR-024, SC-010); rejections render with reason codes, first-class. |
| VII | Journal Everything | yes | `paper_events` is append-only with the full signal taxonomy + lifecycle events (start/stop/interrupt/data-gap/safety/reconcile/broker-reject); FR-010/011; tests assert rejections, executions, and force-flats all produce events. |

**Engineering standards check:**

- [x] Timezone: all session logic delegates to the existing `MarketClock`
      (`clock.py`); no new time authority.
- [x] New thresholds (`stale_data_seconds`, `reconcile_seconds`,
      `warmup_lookback_days`, `chart_30d_days`) live in
      `backend/config/config.yaml` under a new `paper:` block.
- [x] Backend: Python 3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind.

No violations; Complexity Tracking not needed.

## Project Structure

### Documentation (this feature)

```text
specs/021-paper-trading/
├── plan.md              # this file
├── research.md          # Phase 0 — R1..R10 decisions
├── data-model.md        # Phase 1 — four paper_* tables
├── quickstart.md        # Phase 1 — operator guide
├── contracts/
│   └── trade-api.md     # /api/trade/* + engine↔broker contract
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── config/config.yaml                    # + paper: block
├── db/migrations/0129_paper_trading.sql  # 4 tables + RLS + one-running idx
├── src/intraday_trade_spy/
│   ├── config.py                         # + PaperConfig
│   ├── live/                             # NEW package
│   │   ├── __init__.py
│   │   ├── aggregator.py                 # 1m → 5m bar aggregation
│   │   ├── session_state.py              # session bars df + indicator snapshot reuse
│   │   ├── alpaca_broker.py              # TradingClient wrapper (paper-pinned), brackets, close, reconcile reads
│   │   ├── alpaca_stream.py              # StockDataStream/TradingStream wrappers (injectable)
│   │   ├── engine.py                     # LiveSessionEngine: multi-day loop, warmup, decide, force-flat, safety pauses
│   │   └── journal.py                    # paper_events writer (append-only, per-session seq)
│   ├── api/routers/trade.py              # NEW router (contracts/trade-api.md)
│   ├── api/app.py                        # lifespan: interrupted-session reconciler
│   └── storage/…                         # paper_* CRUD on the storage client
└── tests/
    ├── live/                             # engine/aggregator/broker-guard/journal tests (faked clients)
    └── api/new/test_trade_api.py         # router contract tests

frontend/src/
├── routes/_authenticated.trade.tsx       # NEW /trade route
├── components/side-nav.tsx               # + Trade nav item
├── components/trade/                     # NEW
│   ├── TradeControls.tsx                 # start/stop/ack + session status
│   ├── LiveChart.tsx                     # klinecharts live views 1m/5m/1d/30d + VWAP + levels
│   ├── AccountPanel.tsx                  # position/orders/P&L/reconcile state
│   ├── ManualOrderForm.tsx               # US4 (risk-gated)
│   ├── ForwardPerformance.tsx            # equity curve + summary + trades
│   └── LiveJournalTable.tsx              # paper_events view
├── api/trade.ts + hooks/useTrade.ts      # client + polling hooks
└── components/help-content.ts            # + new HelpTooltip entries
```

**Structure Decision**: extends the existing web-app monorepo; one new
backend package (`live/`), one new router, one new frontend page directory
— mirroring how features 016–019 were laid out.

## Key design decisions (full detail in research.md)

- **R1** Websocket 1-minute bars → local 5-minute aggregation; decisions
  on 5m only; REST warmup so mid-session starts compute VWAP/OR over the
  full session; staleness → safety pause.
- **R2** Bracket orders pin protection broker-side; paper endpoint
  hard-asserted; TradingStream for fill events; force-flat = cancel +
  close at 15:55.
- **R3** Thin `LiveSessionEngine` reusing strategy/risk/indicators/clock;
  recompute vectorized indicators per bar (one indicator code path).
- **R4** In-process asyncio session (campaign precedent); one-running
  unique index; restart → `interrupted`, never silent resume.
- **R5** Broker = truth for position/orders; reconcile every 5s; drift →
  pause entries until acknowledged. Sizing from config `account_value`.
- **R6** Four `paper_*` tables, append-only events, strictly separate from
  the OOS archive.
- **R7** Frontend polls (1s running / 5s idle) with `since` cursors — no
  new push infra.
- **R8** klinecharts reuse incl. the registered VWAP indicator; 30d view
  omits VWAP with an explanation.

## Phase 2 approach (preview for /speckit-tasks)

Story order follows spec priorities: foundational (config, migration,
storage CRUD, paper-pinned broker wrapper + guards) → US1 (engine +
start/stop + journal) → US2 (/trade page: state poll, chart, account
panel) → US3 (performance record) → US4 (manual orders) → polish
(tooltips audit, docs, EXPERIMENTS-style live verification). Every
implementation task paired with a preceding failing-test task
(constitution IV). Live verification requires a market session; the
quickstart documents the off-hours verification path (armed session +
faked stream e2e).
