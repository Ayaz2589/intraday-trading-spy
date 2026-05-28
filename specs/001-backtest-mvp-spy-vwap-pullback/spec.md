# Feature Specification: Backtest MVP — SPY VWAP Pullback

**Feature Branch**: `001-backtest-mvp-spy-vwap-pullback`

**Created**: 2026-05-28

**Status**: Draft

**Input**: User description: "Backtest MVP — SPY VWAP Pullback. First feature
of `intraday-trade-spy`. Covers Phases 1–6 of the master plan: monorepo
skeleton, backend Python project setup, config loader, domain models, VWAP
and opening-range indicators, VWAP-pullback long strategy, risk manager,
and a CLI-driven backtester. React frontend, FastAPI endpoints,
paper/live trading, and Alpaca integration are OUT OF SCOPE — they become
later features."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run a backtest and get a journal (Priority: P1)

A solo developer wants to know how a fixed rule-based intraday SPY
strategy would have behaved on real historical data. They run a single
CLI command against a CSV (or bundled fixture) of SPY 5-minute bars and
get back two artifacts: a per-trade journal of executed and rejected
trades, and a one-page summary of the run.

**Why this priority**: This is the entire reason the feature exists. With
just this story shipped, the user has a working research tool. Every
later story improves the *quality* of the answer, but P1 alone delivers
the core value (the journal + summary).

**Independent Test**: Run
`python backend/scripts/run_backtest.py --config backend/config/config.yaml`
against the bundled SPY fixture and confirm the run produces (a) at least
one signal in the journal, (b) at least one rejection reason in the
journal, and (c) a printed summary block with `total_trades`, `win_rate`,
`avg_R`, `max_drawdown`, `profit_factor`.

**Acceptance Scenarios**:

1. **Given** a bundled fixture of SPY 5-minute bars covering at least one
   regular session, **When** the user runs the backtest CLI with default
   config, **Then** stdout contains a per-trade journal table and a
   summary block, and `backend/data/backtests/<run-id>/journal.csv` is
   written with the same rows in machine-readable form.
2. **Given** a CSV path supplied in config that points at valid SPY
   5-minute data, **When** the user runs the backtest CLI, **Then** the
   system loads the CSV in place of the fixture and produces the same
   shape of output.
3. **Given** the CSV path in config points at a missing file, **When** the
   user runs the backtest CLI, **Then** the system fails fast with a
   clear error message naming the missing path — no partial run is
   written.

---

### User Story 2 - See WHY each signal was created or rejected (Priority: P2)

The user needs to be able to read a single row of the journal and
understand exactly what the system saw and decided at that moment —
without opening source code.

**Why this priority**: P1 makes the system useful; P2 makes it
trustworthy. An opaque journal would let the user confirm that *something*
ran but not whether the rules behaved correctly. P2 is the gate between
"it ran" and "I believe it."

**Independent Test**: Pick any journal row at random. Using only the row
and this spec, the user can write one sentence that explains why the
system did what it did at that moment.

**Acceptance Scenarios**:

1. **Given** any executed trade journal entry, **When** the user reads
   it, **Then** the row contains: signal timestamp, indicator snapshot
   at signal time (VWAP value, opening-range high/low, distance from
   VWAP, prior-bar close), the trade plan (planned entry, stop-loss,
   take-profit, quantity, planned risk dollars), and a human-readable
   reason string describing the entry condition.
2. **Given** any rejection journal entry, **When** the user reads it,
   **Then** the row contains the same indicator snapshot AND a
   `rejection_reason` field naming the specific risk-manager check that
   failed (e.g., `daily_loss_limit_reached`, `stop_loss_missing`,
   `position_size_exceeds_cap`).
3. **Given** an exit journal entry, **When** the user reads it, **Then**
   the row records exit timestamp, exit price, exit reason (`stop`,
   `target`, or `force_flat`), realized P&L, and realized R.

---

### User Story 3 - Configure without touching code (Priority: P3)

The user wants to experiment with strategy and risk parameters by
editing config alone — no source-code changes.

**Why this priority**: This is what unlocks the *research* part of
"research, paper-trading, and learning app." Without it, every parameter
change is a code change, which discourages exploration.

**Independent Test**: Change `risk.max_risk_per_trade_pct` from 1.0 to
0.5 in `backend/config/config.yaml`; rerun the backtest on the same
fixture; observe that position sizes are halved across the journal AND
that at least one previously-borderline trade is rejected (or, in the
opposite direction, accepted) compared to the prior run.

**Acceptance Scenarios**:

1. **Given** the default config, **When** the user edits any one of
   `risk.max_risk_per_trade_pct`, `risk.max_trades_per_day`,
   `strategy.opening_range.minutes`,
   `strategy.vwap_pullback.max_distance_from_vwap_pct`,
   `strategy.vwap_pullback.target.risk_reward`,
   `market.force_flat_time`, or `app.timezone`, **Then** rerunning the
   backtest produces a journal that differs in at least one row
   (different size, different decision, or different exit time).
2. **Given** the user sets `market.symbol` to anything other than `SPY`,
   **When** the system starts, **Then** startup fails fast with an error
   message naming constitution principle I (SPY-Only Instrument).
3. **Given** the user sets `app.mode` to `live_auto`, **When** the system
   starts, **Then** startup fails fast because `live_auto_enabled` is
   false by default and the live-readiness review has not been
   completed.

---

### User Story 4 - Trust the backtest doesn't peek at the future (Priority: P4)

The user must be able to trust that any apparent edge in the journal is
the result of the strategy, not the result of the engine accidentally
seeing future bars.

**Why this priority**: This is a correctness gate. If it fails, every
journal in the project is silently suspect. It is P4 only because the
*behavior* the user sees in stories P1–P3 doesn't require this gate to
be visible — but the *trustworthiness* of those behaviors does.

**Independent Test**: A pytest case feeds the engine an adversarial
synthetic dataset (a bar sequence that a leakage bug would exploit) and
asserts the engine's output matches the no-leakage expected output. The
test fails if any indicator or strategy sees a bar with a timestamp
greater than the bar currently under evaluation.

**Acceptance Scenarios**:

1. **Given** the adversarial fixture, **When** the backtest engine runs,
   **Then** every indicator's observable state at bar N is a pure
   function of bars 1..N — bars N+1 onward have no influence.
2. **Given** any backtest run, **When** bars are replayed, **Then** they
   are processed strictly in non-decreasing timestamp order; out-of-order
   input causes a startup-time validation error.

---

### User Story 5 - Reproduce a backtest run (Priority: P5)

The user wants to be able to say "what trades did this run produce?"
weeks later and get the same answer.

**Why this priority**: Reproducibility makes earlier runs comparable to
later runs. Without it, every config change is comparing apples to
mangoes. P5 is last only because it is unobservable until the user
actually re-runs.

**Independent Test**: Run the backtest twice against the same fixture
with the same config. Diff the two `journal.csv` files. They MUST be
byte-identical.

**Acceptance Scenarios**:

1. **Given** the same config and the same input data, **When** the
   backtest runs twice (separated by any amount of time), **Then** the
   two `journal.csv` files are byte-identical.
2. **Given** any backtest run, **When** it completes, **Then** a
   `run.yaml` manifest is written into the run output directory
   containing: the resolved config used, a data fingerprint
   (sha256 + bar count + earliest timestamp + latest timestamp), the
   code version (git SHA when available, else `unversioned`), and the
   run start/end timestamps.
3. **Given** the user supplies a previously-written `run.yaml` to a
   replay command, **When** the system runs, **Then** it loads the same
   resolved config and the same data, and the new journal matches the
   original byte-for-byte.

---

### Edge Cases

- **Bars outside the regular session.** The CSV contains pre-market or
  after-hours bars. Those bars are filtered out before indicator
  computation; a count of filtered bars is logged for the run.
- **Missing intraday bars.** One or more expected 5-minute slots are
  absent inside a session. The engine logs the gap (session date,
  expected count vs actual count, list of missing timestamps) and
  continues. The strategy MUST NOT compute indicators across a gap as
  if no gap existed (e.g., it does not treat the bar before the gap and
  the bar after the gap as adjacent for confirmation purposes).
- **Bars in a non-ET timezone.** The loader normalizes timestamps to
  America/New_York. Bars whose timezone cannot be determined cause a
  load-time error citing the offending row.
- **Daily loss limit hit mid-session.** No new signals are accepted for
  the rest of that session; the daily lockout is journaled with a single
  `lockout` row. An open position at the moment of lockout continues to
  honor its bracket (stop/target) but no new position is opened.
- **Max trades per day hit.** Subsequent candidate signals are rejected
  with reason `max_trades_per_day_reached` and journaled.
- **Force-flat time arrives with an open position.** The position is
  closed at the next bar's open with reason `force_flat`; the journal
  exit row records the assumption.
- **Stop and take-profit hit on the same bar.** The engine assumes the
  stop fills first (conservative for a long position). The journal exit
  row records the assumption explicitly so the user is not misled into
  thinking the engine could resolve intra-bar ordering.
- **`market.symbol` not SPY at startup.** Startup fails with a clear
  error citing constitution principle I.
- **Two signals on the same bar with an open position.** The second
  signal is rejected with reason `position_already_open`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST load the merged config from
  `backend/config/config.yaml` and validate it against a Pydantic schema;
  invalid configs fail fast with a clear error naming the offending
  field.
- **FR-002**: System MUST reject any value of `market.symbol` other than
  `SPY` at startup, citing constitution principle I.
- **FR-003**: System MUST load SPY 5-minute bars from a CSV path
  specified in config OR from a bundled fixture; bars MUST be normalized
  to America/New_York and filtered to the regular session
  (09:30–16:00 ET) before indicator computation.
- **FR-004**: System MUST compute VWAP per session, resetting at each
  session open, and expose the running VWAP value on every bar.
- **FR-005**: System MUST compute opening-range high and low using
  `strategy.opening_range.minutes` (default 15) from session open. The
  opening-range values MUST be considered "complete" only after the OR
  window has fully passed (i.e., the bar whose timestamp is
  session_open + OR_minutes is the first bar where signals may fire).
- **FR-006**: System MUST implement the VWAP Pullback Long strategy: a
  candidate `Signal` is emitted only when ALL of the following hold —
  opening range is complete, current bar's close is above current VWAP,
  the prior pullback came within
  `strategy.vwap_pullback.max_distance_from_vwap_pct` of VWAP, the
  current bar closes above the prior bar's high, and the current bar
  closes above VWAP. The strategy MUST emit a `Signal` only — it MUST
  NOT size positions or place orders.
- **FR-007**: Risk manager MUST validate each candidate `Signal` and
  return a `RiskDecision(approved: bool, reason: str, quantity: int,
  planned_risk_dollars: float)`. The required pre-trade checks are:
  stop-loss present, take-profit present, symbol is SPY, direction is
  long, entry > 0, stop < entry, target > entry, computed position size
  > 0, position size × entry ≤ max position value cap, current daily
  loss not exceeded, count of trades today not at the max-trades cap,
  current consecutive losses not at the cap, no active cooldown, no
  existing open position, current time before `market.no_new_trades_after`,
  most recent bar not stale.
- **FR-008**: Position size MUST be derived as
  `floor(account_size × max_risk_per_trade_pct ÷ (entry − stop))` in
  whole shares. If the resulting size is zero, the signal MUST be
  rejected with reason `position_size_zero`.
- **FR-009**: The paper broker MUST simulate fills bar-by-bar: an
  approved entry fills at the next bar's open; the stop fills at the
  bar's low when low ≤ stop; the take-profit fills at the bar's high
  when high ≥ target; if both are hit on the same bar, the stop is
  assumed to fill first (for a long position).
- **FR-010**: Bracket exits MUST be mutually exclusive — when stop or
  target fills, the other order is cancelled in the same bar.
- **FR-011**: At or after `market.force_flat_time`, any open position
  MUST be closed at the next bar's open with journal reason
  `force_flat`. No new entries MUST be opened after
  `market.no_new_trades_after`.
- **FR-012**: The journal MUST record every: emitted candidate signal,
  risk decision (approved or rejected), executed entry, executed exit
  (stop / target / force_flat), and daily lockout activation. Every
  record MUST include the indicator snapshot at decision time.
- **FR-013**: The backtest engine MUST replay bars strictly in
  non-decreasing timestamp order. Indicators, the strategy, and the
  risk manager MUST only see bars whose timestamp is ≤ the current bar.
  An adversarial test fixture MUST exist that would produce different
  results if future-bar leakage occurred, and the test MUST fail if
  leakage is detected.
- **FR-014**: Each backtest run MUST emit a `run.yaml` manifest into the
  run output directory capturing: the resolved config, the data
  fingerprint (sha256 + bar count + earliest timestamp + latest
  timestamp), the code version (git SHA when available, else
  `unversioned`), and the run start/end timestamps.
- **FR-015**: Re-running with identical config and identical data MUST
  produce byte-identical `journal.csv` output. The summary report,
  serialized to a file, MUST also be byte-identical between runs.
- **FR-016**: The summary report MUST include: total trades, win rate,
  average win, average loss, average R, total R, profit factor, max
  drawdown, best trade R, worst trade R, longest consecutive loss
  streak, count of rejected signals, and a per-reason breakdown of
  rejection counts.
- **FR-017**: The default shipped config MUST set `app.mode: backtest`
  and `broker.live_auto_enabled: false`. Any code path that would
  submit a live order MUST be unreachable with default config. A test
  MUST assert this is the case.

### Key Entities

- **Bar** — one 5-minute SPY candle. Attributes: timestamp (ET), open,
  high, low, close, volume, session date.
- **IndicatorSnapshot** — derived values for the current bar. Attributes:
  VWAP, opening-range high, opening-range low, opening-range complete
  flag, distance-from-VWAP percent, prior bar close.
- **Signal** — a candidate trade emitted by the strategy. Attributes:
  symbol, setup name, direction, timestamp, planned entry, stop-loss,
  take-profit, human-readable reason.
- **RiskDecision** — outcome of risk validation. Attributes: approved
  flag, reason string, quantity, planned risk dollars.
- **TradePlan** — a `Signal` that has been approved and sized.
  Attributes: signal reference, quantity, planned risk dollars.
- **Position** — an open or closed trade. Attributes: entry timestamp,
  entry price, exit timestamp, exit price, exit reason
  (`stop`|`target`|`force_flat`), quantity, realized P&L, realized R.
- **JournalEntry** — a single row of the journal. Attributes: row id,
  status (`emitted`|`approved`|`rejected`|`executed`|`exited`|
  `force_flat`|`lockout`), timestamps, indicator snapshot, trade plan
  fields, reason string.
- **BacktestRun** — metadata for one run. Attributes: run id, config
  snapshot, data fingerprint, code version, summary metrics, run
  start/end timestamps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with the repo freshly cloned can run a backtest
  end-to-end in under 5 minutes following the README quickstart,
  including installing dependencies.
- **SC-002**: 100% of strategy and risk-manager code paths are covered
  by automated tests, with at least one explicit rejection test per
  risk check listed in FR-007.
- **SC-003**: The byte-identical reproducibility check passes on three
  consecutive runs against the bundled fixture without flake.
- **SC-004**: A user can change any single config value listed in
  acceptance scenario US3-1 and observe a deterministic, explainable
  change in the journal output across two consecutive runs.
- **SC-005**: The future-bar leakage test passes on the adversarial
  fixture and would fail if any indicator or strategy were modified to
  peek at a bar with a timestamp greater than the current bar.
- **SC-006**: For any executed trade in the journal, a non-developer can
  answer "why did the system enter this trade?" in one sentence using
  only the journal row and this specification — no source-code reading
  required.

## Assumptions

- The user has Python ≥3.11 installed locally and can run pytest.
- A small bundled fixture of SPY 5-minute bars (covering 1–3 sessions)
  is acceptable as the v1 data source; building a downloader for
  historical SPY data is a later feature.
- No real broker, no real account, no real money is involved. The
  `account_size` in config is a number used solely for position-size
  arithmetic.
- Fees and slippage are modeled as simple per-share constants in config.
  Realistic per-leg slippage modeling is out of scope for v1.
- Out of scope for THIS feature (each will become its own later Spec Kit
  feature): the React frontend, FastAPI endpoints, live paper trading,
  Alpaca integration, manual-approval mode, and the opening-range
  breakout strategy.
- Constitution v1.0.0 governs this feature. Any tension between the
  spec and a NON-NEGOTIABLE principle MUST be resolved in favor of the
  constitution (or, with explicit user approval, by amending the
  constitution before this spec advances).
