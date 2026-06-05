# Phase 0 Research — Study Child-Run Persistence + Drill-Down

No `NEEDS CLARIFICATION` markers existed in the Technical Context: every open
question was resolved in the recorded brainstorming session (2026-06-04) and
verified against the codebase. This file records those decisions in research
format, plus the code-grounding checks performed.

## D1 — How to persist an in-memory evaluation as a run

- **Decision**: New `build_run_payload(result: BacktestResult, ...)` in
  `storage/push.py` maps the engine output directly to `PushRunPayload`;
  `gather_run_outputs()` is refactored to file-read + the shared mapper.
  Per-evaluation `client.push_run()` (the existing atomic `push_run(jsonb)`
  RPC).
- **Rationale**: `BacktestResult` already carries everything the file path
  round-trips through disk (`journal_rows`, `summary`, `run`), and
  `engine.run_df()` already computes a content-based `data_fingerprint`
  (`fingerprint_df`, verified at `backtest/engine.py:49–57`). Skipping the
  temp-dir keeps studies fast and the mapper single-sourced; a parity test
  (in-memory payload ≡ file-round-trip payload) makes the refactor safe.
- **Alternatives considered**:
  - *Temp-dir file round-trip per eval* — zero new mapping code but file I/O ×
    hundreds of evals, temp lifecycle, slower; rejected as a workaround shape.
  - *Batch insert at study end* — fewest RPCs but loses incremental
    durability/drill-down, needs a new bulk RPC, large memory for big grids;
    rejected. Per-eval RPC matches the existing per-eval progress UPDATE.

## D2 — Where the persistence hook lives

- **Decision**: Dependency-injected `persist` callback constructed in
  `api/validation_lifecycle.run_study_task()` (which owns user/config/strategy
  context), called from the `evaluate()` closures in `validation/study.py`.
- **Rationale**: `study.py` is deliberately storage-agnostic and unit-tested
  with stubs (its module docstring states the FR-005 deferral this feature
  closes); injecting `persist` preserves that. The lifecycle already builds
  per-point configs for sensitivity (`evaluate_point`), so it is the right
  place to capture the effective `config_snapshot` per evaluation.
- **Alternatives considered**: importing the storage client inside `study.py`
  (breaks the injection pattern and its offline unit tests); persisting inside
  `walk_forward.py`/`sweep.py` (those are pure evaluation loops; wrong layer).

## D3 — Dedup semantics for identical evaluations

- **Decision**: Per evaluation, `compute_spec_hash(strategy_id, params,
  symbol="SPY", range)` then `find_finished_run_by_spec()`; on hit, reference
  the existing `run_id` with `persisted=True` and skip the push.
- **Rationale**: Machinery exists and is proven on the single-backtest path
  (`api/lifecycle.py:310–325`); study windows are completed ranges, so the
  "frozen data" precondition holds. A dedup-linked run keeps its own
  `study_id` (possibly NULL) — single-valued columns can't claim two parents;
  the referencing study still drills in via its result JSON (SC-007).
- **Alternatives considered**: always push and rely on the finalize-time unique
  index (creates duplicate child rows across studies — pollutes cascade
  deletion); content-hash on results (no — spec hash already canonical).

## D4 — Drillability signalling (old studies + failed pushes)

- **Decision**: `persisted: bool = False` added to `WindowMetrics` and
  `SensitivityPoint`; set `True` on successful push or dedup hit. UI renders a
  "View run →" link only when `persisted` is true.
- **Rationale**: One mechanism covers both pre-014 results (field absent →
  Pydantic default False on re-parse, plain-missing in stored JSON for the
  frontend) and per-eval fail-soft outcomes — no result-version field, no
  per-cell existence probes.
- **Alternatives considered**: result-version field (coarser — can't express a
  single failed window in a new study); frontend HEAD-check per run id (N
  requests, racy; rejected).

## D5 — Fail-soft persistence

- **Decision**: Push/dedup exceptions are caught and logged inside the persist
  callback; the evaluation keeps `persisted=False`; the study proceeds.
- **Rationale**: The seed's hard constraint — "behavior of every evaluation
  must stay byte-identical to today; persistence is additive." A regression
  test asserts study aggregates are equal with persistence healthy, stubbed
  off, and raising.
- **Alternatives considered**: fail the study on persistence error (turns an
  observability feature into a reliability liability); retry loops (YAGNI —
  re-run path exists).

## D6 — Lockbox child run

- **Decision**: `run_lockbox()` persists its evaluation with
  `segment='lockbox'`, `study_id=None`, and writes `lockbox_ledger.run_id`
  via a small storage-client helper.
- **Rationale**: `lockbox_ledger.run_id` exists (0112) and is documented as the
  FR-005 deferral; `runs.segment` check constraint already allows `'lockbox'`
  (0111). The lockbox is the run the operator most wants to inspect.
- **Alternatives considered**: leaving the lockbox out (inconsistent — its
  one-shot result would stay un-drillable); creating a study row to parent it
  (the ledger already plays that role).

## D7 — Old studies: backfill vs. re-run (user decision)

- **Decision**: No automated backfill. Ship `POST
  /api/validation/studies/{study_id}/rerun` cloning `kind` + `params` (which
  embed `config_name`) into a fresh study via the existing `start_study()`,
  with `confirm_large=True`; "Re-run study" buttons on StudiesTable rows and
  the study detail page.
- **Rationale**: User chose the re-run-button option in brainstorming: general
  affordance, no one-off migration code, deterministic engine + frozen data
  means a re-run reproduces the study with children persisted.
- **Alternatives considered**: leave-and-ignore (no path to drill into the two
  real walk-forwards); one-time backfill re-execution inside 014 (scope, and
  dead code after first use).

## D8 — Significance attachment (user decision)

- **Decision**: No new significance UI. Child runs make the existing
  run-detail significance panel reachable for any window (≤2 clicks).
- **Rationale**: User confirmed "via run detail is enough"; the 011 seed's
  "significance attaches to a study window" is satisfied by persistence alone.
- **Alternatives considered**: inline per-window significance action (saves one
  click; adds plumbing — rejected by user).

## D9 — Study detail page treatment (user decision, visual companion)

- **Decision**: Option B — expandable window rows (collapsed: OOS verdict, gap,
  trades, low-confidence; expanded: IS/OOS detail pair, each "View run →"),
  within the validation card language (header card, stat cards, sensitivity
  surface + points table, lockbox link, `?` tooltips).
- **Rationale**: Matches the expandable-row pattern shipped on the validation
  page yesterday; chosen by the user from side-by-side mockups (A: flat table
  with link columns was the alternative).

## Code-grounding checks performed

| Check | Result |
|---|---|
| `runs.study_id/segment/window_index` exist | yes — migration 0111, `RunRow` already models them |
| `lockbox_ledger.run_id` exists | yes — migration 0112, currently never written |
| `spec_hash` dedup machinery | yes — `run_spec.compute_spec_hash`, `client.find_finished_run_by_spec`, `client.set_run_spec_hash`, used at `api/lifecycle.py:310–325` |
| `run_df` fingerprints content | yes — `fingerprint_df` at `backtest/engine.py:49–57` |
| `BacktestResult` carries journal/summary/run | yes — `backtest/engine.py:19–22` |
| Orchestrator hook points | `validation/study.py:44` (walk-forward evaluate) and `:84` (sensitivity evaluate) |
| `start_study` reusable for re-run | yes — `api/validation_lifecycle.py:268` takes kind/config_name/params/confirm_large |
| Latest migration | 0122 — and this feature adds none |
