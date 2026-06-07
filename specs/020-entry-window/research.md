# Phase 0 Research — Entry-Window Filter Knobs (020)

## R1 — Tri-state strategy return, engine journals the skip

**Decision**: `VwapPullbackLong.evaluate(bar, snap, minutes_since_open)`
returns `Signal | WindowSkip | None`. Detection logic is unchanged; the
window check sits between "setup is fully valid" and Signal construction.
`WindowSkip` is a tiny frozen model (timestamp, reason text, window values).
The engine treats it as journal-only: a new `SignalStatus.SKIPPED_WINDOW`
row with the full indicator context, then moves on (no risk call, no order).

**Rationale**: Satisfies both FR-002 (no Signal emitted out-of-window — the
strategy literally returns a different type) and FR-003 (the skip is
journaled with full context) without giving the strategy a journal handle
(it stays pure) or duplicating detection in the engine. One consumer
(engine) + tests change.

**Alternatives considered**: risk-manager rejection (constitution III's
veto is a safety net, not a research knob's home; would also conflate
"unsafe" with "out of hypothesis window" in rejection analytics);
engine-side post-filter on emitted Signals (strategy would emit signals the
spec says it must not); silent strategy None (violates FR-003/VII — exactly
the silence that made this diagnosis require ad-hoc SQL).

## R2 — Minutes-since-open comes from the clock, through the engine

**Decision**: `MarketClock.minutes_since_open(dt) -> int` (ET-aware, relative
to `session_start`); the engine computes it per bar and passes it to
`evaluate`. The `strategy/base.py` protocol gains the parameter.

**Rationale**: FR-006 — clock.py is the single time source; the strategy
stays clock-free (testable with plain ints); mirrors how `or_complete`
already arrives as precomputed context.

**Alternatives considered**: extending `IndicatorSnapshot` (couples
data/indicators to market session config it doesn't have); strategy holding
the clock (new dependency direction, harder unit tests).

## R3 — Config shape + validation

**Decision**: `EntryWindowConfig {start_minutes_after_open: int = 0 (ge=0,
le=390), end_minutes_after_open: int = 390 (ge=0, le=390) — corrected from 360, see spec Clarifications}` nested as
`strategy.vwap_pullback.entry_window`, with a model validator rejecting
start ≥ end (FR-004). config.yaml documents the block with the defaults.
Stored config params lacking the keys deserialize to defaults (Pydantic
default semantics) — FR-010 backward compatibility with zero migration.

**Rationale**: matches every existing knob's nesting pattern
(`stop.buffer_pct`, `target.risk_reward`); bounds checked at the model so
invalid YAML/params fail fast with a named error.

## R4 — Registry, naming, and grids

**Decision**: two `KnobSpec`s — paths
`strategy.vwap_pullback.entry_window.start_minutes_after_open` /
`...end_minutes_after_open`, labels "entry window start (min after open)" /
"entry window end (min after open)", bounds [0, 390], kind int. Leaves are
unique across the registry (CLI leaf resolution keeps working). Frontend
`SENSITIVITY_KNOBS` grids: start 0/15/30/45, end 240/270/300/390 — ascending
and straddling the defaults per the existing invariant test.

**Rationale**: identical treatment to the 8 existing knobs is the whole
point (US2); the grids bracket the diagnostic's hypothesis (30 → 270)
without privileging it.

## R5 — Journal status surface

**Decision**: add `SKIPPED_WINDOW` to `SignalStatus`. `compute_summary` is
asserted *neutral* to the new status (a test feeds a journal containing
SKIPPED_WINDOW rows and shows identical summary numbers) — skips are
learning artifacts, not performance events. Frontend journal/run views
render unknown statuses as plain text today; no frontend change required
for v1 (the row is visible with its reason).

**Rationale**: smallest honest surface; status-specific styling can ride a
later polish round if wanted.

## R6 — Regression gate for FR-010/SC-001

**Decision**: a dedicated test runs the fixture backtest twice — engine
pre-feature semantics are represented by default-window config — and
asserts the journal row sequence and summary are identical to the current
golden expectations (the existing engine tests already pin exact trades;
they must pass unmodified). Plus a unit case: `evaluate` with defaults and
any `minutes_since_open` in [or-complete, cutoff] behaves exactly as the
old signature did.

**Rationale**: "defaults change nothing" is the contract that keeps the
8-year archive comparable across the feature boundary.
