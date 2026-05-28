# Implementation Plan: Backtest MVP — SPY VWAP Pullback

**Branch**: `001-backtest-mvp-spy-vwap-pullback` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-backtest-mvp-spy-vwap-pullback/spec.md`

## Summary

Build the foundation of `intraday-trade-spy`: a Python CLI tool that
replays historical SPY 5-minute bars through a fixed
strategy → risk-manager → paper-broker → journal pipeline and produces a
reproducible, fully-explained trade journal plus a one-page summary.

Architecturally, this feature establishes the monorepo and the backend
package (`intraday_trade_spy`) including config loading (Pydantic v2 +
YAML), the typed domain model, session-aware indicators (VWAP and
opening range), the VWAP-pullback long strategy, the risk manager
(absolute veto with config-driven thresholds), a deterministic paper
broker, and a journal/exporter. The React frontend and FastAPI surface
are deliberately deferred to later features.

The two non-negotiable correctness properties — *no future-bar leakage*
and *byte-identical reproducibility* — are addressed at the architecture
level: bars flow through a `BarIterator` that yields typed `Bar` objects;
the strategy and risk manager never see the underlying dataframe.

## Technical Context

**Language/Version**: Python 3.11+

**Primary Dependencies**: Pydantic v2, PyYAML, pandas, pytest,
pytest-cov, freezegun, ruff

**Storage**: Filesystem only. Inputs: CSV under `backend/data/raw/`.
Outputs: CSV + YAML + JSON under `backend/data/backtests/<run-id>/`.
No database.

**Testing**: pytest. Required coverage targets: 100% of
`strategy/`, `risk/`, `broker/`, `backtest/`, and
`data/indicators.py` per spec SC-002 and constitution Principle IV.

**Target Platform**: macOS / Linux developer machines. CLI only — no
browser, no server, no native binary.

**Project Type**: Web-application monorepo (per master plan §15, §23) —
this feature builds out `backend/` only; `frontend/` ships as a stub
README claiming it for a later feature.

**Performance Goals**: Bundled 3-session fixture (~234 bars) runs
end-to-end in < 5 seconds on a developer laptop. No hard real-time
constraints.

**Constraints**:
- No future-bar leakage (spec FR-013, constitution IV).
- Byte-identical reproducibility across runs given identical config +
  data (spec FR-015).
- `America/New_York` is the only valid timezone for market state;
  `clock.py` is the single source of truth.
- All limits / thresholds / session times live in
  `backend/config/config.yaml` — no hardcoded magic numbers.

**Scale/Scope**: One symbol (SPY). 5-minute bars: ≤ ~20k/year, fits in
memory comfortably. Feature scope: ~12 modules under
`backend/src/intraday_trade_spy/`, ~10 test files under
`backend/tests/`, ~70–80 atomic implementation tasks.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). For each
principle below, state which parts of this feature touch it and prove
non-violation. If a tension exists, defer the justification to the
**Complexity Tracking** table at the bottom of this plan.

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | Config schema pins `market.symbol` to the literal `"SPY"` via a Pydantic `Literal`. Bar loader rejects any row whose symbol column differs. FR-002 + acceptance scenario US3-2 are covered by a startup test. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | `Direction` enum exposes only `LONG`. The VWAP-pullback strategy is a deterministic rule set with no ML/HMM dependencies. Strategy module has no broker or sizing imports — verified by an architecture test (`test_module_boundaries.py`). |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | yes | Paper broker's `simulate_entry` accepts only `RiskDecision(approved=True)` `TradePlan` inputs; the call site has an `assert`. Risk manager implements every check listed in spec FR-007. All numeric limits live in `backend/config/config.yaml`. Each rejection reason has its own test. |
| IV | Test-First Everywhere (NON-NEGOTIABLE, v1.1.0) | yes | Every implementation task in `tasks.md` for in-scope code (`backend/src/**`, non-trivial `backend/scripts/**`) is preceded by a failing-test task. T040 (RiskState) was retro-fitted with T039b after the v1.1.0 amendment. `backend/scripts/run_backtest.py` (T054) is a 3-line wrapper around `main()` and is exempt per the principle. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | Default config sets `app.mode: backtest` and `broker.live_auto_enabled: false`. No live-broker code exists in this feature. FR-017 is tested by `test_default_config_blocks_live`. |
| VI | Educational UI: Every Concept Is Explained | not touched | No UI is shipped in this feature; principle VI applies to UI-shipping features. Documented as out-of-scope in spec assumptions; enforcement deferred to Feature 003 (frontend). |
| VII | Journal Everything | yes | Every state transition (emitted, approved, rejected, executed, exited, force_flat, lockout) flows through `journal/logger.py`. Spec FR-012 lists every event class; tests assert each class produces a journal row with the indicator snapshot at decision time. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is the single source of truth.
- [x] Any new limits, thresholds, or session times live in `backend/config/config.yaml`, not in source.
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest. (FastAPI not used in this feature — deferred to Feature 002.)
- [x] Frontend code is React + TypeScript + Vite + Tailwind. (Frontend not built in this feature.)

**Gate verdict: PASS.** No NON-NEGOTIABLE violation. No entry in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-backtest-mvp-spy-vwap-pullback/
├── plan.md              # This file (/speckit-plan command output)
├── spec.md              # Feature specification
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── cli-backtest.md
│   ├── journal-csv-schema.md
│   ├── summary-json-schema.md
│   └── run-yaml-schema.md
├── checklists/
│   └── requirements.md  # Quality checklist (/speckit-specify output)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

This feature uses the **web-application monorepo** layout from the
master plan. Only `backend/` is implemented in this feature; `frontend/`
is stubbed with a placeholder README.

```text
intraday-trade-spy/
├── README.md                              # Project README (stubbed by this feature; expanded later)
├── CLAUDE.md                              # Runtime guidance (already written)
├── docs/                                  # (Empty in this feature; later features add product / strategy docs)
│   └── README.md                          # Placeholder
├── backend/
│   ├── pyproject.toml                     # Python project metadata + deps + ruff config
│   ├── README.md                          # Backend dev quickstart
│   ├── config/
│   │   ├── config.yaml                    # Default config (mode: backtest, live_auto_enabled: false)
│   │   └── logging.yaml                   # Logging config
│   ├── data/
│   │   ├── raw/
│   │   │   └── spy_5m_sample.csv          # Bundled fixture (1–3 sessions)
│   │   └── backtests/                     # Run outputs land here (.gitkeep only)
│   ├── scripts/
│   │   └── run_backtest.py                # CLI entry point (thin wrapper around package CLI)
│   ├── src/
│   │   └── intraday_trade_spy/
│   │       ├── __init__.py
│   │       ├── config.py                  # Pydantic settings model + YAML loader
│   │       ├── clock.py                   # Market-time SoT (is_market_open / OR_complete / force_flat / no_new_trades_after)
│   │       ├── models.py                  # Bar, IndicatorSnapshot, Direction, SignalStatus, Signal, RiskDecision, TradePlan, Position, JournalEntry, BacktestRun
│   │       ├── data/
│   │       │   ├── __init__.py
│   │       │   ├── loader.py              # CSV → dataframe normalized to ET + session-filtered + symbol-validated
│   │       │   ├── bars.py                # BarIterator: dataframe → typed Bar objects (no future visibility)
│   │       │   ├── indicators.py          # VWAP and opening-range computations + IndicatorSnapshot builder
│   │       │   └── fingerprint.py         # sha256 + bar count + earliest/latest timestamps for data manifest
│   │       ├── strategy/
│   │       │   ├── __init__.py
│   │       │   ├── base.py                # Strategy protocol; emits Signal | None for the current bar
│   │       │   └── vwap_pullback.py       # VWAP Pullback Long implementation (spec FR-006)
│   │       ├── risk/
│   │       │   ├── __init__.py
│   │       │   ├── state.py               # RiskState (per-session counters / open position / cooldown / loss totals)
│   │       │   ├── sizing.py              # position_size(account, risk_pct, entry, stop)
│   │       │   └── manager.py             # validate(signal, state, clock, config) → RiskDecision
│   │       ├── broker/
│   │       │   ├── __init__.py
│   │       │   ├── base.py                # Broker protocol (simulate_entry / simulate_bar)
│   │       │   └── paper.py               # Deterministic paper broker (FR-009, FR-010)
│   │       ├── journal/
│   │       │   ├── __init__.py
│   │       │   ├── logger.py              # Single sink: log_signal / log_decision / log_entry / log_exit / log_lockout
│   │       │   └── exporter.py            # Sorted-deterministic write of journal.csv + summary.json
│   │       ├── backtest/
│   │       │   ├── __init__.py
│   │       │   ├── engine.py              # Orchestrates BarIterator → indicators → strategy → risk → broker → journal
│   │       │   ├── manifest.py            # run.yaml builder (FR-014)
│   │       │   └── metrics.py             # Summary metrics (FR-016)
│   │       └── cli/
│   │           ├── __init__.py
│   │           └── run_backtest.py        # argparse-based CLI (config / data / out flags)
│   └── tests/
│       ├── conftest.py                    # Shared fixtures: bundled bars, adversarial bars, freezegun helpers
│       ├── fixtures/
│       │   ├── spy_5m_sample.csv          # Same file as backend/data/raw, symlinked or copied
│       │   ├── adversarial_future_leak.csv  # Synthetic bars designed to expose leak bugs (US4)
│       │   └── known_results/             # Expected journal.csv files for reproducibility tests
│       ├── test_config.py                 # FR-001, FR-002, FR-017
│       ├── test_clock.py                  # Session boundaries / OR complete / force_flat
│       ├── test_models.py                 # Pydantic validation
│       ├── test_loader.py                 # ET normalization, session filter, gap detection, symbol rejection
│       ├── test_indicators.py             # VWAP daily reset + correctness (FR-004), OR window (FR-005)
│       ├── test_vwap_pullback.py          # FR-006: every passing/failing condition
│       ├── test_sizing.py                 # FR-008 incl. zero-size case
│       ├── test_risk_manager.py           # FR-007: one test per rejection reason
│       ├── test_paper_broker.py           # FR-009, FR-010 incl. same-bar stop-and-target tiebreak
│       ├── test_journal.py                # FR-012: every event class produces a journal row
│       ├── test_backtest_engine.py        # End-to-end on fixture + adversarial future-leak test (FR-013)
│       ├── test_metrics.py                # FR-016 summary fields
│       ├── test_manifest.py               # FR-014 run.yaml
│       ├── test_reproducibility.py        # FR-015 byte-identical journal across runs (SC-003)
│       ├── test_default_config_blocks_live.py  # FR-017
│       └── test_module_boundaries.py      # Architecture test: strategy imports no broker / risk_sizing modules
└── frontend/
    └── README.md                          # Placeholder: "Implemented by Feature 003."
```

**Structure Decision**: Web-application monorepo (Option 2 from the
plan template). This feature populates `backend/` end-to-end and ships
`frontend/` as a placeholder. `docs/` ships as a placeholder. Master
plan §23 is the authoritative source for the full tree.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(No entries — Constitution Check passed.)*

## Phase 0 — Research

See [research.md](./research.md) for the consolidated decisions on:

1. Library choices (pandas vs polars; pytest vs unittest; ruff vs black + flake8).
2. Future-bar leakage prevention architecture (typed `BarIterator`).
3. VWAP per-session reset algorithm.
4. Opening-range completion semantics.
5. Bracket-exit same-bar tiebreak (FR-009).
6. Deterministic journal ordering for byte-identical reproducibility (FR-015).
7. Run manifest fingerprint algorithm (FR-014).

## Phase 1 — Design & Contracts

- Data model: see [data-model.md](./data-model.md).
- CLI surface and on-disk formats: see [contracts/](./contracts/).
- Developer quickstart: see [quickstart.md](./quickstart.md).

## Phase 2 — Tasks

Generated separately by `/speckit-tasks`. Output lands at
`specs/001-backtest-mvp-spy-vwap-pullback/tasks.md`.
