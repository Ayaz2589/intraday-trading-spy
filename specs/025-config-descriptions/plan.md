# Implementation Plan: Human-Readable Config Descriptions

**Branch**: `025-config-descriptions` | **Date**: 2026-06-27 | **Spec**: [spec.md](./spec.md)

**Status**: **IMPLEMENTED** (18/18 tasks). Backend **1009 offline tests green** (16 new: 13
`test_config_summary` + 3 `test_configs_summary`, plus the 4 existing `test_configs_description`
still green = description untouched). Frontend: 6 touched/new test files **35 tests green** (5
config-summary + 16 config-list + 7 dropdown + run-viewer/help-content/f007 guards) and `tsc
--noEmit` (Vercel deploy gate) **clean**. Live smoke vs 29 real configs: **29/29 distinct non-empty
summaries**, `description` byte-identical. Only pre-existing reds remain in the full FE suite
(price-chart baselines ×3 — untouched; f007 coverage guard flakes under 133-file parallel load but
passes in isolation and alongside this feature's files).

**Input**: Feature specification from `/specs/025-config-descriptions/spec.md`

## Summary

Strategy configs carry cryptic auto-generated names (`auto09-c3-buffer_pct0.2`). This feature
derives a concise, deterministic, plain-English summary of what each config *does* purely from its
`params` JSON, reusing the existing knob vocabulary (`validation/knobs.py::KNOB_REGISTRY`) for label
wording. The summary is computed at read time (no DB column, no migration, no stored state) and
surfaced as two new fields on the config API response: a one-line `summary` string and an ordered
list of `{label, value}` `highlights`. The frontend renders the summary next to — never replacing —
the technical name on the Strategies page config list and the topbar config selector, with a
`HelpTooltip` explaining it is auto-derived from params. The existing free-text provenance
`description` field is left completely untouched.

**Technical approach**: A new pure backend module `config_summary.py` exposes
`summarize_config(params: dict) -> ConfigSummary`. `ConfigView` (Pydantic v2) gains two
`@computed_field`s that delegate to it, so the summary appears automatically on every serialized
config (configs list, run manifest, etc.) with zero per-router wiring. Frontend types + two
components render the new fields.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, pytest (backend); React + Vite + Tailwind, Vitest +
Testing Library (frontend). No new dependencies.

**Storage**: None added. Feature is read-only and derives from existing `configs.params`. No
migration. The existing `configs.description` column is not read or written.

**Testing**: pytest (backend unit + API-contract via TestClient), Vitest + React Testing Library
(frontend component tests).

**Target Platform**: Linux server (backend), modern browser SPA (frontend).

**Project Type**: Web application (backend + frontend), matching the existing repo layout.

**Performance Goals**: Negligible — summary is an O(#knobs) string build per config, computed for the
handful of configs in a list response. No caching needed.

**Constraints**: Deterministic / recompute-identical output (FR-002). Total function: never raises on
missing/empty/unknown params (FR-007). Must not touch `description` (FR-008). No magic numbers — the
"full session" entry-window threshold is derived from the knob registry bounds, not a literal.

**Scale/Scope**: ~29 configs per user today; one strategy family (vwap_pullback) in v1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | no | No symbol logic, no instrument handling. Summary describes existing SPY-only configs; introduces no new instrument path. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | no | Pure read-only display derivation. No strategy/signal/sizing/ML/HMM code. Strategy modules untouched. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no | No order, signal, or risk path touched. Read-only. No limits/thresholds added to source — the one derived threshold (full-window) reads the registry's existing bound, not a literal. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task is preceded by a failing-test task. New code lives in `backend/src/intraday_trade_spy/config_summary.py` and `frontend/src/`; both are TDD-mandatory. No exempt-only files. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | no | No trading mode or `live_auto_enabled` touched. Display-only. |
| VI | Educational UI: Every Concept Is Explained | yes | The summary surface ships with a `HelpTooltip` (What / Why / How-derived-from-params) per FR-010 / US3. |
| VII | Journal Everything | no | Nothing executes, rejects, or exits — read-only derivation produces no journalable event. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented. — N/A: no wall-clock logic; entry window is integer "minutes after open", and the full-window threshold is read from the knob registry bound, not from a time computation.
- [x] Any new limits, thresholds, or session times added live in `backend/config/config.yaml`, not in source. — N/A: no new limits/thresholds. The full-window comparison reuses `KNOB_REGISTRY` bounds.
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend code is React + TypeScript + Vite + Tailwind.

All principles pass. No entries in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/025-config-descriptions/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── config-summary.md  # API contract: ConfigView.summary + .highlights
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
backend/
├── src/intraday_trade_spy/
│   ├── config_summary.py              # NEW — pure derivation: summarize_config(params) -> ConfigSummary
│   ├── validation/knobs.py            # REUSED (read-only) — KNOB_REGISTRY label/bounds vocabulary
│   └── api/schemas.py                 # EDIT — ConfigView gains computed_field summary + highlights;
│                                      #        new ConfigHighlightView model
└── tests/
    ├── test_config_summary.py         # NEW — unit tests for the pure function
    └── api/test_configs_summary.py    # NEW — API-contract: GET /api/configs returns summary/highlights

frontend/
├── src/
│   ├── api/types.ts                   # EDIT — Config type gains summary?: string; highlights?: {label,value}[]
│   ├── components/
│   │   ├── strategies/config-list.tsx          # EDIT — render summary + HelpTooltip (US1, US3)
│   │   ├── strategies/config-summary.tsx        # NEW — small presentational ConfigSummary component
│   │   └── strategy-config-dropdown.tsx         # EDIT — render summary in selector (US2)
└── src/components/strategies/__tests__ / co-located tests
    ├── config-summary.test.tsx        # NEW — renders one-line + chips, help tooltip
    ├── config-list.test.tsx           # EDIT/NEW — summary shown next to technical name
    └── strategy-config-dropdown.test.tsx  # EDIT/NEW — summary shown in option
```

**Structure Decision**: Web-application layout (existing). Backend logic is a single new pure module
plus a schema edit; the frontend adds one small presentational component and edits two existing
surfaces. This keeps "one clear responsibility per file" and lets the summary appear everywhere a
`ConfigView` is serialized via the computed fields, avoiding scattered per-router changes.

## Complexity Tracking

> No constitution violations. Table intentionally empty.
