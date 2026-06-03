# Feature Specification: Make the Backtest Honest

**Feature Branch**: `010-honest-backtest`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: "Phase 1 — Make the backtest honest (roadmap §Phase 1; Feature 010). Apply costs/slippage to fills, add real edge-quality metrics (expectancy, Sharpe/Sortino, drawdown $/%, distribution, per-bucket), surface sample-size/significance, and clean up dead config knobs so the backtest measures net, realistic performance."

## Overview

Today the backtest measures a fantasy: fills are ideal (no trading costs deducted), the headline risk-adjusted metric is a hardcoded placeholder, and several configurable knobs do nothing. Any tuning done against this ruler optimizes an illusion. This feature makes the ruler honest — so that every later phase (validation, forward paper, live) is built on numbers that reflect what an operator would actually keep.

This is **Phase 1** of the automated-trading roadmap and a gate: it does not change the *strategy*, only the *measurement* of the strategy.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Net-of-cost backtest results (Priority: P1)

As the operator researching SPY intraday edge, when I run a backtest I want every reported profit-and-loss figure to already have realistic trading costs (per-share fees + slippage) deducted on both entry and exit, so that the number I judge "edge" against is what I would actually keep — not an overstated, zero-cost fantasy.

**Why this priority**: This is the foundational "honest ruler." Every downstream metric (expectancy, Sharpe, drawdown) and every later phase depends on PnL being net. Without it, the rest of the feature decorates a wrong number. It is the minimum viable slice that delivers value on its own.

**Independent Test**: Run a backtest twice on the same data — once with zero costs, once with non-zero costs — and confirm the net result is strictly worse with costs whenever any trade occurs. A fixed, known fixture reproduces the exact expected net PnL after costs.

**Acceptance Scenarios**:

1. **Given** a backtest with non-zero per-share fees and slippage configured, **When** a trade is entered and exited, **Then** the recorded PnL for that trade equals the gross price difference minus fees and slippage applied to both the entry fill and the exit fill.
2. **Given** the same strategy, data, and seed, **When** I compare a zero-cost run to a non-zero-cost run, **Then** the non-zero-cost run reports strictly lower total PnL (and the difference equals the total modeled cost) whenever at least one trade occurs.
3. **Given** a known fixture (fixed number of trades and shares), **When** the backtest completes, **Then** the total deducted cost matches the analytically expected cost (fees × shares × 2 sides + modeled slippage) within rounding tolerance.
4. **Given** a force-flat exit at session close, **When** PnL is recorded, **Then** that trade also has entry+exit costs deducted (force-flat is not cost-free).

---

### User Story 2 - Real edge-quality metrics (Priority: P2)

As the operator, when a backtest finishes I want a complete, correct set of edge-quality metrics — expectancy per trade, a real Sharpe and Sortino ratio, maximum drawdown in both dollars and percent, a return distribution (median / standard deviation / skew), an equity curve, and a per-bucket breakdown by hour-of-day, weekday, and month — so that I can judge *whether* there is an edge, *how large*, and *where it lives or breaks*, instead of reading a placeholder.

**Why this priority**: Net PnL alone does not tell you if an edge is real, durable, or lucky. These metrics are the vocabulary of that judgment, and the roadmap exit gate explicitly requires them. Builds directly on US1 (metrics are computed on net results).

**Independent Test**: Run a backtest against a fixture with known trade outcomes and verify each metric matches its hand-computed expected value (expectancy, Sharpe, Sortino, drawdown $/%, distribution stats, per-bucket counts and sums).

**Acceptance Scenarios**:

1. **Given** a completed backtest with at least two trades, **When** I view the summary, **Then** it reports expectancy per trade computed as (win% × avg win) − (loss% × |avg loss|), a Sharpe ratio, a Sortino ratio, maximum drawdown in dollars, maximum drawdown in percent, and return distribution statistics (median, standard deviation, skew).
2. **Given** a completed backtest, **When** I view the summary, **Then** the previously-placeholder risk-adjusted figure is now a genuine computed value (no longer a constant) and is consistent with the trade outcomes.
3. **Given** a completed backtest, **When** I inspect the per-bucket breakdown, **Then** trades are grouped by hour-of-day, by weekday, and by month, each bucket reporting at least its trade count and aggregate PnL/expectancy.
4. **Given** a completed backtest, **When** I view results over time, **Then** an equity curve (cumulative net PnL across the trade sequence) is available.

---

### User Story 3 - Sample-size and significance signal (Priority: P3)

As the operator, every result I look at should tell me how many trades it is based on and how trustworthy that number is (a confidence interval on the win rate), and should visibly flag thin samples as noise, so that I never mistake "83% win rate on 6 trades" for evidence.

**Why this priority**: The #2 killer after curve-fitting is treating small-sample luck as edge. This guardrail is cheap and prevents a class of self-deception. It is a presentation layer over US2's metrics, so it follows them.

**Independent Test**: Produce a 6-trade result and a 300-trade result; confirm the small one is flagged as low-confidence with a wide interval, and the large one shows a tight interval and is not flagged.

**Acceptance Scenarios**:

1. **Given** any backtest result, **When** I view it, **Then** the trade count N and a 95% confidence interval on the win rate are shown alongside the headline metrics.
2. **Given** a result with a trade count below the low-confidence threshold, **When** I view it, **Then** it is visually flagged as statistically unreliable ("noise").
3. **Given** a result with a large trade count, **When** I view it, **Then** the confidence interval is correspondingly narrow and no noise flag is shown.

---

### User Story 4 - Config that means what it says (Priority: P4)

As the operator, every knob exposed in configuration should actually change backtest behavior, so that when I tune a parameter I can trust the result reflects that change — no silently-ignored dials.

**Why this priority**: Dead knobs are a correctness/honesty trap independent of costs and metrics — a tuner could "optimize" a knob that does nothing and conclude it matters. Lowest priority because it is the smallest surface, but it must land before any parameter research begins.

**Independent Test**: For each documented strategy knob, vary it and confirm the backtest result changes; any knob that cannot change behavior is removed from configuration entirely.

**Acceptance Scenarios**:

1. **Given** a configuration knob that currently has no effect, **When** this feature is complete, **Then** the knob either demonstrably changes backtest behavior when varied, or no longer exists in configuration.
2. **Given** the cleaned configuration, **When** I read it, **Then** there are no parameters that are parsed but ignored.

---

### Edge Cases

- **Zero trades**: expectancy, win-rate confidence interval, Sharpe, Sortino, and drawdown-% must be reported as undefined/null without error (no division by zero).
- **All wins or all losses**: profit factor and Sortino (zero downside deviation) must degrade gracefully to an undefined/sentinel value rather than crash or report a misleading number.
- **Single trade**: confidence interval is maximally wide and the result is flagged as noise.
- **Costs flip an outcome**: a trade that hit its target gross but nets negative after costs is recorded at its true net value; metrics reflect the net classification consistently.
- **Slippage worsens fills only**: slippage must never improve a fill (entry never below the modeled price, exit never above) — costs are always adverse to the trader.
- **Force-flat and rejected/skipped rows**: force-flat exits incur costs and belong to a time bucket; rejections and skipped setups incur no cost and are excluded from PnL metrics.
- **Percent drawdown base**: drawdown-% is computed against a defined account/equity base so the figure is interpretable, not relative to an undefined starting capital.

## Requirements *(mandatory)*

### Functional Requirements

**Costs (US1)**
- **FR-001**: The system MUST deduct configured per-share fees on both the entry fill and the exit fill of every executed trade.
- **FR-002**: The system MUST model configured per-share slippage adversely on both entry and exit (entry filled no better than the reference price, exit filled no better), reducing realized PnL.
- **FR-003**: The system MUST ship sensible non-zero default cost values so that out-of-the-box backtests are net-of-cost, not zero-cost.
- **FR-004**: The recorded per-trade PnL MUST be the net figure (gross minus fees minus slippage), and the aggregate PnL MUST be the sum of net per-trade figures.
- **FR-005**: The system MUST preserve the existing conservative fill assumptions (e.g., same-bar stop-resolves-before-target; force-flat at session close) while layering costs on top of them.
- **FR-006**: The system MUST record enough cost detail per trade (gross PnL, total fees, total slippage, net PnL) for the journal to explain the deduction (constitution VII — journal everything).

**Metrics (US2)**
- **FR-007**: The system MUST compute expectancy per trade as (win rate × average win) − (loss rate × |average loss|).
- **FR-008**: The system MUST compute a genuine Sharpe ratio and a Sortino ratio from the net per-trade return series, replacing the current placeholder.
- **FR-009**: The system MUST compute maximum drawdown expressed in both dollars and percent.
- **FR-010**: The system MUST compute return-distribution statistics over net per-trade outcomes: median, standard deviation, and skew.
- **FR-011**: The system MUST produce an equity curve (ordered cumulative net PnL across the trade sequence).
- **FR-012**: The system MUST produce a per-bucket breakdown of performance by hour-of-day, by weekday, and by month, each bucket reporting at least trade count and aggregate net PnL/expectancy.
- **FR-013**: All metrics MUST be computed over net (post-cost) results, consistent with FR-004.

**Significance (US3)**
- **FR-014**: Every backtest result MUST report its trade count N.
- **FR-015**: Every backtest result MUST report a 95% confidence interval on the win rate.
- **FR-016**: The system MUST visually flag results whose trade count falls below a defined low-confidence threshold as statistically unreliable.

**Config honesty (US4)**
- **FR-017**: Every configuration knob that is parsed MUST affect behavior; any knob that cannot be made to affect behavior MUST be removed from configuration. Specifically resolves the currently-dead `min_minutes_after_open`, `require_close_above_prior_bar_high`, and `require_close_above_vwap`.

**Educational UI (constitution VI)**
- **FR-018**: Every newly surfaced concept (slippage, fees, expectancy, Sharpe, Sortino, drawdown $/%, return distribution, confidence interval, sample size) MUST ship with an in-context explanation answering: what is this, why does it matter, and how is the app using it.

**Process (constitution IV)**
- **FR-019**: Every behavior change in this feature MUST be introduced test-first (a failing test precedes the implementation).

### Key Entities *(include if feature involves data)*

- **Trade record**: a completed trade, extended to carry gross PnL, total fees, total slippage, and net PnL (in dollars and in R), plus its entry timestamp (used for time-bucketing).
- **Cost parameters**: per-share fee and per-share slippage values that govern the deduction, with non-zero defaults.
- **Backtest summary**: the per-run metric set, extended with expectancy, Sharpe, Sortino, max drawdown ($ and %), distribution statistics (median/std/skew), trade count, and win-rate confidence interval.
- **Equity curve**: an ordered series of cumulative net PnL points across the trade sequence.
- **Per-bucket breakdown**: groupings of trades by hour-of-day, weekday, and month, each with count and aggregate net performance.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any backtest with non-zero costs and at least one trade, reported total PnL is strictly lower than the equivalent zero-cost run, and the gap equals the total modeled cost (verified to rounding tolerance).
- **SC-002**: A committed known-fixture backtest reproduces an exact, pre-stated net PnL and total cost — proving costs are applied (the roadmap exit-gate fixture).
- **SC-003**: 100% of these metrics are present and correct against a fixture: expectancy, Sharpe, Sortino, max drawdown in $, max drawdown in %, distribution (median/std/skew), equity curve, and per-bucket breakdown (hour/weekday/month).
- **SC-004**: Every result surfaces trade count N and a 95% win-rate confidence interval; results below the low-confidence threshold are visibly flagged, and a 6-trade result is flagged while a several-hundred-trade result is not.
- **SC-005**: Zero configuration knobs are parsed-but-ignored after this feature — every remaining knob changes a backtest outcome when varied, verified by test.
- **SC-006**: Every newly surfaced concept has an accessible in-context explanation (what/why/how), with none missing.
- **SC-007**: The default (out-of-the-box) backtest is net-of-cost without any manual configuration change.

## Assumptions

- **Cost model shape**: slippage is modeled as a fixed adverse amount per share (matching the existing per-share configuration field), not as a spread- or volatility-dependent model. A more sophisticated model is out of scope for Phase 1 and can be revisited later. *(Default cost magnitudes are an open item to firm up in clarification — see below.)*
- **Default cost magnitudes**: starting assumption is commission-free equity fees (≈ $0.00/share, reflecting the execution broker) plus a conservative non-zero slippage (≈ $0.01/share) so backtests are honestly net-of-cost; exact values to be confirmed in `/speckit-clarify`.
- **Percent-drawdown base**: drawdown-% is computed against the configured account-equity / starting-capital base already present in configuration; if none is suitable, the smallest defensible base is documented.
- **Confidence-interval method**: a standard binomial proportion interval (e.g., Wilson) on the win rate at 95% is acceptable; the exact method is an implementation detail.
- **Low-confidence threshold**: a default trade-count threshold (order of a few dozen trades) flags "noise"; the exact number is a tunable presentation default.
- **Scope guardrails**: SPY-only (constitution I) is unchanged; the strategy still only *suggests* signals and never sizes or places orders (constitution II); no live-trading paths are touched (constitution V). This feature changes measurement and configuration honesty only.
- **No new data**: relies on the Phase 0 multi-year SIP bar dataset already in place; no data work in this feature.
- **Reproducibility**: cost parameters become part of the per-run config snapshot so historical runs remain explainable.

## Out of Scope

- Walk-forward, train/validation/lockbox splits, parameter-sensitivity surfaces, and permutation/significance testing beyond a basic win-rate confidence interval — these are **Phase 2** (Feature 011).
- Any broker/Alpaca execution, live data feed, or operator trading surface — **Phase 3+**.
- Volatility- or spread-aware slippage models, partial fills, and queue-position modeling.
- Multi-symbol support.
