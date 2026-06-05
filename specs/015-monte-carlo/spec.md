# Feature Specification: Monte Carlo Path-Risk Analysis

**Feature Branch**: `015-monte-carlo`

**Created**: 2026-06-04

**Status**: Draft

**Input**: User description: "Monte Carlo path-risk analysis on any run's trades: drawdown/path-risk distributions, forward projection cone, and risk-of-ruin probabilities, attached to the run detail page like the significance panel. Approved brainstorm design: docs/superpowers/specs/2026-06-04-monte-carlo-path-risk-design.md (source of truth for decided architecture and scope)."

## Clarifications

### Session 2026-06-04

- Q: Which rule governs the in-sample caveat banner (notably for sensitivity
  children persisted with no segment by mixed train+validation studies)? →
  A: Caveat unless provably out-of-sample — show the banner for every run whose
  segment is not `validation` or `lockbox`; this includes train-segment
  children, no-segment sensitivity children, and all plain backtests.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Assess drawdown / path risk of a run (Priority: P1)

As the operator, I open any completed run (a standalone backtest, a walk-forward
window's child run, a sensitivity grid point, or the lockbox run) and launch a
Monte Carlo simulation. The system reshuffles the order of the run's actual
trades thousands of times and shows me the distribution of max drawdown (% and
$), longest losing streak, and longest time underwater — with my run's observed
value marked against each distribution — so I can tell how much of my equity
curve's smoothness was ordering luck and how bad the path could plausibly have
been.

**Why this priority**: This is the core question the validation engine cannot
answer today. The observed equity curve is one ordering of the trades;
path-dependent risk statistics are extremely sensitive to that ordering. This
story alone delivers the "how bad could it have gotten?" answer that gates any
paper/live decision.

**Independent Test**: Open a completed run with a meaningful number of trades,
launch the simulation, and verify the three path-risk distributions render with
percentiles and the observed value highlighted. Delivers standalone value
without the cone or ruin sections.

**Acceptance Scenarios**:

1. **Given** a completed run with N ≥ 2 trades, **When** the operator launches
   the simulation, **Then** the system computes the configured number of
   reshuffled paths and displays P5/P25/P50/P75/P95 plus the observed value for
   max drawdown (% and $), longest losing streak, and longest underwater period.
2. **Given** the same run and unchanged configuration, **When** the simulation
   is launched again (any time, any session), **Then** every reported number is
   identical (deterministic, seeded).
3. **Given** a run whose trade count is below the existing low-confidence
   threshold, **When** the simulation completes, **Then** results display with
   the low-confidence indicator.
4. **Given** a run with fewer than 2 trades or no stored trade data, **When**
   the operator attempts a simulation, **Then** the system refuses with a
   plain-English explanation instead of results.

---

### User Story 2 - Project a forward cone of outcomes (Priority: P2)

As the operator, on the same panel I see a forward projection: the system draws
trades with replacement from the run's actual trade distribution to simulate
many future paths over a configurable horizon (default: the same number of
trades as the run produced), and shows me a fan chart of equity percentile
bands plus terminal-equity percentiles — so I know what range of outcomes to
reasonably expect if the strategy keeps behaving like this run.

**Why this priority**: Builds directly on the same simulation machinery and
answers the forward-looking half of the risk question; valuable but secondary
to understanding realized path risk.

**Independent Test**: Launch the simulation on a run and verify the cone renders
percentile bands over the horizon and a terminal-equity percentile summary.

**Acceptance Scenarios**:

1. **Given** a completed run with N ≥ 2 trades, **When** the simulation
   completes, **Then** a cone of P5/P25/P50/P75/P95 equity bands over the
   horizon is displayed, with band ordering P5 ≤ P25 ≤ P50 ≤ P75 ≤ P95 at every
   step, plus terminal-equity percentiles.
2. **Given** a run with a very large trade count, **When** the cone is
   computed, **Then** the response stays within the payload budget (cone
   downsampled to at most 200 steps) without changing the percentile values at
   the sampled steps.

---

### User Story 3 - Quantify risk of ruin (Priority: P3)

As the operator, I see the probability that equity would have dipped below my
starting account value by more than each configured pain threshold (default 5%,
10%, 20%) at any point across the simulated forward paths — so I can judge
whether I could stomach trading this strategy before committing to paper or
live.

**Why this priority**: The most decision-ready single number, but it is derived
from the same forward paths as the cone, so it lands after the machinery from
stories 1–2 exists.

**Independent Test**: Launch the simulation and verify a ruin probability is
shown for every configured threshold, and the probabilities are monotonically
non-increasing as the threshold deepens.

**Acceptance Scenarios**:

1. **Given** a completed simulation, **When** ruin probabilities are displayed,
   **Then** there is one probability per configured threshold, each defined as
   the fraction of forward paths whose equity dropped below starting equity by
   at least that threshold at any point during the horizon.
2. **Given** thresholds 5%, 10%, 20%, **When** probabilities are computed,
   **Then** P(ruin at 5%) ≥ P(ruin at 10%) ≥ P(ruin at 20%).

---

### User Story 4 - Trust and interpret the numbers (Priority: P4)

As the operator (and learner), the panel tells me when NOT to trust the
numbers: an in-sample caveat banner appears when the run's trades are
in-sample (a train-segment study child or a plain backtest), every concept has
an educational tooltip (what is this / why it matters / how the app computes
it, including iteration count and seed), and every result is exactly
reproducible from the metadata it carries.

**Why this priority**: Cross-cutting interpretability; the constitution requires
the education and journaling, and the caveat prevents the most dangerous
misread (treating in-sample risk estimates as real).

**Independent Test**: Open the panel on a train-segment or no-segment child
run and verify the caveat banner; open it on a validation-segment (OOS) child
and verify no banner; verify every displayed concept exposes a tooltip; verify
the simulation event is journaled.

**Acceptance Scenarios**:

1. **Given** a run that is not provably out-of-sample (train-segment child,
   sensitivity child persisted without a segment, or a plain backtest),
   **When** the panel renders, **Then** a caveat explains that the risk
   estimates may be optimistic and OOS windows or the lockbox run are
   preferred.
2. **Given** a validation-segment or lockbox child run, **When** the panel
   renders, **Then** no in-sample caveat is shown.
3. **Given** any rendered Monte Carlo concept (shuffle distribution, cone,
   ruin, iterations/seed), **When** the operator opens its tooltip, **Then**
   it explains what it is, why it matters, and how the app computes it.
4. **Given** a completed simulation, **When** the response is inspected,
   **Then** it carries the seed, iteration count, and trade count that allow
   exact regeneration of every displayed number — and no journal entry or
   stored record was created (parity with significance).

---

### Edge Cases

- Run has 0 or 1 trades → refuse with a plain-English reason (no distribution
  exists for a single trade's ordering).
- Run predates per-trade storage or has no stored trade data → refuse with a
  plain-English reason.
- Trade count below the low-confidence threshold → compute, flag low-confidence.
- All trades are winners (or all losers) → distributions still computed;
  losing-streak stat degenerates gracefully (0 or N).
- Very large runs → cone payload capped at 200 downsampled steps.
- Reshuffled paths always end at the same terminal equity (same trade set);
  the system self-checks this invariant and fails loudly if violated.
- Repeat launches on the same run → byte-identical results (seeded determinism);
  no state accumulates (nothing is persisted).
- A run owned by another user → not found (ownership enforced).
- Sensitivity children persisted without a segment (mixed train+validation
  studies) → not provably OOS; the in-sample caveat shows.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute, for any owned completed run with at
  least 2 stored trades, shuffle-based path-risk distributions (max drawdown
  in % from running peak and in $, longest losing streak, longest underwater
  period in trades), each reported as P5/P25/P50/P75/P95 alongside the
  observed value from the run's actual trade order.
- **FR-002**: The system MUST compute forward-projection equity bands
  (P5/P25/P50/P75/P95 per step) by resampling the run's trades with
  replacement over a configurable horizon (default: the run's observed trade
  count), plus terminal-equity percentiles, with the cone limited to a
  configured maximum number of reported steps (default 200).
- **FR-003**: The system MUST report, for each configured ruin threshold, the
  fraction of forward paths whose equity fell below starting equity by at
  least that threshold at any point during the horizon.
- **FR-004**: Simulation parameters (iteration count, seed, ruin thresholds,
  horizon, cone-step cap) MUST live in configuration — no magic numbers —
  with defaults: 2,000 iterations, fixed seed, thresholds 5/10/20%, horizon =
  observed trade count, cone-step cap 200.
- **FR-005**: Results MUST be deterministic: the same run with the same
  configuration produces identical output on every invocation, and the output
  MUST echo the seed, iteration count, and trade count used.
- **FR-006**: Simulation MUST be computed on demand and MUST NOT be persisted;
  starting equity MUST come from the run's own frozen configuration snapshot.
- **FR-007**: The simulation MUST be launchable from the run detail page for
  every run surface: standalone backtests, walk-forward train/validation
  window children, sensitivity grid-point children, and the lockbox run.
- **FR-008**: The system MUST refuse runs with fewer than 2 trades or no
  stored trade data with a plain-English reason, and MUST flag results as
  low-confidence when the trade count is below the existing low-confidence
  threshold.
- **FR-009**: The panel MUST display the in-sample caveat for every run that
  is not provably out-of-sample — i.e., whenever the run's segment is neither
  `validation` nor `lockbox` (this includes train-segment children,
  sensitivity children persisted without a segment, and all plain backtests) —
  and MUST NOT display it for validation-segment or lockbox children.
- **FR-010**: Every Monte Carlo concept shown in the UI MUST have an
  educational tooltip covering what it is, why it matters, and how the app
  computes it (including iterations and seed).
- **FR-011**: Simulation computations MUST have no persistence or journal
  side effects (parity with significance computations, which write nothing);
  the reproducibility metadata echoed in every response (seed, iterations,
  trade count) is the audit trail. *(Amended during planning — see
  research.md R2: the original premise that significance computations are
  journaled was incorrect.)*
- **FR-012**: Only the run's owner may compute a simulation for it; requests
  for others' runs MUST behave as not-found.
- **FR-013**: The shuffle method MUST preserve the exact observed trade set
  (terminal equity invariant across reshuffled paths, self-checked), and the
  forward bands MUST satisfy P5 ≤ P25 ≤ P50 ≤ P75 ≤ P95 at every step with
  ruin probabilities monotonically non-increasing in threshold depth.

### Key Entities

- **Monte Carlo result**: the on-demand simulation output for one run —
  shuffle path-risk distributions (per-stat observed + percentiles), forward
  cone (horizon + per-step bands), ruin probabilities (per threshold),
  terminal-equity percentiles, and reproducibility metadata (iterations, seed,
  trade count, low-confidence flag). Never stored; reproducible at will.
- **Monte Carlo configuration**: the operator-tunable parameter block
  (iterations, seed, ruin thresholds, horizon) alongside the existing
  significance configuration.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From any qualifying run's detail page, the operator obtains all
  three result groups (path risk, cone, ruin) with a single action in under
  10 seconds at default settings.
- **SC-002**: Repeating a simulation on the same run yields 100% identical
  numbers, across sessions and restarts.
- **SC-003**: For every qualifying run, the operator can read where the
  observed max drawdown, losing streak, and underwater period each fall
  within their simulated distributions (observed value visibly marked).
- **SC-004**: A ruin probability is reported for 100% of configured
  thresholds, and orderings/invariants (band ordering, ruin monotonicity,
  shuffle terminal-equity constancy) hold in 100% of simulations.
- **SC-005**: 100% of Monte Carlo concepts displayed carry an educational
  tooltip; runs not provably out-of-sample always show the caveat and
  validation/lockbox runs never do.
- **SC-006**: Runs that cannot be simulated (too few trades, no trade data)
  always receive a plain-English explanation rather than a bare failure.

## Assumptions

- Per-trade net PnL data is stored for all runs created since the honest-cost
  work (Feature 010); older runs without stored trades are simply refused with
  the explanation (no backfill).
- Starting account equity is recoverable from every run's frozen configuration
  snapshot.
- An established low-confidence trade-count threshold already exists and is
  reused as-is.
- Trades are treated as exchangeable (independent draws) for resampling; this
  is the standard, defensible method for per-trade PnL analysis. Bar-level /
  autocorrelation-aware resampling is explicitly out of scope (recorded as a
  future option in the design doc).
- The run detail page is the single surface for this feature; study pages reach
  it through their existing child-run drill-down links (Feature 014).
- Out of scope (per approved design): pooled-OOS simulation across a study's
  windows; persistence of results; a new study kind; position-sizing
  optimization from simulation output; any new third-party dependency.
