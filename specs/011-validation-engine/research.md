# Phase 0 — Research: Validation Engine

All decisions below are grounded in a full pass over the existing code (config, engine, lifecycle, storage, migrations, frontend). Format: **Decision · Rationale · Alternatives rejected**.

---

## R1 — Engine refactor: in-memory `run_df(...)` (FR-024)

**Decision.** Extract the post-load body of `BacktestEngine.run()` into `run_df(self, df: pd.DataFrame, *, range_start: date, range_end: date) -> BacktestResult`. The existing `run(self, *, csv_path, output_dir)` becomes a thin wrapper: `df = load_bars(csv_path, market=self.cfg.market)` → `attach_indicators(...)` → `self.run_df(df, ...)`. A study loads the **full** train+validation (or required) span once via `materialize_bars_csv` + `load_bars`, then slices in-memory per window with a boolean mask on the ET `session_date` column, calling `run_df` per slice.

**Rationale.** Behavior-neutral and minimal: the loop, risk state, and `compute_summary` are unchanged — only their input plumbing moves. Slicing a pre-parsed DataFrame is ~free vs. re-reading + re-parsing 164k CSV rows per window. `attach_indicators` (VWAP/opening-range) is daily-reset and bar-local, so it is correct to compute on the full frame once and slice, **as long as each window slice starts at a session boundary** — windows are date-bounded (whole sessions), so VWAP/OR recompute correctly within each retained session. (We will assert this with the equivalence fixture below.)

**Validation (TDD).** A golden fixture asserts `run(csv_path=F)` and `run_df(load_bars(F))` produce byte-identical `SummaryMetrics` and journal rows. A second test slices a multi-month frame to a sub-range and asserts the per-session indicator values match a standalone `run` over just that sub-range's CSV (no cross-window VWAP bleed).

**Alternatives rejected.** (a) Per-window CSV materialization — re-reads/re-parses the full history per evaluation (hundreds of reparses, minutes of waste). (b) Read each window directly from Supabase per evaluation — N× network round-trips and duplicates the dedupe/source-preference logic already in `materialize_bars_csv`.

---

## R2 — Bars loading for a study: materialize-once, slice-in-memory

**Decision.** For a study, materialize **one** CSV for the whole required span (train+validation for walk-forward/sensitivity; lockbox for the one-shot) via the existing `materialize_bars_csv(storage_client, start, end)`, `load_bars` it once into a DataFrame, `attach_indicators` once, then slice per window. The CSV is a throwaway temp (same as today).

**Rationale.** Reuses the proven cache-first materialization + source-preference dedupe path verbatim; one network/IO pass per study. The full 2018→2024 frame (~140k bars) fits comfortably in memory.

**Alternatives rejected.** A new `load_bars_range(df-from-table)` path that bypasses CSV — cleaner long-term but duplicates dedupe logic and is a larger surface; defer to 012 if direct-DataFrame loading becomes worthwhile.

---

## R3 — Study orchestration & background-job pattern

**Decision.** A `validation_studies` parent table tracks each study (mirrors `backfill_jobs`, migration 0094): `id, user_id, kind ∈ {walk_forward, sensitivity, lockbox}, status ∈ {queued, running, finished, failed}, params JSONB, progress_completed INT, progress_total INT, result JSONB, failure_reason, created_at/updated_at`. The launch endpoint inserts a `queued` study row and enqueues `validation_lifecycle.run_study_task` via FastAPI `BackgroundTasks` (same mechanism as `_run_backtest_task`). The task loads bars once, enumerates evaluations, runs each through `run_df`, **persists each as a normal child run** (status `finished`) tagged `study_id`/`segment`/`window_index`, updates `progress_*`, then writes the aggregated `result` JSONB and flips the study to `finished`. Crash recovery: extend the existing `sweep_stale_runs()` startup hook to also fail stale `running` studies.

**Concurrency.** Evaluations run **sequentially** within the task in v1 — deterministic, simple, and avoids Supabase write contention. Parallelization is a later optimization (noted, not built).

**Dedup reuse (SC-008).** Each child evaluation computes `compute_spec_hash(strategy, params, symbol, window_start, window_end)`. For completed windows (`window_end < today_ET`) the task first calls `find_finished_run_by_spec(spec_hash)`; on a hit it **links the existing finished run** to the study (a second study-link row / re-tag) instead of recomputing. So re-running an identical study reuses prior evaluations.

**Rationale.** One proven pattern (queued→running→finished, status polling, slot/stale sweep) extended once; child runs get dedup, snapshot, journal, RLS, and drill-down for free.

**Alternatives rejected.** (a) A bespoke job queue — over-engineered for a solo-user background task. (b) Storing only aggregates and discarding child runs — loses per-window drill-down and the dedup reuse, and weakens the 012 insights foundation.

---

## R4 — Train / validation / lockbox split & lockbox isolation

**Decision.** Segments come from a new `validation.split` config block (dates, not code). Default: `train 2018-01-01→2022-12-31`, `validation 2023-01-01→2024-12-31`, `lockbox 2025-01-01→2026-12-31`; lockbox is the most-recent slice. `validation/split.py` exposes `segments(cfg) -> {train, validation, lockbox}` and a hard guard `assert_no_lockbox_overlap(range_start, range_end, segments)` that raises if a non-lockbox study's range intersects the lockbox. The walk-forward/sensitivity orchestrators call this guard before any evaluation; the only path permitted to touch lockbox dates is the explicit lockbox endpoint.

**Rationale.** "No self-deception" must be enforced by code, not discipline (FR-003, SC-001). Config-driven dates keep the constitution's no-magic-numbers rule.

**Validation (TDD).** Tests assert: (a) a walk-forward study over the default split evaluates zero bars dated ≥ lockbox start; (b) a study whose requested range crosses into lockbox is refused with an explicit error.

**Alternatives rejected.** Proportional (e.g. 60/20/20) auto-split — less transparent than explicit dates and harder to keep stable as data grows; regime-keyed split — couples validation to regime tagging unnecessarily for v1.

---

## R5 — Walk-forward windowing math

**Decision.** `validation/window.py` enumerates windows over the **train+validation** pool from `validation.walk_forward` config: `mode ∈ {rolling, anchored}`, `train_months` (default 12), `step_months` (default 6), `validation_months` (default 6). For step `i`: rolling train = `[pool_start + i·step, +train_months)`, anchored train = `[pool_start, train_end_i)`; the **out-of-sample** window is `[train_end_i, train_end_i + validation_months)`. Enumerate while the OOS window end ≤ pool end. Each window produces **two child runs for the same config** — one over the train window (in-sample), one over the OOS window — and the per-window result records both metric sets + the **gap** (OOS − IS) for expectancy ($/R), win rate, profit factor, Sharpe, plus per-window OOS trade count and `low_confidence` flag. The aggregate reports mean OOS metrics and mean gap.

**Rationale.** This is the canonical rolling walk-forward; the default (12/6/6 over 2018→2024) yields ≈11 OOS windows with enough trades each (clarified). Anchored is offered for the "retrain on all history" framing.

**Validation (TDD).** Window enumeration is pure and tested against hand-computed boundaries for both modes; a test asserts no enumerated window overlaps lockbox.

**Alternatives rejected.** Auto-selecting the best config per train window and chaining it forward (classic WF *optimization*) — **rejected on Principle II** (that is automated optimization; clarified out in brainstorming). We report; the human selects.

---

## R6 — Parameter sensitivity grid & surface

**Decision.** `validation/sweep.py` takes 1 or 2 knobs, each a dotted config path (e.g. `strategy.vwap_pullback.target.risk_reward`) plus an explicit list of values, forms the Cartesian product, and runs one child evaluation per grid point over a chosen segment (default: train, optionally train+validation). The result is a `SensitivitySurface`: a list of `{coords: {knob→value}, metric, trade_count, low_confidence}` plus axis metadata. Default metric `validation.sensitivity.default_metric = expectancy_dollars` (configurable per study). Plateau-vs-spike is read visually from the heatmap; the surface also carries a lightweight "neighbor stability" hint (max |metric − neighbor metric| normalized) to aid the eye — informational only.

**Bounds (FR-012).** Before launch, the endpoint computes `grid_points × (windows if combined)` and returns it in the response; if it exceeds `validation.max_evaluations_warn` (default 200) the request must carry `confirm_large=true`. Nothing fans out unbounded silently.

**Scope.** 1-D (a row) and 2-D (a heatmap) grids in v1; ≥3-D is rejected with guidance to fix other knobs (the UI can only render up to 2-D).

**Alternatives rejected.** Auto-ranged grids (pick min/max/step for the user) — hides the human's choice and edges toward optimization; explicit value lists keep research manual.

---

## R7 — Significance: bootstrap CI

**Decision.** `validation/significance.py` computes confidence intervals by **resampling with replacement** (`numpy.random.default_rng(seed)`), default `bootstrap_iterations = 1000`, `confidence = 0.95` → percentile CI (2.5/97.5). Statistics: **expectancy_dollars** and **expectancy_r** resample the per-trade net-PnL / net-R arrays; **Sharpe** resamples the per-ET-day net-return series (consistent with `metrics._sharpe_sortino`). Output: point estimate + `[lo, hi]` per statistic + the seed used.

**Rationale.** Percentile bootstrap is the standard, assumption-light CI for skewed trade distributions; numpy is already in-tree via pandas and gives clean, fast, reproducible seeding.

**Validation (TDD).** Same seed + same trades → identical bounds (SC-004). A degenerate input (0/1 trades) yields `None`/undefined bounds, clearly labeled, no exception.

**Alternatives rejected.** Normal-approximation CI — wrong for skewed expectancy; stdlib `random` — slower for 1000× resamples and noisier seeding ergonomics than `default_rng`.

---

## R8 — Significance: random-entry permutation test (clarified null)

**Decision.** The null is the **random-entry** method (clarified): build a null distribution by generating, per iteration, the **same number of entries** as the observed result at **randomly chosen eligible bars** — respecting `clock` constraints (market open, `allow_new_trades` cutoff, one position at a time, no overnight) — and applying the **same stop/target geometry, the same risk sizing, and the same costs**, then recompute the metric (default: total net PnL / expectancy). `validation/random_entry.py` implements a **lightweight simulator** that, for each sampled entry bar, walks subsequent bars through the existing `PaperBroker` exit logic (stop/target/force-flat + slippage/fees) — reusing the broker, *not* the full strategy/risk loop. Default `permutation_iterations = 1000`, seeded. p-value = fraction of null metrics ≥ observed; **verdict = `p < alpha`** (`alpha` default 0.05). Output: p-value, alpha, boolean verdict, iteration count, seed.

**Rationale.** Directly answers the roadmap's question ("could random entries have done this?") under identical exit/risk/cost rules — isolating *entry-timing* edge. The lightweight bar-walk reuses proven exit code and keeps 1000 iterations in seconds-to-low-minutes (re-running the full strategy loop 1000× would be 15–30 min and is unnecessary — entries are random by construction, so the strategy/risk *evaluation* step is what we're replacing).

**Validation (TDD).** Same seed → identical p-value/verdict. The sampler is asserted to never place an entry that violates `clock` (no entries after `no_new_trades_after`, none overlapping an open position, none held overnight). A synthetic input with an obviously-not-special result yields a high p-value (not significant); a strongly positive deterministic fixture yields a low p-value.

**Alternatives rejected.** (a) Return sign/shuffle permutation — tests only whether the win/loss *sequence* is special, not entry timing (clarified against). (b) Full-engine re-run with a random-entry strategy — faithful but 10–30× slower for no added validity, since exits/risk/costs are identical to the lightweight path.

---

## R9 — Lockbox gate, freeze fingerprint & immutable ledger

**Decision.** `validation/lockbox.py` + a new append-only `lockbox_ledger` table enforce the one-shot discipline (clarified: **block by default + one recorded override-burn**):

- **Freeze fingerprint** = `compute_spec_hash(strategy, params, symbol, lockbox_start, lockbox_end)` — deterministic identity of "this exact config against this exact lockbox."
- **Ledger row** (append-only, never updated to overwrite a result): `id, user_id, lockbox_start, lockbox_end, config_fingerprint, run_id, result JSONB, state ∈ {spent, burned}, override BOOLEAN, created_at`.
- **State machine** (lockbox run endpoint):
  1. No ledger row for (user, lockbox range) → **allow**: run the one-shot child eval (`segment='lockbox'`), append a `spent` row, journal `lockbox_spent`.
  2. Existing row, **same** fingerprint → **idempotent**: return the recorded result (re-running the identical frozen config is the same one-shot, not a violation).
  3. Existing row, **different** fingerprint, `override=false` → **block** with `409 lockbox already spent`.
  4. Different fingerprint, `override=true` → run it, append a `burned` row (`override=true`), journal `lockbox_burned` (severity `warn`); the lockbox is now contaminated for that user and the UI shows it permanently.

**Rationale.** Append-only rows make the result immutable and the *history of attempts* auditable (you can see exactly when/how the lockbox was burned). "Accidental contamination impossible; deliberate contamination irreversible and on the record" (clarified).

**Validation (TDD).** State-machine tests for all four transitions: first spend records + journals; identical re-run is idempotent; a different config is blocked (409); override appends a burned row + warn journal and never overwrites the original. A test asserts a spent result row is never mutated.

**Alternatives rejected.** A single mutable "lockbox status" row — loses the attempt history and risks overwrite; a hard block with no override — leaves a genuinely new candidate with no held-out test until a fresh split exists (clarified against).

---

## R10 — Frontend: dependency-free sensitivity heatmap + Validation section

**Decision.** Follow the 010 precedent: **no new charting dependency.** The sensitivity surface is a CSS-grid / inline-SVG heatmap — colored cells on a sequential scale keyed to the metric, axis labels = knob values, with a legend and the `low_confidence` cells visibly marked. The walk-forward IS-vs-OOS view is a plain table with a color-coded gap column. The significance panel is a CI bar + p-value + a verdict badge. A new `Validation` route group (TanStack file-based routes) holds a studies list/launch page and a study-detail page that composes the four panels; each new concept gets a `HELP_CONTENT` key + `HelpTooltip`.

**Rationale.** Matches the existing dependency-light UI (equity curve is already a hand-rolled SVG sparkline); a heatmap is simple enough to hand-roll and avoids a new dep + bundle weight.

**Alternatives rejected.** Adding a charting/heatmap library (e.g. visx, nivo) — unnecessary weight for one heatmap; reusing klinecharts — it's a financial candlestick chart, wrong tool for a parameter surface.

---

## R11 — Config & migration sequencing

**Decision.** New top-level `validation` block in `config.yaml` parsed by a `ValidationConfig` Pydantic model (with `SplitConfig`, `WalkForwardConfig`, `SensitivityConfig`, `SignificanceConfig` sub-models). New migrations in the **`0110-` range** (latest committed is `0094`; `0100-09` left for the deferred 008 retention work): `0110_validation_studies.sql`, `0111_runs_study_columns.sql`, `0112_lockbox_ledger.sql`, `0113_push_run_finalize_study.sql` (updates the existing `push_run`/`push_run_finalize` RPCs — see migrations 0052/0053 — to pass through `study_id`/`segment`/`window_index`). Applied via direct psycopg + `SUPABASE_DB_URL` (sandbox note: preset/config writes and some git ops require `dangerouslyDisableSandbox`).

**Rationale.** Keeps the no-magic-numbers rule; non-colliding migration numbers; the RPC update is required because runs are inserted via RPC, not direct INSERT.

**Alternatives rejected.** Reusing `0100` — collides with the planned (not-yet-built) `0100_runs_soft_delete.sql` from feature 008.

---

## Open items intentionally deferred to planning-of-tasks / 012

- **Exact IS-vs-OOS gap threshold** that paints a window "overfit" red — a display threshold in `validation.walk_forward`; pick a concrete default in `tasks.md`.
- **Cross-study aggregation/insights** (per-config distribution across all studies, edge time-series, rejection mining) and **008 soft-delete retention** — explicitly **feature 012**.
- **Parallel evaluation** within a study — a later perf optimization; v1 is sequential and deterministic.
