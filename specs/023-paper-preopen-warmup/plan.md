# Implementation Plan: Pre-Open Warmup for Live Paper Trading

**Branch**: `023-paper-preopen-warmup` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/023-paper-preopen-warmup/spec.md`

## Summary

Let the operator start the live paper-trading automation session before the 09:30 ET regular-session open so market data is already flowing and indicators are primed at the open — **without** changing any strategy semantics. Two backend behaviors:

1. **Pre-open guard** in `LiveSessionEngine.on_five_minute_bar`: a bar whose ET time is before `clock.session_start` is journaled as a `pre_open` lifecycle event and then dropped — never appended to `SessionState`, never evaluated. This both delivers the request and closes a latent correctness bug (pre-open bars would otherwise pollute the `session_date`-grouped VWAP and the first-bar-anchored opening range in `data/indicators.py`).
2. **Warmup wiring**: invoke the already-implemented-but-never-called `SessionState.warmup()` on session start, backfilling today's elapsed **regular-session** 5m bars (09:30 → now) via the existing REST fetcher so indicators are correct on the first live bar (at-open or mid-session start).

No strategy/risk/indicator math changes, no new dependencies, no DB migration, no frontend changes. Anchoring stays at 09:30 ET.

## Technical Context

**Language/Version**: Python 3.11 (backend)

**Primary Dependencies**: FastAPI, Pydantic v2, pandas, alpaca-py (existing). No new deps.

**Storage**: None new. Ephemeral in-memory session state (the existing `RUNNING` registry + `SessionState`); the existing `paper_*` tables are untouched (no schema change).

**Testing**: pytest. New unit tests on `LiveSessionEngine` (pre-open guard) and `SessionState` (warmup parity), plus an aggregator boundary test. Reuse the existing offline paper-trading test patterns (no live broker).

**Target Platform**: Linux server (backend API + asyncio session runner).

**Project Type**: Web service (backend automation only for this feature).

**Performance Goals**: Negligible — the guard is an O(1) time comparison per 5m bar; warmup loads ≤78 bars once at startup (the existing per-append recompute is already ≤78 rows).

**Constraints**: Must preserve exact backtest/live indicator parity (the existing golden parity test must stay green). Must not alter end-of-day controls. America/New_York via `clock.py` only.

**Scale/Scope**: ~2 production files changed (`live/engine.py`, `live/runner.py`) + the start path in `api/routers/trade.py` to supply warmup bars; a thin reuse of `fetch_intraday_df`. ≤~40 lines of production code; the bulk is tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | SPY-only is unchanged; no new instrument enters any path. Bars remain SPY. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | no | No strategy/direction change; no ML/HMM. The guard only filters *when* bars are processed, not *how*. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | Risk path untouched. Pre-open bars never reach evaluation, so no order is ever proposed before the open; the regular-session path is byte-for-byte as today (stop+target still required). |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every production change in `backend/src/` is preceded by a failing test: pre-open-guard tests and warmup-parity tests authored first (see tasks). |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | This is the PAPER path. `live_auto_enabled` is untouched; the paper endpoint hard-assert stays. No live auto-trading enabled. |
| VI | Educational UI: Every Concept Is Explained | no | Backend-only; no new UI concept/label. (No chart change — pre-open bars are not added to the chart view.) |
| VII | Journal Everything | yes | New `pre_open` lifecycle event records pre-open data activity; warmup outcome (loaded N bars / empty / fetch-failed) is journaled. Nothing happens silently. |

**Engineering standards check:**

- [x] Timezone is `America/New_York`; the guard consults `clock.session_start` / existing `MarketClock`, not a reimplementation. The "before the open" test uses the clock, not a hardcoded 09:30.
- [x] No new limits/thresholds/session-times introduced — the existing `market.session_start` (and `paper.*`) config govern behavior. (Decision in research.md: no new config knob; the guard makes early start safe unconditionally.)
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend unaffected (no React/TS changes in scope).

**Result**: No violations. Constitution gate PASSES. The feature deliberately stays inside "Regular session only (09:30–16:00 ET)" because trading and indicator anchoring remain at 09:30; only the operator's permitted *start time* and data *streaming* move earlier (data activity, not trading activity).

## Project Structure

### Documentation (this feature)

```text
specs/023-paper-preopen-warmup/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (internal contracts; no new HTTP endpoint)
├── checklists/
│   └── requirements.md  # from /speckit-specify
└── tasks.md             # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── live/
│   │   ├── engine.py          # CHANGE: pre-open guard in on_five_minute_bar; journal pre_open
│   │   ├── runner.py          # CHANGE: accept + apply warmup bars before streaming
│   │   └── session_state.py   # (reuse existing warmup(); no change expected)
│   └── api/routers/
│       └── trade.py           # CHANGE: fetch today's RTH bars at start, pass to runner; journal warmup outcome
└── tests/
    └── live/                  # NEW tests: pre-open guard, warmup parity, aggregator boundary
```

**Structure Decision**: Existing Option-2 web layout. This feature touches only the backend `live/` package and the paper-trading start path in `api/routers/trade.py`. The warmup fetch reuses the existing `fetch_intraday_df` REST wrapper (already starts at 09:30, so it already returns only regular-session bars — satisfies FR-007 with no change to the fetcher).

## Complexity Tracking

> No constitution violations — table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| (none) | — | — |
