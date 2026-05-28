# Phase 0 Research: Backtest MVP — SPY VWAP Pullback

This document records the technical decisions that resolve every
"NEEDS CLARIFICATION" implicit in the spec, plus the rationale and the
alternatives rejected. Each decision is referenced from `plan.md` and
will be referenced again from `tasks.md`.

---

## Decision 1 — Data manipulation library: pandas (not polars)

**Decision**: Use pandas ≥ 2.2 for in-memory bar handling. The `Bar`
typed object is the only thing the strategy / risk manager see; pandas
is an implementation detail of the loader and indicator computations.

**Rationale**:
- Fixture data sizes for v1 (single-symbol intraday 5-min bars, a few
  years at most) are trivially in-memory for pandas.
- pandas has the most mature timezone-aware `DatetimeIndex` semantics,
  which we lean on for ET normalization and session grouping.
- Most engineers reading this code will have prior pandas exposure;
  polars's expression API would add a learning tax for marginal gain.
- The strategy / risk modules NEVER see pandas — they consume typed
  `Bar` and `IndicatorSnapshot` objects. So if performance later
  demands a swap, only `data/loader.py` and `data/indicators.py`
  change.

**Alternatives considered**:
- *polars*: faster and lazier, but extra cognitive load and harder
  reproducibility guarantees across versions for our use case.
- *Plain stdlib + numpy*: too low-level for session-grouped VWAP and
  timezone normalization; we'd reinvent half of pandas.

---

## Decision 2 — Architectural prevention of future-bar leakage

**Decision**: The data layer exposes a `BarIterator` that, given a
pandas dataframe of bars (already sorted ascending by timestamp), yields
one immutable `Bar` (Pydantic frozen model) at a time AND maintains an
internal "visible head index" pointing only at the current row. The
strategy and risk manager are given the `Bar` plus an
`IndicatorSnapshot` already computed for that bar's index. Neither
function ever receives the dataframe or the iterator.

**Rationale**:
- "No future-bar leakage" cannot be enforced by test alone if the
  strategy gets the dataframe — a bug could index into the future.
  Structural enforcement (only-the-current-Bar visibility) makes the
  property non-bypassable.
- The adversarial test fixture (`adversarial_future_leak.csv`) is
  designed so that a peeking implementation produces different output
  from a non-peeking one. The test asserts on the non-peeking output.
- Indicators are computed once up front against the full dataframe
  (vectorized for performance), but their values are sliced by the
  iterator's visible head index, so a Bar at position N carries the
  indicator value that was knowable at N.

**Alternatives considered**:
- *Give the strategy a "view" of the dataframe and trust the
  implementer*: brittle. Constitution principle IV demands stronger
  enforcement.
- *Recompute indicators bar-by-bar*: O(N²) for no benefit; the
  vectorized precompute + sliced view delivers the same correctness
  guarantee at O(N).

---

## Decision 3 — VWAP per-session reset algorithm

**Decision**: VWAP is computed per session (calendar date in ET).
Implementation: for each `Bar(i)` with typical price
`tp_i = (high + low + close) / 3`, maintain a running sum
`Σ tp_i × volume_i` and `Σ volume_i` within the session. VWAP at bar
`i` = (running PV sum at i) / (running volume sum at i). Reset both at
the first bar of each new session date.

**Rationale**:
- Matches master plan §4 ("VWAP resets each day") and is the
  industry-standard intraday formula.
- Using typical price rather than close better matches what most
  traders mean by VWAP and is consistent across charting platforms.
- Implemented vectorized via pandas `groupby(session_date).cumsum()`,
  producing one VWAP column per row of the bar dataframe before
  iteration begins.

**Alternatives considered**:
- *Close-only VWAP*: simpler but inconsistent with platforms the user
  may compare against; rejected.
- *Compute VWAP inside the strategy*: violates Decision 2 (strategy
  receives the snapshot, not the math).

---

## Decision 4 — Opening-range completion semantics

**Decision**: The opening range is the high / low of bars in the
half-open interval `[session_open, session_open + OR_minutes)`. The OR
is considered "complete" starting from the bar whose timestamp equals
`session_open + OR_minutes` (i.e., the bar immediately after the last
in-OR bar). Signals MAY fire only on bars where `OR_complete` is true.

**Rationale**:
- Spec FR-005 requires "OR_complete only after the OR window has fully
  passed." The half-open-interval definition gives a clean, off-by-one-
  free rule: a 15-minute OR on a session opening at 09:30 ET covers
  bars at 09:30, 09:35, and 09:40 (which start at 09:40 and end at
  09:45). The first signal-eligible bar starts at 09:45.
- Vectorized: a boolean `or_complete` column is computed in the loader
  / indicators stage and carried on every row.

**Alternatives considered**:
- *Closed interval `[session_open, session_open + OR_minutes]`*:
  ambiguous around the exact OR_minutes boundary; rejected for clarity.
- *Compute OR completeness in the strategy*: violates Decision 2 +
  duplicates logic that belongs in the indicator layer.

---

## Decision 5 — Same-bar stop-and-target tiebreak

**Decision**: If a single bar's `low ≤ stop_loss` AND
`high ≥ take_profit`, the paper broker assumes the stop fills first
(for a long position). The journal exit row records this assumption
explicitly via a field `same_bar_tiebreak: stop_first`.

**Rationale**:
- Spec FR-009 mandates this rule. The conservative-for-long assumption
  prevents accidentally optimistic backtests where a bar's range
  spanned both exits and the engine "got lucky."
- Recording the tiebreak in the journal makes the assumption auditable
  per spec User Story 2 — the user is never surprised by the engine's
  intra-bar resolution choice.

**Alternatives considered**:
- *Coin-flip*: non-deterministic; violates FR-015 (byte-identical
  reproducibility) and FR-013 (deterministic replay).
- *Take-profit first*: optimistic; would systematically inflate
  backtested results.

---

## Decision 6 — Deterministic journal ordering for reproducibility

**Decision**: Before writing `journal.csv`, journal rows are sorted by
the composite key `(timestamp_iso, status_priority, row_seq)` where
`status_priority` is a fixed dict
`{emitted: 0, approved: 1, rejected: 1, executed: 2, exited: 3,
force_flat: 3, lockout: 4}` and `row_seq` is the in-engine insertion
order (preserved as a tie-breaker). The CSV writer uses
`quoting=csv.QUOTE_MINIMAL`, `lineterminator='\n'`, and an explicit
column order; floating-point fields are formatted with the format
strings in `contracts/journal-csv-schema.md`.

**Rationale**:
- The same logical run can produce the same logical events in slightly
  different in-engine orders (e.g., risk decision and signal can be
  emitted at "the same bar"). A stable sort key collapses that
  variance.
- Locking the CSV writer's options removes platform-specific newline
  variance.
- Floating-point formatting at the I/O boundary (not at the model
  layer) keeps the in-memory `Position.realized_pnl` precise while
  guaranteeing byte-identical files.

**Alternatives considered**:
- *Hash-based ordering*: introduces dependency on Python's hash seed;
  not deterministic across processes by default.
- *Trust the engine's natural emission order*: brittle to refactor.

---

## Decision 7 — Run manifest fingerprint

**Decision**: `run.yaml` carries a `data_fingerprint` block with:
- `sha256`: SHA-256 of the raw CSV bytes that the loader read.
- `bar_count`: integer count of rows AFTER session filtering and
  symbol validation.
- `earliest_timestamp`: ISO 8601 with `-04:00` / `-05:00` ET offset.
- `latest_timestamp`: same format.
- `session_count`: integer count of distinct ET calendar dates with at
  least one in-session bar.

It also carries:
- `resolved_config`: the full validated config tree (post-defaults,
  pre-execution) as a YAML mapping.
- `code_version`: `git rev-parse HEAD` if the cwd is a git tree;
  otherwise the literal string `"unversioned"`.
- `run_started_at` / `run_ended_at`: ISO 8601 UTC timestamps.

**Rationale**:
- Fingerprinting the **post-filter** bar count distinguishes "the user
  changed the CSV" from "the user filtered differently."
- SHA-256 of CSV bytes catches silent file edits without needing
  metadata.
- The two-timestamp model lets the user see both that two runs
  consumed the same data AND that they did so under the same code.

**Alternatives considered**:
- *Hash the dataframe instead of the file*: harder to reproduce
  (depends on pandas internals + dtype inference).
- *Skip code_version when git absent*: makes manifests less useful in
  CI containers; the `"unversioned"` literal is more honest.

---

## Decision 8 — Test tooling

**Decision**: `pytest` for the runner, `pytest-cov` for coverage,
`freezegun` for time-dependent tests (clock module, no-new-trades-after,
force-flat). No `unittest` or `nose`.

**Rationale**:
- pytest is the de facto standard; the test discovery and fixture
  ergonomics are vastly better than unittest for this codebase shape.
- freezegun is needed because `clock.py` calls `datetime.now()` in some
  branches; tests that pretend the wall clock is mid-session are
  cleaner with freezegun than with monkeypatched datetimes.
- pytest-cov gates SC-002 (100% coverage of strategy / risk paths).

**Alternatives considered**:
- *unittest*: more verbose, no parameterization without subTest.
- *hypothesis*: useful for property-based VWAP tests; deferred to a
  later feature to keep this MVP's dep list tight.

---

## Decision 9 — Lint / format tooling

**Decision**: ruff (lint) + ruff-format (format). Minimal rule set:
`E`, `F`, `I`, `B`, `UP`. No mypy in this feature.

**Rationale**:
- ruff is fast enough to run in a pre-commit and a CI step combined.
- Pydantic v2 already provides runtime type validation; adding mypy in
  v1 would slow iteration with marginal benefit. Defer to a later
  feature when the codebase has more modules to type-check.

**Alternatives considered**:
- *black + flake8 + isort*: three tools where one suffices.
- *mypy from day one*: marginal benefit until the codebase grows.

---

## Decision 10 — Config schema layering

**Decision**: A single `backend/config/config.yaml` carries all values.
Pydantic v2 `BaseSettings`-style model validates the tree at load time
with sub-models for `app`, `market`, `data`, `strategy`, `risk`, and
`broker`. The `market.symbol` field is typed as
`Literal["SPY"]` (constitution principle I — enforced at the type
level, not at runtime if/else). The `broker.live_auto_enabled` field
is typed as `Literal[False]` in the default config; enabling live
requires explicit override (constitution principle V).

**Rationale**:
- Pydantic `Literal["SPY"]` makes "any non-SPY symbol" a parse error,
  which is the strongest possible enforcement.
- Single config file matches master plan §24; no env-var-override
  layering yet because there's nothing in this feature that needs to
  differ between dev and CI.

**Alternatives considered**:
- *Multiple YAMLs (dev.yaml, prod.yaml)*: premature for a single-mode
  feature.
- *python-dotenv + env vars*: nothing in this feature is secret; YAML
  is more readable.
