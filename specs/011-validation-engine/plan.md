# Implementation Plan: Validation Engine (Phase 2 — Validation Methodology)

**Branch**: `011-validation-engine` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-validation-engine/spec.md`

## Summary

Build the engine that distinguishes a real, durable edge from fit-to-noise. The central object is a **validation study** — a background-orchestrated container that runs *many* backtests over different date windows and/or a human-specified parameter grid, then aggregates them into four verdicts:

1. **Walk-forward** — in-sample (training-window) vs out-of-sample (next validation-window) metrics, side by side, with the gap flagged (overfit detector). Default: rolling 12-month train / 6-month step, over the **train+validation** pool only — the **lockbox is never touched**.
2. **Parameter sensitivity** — a human-specified grid of knob values → a metric *surface*, so a robust **plateau** is distinguishable from a fragile **spike**.
3. **Significance** — a **bootstrap** confidence interval on key metrics + a **random-entry permutation** test ("could random entries under identical exit/risk rules have done this?") → a plain "significant at α = 0.05?" verdict, seeded for reproducibility.
4. **One-shot lockbox** — freeze a candidate config, run it on the held-out lockbox **exactly once**, recorded immutably; a second run against a *different* config is **blocked by default** with one deliberate, journaled **"override & burn"** escape hatch.

**Governing constraint (Principle II):** the engine **evaluates and reports**; it never auto-selects a config to trade, never chains a machine-chosen config into the next window, never feeds a broker. The human reads the surfaces and picks. No optimizer, no ML.

**Reuse, not reinvention.** Each window×config evaluation is a *normal run* — tagged to a parent study via new `runs.study_id` / `runs.segment` / `runs.window_index` columns — so it inherits run **dedup** (`compute_spec_hash` + the `(user_id, spec_hash, data_fingerprint)` unique index), the per-run **config snapshot**, full **trades/journal**, RLS, and the existing **run-detail UI** for drill-down. A study aggregates its children. Studies run as a FastAPI **BackgroundTask** with a `validation_studies` parent row (mirroring the `backfill_jobs` pattern). The one engine refactor (FR-024) extracts an in-memory `run_df(...)` so a study loads the full history **once** and slices per window instead of re-parsing a CSV per evaluation.

Every new concept ships a `HelpTooltip` (VI); studies + lockbox spend/burn are journaled (VII); every behavior change is test-first (IV). SPY-only / long-only / risk-veto / paper-first contracts are untouched.

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript / React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, pandas + numpy (numpy already transitive via pandas — used for seeded bootstrap/permutation RNG), pytest (backend); React + Vite + Tailwind, `@tanstack/react-query`, TanStack Router, Radix Popover (`HelpTooltip`), vitest + @testing-library/react (frontend). **No new charting dependency** — the sensitivity surface renders as a dependency-free SVG/CSS heatmap (010 precedent).

**Storage**: Supabase Postgres. New tables `validation_studies` and `lockbox_ledger`; three new nullable columns on `runs` (`study_id`, `segment`, `window_index`). Child-run rows, trades, signals, journal reuse existing tables. Migrations are SQL files applied via direct psycopg + `SUPABASE_DB_URL`.

**Testing**: pytest (split math, WF windowing + lockbox-leakage guards, seeded bootstrap/permutation determinism, lockbox-burn guard, `run_df` equivalence fixture); vitest + testing-library (Validation UI components + tooltips).

**Target Platform**: Linux server (FastAPI), modern browser (SPA).

**Project Type**: Web application (separate `backend/` + `frontend/`).

**Performance Goals**: Each evaluation runs over a *window* (~12–18 months ≈ 23k–35k bars), not the full 164k, so ~1–2s each. A default study (e.g. ~11 walk-forward windows, or a ≤50-point sensitivity grid) completes in low single-digit minutes as a background job. Significance uses a lightweight random-entry simulator (reuses the broker's bar-walk exit logic) rather than re-running the full strategy loop 1000×, keeping a 1000-iteration permutation in the seconds-to-low-minutes range.

**Constraints**: No lookahead (engine still replays chronologically; window slices are date-bounded, never future-peeking). **Lockbox isolation is enforced in code + tests** — no non-lockbox study may evaluate a bar dated in the lockbox segment. All date/time bucketing uses `America/New_York` via `clock.py`. All randomness is seeded (`numpy.random.default_rng(seed)` from config) → identical inputs+seed produce byte-identical verdicts. New limits/thresholds/dates live in `config.yaml` (`validation` block), never in source.

**Scale/Scope**: ~8 years of 5-min SPY bars (164,918 bars); a study spawns tens (sensitivity) to low-hundreds of child runs; single-symbol.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes (indirect) | Every child run, every window slice, and the permutation null all operate on SPY bars only. `market.symbol: SPY` (`Literal["SPY"]`) and the API's rejection of `symbol` on the start-backtest boundary are unchanged; the new validation endpoints likewise never accept a symbol. No multi-symbol surface introduced. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | **yes (central)** | The engine is **evaluate-and-report only** (FR-022): it runs configs the human specifies and surfaces IS-vs-OOS / sensitivity / significance; it **never auto-selects** a config, **never chains** a machine-chosen config into a window, and **never feeds a broker**. Parameter grids are human-supplied explicit value lists — there is **no optimizer** searching the space. No ML/HMM. The random-entry **permutation null** generates LONG-only synthetic entries with the existing stop/target geometry **purely to compute a p-value** — it is a statistical baseline, never a trading strategy, never selected, never executed. The production VWAP-pullback strategy and `Direction`=LONG are untouched. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | yes (indirect) | Every evaluation (walk-forward, sensitivity, lockbox) runs the full `Strategy → RiskManager → Broker` path with stop+target required and costs applied — the veto is unchanged and unbypassed. The permutation null's synthetic trades are sized/clamped through the same risk sizing and costs, so they cannot fabricate impossible trades. All limits stay in `config.yaml`. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Failing-test-first for: split-segment math, walk-forward window enumeration **and the lockbox-no-leakage guard**, the `run_df` ↔ `run(csv_path)` equivalence fixture, seeded bootstrap/permutation determinism, the lockbox spend/idempotent-resave/block/override-burn state machine, and every new API endpoint + frontend component. All code lands in `backend/src/`, `frontend/src/`, or non-trivial `backend/scripts/`. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | no (affirmed) | Entirely backtest-mode. No broker integration, no live path, no scheduler that places orders. `broker.provider: paper` and `live_auto_enabled: Literal[False]` untouched. The "one-shot lockbox" is a *backtest* over held-out historical bars, not a live action. |
| VI | Educational UI: Every Concept Is Explained | yes | New `HELP_CONTENT` keys + `HelpTooltip`s for: walk-forward, in-sample, out-of-sample, IS-vs-OOS gap, plateau-vs-peak, parameter sensitivity, bootstrap confidence interval, permutation/Monte-Carlo test, lockbox, and burned/contaminated lockbox (FR-021). |
| VII | Journal Everything | yes | Study lifecycle (created/started/finished/failed) and **every lockbox spend and burn** emit `journal_events` rows (`kind='lifecycle'`, details payload `{event: "validation_study_*"}` / `{event: "lockbox_spent"\|"lockbox_burned", config_fingerprint, override}`). Existing `journal/logger.py` sink reused. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic — window/segment slicing uses ET `session_date` via `clock.py`; no clock reimplementation.
- [x] New limits/thresholds/dates live in `backend/config/config.yaml` — a new `validation` block (split dates, walk-forward window/step/mode, sensitivity default metric + grid warn threshold, significance iterations/confidence/alpha/seed). No hardcoded dates or limits in source.
- [x] Backend is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend is React + TypeScript + Vite + Tailwind — sensitivity surface uses a dependency-free SVG/CSS heatmap; no new charting library.

No NON-NEGOTIABLE principle is violated. The Principle-II proof above (engine reports, human selects; the permutation null is a statistical baseline, not a strategy) is the load-bearing one and is reinforced by FR-022 and a test asserting no validation code path can reach a broker/live call. **Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/011-validation-engine/
├── plan.md              # This file
├── research.md          # Phase 0 — engine refactor, study orchestration, WF math, bootstrap/permutation method, lockbox ledger, heatmap rendering
├── data-model.md        # Phase 1 — validation_studies + lockbox_ledger schema, runs new columns, Python study/result models, API views
├── quickstart.md        # Phase 1 — run a walk-forward / sensitivity / significance / lockbox study and verify
├── contracts/
│   └── validation-api.md     # /api/validation/* endpoints + study-result payload shapes
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── config/
│   └── config.yaml                          # new `validation` block: split dates, walk_forward, sensitivity, significance (EDIT)
├── db/migrations/
│   ├── 0110_validation_studies.sql          # validation_studies parent table + RLS + indexes (NEW)
│   ├── 0111_runs_study_columns.sql          # runs ADD study_id FK, segment, window_index + index (NEW)
│   ├── 0112_lockbox_ledger.sql              # immutable append-only lockbox_ledger + RLS (NEW)
│   └── 0113_push_run_finalize_study.sql     # update push_run/finalize RPC to pass study_id/segment/window_index (NEW)
├── src/intraday_trade_spy/
│   ├── config.py                            # ValidationConfig + sub-models; add to Config (EDIT)
│   ├── models.py                            # study/result value objects (WalkForwardWindowResult, SensitivitySurface, SignificanceResult, ...) (EDIT)
│   ├── backtest/
│   │   └── engine.py                        # extract run_df(df, ...); run(csv_path) delegates (behavior-neutral) (EDIT)
│   ├── validation/                          # NEW module — the heart of this feature
│   │   ├── __init__.py
│   │   ├── split.py                         # train/validation/lockbox segments from config; lockbox-membership guard
│   │   ├── window.py                        # walk-forward window enumeration (rolling/anchored)
│   │   ├── walk_forward.py                  # orchestrate per-window IS/OOS evaluations → WalkForward result
│   │   ├── sweep.py                         # parameter grid → per-point evaluations → SensitivitySurface
│   │   ├── significance.py                  # seeded bootstrap CI + random-entry permutation p-value + verdict
│   │   ├── random_entry.py                  # lightweight random-entry null simulator (reuses broker exit/costs)
│   │   ├── lockbox.py                       # freeze fingerprint + spend/idempotent/block/override-burn state machine
│   │   └── study.py                         # study orchestrator (loads bars once, slices, runs children, aggregates)
│   ├── api/
│   │   ├── validation_lifecycle.py          # background-task runner for a study (mirrors lifecycle._run_backtest_task) (NEW)
│   │   ├── routers/validation.py            # POST/GET /api/validation/studies, /{id}, /{id}/status, lockbox run+override (NEW)
│   │   └── schemas.py                       # Start*StudyRequest / *View response bodies (EDIT)
│   └── storage/
│       ├── client.py                        # study CRUD, list child runs by study, ledger read/append (EDIT)
│       └── models.py                        # ValidationStudyRow, LockboxLedgerRow; RunRow + study fields (EDIT)
└── tests/
    └── validation/                          # failing-test-first for split/window/wf/sweep/significance/lockbox + engine run_df fixture (NEW)

frontend/
├── src/
│   ├── api/
│   │   ├── types.ts                         # ValidationStudy, study-result, ledger types (EDIT)
│   │   └── validation.ts                    # client + react-query hooks for /api/validation/* (NEW)
│   ├── hooks/                               # useStudies / useStudy / useStudyStatus / useStartStudy / useLockboxRun (NEW)
│   ├── routes/
│   │   ├── _authenticated.validation.tsx              # studies list + launch (NEW)
│   │   └── _authenticated.validation_.$studyId.tsx    # study detail (WF table / sensitivity surface / significance / lockbox) (NEW)
│   └── components/
│       ├── validation/
│       │   ├── walk-forward-table.tsx       # IS-vs-OOS per-window table, gap highlighted (NEW)
│       │   ├── sensitivity-surface.tsx      # dependency-free SVG/CSS heatmap (NEW)
│       │   ├── significance-panel.tsx       # CI + permutation p-value + verdict badge (NEW)
│       │   ├── lockbox-gate.tsx             # freeze → one-shot run → spent/burned state (NEW)
│       │   └── start-study-dialog.tsx       # launch WF/sensitivity study (NEW)
│       └── help-content.ts                  # new HELP_CONTENT keys for every new concept (EDIT)
└── src/components/validation/*.test.tsx     # vitest tests for new components (NEW)
```

**Structure Decision**: Existing web-app layout (`backend/` + `frontend/`). The feature is additive: a new backend `validation/` module + `api/routers/validation.py` + `api/validation_lifecycle.py`, three new tables + three `runs` columns + an RPC update, and a new frontend `Validation` route/section. The **only edit to existing trading code** is the behavior-neutral `engine.run_df(...)` extraction (FR-024). Child-run persistence, dedup, snapshots, journal, and the run-detail UI are reused unchanged.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
