# Feature Specification: Validation Engine (Phase 2 — Validation Methodology)

**Feature Branch**: `011-validation-engine`

**Created**: 2026-06-03

**Status**: Draft

**Input**: User description: Phase 2 of the automated-trading roadmap — the validation **engine** that lets us refine strategy knobs without fooling ourselves into trading a curve-fit illusion. (The cross-run insights/aggregation API and the soft-delete retention prerequisite are deliberately deferred to a later feature, 012.)

## Overview

Phase 0 gave us multi-regime data; Phase 1 made the backtest measure *net, realistic* per-run performance. But a single backtest — even a net-of-cost one over thousands of trades — cannot tell us whether an edge is **real** or **fit to the noise of the data we happened to tune on**. This feature builds the methodology that answers that question.

The central object is a **validation study**: a container that orchestrates *many* backtests over different slices of history and/or a human-specified grid of knob values, then aggregates them into four verdicts:

1. **In-sample vs out-of-sample** (walk-forward) — does performance survive on data the config was *not* tuned on?
2. **Plateau vs spike** (parameter sensitivity) — is the edge robust across a *range* of a knob's values, or a fragile single peak?
3. **Significant vs luck** (bootstrap + permutation) — is the result distinguishable from chance?
4. **Lockbox** (one-shot held-out test) — does a frozen candidate survive on data reserved, untouched, for a single final test?

**Governing constraint (constitution Principle II):** the engine **evaluates and reports only**. It runs configs the *human* specifies and surfaces the evidence; it **never** auto-selects a config to trade and **never** chains a machine-chosen config into the next window. Parameter research stays manual and out-of-sample-disciplined. There is no automated optimizer in this feature.

**The honest framing:** most candidate configs *should* fail this process. A study that kills a config is the process working, not failing. If nothing survives, that is a valid, money-saving result.

## Clarifications

### Session 2026-06-03

- Q: When the lockbox is already spent and the operator points a *different* config at it, what happens? → A: **Block by default, with one deliberate recorded override.** A second lockbox run against a different config is refused with an explicit "lockbox already spent" error. The only way through is an explicit **"override & burn"** action, which permanently marks the lockbox contaminated, records that the discipline was broken, and is journaled. Accidental contamination is impossible; deliberate contamination is irreversible and on the record.
- Q: How is the permutation / Monte-Carlo null distribution built? → A: **Random-entry null.** Generate the same number of entries as the observed result at randomly chosen eligible bars (respecting the session window, no-overnight, and one-position-at-a-time constraints), apply the same stop/target/exit rules and costs, recompute the metric, and repeat to form the null distribution.
- Q: What is the shipped default walk-forward windowing? → A: **Rolling ~12-month training window stepping ~6 months**, validating on the next ~6-month window (≈11 out-of-sample windows over the 2018→2024 train+validation pool). Anchored-vs-rolling and the window/step sizes remain configurable.

## User Scenarios & Testing *(mandatory)*

The "user" here is us — the builder/operator doing strategy research. Each story is an independently testable slice that delivers research value on its own.

### User Story 1 - Walk-forward: see in-sample vs out-of-sample side by side (Priority: P1)

As the operator, I want to run a chosen config through a **walk-forward** study across the train and validation history — tuning-window metrics next to the following untouched window's metrics — so I can see whether the edge survives out-of-sample or only existed in the data I looked at. This story also establishes the **train / validation / lockbox** segmentation that every other story depends on, and guarantees the lockbox is never touched.

**Why this priority**: This is the heart of Phase 2 and the single most important overfitting detector. Built alone it already delivers the core value — "is this edge real or did I just fit noise?" — and it forces the data-split discipline that the rest of the feature builds on.

**Independent Test**: Define the three segments in config, launch a walk-forward study on a candidate config, and confirm the study presents per-window in-sample vs out-of-sample metrics with the gap highlighted — and that no bar dated inside the lockbox segment was ever evaluated.

**Acceptance Scenarios**:

1. **Given** a configured train/validation/lockbox split and a candidate config, **When** the operator launches a walk-forward study, **Then** the study produces, for each rolling window, the in-sample (training-window) metrics and the out-of-sample (next validation-window) metrics side by side, with a clearly flagged in-sample-vs-out-of-sample gap.
2. **Given** a walk-forward study, **When** any window is evaluated, **Then** no bar whose timestamp falls in the lockbox segment is ever included in any evaluation.
3. **Given** an out-of-sample window with fewer than the configured low-confidence trade count, **When** the study reports that window, **Then** the window is flagged as a thin/noisy sample (consistent with the Phase 1 significance indicator).
4. **Given** a config whose own requested date range overlaps the lockbox segment, **When** a non-lockbox study is launched, **Then** the system refuses the study with an explicit error rather than silently leaking lockbox data.

---

### User Story 2 - Parameter sensitivity: plateau vs spike (Priority: P2)

As the operator, I want to evaluate a **human-specified grid** of values for one or more knobs and see the resulting performance *surface*, so I can tell whether the edge is a robust **plateau** (works across a range of values) or a fragile **spike** (one lucky setting). I want to prefer the boring middle of a plateau and distrust sharp peaks.

**Why this priority**: Robustness over peaks is a core anti-overfitting test. It is independent of walk-forward — a grid can be run over any segment — but it is a refinement of the core methodology, so it follows the P1 walk-forward slice.

**Independent Test**: Specify a grid of, say, five values for one knob, launch a sensitivity study, and confirm the study reports the chosen metric at each value as a surface, making plateau-vs-spike visually obvious.

**Acceptance Scenarios**:

1. **Given** a grid of N values for one knob (or an M×N grid for two knobs), **When** the operator launches a sensitivity study, **Then** the study evaluates each grid point and reports the selected metric (e.g., expectancy, net P&L) at each point as a surface.
2. **Given** a completed sensitivity study, **When** the operator views the surface, **Then** adjacent grid points that perform similarly (a plateau) are visually distinguishable from an isolated high point flanked by poor neighbors (a spike).
3. **Given** a grid whose size exceeds a configured warning threshold, **When** the operator launches it, **Then** the system surfaces the total evaluation count and estimated effort before proceeding (no silent unbounded fan-out).

---

### User Story 3 - Significance: distinguish edge from luck (Priority: P2)

As the operator, I want a clear **significance verdict** for a result — both a **bootstrap confidence interval** on the key metrics and a **permutation / Monte-Carlo** test ("could random entries respecting the same session constraints and trade count have produced this?") — so I know whether a positive result is distinguishable from chance, with a plain "significant at α = 0.05?" answer.

**Why this priority**: Significance defends against celebrating noise. It applies to any single result or out-of-sample window and is independent of the walk-forward and sensitivity machinery, so it sits alongside US2.

**Independent Test**: Point the significance test at a completed result and confirm it returns a bootstrap CI on expectancy (and Sharpe), a permutation p-value, and a yes/no significance verdict — and that re-running with the same seed produces identical numbers.

**Acceptance Scenarios**:

1. **Given** a completed result with a population of trades, **When** the operator requests significance, **Then** the system reports a confidence interval (default 95%) on expectancy and Sharpe via resampling, and a permutation/Monte-Carlo p-value with an explicit "significant at α = 0.05? yes/no" verdict.
2. **Given** the same result and the same random seed, **When** significance is computed twice, **Then** the two outputs are identical (reproducible).
3. **Given** a result with too few trades to be meaningful, **When** significance is computed, **Then** the verdict reflects the wide interval / lack of significance rather than a false positive.

---

### User Story 4 - One-shot lockbox gate (Priority: P3)

As the operator, after a candidate config has survived walk-forward, sensitivity, and significance, I want to **freeze** it and run it against the **lockbox** segment **exactly once** — with the result recorded immutably — so that I cannot quietly re-tune against the held-out set. If I try to run the lockbox against a tweaked config, the system must **block it or loudly flag the lockbox as burned/contaminated**.

**Why this priority**: The lockbox is the capstone and the final exit-gate test; it is only meaningful once the earlier stories exist and a candidate has been chosen. It is the defining anti-self-deception mechanism, so it is essential to *complete* the feature even though it is built last.

**Independent Test**: Freeze a config, run it once on the lockbox segment, confirm the result is recorded; then attempt a second lockbox run against a *different* config and confirm the system blocks it or marks the lockbox burned, and that the spend was journaled.

**Acceptance Scenarios**:

1. **Given** a frozen candidate config, **When** the operator runs the one-shot lockbox test, **Then** the system evaluates that config on the lockbox segment, records the result immutably in a spent-lockbox ledger, and emits a journal entry for the spend.
2. **Given** a lockbox that has already been spent, **When** the operator attempts to run it against a *different* config, **Then** the system refuses with an explicit "lockbox already spent" error — unless the operator invokes the explicit "override & burn" action, which permanently marks the lockbox contaminated, records that the discipline was broken, and journals it.
3. **Given** a spent lockbox, **When** the operator views the validation surface, **Then** the lockbox's spent/burned state and the one recorded result are clearly displayed and cannot be silently overwritten.

---

### Edge Cases

- **Thin windows**: a walk-forward window or grid point with very few trades is flagged low-confidence (reusing the Phase 1 sample-size indicator), not reported as if meaningful.
- **Data gaps / holidays**: windows that span thin or partial data still evaluate correctly; window boundaries are based on configured dates, not assumed contiguity.
- **Lockbox leakage attempt**: any study whose requested range intersects the lockbox segment is refused unless it is *the* explicit one-shot lockbox run.
- **Lockbox re-run**: a second lockbox evaluation against a changed config is blocked or burns the lockbox — never a silent overwrite.
- **Combinatorial blow-up**: a grid or walk-forward configuration that implies a very large number of evaluations surfaces its size/effort before running; nothing fans out unbounded silently.
- **No survivor**: a study where every config fails the gates completes normally and reports "nothing survived" as a valid outcome.
- **Zero-trade result**: significance and metrics degrade gracefully (no division by zero; verdict = not significant / undefined, clearly labeled).
- **Reproducibility**: any test involving randomness (bootstrap, permutation) is seeded so a repeated study yields identical verdicts.

## Requirements *(mandatory)*

### Functional Requirements

**Data split discipline**

- **FR-001**: The system MUST segment the available SPY history into three contiguous, chronological segments — **train**, **validation**, and **lockbox** — with the lockbox being the most-recent slice (closest to forward / out-of-sample-by-construction).
- **FR-002**: Segment boundaries MUST be defined in configuration (no hard-coded date literals in source). The shipped default MUST be adjustable.
- **FR-003**: The system MUST guarantee that walk-forward and sensitivity studies never evaluate any bar dated inside the lockbox segment, and MUST refuse any non-lockbox study whose requested range intersects the lockbox.

**Validation study orchestration**

- **FR-004**: The system MUST support a first-class **validation study** that orchestrates multiple individual backtest evaluations over different windows and/or a grid of configs, and aggregates their per-evaluation results.
- **FR-005**: Each individual window×config evaluation MUST be a normal, fully-recorded backtest (inheriting per-evaluation metrics, trades, journal, config snapshot, and deduplication) so any single evaluation can be inspected on its own.
- **FR-006**: Long-running studies MUST execute as background work and report progress/status, without blocking the operator.

**Walk-forward (US1)**

- **FR-007**: The system MUST roll an evaluation window through the train+validation segments and report, per window, the in-sample (training-window) metrics next to the following untouched window's out-of-sample metrics.
- **FR-008**: The system MUST compute and surface an explicit in-sample-vs-out-of-sample **gap** per window and in aggregate, where a large gap signals overfitting.
- **FR-009**: Walk-forward window sizing and step, and whether the training window is anchored or rolling, MUST be configurable. The shipped default MUST be a **rolling ~12-month training window stepping ~6 months**, validating on the next ~6-month window.

**Parameter sensitivity (US2)**

- **FR-010**: The system MUST evaluate a human-specified grid of values for one or more knobs over a chosen segment and report the selected metric at each grid point as a surface.
- **FR-011**: The surface MUST make a **plateau** (stable performance across neighboring values) distinguishable from a **spike** (an isolated peak surrounded by poor neighbors).
- **FR-012**: Before launching, the system MUST surface the total number of evaluations a grid implies and warn when it exceeds a configured threshold.

**Significance (US3)**

- **FR-013**: The system MUST compute **bootstrap confidence intervals** (default 95%) on key metrics (at minimum expectancy and Sharpe) by resampling the trade population.
- **FR-014**: The system MUST run a **permutation / Monte-Carlo** test whose null distribution is built by the **random-entry** method: generate the same number of entries as the observed result at randomly chosen eligible bars (respecting the session window, no-overnight, and one-position-at-a-time constraints), apply the same stop/target/exit rules and costs, recompute the metric, and repeat to form the null. Report the observed result's p-value against that null.
- **FR-015**: The system MUST produce a plain-language **"significant at α = 0.05? yes/no"** verdict from the permutation test.
- **FR-016**: All randomness used in significance (and anywhere else) MUST be seeded so results are reproducible; the same input + seed MUST yield identical verdicts.

**Lockbox (US4)**

- **FR-017**: The system MUST let the operator **freeze** a candidate config (capture an immutable fingerprint of it) and run it against the lockbox segment as an explicit, deliberate action.
- **FR-018**: The system MUST record each lockbox evaluation immutably in a **spent-lockbox ledger** keyed by config fingerprint, and MUST emit a journal entry for the spend.
- **FR-019**: Once a lockbox has been spent, the system MUST by default **block** a subsequent lockbox run against a *different* config, refusing it with an explicit "lockbox already spent" error so accidental contamination is impossible. The system MUST provide exactly one deliberate escape hatch — an explicit **"override & burn"** action — which, when invoked, permanently marks the lockbox **burned/contaminated**, records that the discipline was broken, and emits a journal entry. Deliberate contamination MUST be irreversible and on the record. A spent result MUST never be silently overwritten.

**Surfacing & education**

- **FR-020**: The system MUST provide an operator surface (a "Validation" area) presenting: the walk-forward in-sample-vs-out-of-sample table with the gap highlighted; the parameter-sensitivity surface; the significance verdict (CI + permutation p-value + verdict); and the lockbox gate with its spent/burned state.
- **FR-021**: Every new concept introduced by this surface MUST ship with a `?` help affordance answering *what it is, why it matters, and how the app uses it* — covering at least: walk-forward, in-sample, out-of-sample, the in-sample/out-of-sample gap, plateau-vs-peak, parameter sensitivity, bootstrap confidence interval, permutation/Monte-Carlo test, lockbox, and burned/contaminated lockbox.

**Governance**

- **FR-022**: The validation engine MUST only evaluate and report; it MUST NOT automatically select a config to trade, chain a machine-chosen config into a subsequent window, or feed any config to a broker. Config selection is always a manual operator action.
- **FR-023**: Studies and lockbox spend events MUST be journaled with full context (constitution VII).

**Enablement (technical, behavior-neutral)**

- **FR-024**: The backtest evaluation path MUST be able to operate on a pre-loaded, date-bounded slice of history so a single study can load the full history once and slice it per window, rather than re-reading source data for every evaluation. This refactor MUST be behavior-neutral and covered by tests proving identical results to the current path.

### Key Entities *(include if feature involves data)*

- **Validation Study**: A first-class container describing a research question (kind = walk-forward | sensitivity | lockbox), the segment(s) it spans, the config or grid it evaluates, its status/progress, and its aggregated verdicts. Parent of many window evaluations.
- **Window Evaluation**: One backtest of one config over one date-bounded window, tagged with its study, its segment (train | validation | lockbox), and its window index. Carries full per-run metrics/trades/journal and is individually inspectable.
- **Split Segment**: The configured train / validation / lockbox date boundaries.
- **Sensitivity Surface**: The set of (knob value(s) → metric) points produced by a grid study, used to judge plateau vs spike.
- **Significance Result**: Bootstrap CI(s), permutation p-value, seed, and the α = 0.05 verdict attached to a result.
- **Lockbox Ledger Entry**: An immutable record that a given frozen config fingerprint was evaluated against the lockbox, when, with what result, and whether the lockbox was thereby spent/burned.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A walk-forward study over the full train+validation history completes and presents per-window in-sample vs out-of-sample metrics, and provably evaluates **zero** bars dated inside the lockbox segment.
- **SC-002**: The operator can detect overfitting at a glance: when out-of-sample performance is materially worse than in-sample, the study flags the gap without the operator hand-computing it.
- **SC-003**: A sensitivity study over a grid of knob values yields a surface from which a plateau and a spike are visually distinguishable, supporting a "prefer the plateau" decision.
- **SC-004**: For any result, the system returns a 95% bootstrap confidence interval, a permutation p-value, and an explicit "significant at α = 0.05?" verdict; repeating the computation with the same seed yields byte-identical verdicts.
- **SC-005**: A frozen config can be evaluated against the lockbox exactly once; a second lockbox attempt against a different config is blocked or recorded as a burned lockbox, and every lockbox spend appears in the journal.
- **SC-006**: 100% of newly introduced concepts in the Validation surface have a working `?` help affordance.
- **SC-007**: An end-to-end exit-gate dry run is possible: take a candidate config, show whether it (a) survives walk-forward with a healthy trade count, (b) sits on a plateau, (c) is significant after costs, and (d) passes the one-shot lockbox — or clearly does not, which is itself a valid result.
- **SC-008**: Running a study a second time with unchanged inputs reuses prior evaluations rather than recomputing them (deduplication holds across studies).

## Assumptions

These reasonable defaults were chosen where the description did not pin down a value; all are adjustable and will be confirmed during planning.

- **Split default**: train = 2018→2022, validation = 2023→2024, lockbox = 2025→2026, configurable. The lockbox is the most-recent slice deliberately, to approximate forward/out-of-sample conditions.
- **Walk-forward defaults**: rolling ~12-month training window, ~6-month step, validating on the next ~6-month window (≈11 out-of-sample windows over the 2018→2024 train+validation pool); exact sizes configurable, anchored-vs-rolling is a config switch.
- **Significance defaults**: ~1,000 bootstrap resamples and ~1,000 permutation iterations, 95% CI, α = 0.05 — all configurable. A fixed default seed is shipped for reproducibility.
- **Sample-size flagging** reuses Phase 1's low-confidence trade-count threshold and Wilson-CI machinery rather than inventing a new one.
- **Persistence reuses the existing run/trade/journal/config infrastructure** as the evaluation unit (a study is a parent of normal runs tagged with segment + window index), inheriting deduplication, per-run config snapshots, and access control. The lockbox ledger is a new immutable record.
- **Cost realism is inherited from Phase 1**: every evaluation is net-of-cost; significance is judged on net results.
- **Strategy and instrument are unchanged**: SPY-only, the existing rule-based VWAP-pullback strategy and risk manager; this feature adds methodology around them, not new trading logic.
- **Out of scope (deferred to feature 012)**: the cross-run insights/aggregation API and views (per-config performance distribution, parameter sensitivity across the whole archive, edge time-series, cross-strategy comparison, rejection mining) and the soft-delete retention prerequisite. This feature *produces* studies; 012 will *aggregate across* them.
- **Live trading is untouched**: this feature operates entirely in backtest mode; no broker, no live path, no change to the live-disabled gate.
