<!--
SYNC IMPACT REPORT
==================
Version change: TEMPLATE (unfilled placeholders) → 1.0.0
Rationale: Initial ratification of the project constitution. Template
placeholders replaced with substantive principles derived from the
master build plan at ~/Desktop/intraday-trade-spy-master-plan.md.

Principles added (no renames; prior state was the placeholder template):
  - I.   SPY-Only Instrument (NON-NEGOTIABLE)
  - II.  Long-Only, Rule-Based v1 (NON-NEGOTIABLE)
  - III. Risk Manager Has Absolute Veto (NON-NEGOTIABLE)
  - IV.  Test-First for Strategy & Risk (NON-NEGOTIABLE)
  - V.   Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE)
  - VI.  Educational UI: Every Concept Is Explained
  - VII. Journal Everything

Sections added (replacing placeholder sections):
  - Engineering Standards
  - Development Workflow
  - Governance

Templates / dependent artifacts updated:
  ✅ .specify/templates/plan-template.md  — Constitution Check now lists
     the seven principles as concrete gates; structure decision references
     the master plan's monorepo layout.
  ✅ .specify/templates/tasks-template.md — Added a TDD-mandatory note for
     strategy/risk/broker/backtest task categories overriding the
     "tests optional" default.
  ✅ CLAUDE.md — Runtime guidance now references the constitution and
     restates the hard constraints for in-editor assistance.
  ⚠ .specify/templates/spec-template.md — No structural change required;
     principles are enforced at the plan stage, not the spec stage.
     Reviewed.

Follow-up TODOs: None.

Ratified: 2026-05-28
-->

# intraday-trade-spy Constitution

## Core Principles

### I. SPY-Only Instrument (NON-NEGOTIABLE)

Symbol is SPY only. All v1 strategies, indicators, signals, orders, and
risk checks MUST reject any non-SPY symbol at the type/validation
boundary. Multi-symbol trading, QQQ, options, futures, and crypto are
explicitly out of scope for v1.

**Why:** Focused study of a single, liquid instrument keeps the strategy
explainable and the test surface small. SPY's liquidity and tight spreads
make backtests and paper fills realistic. Any feature touching another
instrument is a constitution violation requiring an explicit amendment
(MAJOR version bump).

**Enforcement:** Config sets `market.symbol: SPY`. Backend MUST reject any
signal or order for another symbol with an explicit error. Tests cover
the rejection path.

### II. Long-Only, Rule-Based v1 (NON-NEGOTIABLE)

v1 supports long trades only — short selling is rejected. v1 strategies
are rule-based — no HMM, no ML prediction, no sentiment analysis.
Strategies create candidate signals only; they MUST NOT size positions or
place orders.

**Why:** Long-only avoids borrow rules and reduces edge cases for a
learning system. Rule-based logic is explainable in the UI's `?` tooltips.
Separation between strategy and execution is the foundation of the safety
architecture.

**Enforcement:** `Direction` enum has only `LONG` in v1. Strategy modules
MUST NOT import broker or risk-sizing code. Module boundaries are
verified by PR review and an architecture test.

### III. Risk Manager Has Absolute Veto (NON-NEGOTIABLE)

The architectural contract is fixed:

```
Strategy suggests → Risk manager approves/rejects → Broker executes only approved trades → Journal logs everything.
```

Every trade MUST have a stop-loss AND a take-profit. **No stop-loss = no
trade.** The risk manager enforces, at minimum: max risk per trade, max
daily loss, max trades per day, max consecutive losses, cooldown after
losses, max position value, no overnight positions, and a no-new-trades
cutoff before market close.

**Why:** A single veto layer is the only reliable way to prevent strategy
bugs from becoming financial losses. Centralizing risk also centralizes
the audit trail.

**Enforcement:** All limits, thresholds, timeframes, and cutoff times live
in `backend/config/config.yaml`. Hardcoded limits in source are forbidden.
Broker MUST refuse to place an order whose `RiskDecision` is not
`approved`. Tests cover every rejection reason.

### IV. Test-First for Strategy & Risk (NON-NEGOTIABLE)

TDD is mandatory for: indicator math, strategy logic, risk-manager checks,
broker simulation, and the backtest engine. Red → Green → Refactor
strictly enforced for these modules.

Required test gates include (non-exhaustive):

- VWAP resets daily and computes correctly across known fixtures
- Opening range high/low are correct for the first N minutes
- No signal is emitted before the opening range completes
- Risk manager rejects: missing stop, missing target, wrong symbol, wrong
  direction, daily-loss-hit, max-trades-hit, duplicate signal,
  position-size cap, stale data
- The backtest engine does NOT peek at future bars
- The paper broker's bracket exits are mutually exclusive (one fill
  cancels the other)

**Why:** These modules are where bugs become losses. Tests are the only
durable specification of what "safe" means.

**Enforcement:** PRs touching `strategy/`, `risk/`, `broker/`, or
`backtest/` MUST add or modify tests covering the changed behavior. CI
fails without coverage of the changed paths.

### V. Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE)

Build order is fixed and MUST be followed:

```
backtest → internal paper broker → Alpaca paper → manual-approval mode → (much later, maybe) tiny live
```

`live_auto_enabled: false` is the default in shipped config. Live
auto-trading is blocked at the config layer and CANNOT be enabled without
a documented live-readiness review passing the checklist defined in
`docs/PAPER_TRADING.md`.

**Why:** Every step in the build order reduces the surface where a bug
can cost money. Skipping steps is how engineering projects become
financial incidents.

**Enforcement:** The app boots with `mode: backtest` or `mode: paper`.
Code paths that submit live orders MUST be guarded by a
`live_auto_enabled` flag AND an explicit manual readiness flag, both of
which default to false. A test asserts that the live-auto path is
unreachable with default config.

### VI. Educational UI: Every Concept Is Explained

Every important UI concept (VWAP, opening range, stop-loss, take-profit,
R multiple, daily drawdown, rejected signal, circuit breaker, paper
trading, backtest, slippage, spread) MUST ship with a `?` `HelpTooltip`
that answers, in plain English:

1. What is this?
2. Why does it matter?
3. How is the app using it?

Frontend MUST surface WHY a signal was created or rejected, not just the
outcome. Rejected signals are first-class citizens of the journal and
UI — they are the most important learning artifact this app produces.

**Why:** This app is an educational engineering project, not a hype
dashboard. Users learn intraday trading by watching the system explain
itself.

**Enforcement:** PR review for any frontend page rejects new concept
labels without a paired `HelpTooltip`. The reusable `HelpTooltip`
component is required and centrally defined.

### VII. Journal Everything

Every executed trade, rejected signal, skipped setup, risk decision, and
P&L event MUST be logged with full context: timestamp, prices, indicator
values at signal time, reason string, and resulting position/P&L impact.
Logs MUST be human-readable and exportable (CSV minimum).

**Why:** Without a complete trail, the system cannot teach the user what
happened or be debugged after a session. Rejected signals are as
important as executed ones.

**Enforcement:** `journal/logger.py` is the single sink for all
trade-lifecycle events. Bypassing it is forbidden. Tests assert that
rejections, executions, and force-flat exits all produce journal entries.

## Engineering Standards

- **Timezone:** All market time is `America/New_York`. The `clock.py`
  module is the single source of truth for "is market open?", "is opening
  range complete?", "is no-new-trades cutoff reached?", and "is
  force-flat time?".
- **Data integrity:** Regular session only (09:30–16:00 ET). Default
  timeframe is 5-minute bars. The backtest engine MUST replay bars
  strictly in chronological order and MUST NOT expose future bars to any
  indicator, strategy, or risk check.
- **Configuration:** All magic numbers (limits, thresholds, timeframes,
  session times, risk parameters) live in `backend/config/config.yaml`.
  Hardcoded literals for these values in source code are forbidden.
- **File responsibility:** One clear responsibility per file. Prefer
  small, focused modules over large ones. Files that change together
  should live together.
- **Backend stack:** Python ≥3.11, FastAPI, Pydantic v2, pandas or polars
  for backtests, pytest for tests.
- **Frontend stack:** React + TypeScript + Vite + Tailwind CSS. Charting
  via Recharts or lightweight-charts.
- **No overnight positions:** Enforced by `market.force_flat_time`
  (default 15:55 ET). Any position open at force-flat time MUST be
  closed.

## Development Workflow

Every feature MUST flow through the Spec Kit phases in order:

```
speckit-specify → speckit-clarify (if ambiguities exist) → speckit-plan → speckit-tasks → speckit-analyze → speckit-implement
```

**Plan gate:** Every `plan.md` MUST include a `Constitution Check`
section that explicitly cites which of the seven principles the feature
touches and demonstrates non-violation. Any tension MUST be listed in the
`Complexity Tracking` table with a justification AND a
simpler-alternative-rejected reason. Plans that violate a
NON-NEGOTIABLE principle without a constitution amendment cannot pass
the gate.

**PR gate:** PRs touching `strategy/`, `risk/`, `broker/`, `backtest/`,
or `journal/` MUST include tests covering the changed behavior. PRs
adding frontend concept labels MUST include the matching `HelpTooltip`.

**Review gate:** `speckit-analyze` MUST be run before `speckit-implement`
for any feature that materially touches the strategy / risk / broker
contract.

## Governance

This constitution supersedes ad-hoc engineering choices. Any deviation
from a NON-NEGOTIABLE principle requires:

1. A documented amendment to this file describing the change, the
   motivation, and the affected scope.
2. A version bump per the semver policy below.
3. Explicit user approval before the amendment merges.

**Versioning policy:**

- **MAJOR** — Removal of a principle, redefinition that breaks prior
  gates, or scope expansion to a new instrument / asset class.
- **MINOR** — Addition of a new principle or material expansion of an
  existing one (e.g., new risk check, new mandatory UI rule).
- **PATCH** — Clarifications, typo fixes, wording refinements that do
  not change enforcement semantics.

**Compliance review:** During every `speckit-plan` step, the Constitution
Check is the gate. During every PR review, the seven principles are the
checklist. `CLAUDE.md` is the runtime guidance file that mirrors these
constraints for in-editor assistance.

**Version**: 1.0.0 | **Ratified**: 2026-05-28 | **Last Amended**: 2026-05-28
