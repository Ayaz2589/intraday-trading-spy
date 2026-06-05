# Feature Specification: Cross-Run Insights, Pooled Study Gate & Advisory Claude Narrative

**Feature Branch**: `016-insights`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Cross-run insights, pooled study-level gate, and advisory Claude narrative — productize the decision-grade pooled-OOS analysis the wf-rr3 lockbox gate had to be run ad-hoc for, and build the cross-run insights layer over the child-run archive. Approved brainstorm design: docs/superpowers/specs/2026-06-05-insights-aggregation-design.md (source of truth for decided architecture and scope)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the pooled gate on a walk-forward study (Priority: P1)

As the operator, I open any walk-forward study and run its **pooled gate**: the
system pools all out-of-sample trades across the study's validation windows and
gives me the single decision-grade verdict — does the pooled expectancy
confidence interval exclude zero? — alongside pooled path-risk (drawdown, ruin)
and a windows-positive summary. The verdict is stored on the study permanently,
phrased in the same language that gates the lockbox.

**Why this priority**: This is the number that decides whether the lockbox can
ever be spent. On 2026-06-05 it had to be computed by hand outside the product
(verdict for wf-rr3: NOT PASSED — expectancy $0.91/trade, 95% CI
[−0.53, +2.56], 2,607 pooled trades). The product must own its own gate.

**Independent Test**: Open the wf-rr3 study, run the pooled gate, and confirm
it reproduces the 2026-06-05 ad-hoc verdict (per SC-001 as amended: verdict,
point, trades, sign test exact; CI within bootstrap noise). Re-run → identical
numbers. Delivers standalone value with no other component built.

**Acceptance Scenarios**:

1. **Given** a walk-forward study with persisted validation-window children,
   **When** the operator runs the gate (fast mode), **Then** within a few
   seconds the panel shows: PASSED/NOT PASSED with the rule spelled out
   (pooled expectancy 95% CI vs zero), pooled trade count and total OOS PnL,
   expectancy CIs in $ and R, windows-positive count with a sign-test p-value,
   and pooled drawdown/ruin risk — and the verdict is persisted on the study.
2. **Given** a study with a computed gate, **When** the operator re-runs it,
   **Then** every number is byte-identical (seeded determinism) and the stored
   verdict is refreshed with a new computed-at timestamp.
3. **Given** the operator chooses the full gate, **When** the background
   computation finishes, **Then** each window row shows its individual
   significance p-value and the banner adds the combined (Fisher) p-value.
4. **Given** a sensitivity study, a pre-archive study with no persisted
   children, or a study pooling fewer than 2 trades, **When** a gate is
   requested, **Then** the system refuses with a plain-English reason (and,
   for the no-children case, points at the existing "re-run study" path).
5. **Given** a full gate is already running for a study, **When** another full
   gate is requested, **Then** the request is rejected as a conflict.

---

### User Story 2 - See the edge across time and configs (Priority: P2)

As the operator, I open a new **Insights** page and see the edge time-series:
one point per out-of-sample window across the entire archive, per config, so I
can see at a glance whether the edge is stable or regime-bound — and click any
point to drill into that window's run. Beside it, a per-config distribution
compares configs window-by-window (count, share positive, quartiles).

**Why this priority**: The "which regimes bleed?" question (2021H1 / 2022H1)
is the next research step after the failed gate, and it's exactly this chart.
Builds directly on the archive; no dependency on US1.

**Independent Test**: Open the Insights page with an archive containing two
configs' studies; see two series with one point per OOS window, click a point
and land on that child run; see the distribution comparison. Empty archive →
clear empty states.

**Acceptance Scenarios**:

1. **Given** an archive with OOS child runs for two configs, **When** the
   Insights page loads, **Then** the time-series shows one point per window
   per config (computed from stored per-trade data, out-of-sample windows
   only) and each point links to its run.
2. **Given** the distribution view, **When** it renders, **Then** each config
   shows window count, share of positive windows, quartiles of window
   outcomes, and total OOS trades, side by side.
3. **Given** an empty archive, **When** the page loads, **Then** both views
   show an instructive empty state instead of blank charts.

---

### User Story 3 - Get Claude's read (Priority: P3)

As the operator, on both the Insights page and a study's gate panel I can click
"Get Claude's read": the system sends the already-computed statistics to an
LLM and shows an advisory narrative — a summary, findings where **every claim
cites the specific metric backing it** (rendered from the app's own data beside
the claim), risks, and suggested experiments. The analysis is pinned to a
snapshot of the data it analyzed and stored; re-opening the page shows the
stored analysis free of charge, and regeneration is only offered when the
underlying data changed.

**Why this priority**: Cross-cutting narrative synthesis is the highest-leverage
add once the numbers exist — but it is strictly advisory and the app must be
fully functional without it.

**Independent Test**: With the analysis provider configured, generate a read on
each surface; verify findings cite metrics present in the data, the footer
shows snapshot/model/date, and a second visit returns the stored analysis
without a new provider call.

**Acceptance Scenarios**:

1. **Given** gathered insights or a computed gate, **When** the operator
   requests Claude's read, **Then** a structured analysis renders (summary,
   cited findings, risks, suggested experiments) with a footer identifying the
   snapshot, model, and date.
2. **Given** a stored analysis whose underlying data has not changed, **When**
   the surface is revisited or the read is requested again, **Then** the
   stored analysis is returned with no new provider call, and Regenerate is
   disabled (unless forced).
3. **Given** the provider responds that account credit is exhausted, **When**
   the call fails, **Then** the feature pauses itself, shows a banner telling
   the operator to top up (with a one-click Re-enable), and stored analyses
   remain readable.
4. **Given** the feature is unconfigured (no API key), **When** any surface
   renders, **Then** a quiet setup hint appears instead of the button and
   everything else on the page works normally.
5. **Given** a transient provider failure (rate limit/overload), **When** the
   call fails, **Then** the operator sees a "try again shortly" message and
   nothing is persisted or paused.

---

### User Story 4 - Trust boundaries and education (Priority: P4)

As the operator (and learner), the new concepts explain themselves: the gate
banner's tooltip ties the verdict to the lockbox discipline; sign test, Fisher
combination, edge time-series, window distribution, snapshot pinning, and the
advisory nature of the LLM each get a plain-English tooltip. The UI makes the
determinism split explicit: gate numbers are seeded and reproducible; Claude's
read is advisory and non-deterministic.

**Why this priority**: Constitution principle VI; also the guardrail that keeps
the LLM correctly framed as a perspective, never an authority.

**Independent Test**: Sweep every new concept label for a tooltip; verify the
advisory tooltip states that Claude never trades or tunes and that claims must
be verified against cited metrics.

**Acceptance Scenarios**:

1. **Given** any new concept label (gate verdict, sign test, Fisher p, edge
   time-series, distribution, Claude advisory, snapshot pin), **When** the
   operator opens its tooltip, **Then** it explains what it is, why it
   matters, and how the app uses it.
2. **Given** the Claude card, **When** it renders findings, **Then** each
   claim appears beside the cited metric's value rendered from the app's own
   data — a claim citing a metric absent from the data is visibly unverifiable.

---

### Edge Cases

- Zero-trade windows are excluded from pooling but counted and disclosed
  ("11 of 12 windows contributed trades").
- Pre-archive (no-children) studies → refusal + the existing re-run affordance.
- Sensitivity studies → refusal (the gate is a walk-forward concept).
- Gate results cannot go stale: a study's children never change (a re-run is a
  new study); the stored verdict carries its computed-at timestamp.
- Empty archive → instructive empty states; Claude buttons disabled ("nothing
  to analyze yet").
- Oversized analysis payloads truncate the time-series to a configured number
  of most-recent windows, disclosed in the analysis footer.
- Provider failure taxonomy: credit exhausted → auto-pause + top-up banner +
  one-click re-enable (optimistic — an empty balance just re-trips the pause);
  bad/missing key → setup hint, not auto-paused; rate limit/overload →
  transient message; unparseable analysis → "try again" error; refusal
  surfaced plainly.
- The pause switch doubles as a manual toggle; analyses stay readable paused.
- Concurrent full-gate requests → conflict rejection.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: For any owned walk-forward study with persisted validation
  children, the system MUST compute a pooled gate: pooled out-of-sample
  expectancy confidence intervals ($ and R), pooled path-risk (drawdown
  distribution, ruin probabilities), windows-positive sign test, and the
  verdict `passed = pooled expectancy-$ CI lower bound > 0`.
- **FR-002**: The fast gate MUST complete synchronously (seconds); the full
  gate (per-window significance + combined p-value) MUST run as a background
  task with progress, guarded against concurrent runs on the same study.
- **FR-003**: Completed gate results MUST be persisted on the study itself and
  re-displayed on every visit; recomputation MUST be byte-identical for
  identical inputs (seeded).
- **FR-004**: The system MUST refuse gates for sensitivity studies, studies
  without persisted children (pointing at the re-run path), and pools of fewer
  than 2 trades — each with a plain-English reason.
- **FR-005**: The system MUST provide an edge time-series across the archive:
  one point per out-of-sample child run with window range, config, expectancy
  ($/R), risk-adjusted return, trade count, and net PnL — computed from stored
  per-trade data (not cached summaries) and restricted to provably
  out-of-sample (validation-segment) runs, scoped to the owner.
- **FR-006**: The system MUST provide a per-config distribution: window count,
  share of positive windows, quartiles of window outcomes, total OOS trades.
- **FR-007**: Every insights response MUST carry a snapshot fingerprint
  derived from the contributing runs, used to pin analyses and signal staleness.
- **FR-008**: The Insights page MUST present the time-series (points
  click-through to runs) and distribution side by side with an advisory
  analysis panel (chosen split layout), plus a new navigation entry.
- **FR-009**: The system MUST generate, on explicit operator request only, an
  advisory narrative over the gathered statistics with: summary, findings each
  citing a specific metric from the payload, risks, and suggested experiments
  — rendered so cited metrics display the app's own values beside each claim.
- **FR-010**: Analyses MUST be stored with their snapshot/payload identity,
  model, and timestamp; an unchanged snapshot MUST return the stored analysis
  without a new provider call; regeneration MUST require a changed snapshot or
  an explicit force.
- **FR-011**: On a provider credit-exhaustion error, the system MUST
  automatically pause the analysis feature, persist the paused state with its
  reason, surface a top-up banner with one-click re-enable, and keep stored
  analyses readable. Bad/missing credentials MUST surface a setup hint without
  auto-pausing; transient provider errors MUST surface a retry message without
  persisting anything.
- **FR-012**: The pause switch MUST also be operable manually, and the entire
  application MUST function fully with the analysis feature paused or
  unconfigured (graceful degradation).
- **FR-013**: The analysis capability MUST be strictly advisory: triggered
  manually only, no scheduled/background invocation, no write path into
  strategies, configs, risk parameters, or order flow.
- **FR-014**: All new tunables (gate alpha/seeds, analysis model, payload
  truncation limit) MUST live in configuration — no magic numbers.
- **FR-015**: Every new concept MUST ship with an educational tooltip; the
  gate banner MUST link the verdict to the lockbox discipline; the UI MUST
  distinguish seeded/reproducible gate numbers from advisory/non-deterministic
  analysis text.
- **FR-016**: All new data access MUST be owner-scoped; analyses and settings
  MUST be protected per user like existing per-user tables.

### Key Entities

- **Pooled gate result**: per-study verdict + statistics (CIs, sign test,
  pooled path-risk, optional per-window p-values and combined p), stored
  additively on the study record with computed-at; reproducible.
- **Insights snapshot**: the gathered cross-run aggregates (time-series +
  distribution) identified by a fingerprint; never persisted, recomputed on
  demand.
- **Stored analysis**: an advisory narrative (summary, cited findings, risks,
  experiments) pinned to a payload identity, with model and timestamp;
  readable history of what was generated from which data.
- **Analysis settings**: per-user enabled/paused state with a reason
  (billing/manual) and updated-at.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The pooled gate on the wf-rr3 study reproduces the 2026-06-05
  ad-hoc verdict: NOT PASSED, pooled expectancy $0.91/trade, 2,607 pooled
  trades, 9/12 windows positive (sign p 0.073) — all exact — with the 95% CI
  agreeing within bootstrap sampling error of the ad-hoc [−0.53, +2.56]
  (product, deterministic window ordering, seed 20260605: [−0.71, +2.60]).
  *(Amended at implement time: the ad-hoc run's SQL had no deterministic
  input order and bootstrap resampling is order-sensitive, so its exact CI
  bounds were never pinnable; the product gate is byte-deterministic with
  proper window ordering.)* The ad-hoc analysis never needs to be run by
  hand again.
- **SC-002**: Fast gate verdict visible within 10 seconds of the click; full
  gate completes in the background and enriches the same panel without the
  operator waiting on it.
- **SC-003**: Gate recomputation yields 100% identical numbers across
  sessions and restarts.
- **SC-004**: From the Insights page, the operator can identify the
  worst-performing window of any config and land on its run detail in ≤ 2
  clicks.
- **SC-005**: 100% of analysis findings name a metric present in the analyzed
  payload, with the app-computed value rendered beside the claim.
- **SC-006**: An unchanged snapshot never incurs a second provider charge;
  with $5 of provider credit the operator gets at least 20 distinct analyses.
- **SC-007**: With the analysis feature paused, unconfigured, or failing,
  every numeric view (gate, charts, distributions) remains fully functional.
- **SC-008**: 100% of new concepts carry educational tooltips.

## Assumptions

- The child-run archive (study-tagged, segment-labeled runs with stored
  per-trade data) exists per Feature 014; pre-014 studies are handled by
  refusal + the existing re-run path, not backfill.
- Walk-forward children within one study share an identical frozen config
  (same starting equity), so pooled path-risk can use it (015's rule).
- Insights metrics are computed from stored per-trade data deliberately —
  the known summary-vs-trades expectancy discrepancy is out of scope and
  sidestepped by construction.
- A single operator account; provider cost control is idempotency + manual
  triggers + the pause switch (no quota system needed).
- One new third-party dependency (the LLM provider's official SDK) and one
  database migration (analyses + settings) are accepted; everything else
  reuses existing engines and access paths.
- Out of scope (per approved design): soft-delete retention and delete-all
  re-enable; rejection mining; sensitivity-across-archive; automated parameter
  optimization from analysis output; any scheduled/background analysis.
