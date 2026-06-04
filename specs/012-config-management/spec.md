# Feature Specification: First-Class Config Management

**Feature Branch**: `012-config-management`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: Turn "config" from a single mutable `default` into a first-class, named, comparable object, so the validation engine (Feature 011) can actually compare configs and the operator can do real parameter research. (See [`docs/research-tooling-uplift.md`](../../docs/research-tooling-uplift.md) for the framing.)

## Overview

The app does two jobs: **backtest/learn** (run one config, understand it) and **validate/research** (compare many configs scientifically — Feature 011). The research job is blocked by a primitive mismatch: the app treats "config" as a single, mutable object named `default`. You can edit it in place, but you cannot **create, name, duplicate, or delete** configs — so there is never more than one to compare. The validation engine's whole premise (walk-forward of config A vs B, sensitivity over a chosen base, freezing a named candidate for the lockbox) has no substrate, and the operator can't tell which run used which knobs because the one config keeps changing underneath them.

This feature makes a **config a first-class, named object**: create (from a built-in preset, by duplicating, or from scratch), rename, edit, duplicate, and safely delete multiple named configs, and pick among them everywhere a config is chosen. It also ships **workable defaults and presets** so a fresh config actually executes trades, fixing the discovered "0-trade wall" (the shipped default's position-value cap rejects nearly every signal for an intraday strategy).

The data substrate largely exists: the `configs` table is already keyed unique per (user, name), the storage layer already reads/writes named configs, and every run already snapshots the exact knobs it ran with (so run history is independent of the live config — deleting a config can never rewrite the past). What's missing is the create/duplicate/rename/delete surface, the multi-config UI, the safe-delete semantics, and exposing presets.

## Clarifications

### Session 2026-06-04

- Q: Deleting a config that past runs used — what behavior, and by what mechanism? → A: **Allow deleting any config (subject to "can't delete your last one"); nullify the run's live link via `ON DELETE SET NULL` (`runs.config_id` becomes nullable).** Past runs stay fully intact and display their own immutable snapshot; they simply no longer point at a live config. The FK is never left dangling.
- Q: With multiple configs, is there still a single pre-selected "active" config, or must every launch choose one explicitly? → A: **Keep one designated "active" config** that is pre-selected wherever a config is chosen (backtest / study / lockbox), preserving today's no-explicit-pick flows. The operator can change which config is active.

## User Scenarios & Testing *(mandatory)*

The "user" is the operator doing strategy research.

### User Story 1 - Create a second config and run it (Priority: P1)

As the operator, I want to create a new named config — starting from a built-in preset, by duplicating an existing config, or from sane defaults — and then select it when launching a backtest or a validation study, so I finally have *more than one* config to compare. This is the unlock; without it the validation engine has nothing to work on.

**Why this priority**: Everything else (compare, validate, freeze for lockbox) depends on more than one config existing. Built alone it already delivers the core value: a second, selectable config.

**Independent Test**: Create a config named "aggressive" from the aggressive preset, launch a backtest selecting it, and confirm the resulting run executed with *that* config's knobs (not `default`'s).

**Acceptance Scenarios**:

1. **Given** only `default` exists, **When** the operator creates a new config from a preset / by duplication / from scratch with a unique name, **Then** the new config appears in the config list and is immediately selectable when launching a backtest, validation study, or the lockbox.
2. **Given** two configs exist, **When** the operator launches a backtest selecting the non-default one, **Then** the run executes with the selected config's knobs and its per-run snapshot reflects them.
3. **Given** a config name that already exists for this user, **When** the operator tries to create another with that name, **Then** the system rejects it with a clear "name already in use" message (no silent overwrite).

---

### User Story 2 - Edit a named config's knobs (Priority: P2)

As the operator, I want to edit the risk and strategy knobs of a *selected* named config (not "the" config), so each config holds its own distinct settings and I can tune them independently.

**Why this priority**: Editing per-config is how you actually create the variants you compare. It refines US1.

**Independent Test**: Select "aggressive", change its risk-reward and position-cap knobs, save, re-open it, and confirm the values persisted and that `default` is unchanged.

**Acceptance Scenarios**:

1. **Given** a selected config, **When** the operator edits its risk knobs (account value, max risk/trade, max position value, daily-loss limit, max trades/day, cooldown…) and strategy knobs (risk-reward, max-distance-from-VWAP, opening-range minutes, stop buffer…) and saves, **Then** only that config changes; other configs are untouched.
2. **Given** an edited config, **When** a new run is launched with it, **Then** the run uses the edited values; previously-finished runs are unaffected (they keep their own snapshot).

---

### User Story 3 - Duplicate, rename, and safely delete configs (Priority: P3)

As the operator, I want to duplicate, rename, and delete configs, with deletion that **never corrupts run history**, so I can keep my config library tidy without fear of losing the record of what I already tested.

**Why this priority**: Library hygiene; valuable but not required for the core compare loop. The safe-delete guarantee is the important correctness constraint here.

**Independent Test**: Duplicate "aggressive" → "aggressive-2", rename it, then delete it; confirm any past runs that used it still open and still show their original knobs.

**Acceptance Scenarios**:

1. **Given** a config, **When** the operator duplicates it under a new unique name, **Then** a new config with identical knobs is created and the original is unchanged.
2. **Given** a config referenced by one or more past runs, **When** the operator deletes it, **Then** the deletion succeeds and every past run that used it still opens and still displays the exact knobs it ran with (run history is preserved).
3. **Given** only one config remains, **When** the operator tries to delete it, **Then** the system prevents it (the user must always have at least one config).
4. **Given** a config, **When** the operator renames it to a name already in use, **Then** the system rejects it.

---

### User Story 4 - Workable defaults & presets that actually trade (Priority: P2)

As the operator (and any new user), I want the shipped default config and the built-in presets to actually execute trades on SPY out of the box, so I never hit the silent "0 trades" wall again.

**Why this priority**: A config that produces zero trades makes the entire research workflow look broken (every metric is empty). The discovered cause — the position-value cap rejecting the risk-based size — must be fixed in the shipped defaults, not just patched per-user.

**Independent Test**: Create a config from the shipped default (and from each preset) and run a multi-month backtest; confirm each executes a non-trivial number of trades (not zero) due to `position_size_cap`.

**Acceptance Scenarios**:

1. **Given** a fresh config created from the shipped default, **When** a multi-month SPY backtest is run, **Then** it executes a non-trivial number of trades (not ~0), i.e. the position-value cap is sized for an intraday strategy.
2. **Given** the built-in presets (spanning low-risk → aggressive), **When** each is instantiated and backtested, **Then** each executes trades and represents a distinct, sensible risk profile.
3. **Given** any preset or default, **When** inspected, **Then** none can enable live auto-trading.

---

### Edge Cases

- **Duplicate / colliding names**: creating or renaming to an existing name is rejected with a clear message.
- **Deleting a referenced config**: succeeds without corrupting run history (runs keep their own snapshot); the underlying reference is handled safely.
- **Deleting the last config**: blocked — at least one config must always exist.
- **Mis-tuned config (0 trades)**: allowed (it's a valid user choice), but the *shipped* defaults/presets must not be mis-tuned; a 0-trade result is surfaced honestly (it isn't silently "broken").
- **Live safety**: no config-creation, duplication, preset, or edit path can set live auto-trading on.
- **Empty / invalid names**: rejected/normalized (trimmed, length-bounded).
- **Which config a study/lockbox used**: always recorded, so "different results" can be attributed to the config that produced them.

## Requirements *(mandatory)*

### Functional Requirements

**Create & select (US1)**
- **FR-001**: Operators MUST be able to create a new named config from any of: a built-in preset, a duplicate of an existing config, or sane built-in defaults.
- **FR-002**: Config names MUST be unique per user; creation/rename with a colliding name MUST be rejected with a clear message (no silent overwrite). Names MUST be validated/normalized (non-empty, trimmed, length-bounded).
- **FR-003**: Every surface that chooses a config — start-backtest, start-validation-study, and the lockbox — MUST select from the operator's real list of named configs.
- **FR-004**: A run launched with a selected config MUST execute with that config's knobs and MUST record a per-run snapshot of them (so the run is attributable and reproducible).

**Edit (US2)**
- **FR-005**: Operators MUST be able to edit a *selected* named config's risk knobs and strategy knobs; saving MUST affect only that config.
- **FR-006**: Editing a config MUST NOT alter previously-finished runs (they retain their own snapshot).

**Duplicate / rename / delete (US3)**
- **FR-007**: Operators MUST be able to duplicate a config under a new unique name (deep copy of its knobs).
- **FR-008**: Operators MUST be able to rename a config (subject to the uniqueness rule).
- **FR-009**: Operators MUST be able to delete *any* config (subject to FR-010) such that **run history is preserved** — every past run that used it still opens and still displays the knobs it actually ran with. Deletion MUST nullify the run's live config reference (`runs.config_id` becomes nullable, `ON DELETE SET NULL`) while the run's own immutable snapshot is retained; the foreign key MUST never be left dangling.
- **FR-010**: The system MUST prevent deleting the operator's last remaining config (at least one config must always exist).
- **FR-018**: The system MUST maintain a single designated **active config** per operator, pre-selected wherever a config is chosen (backtest / validation study / lockbox), so flows that don't explicitly pick a config keep working. The operator MUST be able to change which config is active. (If the active config is deleted, another remaining config MUST become active.)

**Workable defaults & presets (US4)**
- **FR-011**: The shipped default config and built-in presets MUST be sized so a SPY backtest executes a non-trivial number of trades (the position-value cap MUST accommodate the risk-based intraday position size; the discovered 0-trade default MUST be fixed).
- **FR-012**: Built-in presets MUST span a sensible range of risk profiles (e.g. low-risk → balanced → aggressive) and MUST be selectable as creation starting points.

**Governance & education**
- **FR-013**: No config path (create, duplicate, preset, edit) MAY enable live auto-trading; the live-disabled guarantee MUST hold at every layer.
- **FR-014**: Configs remain SPY-only and rule-based (no ML / optimization knobs introduced).
- **FR-015**: The risk manager MUST continue to enforce every config's risk knobs and keep its absolute veto (stop + target required, limits enforced); configs cannot weaken that contract.
- **FR-016**: Config create / duplicate / rename / delete events MUST be journaled with full context.
- **FR-017**: Each new config-management concept MUST ship with a `?` help affordance answering *what it is, why it matters, how the app uses it* — covering at least: a named/saved config, duplicate-vs-edit, why deleting is safe for run history, and intraday buying power / the position-value cap.

### Key Entities *(include if feature involves data)*

- **Named Config**: an operator-owned, uniquely-named set of strategy + risk knobs (SPY-only, backtest/paper mode, live disabled). The thing you create, edit, duplicate, rename, delete, and select. Exactly one of the operator's configs is the **active** config (pre-selected default). *(Already exists as a row keyed unique per (user, name); this feature adds its full lifecycle + the active designation.)*
- **Preset**: a built-in, read-only starting template (e.g. low-risk / balanced / aggressive / vwap-variant) that an operator instantiates into a new editable named config.
- **Run snapshot**: the immutable copy of the exact knobs a run executed with, already attached to every run — the mechanism that makes deleting a config safe for history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can go from "one config" to "two or more distinct, selectable configs" entirely through the UI, with no manual database editing.
- **SC-002**: A backtest or validation study launched with a chosen config provably runs *that* config (its snapshot matches the chosen config's knobs).
- **SC-003**: A fresh config from the shipped default (and from each preset) executes a non-trivial number of trades over a multi-month SPY backtest — zero-trade-by-default is eliminated.
- **SC-004**: Deleting a config that past runs used leaves 100% of those runs openable and showing their original knobs.
- **SC-005**: Name collisions and last-config deletion are prevented with clear messages; no config operation can enable live trading.
- **SC-006**: 100% of new config-management concepts have a working `?` help affordance.
- **SC-007**: With multiple configs available, walk-forward studies launched on *different* configs return *different* results (closing the "every study is identical" confusion), because they now run different inputs.

## Assumptions

Reasonable defaults chosen where the description didn't pin a value; all adjustable in planning.

- **Reuses the existing config substrate**: the `configs` table (unique per user+name), the existing storage read/write methods, and the existing per-run config snapshot. This feature adds the create/duplicate/rename/delete surface, the multi-config UI, safe-delete semantics, and preset exposure — not a new data model.
- **Safe delete mechanism (decided in clarification)**: deleting a config nullifies the run's live reference (`runs.config_id` nullable, `ON DELETE SET NULL`); the run's immutable snapshot preserves history. Any config is deletable except the last one.
- **Active config**: exactly one config is the operator's designated *active* config, pre-selected wherever a config is chosen (backward-compatible with today's implicit `default`); the operator can switch it, and deleting the active config promotes another remaining config to active.
- **UI home**: the existing single-config editor (the strategy-config surface) evolves into a multi-config manager — list, create/duplicate/rename/delete, select + edit — rather than introducing an unrelated new area.
- **Presets**: the built-in preset files already in the repo (low-risk / aggressive / demo / vwap-variant) are exposed as read-only starting templates; instantiating one copies its knobs into a new editable config. Presets are fixed templates, not user-editable in place.
- **Workable default**: ships an intraday-sane position-value cap (≈4× buying power, the standard for a same-day strategy) plus sane risk, so backtests execute; presets span the risk spectrum and all execute trades.
- **Out of scope (later features)**: sharing/import/export of configs; automated parameter optimization (Principle II); persisting study child-runs + per-window drill-down (Feature 013); cross-run insights/aggregation (Feature 014).
- **Account value** is a per-config knob the operator sets; the feature does not prescribe a "correct" account size (it only ensures the *cap-to-risk ratio* lets trades through).
