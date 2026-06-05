# Implementation Plan: Study Child-Run Persistence + Drill-Down

**Branch**: `014-study-run-persistence` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-study-run-persistence/spec.md`

**Design source**: approved brainstorm design
[docs/superpowers/specs/2026-06-04-study-child-run-persistence-design.md](../../docs/superpowers/specs/2026-06-04-study-child-run-persistence-design.md)

## Summary

Validation studies (011) persist only their aggregated result; each per-window /
per-grid-point evaluation runs in-memory and its `run_id` is a placeholder.
This feature persists every study evaluation as a first-class run — via a new
in-memory payload builder shared with the existing file-based push path — tagged
with `study_id` / `segment` / `window_index` (columns exist since 0111),
deduplicated by `spec_hash`, fail-soft on storage errors, and self-described as
drillable per window/point by a `persisted` flag in the stored result. The
lockbox one-shot persists its run and links `lockbox_ledger.run_id`. The main
runs list hides children; child run detail badges back to its study. A re-run
endpoint clones any study's params into a fresh (drillable) study. The study
detail page is redesigned in the validation card language with expandable
window rows linking to child runs. **Zero schema migrations.**

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, pandas (backend); React 18, Vite,
Tailwind, TanStack Router/Query (frontend)

**Storage**: Supabase Postgres via `SupabaseStorageClient` (PostgREST + `push_run`
RPC); no new migrations — uses existing `runs.study_id/segment/window_index`
(0111), `lockbox_ledger.run_id` (0112), `runs.spec_hash` (0091),
`runs.config_snapshot` (0092)

**Testing**: pytest (offline scope: `PYTHONPATH=. .venv/bin/pytest -q
--ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py`);
vitest + testing-library (frontend)

**Target Platform**: Dockerized dev stack (backend :8001, frontend :5173); cloud
Supabase

**Project Type**: web application (backend + frontend)

**Performance Goals**: child-run persistence must not change study wall-clock
materially — one sequential `push_run` RPC per evaluation, matching the existing
per-evaluation progress UPDATE cadence (tens to hundreds of evals per study)

**Constraints**: every evaluation's aggregate math stays byte-identical to today
(persistence is additive and fail-soft); runs list stays unflooded; behavior of
`gather_run_outputs()` (CLI/API single-backtest path) preserved exactly
(parity-tested)

**Scale/Scope**: studies of ~10–400 evaluations; 2 backend modules refactored,
~3 endpoints touched, 1 added; 1 frontend page redesigned + run-detail badge +
StudiesTable button

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | Child runs persist evaluations of the same SPY-only engine; `compute_spec_hash` is called with `symbol="SPY"` as today; no new instrument surface. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | Re-run clones a study's params **unchanged** — no optimization loop, no param search beyond the existing user-specified sensitivity grids; no ML introduced. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | The engine (strategy → risk → broker → journal) is untouched; persistence consumes its output after the fact. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task is preceded by a failing test: payload-builder parity, orchestrator persistence/tagging, dedup reuse, fail-soft, aggregate-math regression, lockbox ledger link, runs-list filter, rerun endpoint, RunView fields, and frontend components (window rows link gating, rerun button, study badge). |
| V | Paper-First, Live Trading Disabled (NON-NEGOTIABLE) | no | Backtest-only data flows; no live code paths. |
| VI | Educational UI: Every Concept Is Explained | yes | New concepts (child run, IS/OOS drill-down, re-run study) each ship with a `?` `HelpTooltip` (what / why / how the app uses it). |
| VII | Journal Everything | yes | Child runs persist their full journal (executions, rejections, skipped setups, force-flat exits) through the **same** `PushRunPayload` rows as standalone runs — nothing bypasses the journal sink. |

**Engineering standards check:**

- [x] Timezone: no new time logic; ranges come from the existing window splitter.
- [x] No new limits/thresholds in source; no config keys needed (per-eval push has no tunables; cadence matches existing progress updates).
- [x] Backend: Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend: React + TypeScript + Vite + Tailwind.

**Gate result**: PASS — no violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/014-study-run-persistence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api.md           # rerun endpoint + RunView/result-shape deltas
├── checklists/
│   └── requirements.md  # spec quality checklist (done)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── models.py                      # WindowMetrics / SensitivityPoint: + persisted: bool = False
│   ├── storage/
│   │   ├── push.py                    # + build_run_payload(); gather_run_outputs() refactored onto it
│   │   ├── models.py                  # RunRow/PushRunPayload (already have study fields — unchanged)
│   │   └── client.py                  # list_runs(): study_id IS NULL filter; update_lockbox_ledger_run_id()
│   ├── validation/
│   │   ├── study.py                   # evaluate() closures call injected persist callback
│   │   └── walk_forward.py            # (unchanged — already passes segment/window_index to evaluate)
│   └── api/
│       ├── validation_lifecycle.py    # builds persist callback (user/config/strategy ctx); run_lockbox persists child + ledger link; rerun_study()
│       ├── routers/validation.py      # + POST /studies/{study_id}/rerun
│       ├── routers/runs.py            # (response shape via schemas)
│       └── schemas.py                 # RunView: + study_id/segment/window_index; StudyRerunResponse
└── tests/
    ├── storage/test_build_run_payload.py      # parity + mapping tests
    ├── validation/test_study_persistence.py   # tagging, dedup, fail-soft, aggregate regression
    └── api/test_validation_rerun.py, test_runs_list_filter.py, ...

frontend/
└── src/
    ├── routes/_authenticated.validation_.$studyId.tsx   # redesigned page composition
    ├── routes/_authenticated.runs_.$runId.tsx           # + study membership badge
    ├── components/validation/
    │   ├── StudyHeaderCard.tsx        # new: kind+config, params subtitle, status, Re-run
    │   ├── StudyStatCards.tsx         # new: WF / sensitivity stat rows
    │   ├── WindowRows.tsx             # new: expandable rows (Option B) + link gating
    │   ├── SensitivityPointsTable.tsx # new: points table w/ run links
    │   ├── sensitivity-surface.tsx    # reused inside card
    │   └── StudiesTable.tsx           # + Re-run button per row
    ├── api/validation.ts              # + rerunStudy(); result types + persisted flag
    └── api/runs.ts                    # RunView + study fields
```

**Structure Decision**: existing web-application layout (backend/ + frontend/);
no new top-level structure. New frontend components live in the established
`components/validation/` folder alongside yesterday's redesign components.

## Design decisions (from approved brainstorm — binding for tasks)

1. **Persistence approach A — in-memory builder.** `build_run_payload()` maps
   `BacktestResult` (journal_rows + summary + run) → `PushRunPayload` directly.
   The row-mapping logic is extracted from `gather_run_outputs()` so both paths
   share one mapper; a parity test pins byte-equality of payloads from the same
   engine result. Per-eval `client.push_run()` — no batching, no temp files.
2. **Dependency-injected persist callback.** `study.py` stays storage-agnostic:
   `validation_lifecycle.run_study_task()` constructs a
   `persist(result, *, segment, window_index) -> (run_id, persisted)` callback
   carrying user/config/strategy context + effective config snapshot (for
   sensitivity: base config merged with grid-point overrides, built where
   `evaluate_point` is built today). The orchestrator's `evaluate()` closures
   call it and stamp `run_id` + `persisted` into `WindowMetrics` /
   `SensitivityPoint`.
3. **Dedup.** Before pushing, `compute_spec_hash(...)` +
   `find_finished_run_by_spec()`; on hit, reference the existing run
   (`persisted=True`, no new row). SC-007/SC-008 lineage.
4. **Fail-soft.** Push exceptions are caught + logged; `persisted=False`; the
   study continues; aggregates unchanged (regression test: result equal with
   persistence stubbed off vs. erroring).
5. **`persisted: bool = False`** on `WindowMetrics` and `SensitivityPoint`
   uniformly gates UI links for pre-014 studies (field absent → default False)
   and failed pushes. No result-version field needed.
6. **Lockbox.** `run_lockbox()` persists its child (`segment='lockbox'`,
   `study_id=None`) and writes `lockbox_ledger.run_id` via a small
   client helper. Pre-014 ledger rows (null run_id) simply render no link.
7. **Runs list.** `list_runs()` adds `study_id IS NULL`; no toggle.
8. **Re-run.** `POST /api/validation/studies/{study_id}/rerun` loads the old
   study row, re-invokes `start_study()` with its `kind` + `params` +
   `config_name`, passing `confirm_large=True` (the operator explicitly
   re-runs something already executed once). 404 unknown id;
   `StudyConfigNotFound` surfaces as today.
9. **RunView** gains nullable `study_id` / `segment` / `window_index`; run
   detail renders a "Part of study — window N · segment" badge linking to
   `/validation/$studyId` when `study_id` is present.
10. **Study detail page (Option B)** — header card, stat cards, expandable
    window rows (collapsed: OOS verdict/gap/trades/low-confidence; expanded:
    IS/OOS pair each with "View run →" when `persisted`), sensitivity surface
    card + points table, lockbox link, `?` tooltips for child run / IS-OOS
    drill-down / re-run.

## Complexity Tracking

> No constitution violations — table intentionally empty.
