# Implementation Plan: Entry-Window Filter Knobs

**Branch**: `020-entry-window` | **Date**: 2026-06-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/020-entry-window/spec.md`

## Summary

Add two validated, whitelisted knobs — `entry_window.start_minutes_after_open`
and `entry_window.end_minutes_after_open` (ints, default 0/390 — corrected from 360 during implementation; see spec Clarifications) — to the
VWAP-pullback strategy. The strategy's `evaluate` gains a tri-state return:
a fully-formed setup outside the window returns a `WindowSkip` (instead of a
`Signal`), which the engine journals as a new `SKIPPED_WINDOW` status —
skipped setups are first-class artifacts (VII). `MarketClock` (the single
time source) gains `minutes_since_open`; the engine passes it to `evaluate`.
The knobs join the 017 registry (bounds [0, 390]) so sweeps, sanitation,
recommendations, and campaigns handle them like every existing knob; the
frontend mirror (`config-knobs.ts`), config editor Signal group, diff chips,
sensitivity pills, and a new `entry_window` tooltip complete the surface.
Defaults reproduce current behavior byte-identically (FR-010 regression
test). This deliberately re-introduces — as a *read, validated, journaled*
knob — the concept feature 010 deleted for being parsed-but-never-read.

## Technical Context

**Language/Version**: Python 3.11 (backend), TypeScript 5 / React 18 (frontend)

**Primary Dependencies**: existing only — Pydantic v2, pytest, Vitest. **Zero new dependencies, zero migrations** (knobs live in config params JSON; the registry is code).

**Storage**: none added.

**Testing**: pytest (strategy/engine/clock/config/registry), Vitest (knob mirror, editor, chips, launcher pills, help coverage).

**Target Platform**: unchanged.

**Project Type**: web application + CLI (existing).

**Performance Goals**: no measurable engine overhead (one integer comparison per bar).

**Constraints**: FR-010 byte-identical default behavior; FR-006 all time math via `MarketClock`; window narrows, never extends, past `no_new_trades_after`.

**Scale/Scope**: ~6 backend files touched + tests; ~7 frontend files + tests; 1 new help concept (88 → 89).

## Constitution Check

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only (NON-NEGOTIABLE) | no | No instrument surface touched; knobs are time-of-day ints. |
| II | Long-Only, Rule-Based (NON-NEGOTIABLE) | yes | The window is a deterministic rule on an existing rule-based setup; strategy still only *suggests* (returns Signal/WindowSkip), never sizes or orders. |
| III | Risk Veto (NON-NEGOTIABLE) | yes | Untouched and proven untouched: the window can only *narrow* entries; `no_new_trades_after` and force-flat still bind (acceptance scenario 5 is a test). Risk manager code is not modified. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every backend/frontend implementation task is preceded by its failing-test task; config/docs/help-text exempt per the constitution's list. |
| V | Paper-First (NON-NEGOTIABLE) | no | Backtest-only logic; no broker/live paths. |
| VI | Educational UI | yes | New `entry_window` HelpTooltip (what/why-with-evidence/how) in the editor + glossary; SKIPPED_WINDOW journal rows surface WHY a setup was not traded. |
| VII | Journal Everything | yes | The feature's core: window-suppressed setups become explicit `SKIPPED_WINDOW` journal entries with full indicator context — they were previously untraded *silently* only because the concept didn't exist. |

**Engineering standards check:**

- [x] `MarketClock.minutes_since_open` is the only new time logic; ET via the existing clock.
- [x] Defaults/bounds live in config models + `config.yaml` knob registry — no magic numbers in strategy code.
- [x] Python 3.11/Pydantic v2/pytest; React/TS/Vite.

No violations → Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/020-entry-window/
├── plan.md  ├── research.md  ├── data-model.md  ├── quickstart.md
├── contracts/knobs.md
└── tasks.md (next phase)
```

### Source Code (repository root)

```text
backend/
├── config/config.yaml                       # + strategy.vwap_pullback.entry_window block
├── src/intraday_trade_spy/
│   ├── clock.py                             # + minutes_since_open(dt)
│   ├── config.py                            # + EntryWindowConfig (validator: start < end)
│   ├── models.py                            # + SignalStatus.SKIPPED_WINDOW, WindowSkip
│   ├── strategy/vwap_pullback.py            # window gate → Signal | WindowSkip | None
│   ├── strategy/base.py                     # protocol signature (+ minutes_since_open)
│   ├── backtest/engine.py                   # pass minutes; journal WindowSkip
│   └── validation/knobs.py                  # + 2 KnobSpecs [0, 390] int
└── tests/ (strategy, engine regression, clock, config, knobs, summary-neutrality)

frontend/src/
├── lib/config-knobs.ts                      # KnobValues+2, defaults, paths, labels, chips, SENSITIVITY_KNOBS+2
├── components/strategies/config-editor.tsx  # Signal group +2 fields (+ tooltip)
├── components/help-content.ts               # + entry_window (88 → 89) [+ test, run-viewer exclusion]
└── (StartStudyCard pills come free via SENSITIVITY_KNOBS)
```

**Structure Decision**: pure extension of existing modules; no new packages.

## Complexity Tracking

No constitution violations to justify.
