# Feature Specification: Live Paper Trading + /trade Page

**Feature Branch**: `021-paper-trading`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Paper trading via the Alpaca API (highest-tier subscription: full market data feeds, high-uptime websockets) plus a new /trade page. The page tracks paper trades end-to-end — positions, buys, sells, open orders — with a live SPY price chart supporting 1-minute, 5-minute, 1-day, and 30-day views that auto-updates with new data per view, with VWAP overlaid. Strategy performance logging and charting show how the strategy is doing live. Two controls: a button to START automated paper trading (the strategy → risk manager → broker pipeline runs live against Alpaca paper) and a button to STOP automation."

## Why this feature exists

The lockbox is spent (Experiment 011): there is no unbiased historical data
left to judge any strategy against. **Forward paper trading is now the only
honest out-of-sample evidence this project can produce.** This feature turns
the existing backtest pipeline (strategy → risk manager → broker → journal)
into a live paper-trading loop against a real brokerage paper account, and
gives the operator one page to watch it, control it, and learn from it.
Every day it runs, the project accumulates the new lockbox.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start and stop automated paper trading (Priority: P1)

As the operator, I press **Start automation** and the system runs the
existing strategy pipeline live during market hours: it watches SPY bars in
real time, evaluates the strategy on each completed bar, sends every signal
through the risk manager, places approved orders (always with a stop-loss
and take-profit) on the paper account, and journals everything — exactly as
a backtest would, but forward in time with real market data. I press
**Stop automation** and the system stops entering new trades.

**Why this priority**: This is the entire point — unattended forward
evidence generation. Without it the page is just another chart.

**Independent Test**: During (or simulating) a market session, press Start;
verify the first qualifying setup produces a journaled signal, a risk
decision, and (if approved) a paper order with stop and target attached.
Press Stop; verify no new entries occur afterward.

**Acceptance Scenarios**:

1. **Given** automation is off and the market is open, **When** the operator
   presses Start, **Then** an automation session begins, is journaled with
   the exact strategy configuration it will trade, and the status indicator
   shows "running".
2. **Given** automation is running and a bar completes that satisfies every
   strategy entry rule, **When** the risk manager approves the signal,
   **Then** a paper order is placed with both a stop-loss and a take-profit,
   and the execution is journaled with full context.
3. **Given** automation is running and a signal is rejected by the risk
   manager (any veto), **Then** no order is placed and the rejection is
   journaled with its reason — identical taxonomy to backtests.
4. **Given** automation is running with an open position, **When** the
   operator presses Stop, **Then** no new entries occur; the existing
   position continues to be managed to its stop/target/force-flat exit, and
   the stop event is journaled.
5. **Given** automation is running, **When** the force-flat time (15:55 ET)
   arrives with an open position, **Then** the position is closed and
   journaled as force-flat — the account is always flat overnight.
6. **Given** automation is running, **When** the operator closes their
   browser, **Then** automation keeps running on the server and the page
   shows its true state on next visit.

---

### User Story 2 - The /trade page: live chart + account state (Priority: P2)

As the operator, I open **/trade** and see the live state of my paper
account — current position (if any), open orders, today's fills, realized
and unrealized P&L — alongside a live SPY price chart. The chart offers
four views — 1-minute, 5-minute, 1-day, and 30-day — each advancing
automatically as new data arrives, with VWAP overlaid on the intraday
views. Entry, exit, stop, and target levels of the current position are
drawn on the chart.

**Why this priority**: The operator must be able to *watch* the machine to
trust it. The page is the cockpit; automation (US1) is the engine.

**Independent Test**: Open /trade during a market session with no
automation: chart ticks forward per view, account panel shows the paper
account truthfully (flat, no orders). With a position open, its levels
appear on the chart.

**Acceptance Scenarios**:

1. **Given** the market is open, **When** a new bar completes, **Then** the
   active chart view extends with the new bar without a manual refresh.
2. **Given** the 1-minute or 5-minute view is selected, **Then** the
   session-anchored VWAP line is overlaid; on the 30-day view (daily bars)
   no intraday VWAP is drawn (it is not meaningful there) and the view says
   why.
3. **Given** an open paper position, **Then** the chart marks the entry
   price, stop-loss, and take-profit levels, and the account panel shows
   quantity, average price, and live unrealized P&L.
4. **Given** the market is closed, **Then** the page shows the most recent
   session's data, clearly labeled as closed, and the Start control explains
   when trading can next begin.
5. **Given** any concept on the page (VWAP, force-flat, automation session,
   unrealized P&L, paper account…), **Then** a HelpTooltip explains what it
   is, why it matters, and how the app uses it.

---

### User Story 3 - Live strategy performance tracking (Priority: P3)

As the operator, I can see how the strategy is performing *forward*: a
running equity/P&L chart of the paper account, per-trade history with R
multiples, win rate, expectancy, and the full live journal (executions,
rejections, skips, force-flats) — the same evidence vocabulary as the
backtests, so forward results are directly comparable to the archive.

**Why this priority**: The accumulated forward record is the product. It
must use the same honest metrics as the rest of the app or it can't serve
as the new out-of-sample evidence.

**Independent Test**: After at least one automated session with ≥1 trade,
the page shows cumulative P&L over time, the trade list with R multiples,
and journal rows matching what the engine recorded.

**Acceptance Scenarios**:

1. **Given** completed paper trades exist, **Then** the page charts
   cumulative P&L/equity over time and lists every trade with entry, exit,
   R multiple, and exit reason.
2. **Given** an automation session produced signals, **Then** the journal
   view shows every emitted/approved/rejected/executed/exited/force-flat
   event with the same fields and reason codes as backtest journals.
3. **Given** multiple sessions over multiple days, **Then** summary metrics
   (trade count, win rate, expectancy R, total R) aggregate across the
   forward record.

---

### User Story 4 - Manual paper orders, risk-gated (Priority: P4)

As the operator, I can manually buy SPY (and sell/close my position) on the
paper account from the /trade page — but a manual entry is never exempt
from the rules: it must carry a stop-loss and take-profit and passes
through the same risk manager that vets strategy signals. A manual order
the risk manager rejects is not placed, and the rejection is journaled.

**Why this priority**: Useful for learning and for testing the pipes
end-to-end, but the project's purpose is the *automated* forward record;
manual trading is a convenience, not the product.

**Independent Test**: Submit a manual buy with stop and target → it appears
as an order, then a position; close it → flat. Submit one violating a risk
rule (e.g., position already open) → rejected and journaled.

**Acceptance Scenarios**:

1. **Given** a flat account during market hours, **When** the operator
   submits a manual buy with stop and target, **Then** the risk manager
   sizes/validates it and an order is placed and journaled (marked as
   manual origin).
2. **Given** a manual order request without a stop-loss, **Then** it is
   refused before reaching the broker — no stop, no trade.
3. **Given** an open position, **When** the operator presses Close
   position, **Then** the position is exited at market and journaled with
   exit reason "manual close".
4. **Given** an open position from a manual trade, **When** automation is
   running, **Then** the strategy will not stack a second position (one
   position at a time — same rule as backtests).

---

### Edge Cases

- **Data feed disconnects mid-session**: the system reconnects
  automatically; the gap is journaled; any open position's protective
  orders live on the broker side (stop/target are real resting orders, not
  app-side logic), so a dead app process can never leave a position
  unprotected.
- **Backend restarts while automation is running**: automation does NOT
  silently resume; the interruption is journaled, the page shows
  automation stopped with the reason, and the operator must explicitly
  restart it. Open positions remain protected by their broker-side orders.
- **Start pressed while the market is closed**: the session arms and is
  journaled; trading begins at the next session open (and the UI says so).
- **Stop pressed with an open position**: no new entries; exits continue to
  be managed (stop/target/force-flat). The operator can additionally Close
  position manually.
- **Order rejected by the brokerage** (halted, no buying power, symbol
  restriction): journaled as a rejection with the broker's reason; the
  engine continues.
- **Partial fill at session end**: any unfilled remainder is cancelled at
  force-flat; the filled portion is flattened; both journaled.
- **Position drift** (broker says one thing, app says another): the page
  reconciles against the broker as the source of truth, surfaces the
  mismatch prominently, and pauses automation entries until acknowledged.
- **Duplicate automation**: at most one automation session can run at a
  time; a second Start is refused with an explanation.
- **Stale data safety**: if no fresh market data arrives for a configurable
  window during market hours, automation pauses entries and journals why
  (never trade blind).
- **Clock authority**: session open/close, no-new-trades-after (15:30 ET)
  and force-flat (15:55 ET) follow the app's market clock — the same
  authority backtests use.

## Requirements *(mandatory)*

### Functional Requirements

**Automation lifecycle**

- **FR-001**: Operators MUST be able to start and stop automated paper
  trading from the /trade page; each start/stop is journaled with operator
  action, timestamp, and the exact strategy configuration in force.
- **FR-002**: An automation session MUST snapshot the active strategy
  configuration at start; mid-session config edits MUST NOT affect a
  running session.
- **FR-003**: At most one automation session MUST be able to run at a time.
- **FR-004**: While running, the system MUST evaluate the strategy on each
  completed bar of live SPY data and route every signal through the risk
  manager; only approved signals reach the broker. The strategy itself
  MUST NOT size positions or place orders (existing architecture rule).
- **FR-005**: Every order placed MUST carry both a stop-loss and a
  take-profit as real broker-side protective orders. No stop-loss = no
  trade — with zero exceptions, including manual orders.
- **FR-006**: Stopping automation MUST prevent new entries immediately;
  existing positions MUST continue to be managed to stop/target/force-flat.
- **FR-007**: The system MUST close all positions by the force-flat time
  (15:55 ET) and place no new entries after the cutoff (15:30 ET);
  overnight positions are forbidden.
- **FR-008**: Automation MUST run server-side, independent of any browser
  session.
- **FR-009**: After a backend restart, a previously-running automation
  session MUST NOT silently resume; the interruption is journaled and shown.

**Journal & performance record (the forward evidence)**

- **FR-010**: Every signal evaluation outcome — emitted, approved,
  rejected (with reason code), executed, exited, force-flat, skipped —
  MUST be journaled with the same field taxonomy backtests use, plus live
  context (order ids, fill prices, fees if any).
- **FR-011**: The forward record (sessions, orders, fills, journal rows,
  per-trade R multiples) MUST persist durably and survive restarts; it is
  append-only — no retroactive edits.
- **FR-012**: The /trade page MUST show per-trade history, cumulative
  P&L/equity over time, and summary metrics (trades, win rate, expectancy
  R, total R) computed the same way the backtest summary computes them.

**Live market view**

- **FR-013**: The /trade page MUST show a live SPY price chart with four
  views — 1-minute, 5-minute, 1-day, 30-day — each automatically extending
  as new data arrives, without manual refresh.
- **FR-014**: Intraday views (1-minute, 5-minute, 1-day) MUST overlay the
  session-anchored VWAP; the 30-day view (daily bars) omits it and explains
  why.
- **FR-015**: When a position is open, the chart MUST mark entry, stop, and
  target levels.
- **FR-016**: The page MUST display current position, open orders, today's
  fills, and realized + unrealized P&L, reconciled against the brokerage
  paper account as the source of truth; any mismatch is surfaced and pauses
  automation entries until acknowledged.
- **FR-017**: With the market closed, the page MUST show the latest
  session's data clearly labeled as closed, and when trading can next start.

**Manual trading (risk-gated)**

- **FR-018**: Operators MUST be able to submit a manual paper buy (with
  stop and target) and close an open position from the page; manual orders
  pass through the same risk manager and are journaled with manual origin.
- **FR-019**: Manual and automated trading respect the same single-position
  rule: never more than one open position.

**Safety rails (constitution)**

- **FR-020**: All trading in this feature targets the brokerage PAPER
  account only; the system MUST refuse to operate against a live-money
  account (live auto-trading remains disabled by default and is out of
  scope here).
- **FR-021**: SPY only, long only — orders for any other symbol or
  direction are refused.
- **FR-022**: If live market data goes stale beyond a configured window
  during market hours, automation MUST pause new entries and journal why.
- **FR-023**: All thresholds for this feature (stale-data window,
  reconciliation cadence, chart refresh cadences) MUST live in
  configuration, not code.
- **FR-024**: Every concept the page introduces MUST ship with a
  HelpTooltip answering: what is this, why does it matter, how is the app
  using it.

### Key Entities

- **Automation Session**: one operator-initiated run of live automated
  trading — start/stop times, who/what stopped it (operator, restart,
  safety pause), config snapshot, status (armed, running, paused, stopped).
- **Paper Order**: an instruction sent to the brokerage paper account —
  side, quantity, protective stop and target, origin (strategy or manual),
  broker order id, lifecycle status (submitted, filled, partial, cancelled,
  rejected).
- **Paper Position**: the current SPY holding — quantity, average entry,
  protective order references, unrealized P&L.
- **Paper Trade (fill)**: a completed round-trip — entry/exit prices and
  times, R multiple, exit reason (stop, target, force-flat, manual),
  session linkage.
- **Live Journal Event**: same taxonomy as backtest journal rows
  (emitted/approved/rejected/executed/exited/force-flat/skipped) with live
  context.
- **Forward Performance Record**: the accumulating cross-session evidence —
  equity curve points and summary metrics over all paper sessions.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With automation on during a market session, a qualifying
  setup results in a placed paper order with stop and target attached, with
  zero human intervention between signal and order.
- **SC-002**: 100% of executed paper trades carry both protective orders at
  the brokerage from the moment of entry; zero trades ever rest unprotected.
- **SC-003**: 100% of signal outcomes (including every rejection and skip)
  during an automation session appear in the journal with reason codes;
  spot-checks find no missing events.
- **SC-004**: After pressing Stop, zero new entries occur (verified across
  sessions), while open positions still close via stop/target/force-flat.
- **SC-005**: Zero overnight positions across all paper sessions — every
  session ends flat by 15:55 ET.
- **SC-006**: The active chart view reflects a newly completed bar within
  5 seconds of bar close; position levels appear within the same bound.
- **SC-007**: Page-displayed position, orders, and P&L match the brokerage
  paper account exactly at reconciliation points; any mismatch is visibly
  flagged within one reconciliation cycle.
- **SC-008**: A full trading day runs unattended (browser closed) and the
  complete day's record — trades, journal, P&L — is present afterward.
- **SC-009**: Forward summary metrics (win rate, expectancy R, total R) for
  a session match a hand-computation from its trade list exactly.
- **SC-010**: Every new concept on /trade has a HelpTooltip (audited the
  same way prior features were).

## Assumptions

- **The brokerage is Alpaca**, using the project's existing credentials;
  the account targeted is the PAPER account exclusively. The operator's
  subscription tier provides full real-time market data and reliable
  websocket streams (stated by the operator).
- **The strategy that trades is the active config** (the same one
  backtests/campaigns use); automation snapshots it at session start.
- **Decision cadence stays on 5-minute bars** — the constitution's default
  timeframe and the granularity every backtest used. The 1-minute chart
  view is observational; it does not change when the strategy decides.
  (Changing decision cadence would make forward results incomparable to
  the archive.)
- **Chart views**: 1-minute and 5-minute views show the current session's
  bars at those granularities; the 1-day view shows the full current
  session; the 30-day view shows ~30 calendar days of daily bars.
- **Protective exits are broker-side resting orders** (not app-watched
  levels) so positions stay protected even if the app dies. Force-flat
  remains an app responsibility at 15:55 ET.
- **Paper fills are the brokerage's simulation**; slippage/fees follow what
  the paper venue reports. Forward metrics use reported fills as truth.
- **Existing engine components are reused** (strategy, risk manager,
  journal taxonomy, market clock); this feature adds a live data/broker
  loop and the page, not a second trading brain.
- **No multi-user concurrency concerns**: single operator account, one
  automation session at a time.
- **Out of scope for this feature**: live-money trading, any new strategy
  logic (regime conditioning is a separate future feature), multi-symbol
  support, shorting, options.
