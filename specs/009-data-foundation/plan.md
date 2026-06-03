# Implementation Plan: Phase 0 — Data Foundation (Multi-Regime Historical Bars)

**Branch**: `009-data-foundation` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-data-foundation/spec.md`

## Summary

Add **Alpaca market data** as a second, multi-year SPY 5-minute bar source alongside the existing yfinance source, load years of history via an **in-app background backfill job** with progress, enforce **one clean bar per timestamp** on the backtest read path (prefer Alpaca over yfinance), index `bars(bar_start)` for fast range reads, and surface **per-regime data coverage** (with a 90%-completeness "covered" bar) in the UI. The result: a single backtest spans 2020–present across four regimes and yields hundreds+ trades instead of six — the prerequisite for every later phase.

**Technical approach**: introduce a small `BarSource` abstraction (a Protocol) so the new `AlpacaBarSource` produces the *same normalized rows* (`bar_start, open, high, low, close, volume, source`) as the existing yfinance `Downloader`, with `source='alpaca'`. The backfill mirrors the proven `data_download_jobs` background-job pattern with a new `backfill_jobs` table tracking status + progress + gaps. Cross-source dedup is enforced in exactly one place — `materialize_bars_csv()` (the function that feeds the engine) — by selecting `source` in `list_bars()` and keeping the highest-precedence source per `bar_start`. Coverage is extended to compute per-regime completeness against an NYSE trading calendar.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: Backend — FastAPI, Pydantic v2, pandas, supabase-py (PostgREST), psycopg (already added for direct DB reads), **`alpaca-py`** (new — official Alpaca SDK for historical bars), **`pandas-market-calendars`** (new — NYSE session calendar for expected-session counts). Frontend — TanStack Query, TanStack Router, Tailwind, Vitest.

**Storage**: Supabase Postgres. `bars` table `UNIQUE(bar_start, source)`, RLS (authenticated read, service-role write). New: `backfill_jobs` table; new index `bars(bar_start)`. DDL applied **manually in the Supabase SQL editor** (project practice); reads via PostgREST, with psycopg/`SUPABASE_DB_URL` for the per-regime aggregate.

**Testing**: pytest (backend, `unit_client` + `stub_storage_client` MagicMock fixtures), Vitest + Testing Library (frontend). TDD mandatory (constitution IV) — Alpaca SDK calls are mocked via an injectable client (mirrors `Downloader(download_fn=...)`).

**Target Platform**: Linux server (Fly.io backend), browser SPA (Vercel frontend), Supabase Postgres.

**Project Type**: Web application (backend + frontend), Option 2 structure.

**Performance Goals**: A multi-year bar read (≈tens of thousands of rows) materializes in **seconds**; range reads use the new `bar_start` index (no full scan). Backfill is a long-running background job (minutes), non-blocking.

**Constraints**: SPY-only (constitution I). Alpaca usage is **market-data read-only** — no trading/execution client is instantiated (constitution V). Free Alpaca tier = **IEX feed** (see research.md risk on VWAP fidelity). Regular session 09:30–16:00 ET only.

**Scale/Scope**: ~2018/2020 → present of 5-minute SPY bars (~78 bars/session × ~250 sessions/yr × ~5 yr ≈ **~100k bars**). New: 1 bar-source class, 1 backfill job + 2–3 endpoints, 1 dedup change, 1 index migration, 1 jobs-table migration, ~3 frontend additions (coverage panel, backfill trigger, tooltips).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | **yes** | Alpaca requests hard-code `"SPY"`; `_parse_csv`/normalize keep the SPY-only filter; `market.symbol` stays `Literal["SPY"]`; `bars` gains **no** `symbol` column. New source/loader signatures are written *symbol-parameterizable* (a `symbol: str = "SPY"` arg) but **default to and enforce SPY** — no other symbol is reachable. No multi-symbol behavior ships. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | no | No strategy, signal, or ML/HMM code touched. Pure data-layer feature. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No order/broker/risk path touched. No trades are placed. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | **yes** | Every new module (Alpaca bar source, backfill job runner, dedup logic, coverage-by-regime, frontend hooks/components) is preceded by a failing test. Alpaca SDK is injected (mockable) like `Downloader(download_fn=...)`. Exempt: the ≤5-line env-keyed client constructor, config YAML, `.env.example`, docs. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | **yes (data-only)** | Adding Alpaca **credentials + SDK** could *look* like a step toward live trading; it is not. This feature instantiates only Alpaca's **historical market-data** client (read-only). No `TradingClient`, no order path, no websocket execution. `broker.provider` stays `paper`; `live_auto_enabled` stays `Literal[False]`. A test asserts no trading/order client is constructed by the data path. `ALPACA_PAPER=true` is stored for *future* phases, unused here. |
| VI | Educational UI: Every Concept Is Explained | **yes** | Each new UI concept — **data coverage**, **regime completeness**, **backfill**, **data source** — ships a `?` `HelpTooltip` (new `help-content.ts` keys) answering what/why/how. |
| VII | Journal Everything | **partial / by-design** | The trade-lifecycle journal (`journal/logger.py`) is unchanged and not bypassed (no trade events occur). The spec's operator-record requirement (FR-008) is met by the `backfill_jobs` row (source, range, bars added, gaps, status) + its status endpoint — the auditable record for a data operation. |

**Engineering standards check:**

- [x] Timezone `America/New_York` for all session logic; reuse the existing ET session-window handling (`clock.py` / downloader's session filter) rather than re-hardcoding a third copy.
- [x] New limits/thresholds/windows in `backend/config/config.yaml`: `data.source_preference`, `data.regimes`, `data.regime_covered_threshold_pct`, `api.backfill.{window_days,max_concurrent_per_user}`, `alpaca.feed`. No magic numbers in source. Alpaca **secrets** stay in env (`.env`), never YAML.
- [x] Backend Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend React + TypeScript + Vite + Tailwind.

**Result: PASS.** No NON-NEGOTIABLE principle is violated; Complexity Tracking is empty. The one item worth conscious attention (V) is resolved by keeping Alpaca strictly read-only data and asserting it in a test.

## Project Structure

### Documentation (this feature)

```text
specs/009-data-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output — Alpaca SDK/feed, calendar lib, dedup, job pattern, VWAP risk
├── data-model.md        # Phase 1 output — Bar, BarSource, BackfillJob, Coverage, RegimeWindow + migrations
├── quickstart.md        # Phase 1 output — run a backfill end-to-end and verify the exit gate
├── contracts/           # Phase 1 output — backfill + coverage endpoint contracts
│   ├── backfill.md
│   └── coverage.md
├── checklists/
│   └── requirements.md  # from /speckit-specify (16/16)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── data/
│   │   ├── downloader.py          # EXISTING yfinance Downloader (unchanged interface)
│   │   ├── bar_source.py          # NEW — BarSource Protocol + normalized-row contract
│   │   └── alpaca_source.py       # NEW — AlpacaBarSource (alpaca-py, IEX, 5-min, ET session filter)
│   ├── api/
│   │   ├── lifecycle.py           # EDIT — materialize_bars_csv dedup; backfill job runner
│   │   └── routers/
│   │       └── bars.py            # EDIT — POST /bars/backfill, GET /bars/backfill/{id}; coverage++ 
│   ├── storage/
│   │   └── client.py              # EDIT — list_bars selects source; backfill_jobs CRUD; coverage-by-regime
│   ├── calendar/                  # NEW (or util) — expected-session counts via pandas-market-calendars
│   └── config.py                  # EDIT — AlpacaConfig, DataConfig.{source_preference,regimes,threshold}
├── config/config.yaml             # EDIT — regimes, source_preference, backfill, alpaca.feed
├── db/migrations/
│   ├── 0093_bars_bar_start_index.sql   # NEW — CREATE INDEX ON bars (bar_start)
│   └── 0094_backfill_jobs.sql          # NEW — backfill_jobs table + RLS
├── scripts/
│   └── backfill_bars.py           # OPTIONAL — CLI sharing the backfill core (mirrors seed_bars_from_csv.py)
├── .env.example                   # EDIT — ALPACA_API_KEY / ALPACA_SECRET_KEY / ALPACA_PAPER placeholders
└── tests/                         # NEW tests mirroring test_downloader.py / test_bars_endpoints.py

frontend/
├── src/
│   ├── api/bars.ts                # EDIT — startBackfill, getBackfillStatus; coverage type ++ 
│   ├── hooks/
│   │   ├── useBarsCoverage.ts     # EDIT — richer coverage type
│   │   ├── useStartBackfill.ts    # NEW — useMutation
│   │   └── useBackfillStatus.ts   # NEW — polling useQuery
│   ├── components/
│   │   ├── data-coverage-panel.tsx # NEW — span + per-regime completeness + backfill trigger
│   │   └── help-content.ts        # EDIT — coverage/regime/backfill/source help keys
│   └── routes/
│       └── _authenticated.data.tsx # NEW — host page for the coverage panel (or embed in existing)
└── (vitest tests colocated)
```

**Structure Decision**: Web-app (Option 2). The feature is additive: a new bar source and backfill job slot into the existing data layer; the single behavior change to existing code is the dedup in `materialize_bars_csv()`. Frontend adds a coverage/backfill surface (new route preferred over further overloading `strategy-config-dropdown.tsx`).

## Complexity Tracking

> No constitution violations — no entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
