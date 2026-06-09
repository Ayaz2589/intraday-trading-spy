# Implementation Plan: Historic Trade Replay

**Branch**: `022-historic-trade-replay` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/022-historic-trade-replay/spec.md`

## Summary

A new **Historic Trade** page under `/trade` (URL `/trade/historic`) that replays a chosen
past SPY session bar-by-bar from stored 5-minute history, with the same cockpit, manual
buy/sell, automated-strategy, journal, and chart experience as live paper trading
(feature 021) — but driven by historical data and a **simulated, honest-cost fill model**
instead of Alpaca. A user-controlled simulated clock paces the replay at selectable speeds
(1s…1hr of market time per real second); play/pause/speed are live-adjustable.

**Key technical decision (see research.md R1):** replay automation runs on the **backtest
decision+fill primitives** (`strategy.evaluate` → `risk.validate` → `broker/paper.py`
PaperBroker), *not* the live engine. The live engine fills brackets at market on the signal
bar; the backtester fills at the next bar's open with the honest cost model. SC-004 requires
replay automation to match a **backtest** of the same date/config exactly, so the backtest
convention is mandatory. We reuse the live page's *presentation, journal-event vocabulary,
and API shape* so the experience is identical, while the *fill math* is the research-grade
backtest model — which is also the more honest, education-correct choice ("see what
strategies will work" should match the archive the user already trusts).

**Persistence:** none. Replay state is held in an in-memory per-user registry (mirrors
`live/runner.py`'s `RUNNING` dict) and is never written to the database — no migration, no
new tables. This makes leakage into the runs/Insights archive or the `paper_*` forward
record structurally impossible (SC-005).

**Reuse inventory** (verbatim, no forking): domain models (`models.py`), VWAP-pullback
strategy + tri-state `evaluate` (`strategy/`), `RiskManager`/`RiskState`/`position_size`
(`risk/`), `PaperBroker` honest-cost fills (`broker/paper.py`), `MarketClock` (`clock.py`),
indicator/session snapshot (`SessionState`/`attach_indicators`), bar reads
(`storage.list_bars`, `bars_present_session_dates`), trading-calendar
(`data/market_calendar.expected_session_dates`), active-config load
(`storage.get_active_config`), auth/storage DI (`api/deps.py`), and the frontend
`LiveChart` / `ForwardPerformance` / `LiveJournalTable` / `AccountPanel` /
`ManualOrderForm` / `HelpTooltip` components + the `useTrade` hook/api patterns.

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript 5 + React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, pytest (backend, all existing); React +
Vite + Tailwind + TanStack Router + TanStack Query + klinecharts + vitest (frontend, all
existing). **No new dependencies.**

**Storage**: None new. Reads existing `public.bars`. Replay session/orders/trades/journal
live **in-memory only** for the life of the replay. **No migration.**

**Testing**: pytest (`backend/.venv-sbx`, `PYTHONPATH=src`, markers `not slow and not
integration`); vitest in the frontend docker container.

**Target Platform**: Local Docker stack (backend :8001, frontend :5173) talking to Supabase
cloud (bars) — no Alpaca/brokerage involvement at all.

**Project Type**: Web application (FastAPI backend + React frontend).

**Performance Goals**: A full 6.5-hour session (~78 5-minute bars) replays to completion in
~7s at the 1hr/3600× speed and well under 60s at 5m or faster, with zero skipped bars, fills,
or journal events at any speed (SC-002). Start-to-first-bar under 5s (SC-001).

**Constraints**: SPY-only, long-only, risk-vetoed, stop+target mandatory, journal-everything,
educational tooltips, America/New_York via `clock.py`, all numbers from
`backend/config/config.yaml`. No look-ahead: an order placed on bar N can only fill on data
at/after bar N+1.

**Scale/Scope**: Single operator; one active replay per user; ~2,000 covered session dates
(2018→present). One new backend package (`replay/`), one new router, one new frontend page +
hook/api module, ~5 new help keys. No persistent schema.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | Reuses `Bar`/`Signal` models whose `symbol` is `Literal["SPY"]`; bars loaded are SPY-only; `RiskManager.validate` rejects non-SPY. No new instrument path. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | Reuses the existing `VwapPullbackLong` strategy and `Direction.LONG`; manual orders are buys/closes only — a sell with no/over position is rejected (US2 AS5). No ML/HMM/shorting introduced. The replay engine consumes signals; it never sizes or sources them outside the strategy. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | yes | Every order — manual or automated — passes `RiskManager.validate`; the simulated broker refuses any plan whose `RiskDecision.approved` is false. Stop+target required (no stop = no trade, US2 AS2/SC-006). Bracket exits mutually exclusive via `PaperBroker.simulate_bar` (constitution's required gate). All limits from config. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | All new code under `backend/src/intraday_trade_spy/replay/`, the new router, and `frontend/src/` is TDD — every implementation task is preceded by a failing-test task in tasks.md. Required gates exercised: no-look-ahead (engine never fills on the signal bar), bracket mutual-exclusion, risk rejections, force-flat journaling. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | Replay touches **no** brokerage (paper or live); `live_auto_enabled` is never read or set. It runs without any Alpaca credentials. This sits *behind* "Alpaca paper" in the build order — a pure simulation, strictly safer. |
| VI | Educational UI: Every Concept Is Explained | yes | New concepts (replay, simulated clock, playback speed, simulated fill, session recap) each ship a `HelpTooltip`; the page surfaces WHY signals are taken/rejected via the reused journal table (rejections are first-class). A `help-coverage` test gates it. |
| VII | Journal Everything | yes | Every signal, window-skip, risk approval/rejection, submission, fill, cancellation, and force-flat is emitted as a journal event (same `kind` vocabulary as live) into the in-memory replay journal and shown live (FR-012). The recap exports the journal. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented (the simulated clock paces real→sim time but all market-time gates go through `MarketClock`).
- [x] Any new limits, thresholds, or session times live in `backend/config/config.yaml`. The playback-speed *options* are a UI-presentation list (not risk/market thresholds); the canonical set and any default live in config (`replay.speeds`, `replay.default_speed`) to avoid hardcoded magic numbers.
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend code is React + TypeScript + Vite + Tailwind.

All seven principles pass. No violations → **Complexity Tracking is empty.** The one notable
design choice (drive backtest primitives rather than the live engine) is documented in
research.md R1; it is not a constitution tension — it is the *only* way to satisfy SC-004 and
is the more honest model.

## Project Structure

### Documentation (this feature)

```text
specs/022-historic-trade-replay/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1–R8
├── data-model.md        # Phase 1 — in-memory entities + reused models
├── quickstart.md        # Phase 1 — operator/dev guide
├── contracts/
│   └── replay-api.md     # Phase 1 — /api/replay/* endpoint contracts
├── checklists/
│   └── requirements.md  # spec quality checklist (passing)
└── tasks.md             # Phase 2 — created by /speckit-tasks
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── replay/                      # NEW package — mirrors live/ but simulated + ephemeral
│   │   ├── __init__.py
│   │   ├── journal.py                # ReplayJournal — append-only in-memory PaperEvent-shaped events
│   │   ├── engine.py                # ReplayEngine — per-bar backtest-parity decision+fill + manual intake
│   │   ├── session.py               # ReplaySession — in-memory state (clock, speed, position, trades, events, bars)
│   │   └── runner.py                # ReplayRunner — asyncio pacing loop, play/pause/speed/stop; REPLAY_RUNNING registry
│   ├── api/routers/
│   │   └── replay.py                # NEW router — /api/replay/* (mirrors trade.py DI + shape)
│   ├── broker/paper.py              # REUSED verbatim (honest-cost fills, bracket mutual-exclusion)
│   ├── strategy/, risk/, clock.py   # REUSED verbatim
│   ├── storage/client.py            # REUSED (list_bars, bars_present_session_dates, get_active_config)
│   └── data/market_calendar.py      # REUSED (expected_session_dates for the date picker)
│   └── api/app.py                   # EDIT — register replay.router
└── tests/                            # NEW: test_replay_engine, test_replay_runner, test_replay_journal,
                                      #      test_replay_api, test_replay_backtest_parity (SC-004)

frontend/
├── src/
│   ├── routes/
│   │   └── _authenticated.trade_.historic.tsx   # NEW route → /trade/historic
│   ├── components/trade/
│   │   ├── HistoricTradePage.tsx                # NEW page (composes reused panels + ReplayControls)
│   │   ├── ReplayControls.tsx                   # NEW (date picker, play/pause, speed, progress)
│   │   ├── LiveChart.tsx / ForwardPerformance.tsx / LiveJournalTable.tsx /
│   │   │   AccountPanel.tsx / ManualOrderForm.tsx   # REUSED
│   │   └── *.test.tsx                            # NEW colocated tests
│   ├── api/replay.ts                            # NEW (mirrors api/trade.ts)
│   ├── hooks/useReplay.ts                       # NEW (mirrors hooks/useTrade.ts)
│   ├── components/side-nav.tsx                  # EDIT — add Historic Trade under Trade (depth 1)
│   └── components/help-content.ts               # EDIT — add replay help keys
```

**Structure Decision**: Web application. A new backend `replay/` package deliberately mirrors
the `live/` package's shape (engine/session/runner/journal + registry) so the code reads like
its sibling, but every external boundary is swapped: bars come from storage instead of a
websocket, fills come from `broker/paper.py` instead of Alpaca, and state is in-memory instead
of `paper_*` tables. The frontend adds one nested route and one page that composes the existing
live-cockpit panels around new replay controls.

## Complexity Tracking

> No constitution violations. Table intentionally empty.
