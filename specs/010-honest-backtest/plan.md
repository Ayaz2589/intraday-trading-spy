# Implementation Plan: Make the Backtest Honest

**Branch**: `010-honest-backtest` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-honest-backtest/spec.md`

## Summary

Make the backtest measure *net, realistic* performance. Three changes, in priority order:

1. **Apply trading costs** in the paper broker — adverse per-share slippage baked into entry/exit fill prices, plus per-share fees deducted on both sides — so every PnL figure is net. Defaults: fees `$0.00/share`, slippage `$0.01/share`.
2. **Compute real metrics** over the net results — expectancy, daily-return Sharpe/Sortino (annualized ×√252, rf=0), max drawdown in `$` and `%` over an equity curve based on `risk.account_value`, return distribution (median/std/skew), a per-bucket breakdown (hour/weekday/month), trade count `N`, and a 95% win-rate confidence interval — replacing the placeholder `sharpe=0.0` and the R-only drawdown.
3. **Delete three dead config knobs** (`min_minutes_after_open`, `require_close_above_prior_bar_high`, `require_close_above_vwap`) that are parsed but never read, so config means what it says.

Every new concept ships with a `HelpTooltip` (VI); per-trade cost detail is journaled (VII); every behavior change is test-first (IV). Strategy logic and the SPY-only / long-only / risk-veto / paper-first contracts are untouched.

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript / React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, pandas, pytest (backend); React + Vite + Tailwind, `@tanstack/react-query`, Radix Popover (`HelpTooltip`), klinecharts (existing price chart), vitest + @testing-library/react (frontend)

**Storage**: Supabase Postgres — `runs.summary` is a JSONB column (adding fields is non-breaking, no migration required); local backtest artifact `summary.json`; journal CSV.

**Testing**: pytest (backend unit + fixture), vitest + testing-library (frontend components)

**Target Platform**: Linux server (FastAPI), modern browser (SPA)

**Project Type**: Web application (separate `backend/` + `frontend/`)

**Performance Goals**: A full-span backtest (~164,918 bars, ~3,926 trades) runs in ~5s today; added metric computation must stay negligible (target < ~1s overhead, single pass over the trade list).

**Constraints**: No lookahead (engine replays chronologically — costs touch only fill prices, never future bars). All time-bucketing uses `America/New_York` via `clock.py`. `$` figures rounded consistently; a committed fixture must reproduce exact net PnL deterministically. Metrics must degrade gracefully on 0/1-trade and all-win/all-loss inputs.

**Scale/Scope**: ~8 years of 5-min SPY bars; thousands of trades per run; single-symbol.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | No symbol surface changes. `market.symbol: SPY` (`Literal["SPY"]`) stays pinned; `Bar`/`Signal` keep `Literal["SPY"]`. Costs and metrics operate on existing SPY trades only; dead-knob removal touches the VWAP-pullback config, not the symbol boundary. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | No ML/HMM/optimizer introduced — metrics are **descriptive**, computed *after* the run, never feeding the strategy. Deleting the three dead knobs does **not** change strategy behavior (they were inert; the VWAP/prior-bar confirmations are already hardcoded). Strategy still only *suggests* signals; cost logic lives in the broker, not the strategy. `Direction` stays LONG-only. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | yes (indirect) | Costs make `realized_pnl` strictly more conservative, so the daily-loss lockout (`_apply_exit_to_state` → `daily_realized_pnl`) trips *earlier*, never later — the veto is strengthened, not bypassed. Every trade still requires stop **and** target; the broker still refuses non-approved trades; all limits remain in `config.yaml`. New cost params live in `config.yaml` (no hardcoded literals). |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every behavior change (cost application on entry/stop/target/force-flat, each new metric, each knob deletion) is preceded by a failing test. A committed cost **fixture** asserts exact net PnL (spec SC-002). Frontend `Stat`/tooltip additions get vitest component tests. All edits land in `backend/src/` and `frontend/src/` (TDD-mandatory roots). |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | no | No live code path touched. `broker.provider: paper`, `live_auto_enabled: Literal[False]` unchanged. Costs apply only inside the in-process `PaperBroker`/backtest simulator. |
| VI | Educational UI: Every Concept Is Explained | yes | New `HELP_CONTENT` keys + `HelpTooltip`s for every new concept: slippage, fees, expectancy, Sharpe, Sortino, drawdown `$`, drawdown `%`, return distribution, sample size, win-rate confidence interval, equity curve. The thin-sample "noise" flag explains *why* it's unreliable. |
| VII | Journal Everything | yes | Per-trade cost breakdown (gross PnL, fees, slippage, net PnL) added to `JournalEntry` → journaled via `journal/logger.py` and CSV-exportable. No new sink; existing logger path reused. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic — per-bucket hour/weekday/month derive from NY-local timestamps via `clock.py`; no reimplementation.
- [x] New limits/thresholds live in `backend/config/config.yaml` — `broker.fees_per_share`/`slippage_per_share` defaults set; new `metrics.*` block (low-confidence trade threshold, CI confidence level, annualization factor) added to config, not source.
- [x] Backend is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend is React + TypeScript + Vite + Tailwind. (Equity curve renders with a dependency-free inline SVG sparkline; no new charting library — see research.md.)

No NON-NEGOTIABLE principle is violated. **Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/010-honest-backtest/
├── plan.md              # This file
├── research.md          # Phase 0 — cost model, metric formulas, CI method, equity-curve rendering
├── data-model.md        # Phase 1 — extended SummaryMetrics / JournalEntry / Position + new value objects
├── quickstart.md        # Phase 1 — how to run + verify net-of-cost results and the fixture
├── contracts/
│   └── summary-contract.md   # summary.json + /api/runs/{id}/summary + cloud RunSummary additions
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── config/
│   └── config.yaml                         # cost defaults + new metrics.* block (EDIT)
├── src/intraday_trade_spy/
│   ├── config.py                           # BrokerConfig defaults; DELETE dead knobs; add MetricsConfig (EDIT)
│   ├── models.py                           # JournalEntry/Position cost fields; SummaryMetrics new fields (EDIT)
│   ├── broker/
│   │   ├── base.py                         # broker protocol (if needed) (EDIT)
│   │   └── paper.py                        # apply slippage to fills + fees to PnL (EDIT)
│   ├── backtest/
│   │   ├── engine.py                       # pass cfg.broker to PaperBroker (EDIT)
│   │   └── metrics.py                      # expectancy, Sharpe/Sortino, DD $/%, distribution, buckets, CI, equity curve (EDIT)
│   ├── strategy/vwap_pullback.py           # (no change — confirmations already hardcoded)
│   ├── api/schemas.py                      # RunSummaryView new fields (EDIT)
│   └── storage/
│       ├── models.py                       # cloud RunSummary new fields (EDIT)
│       └── push.py                         # map new metrics into cloud summary (EDIT)
└── tests/                                  # failing-test-first for every change above + cost fixture (NEW/EDIT)

frontend/
├── src/
│   ├── api/legacy-types.ts                 # SummaryMetricsView new fields (EDIT)
│   ├── api/types.ts                        # RunSummary new fields (EDIT)
│   ├── components/
│   │   ├── summary-metrics-card.tsx        # new Stat cells + tooltips + noise flag (EDIT)
│   │   ├── help-content.ts                 # new HELP_CONTENT keys (EDIT)
│   │   ├── per-bucket-card.tsx             # new — hour/weekday/month breakdown (NEW)
│   │   └── equity-curve.tsx                # new — dependency-free SVG sparkline (NEW)
│   └── routes/run-viewer.tsx               # mount per-bucket card + equity curve (EDIT)
└── src/components/*.test.tsx               # vitest tests for new/changed components (NEW/EDIT)
```

**Structure Decision**: Existing web-app layout (`backend/` + `frontend/`). This feature is additive within those trees — no new top-level structure. The two summary surfaces (local `SummaryMetrics` → `summary.json` → legacy `/api/runs/{id}/summary` → `SummaryMetricsView`/`summary-metrics-card.tsx`; and cloud `RunSummary` JSONB → `RunSummaryView`) are both extended so detail-view and cross-run/aggregation surfaces stay consistent.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
