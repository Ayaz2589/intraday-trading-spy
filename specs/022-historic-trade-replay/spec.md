# Feature Specification: Historic Trade Replay

**Feature Branch**: `022-historic-trade-replay`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Historic trade replay page: a /historic-trade page nested under /trade. Works exactly like the existing live paper trading experience (feature 021) but driven by historical data we already have, replaying a full chosen market session bar-by-bar — useful for education and for seeing how strategies behave. The replay ticks the historical session forward at user-selectable playback intervals (1s, 10s, 30s, 1m, 5m, 10m, 30m, 1hr per tick) and the user can speed up/slow down time during playback. While the session replays, the user can manually buy and sell (risk-gated like paper trading) and/or watch the automated strategy trade the session. Reuses the already-built paper-trading machinery (strategy/risk/indicators/journal/charts) wherever possible; simulated fills against historical bars instead of the Alpaca paper API. Strictly separate from the runs/Insights archive and from the real paper_* forward record."

## Clarifications

### Session 2026-06-07

- Q: What does the selected playback interval (1s/10s/30s/1m/5m/10m/30m/1hr) mean? → A: It is a **speed setting** — the amount of *simulated market time* that elapses per *one real second*. 1s = real-time (1×); 1hr = 3600× (a full 6.5-hour session in ~6.5 real seconds). The simulated clock advances continuously; a stored 5-minute bar surfaces the moment the simulated clock crosses its boundary. No sub-bar prices are synthesized.
- Q: Where does replay market data come from? → A: **Stored 5-minute bars only** for v1 (the data foundation's covered history, 2018→present). No finer-grained (1-minute) historical fetch in v1; fidelity at 5-minute granularity matches what the strategy already decides on. (Higher-fidelity 1m fetch is a documented future enhancement, out of scope here.)
- Q: Is replay state persisted or ephemeral? → A: **Ephemeral, held server-side in memory** for the duration of the active replay. It survives a page refresh (the page reattaches to the running replay), but is **never written to the database** — it vanishes when the replay stops or the backend restarts (interrupted, never silently resumed). No new persistent tables; this makes archive/forward-record leakage structurally impossible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Replay a past session and watch it unfold (Priority: P1)

A user opens the Historic Trade page (nested under Trade in the navigation), picks a past market session date from the covered history, and presses Play. The session replays from the 09:30 ET open: the price chart draws bar by bar, the session indicators (VWAP, opening range) build exactly as they would have on that day, and a simulated session clock advances. The user can pause, resume, and change the playback speed at any moment — from slow studying pace up to "whole session in under a minute." When the simulated clock reaches the session close, the replay ends with a session recap.

**Why this priority**: This is the foundation every other story builds on — a working replay engine with honest historical data, time control, and the same indicator views the live Trade page has. On its own it already delivers the educational core: *watching* how a real session developed.

**Independent Test**: Pick a known historical date, press Play, and verify the session replays start-to-finish in chronological order with indicators updating, pause/resume working, and speed changes taking effect — with no trading involved at all.

**Acceptance Scenarios**:

1. **Given** a valid covered session date is selected, **When** the user presses Play, **Then** bars appear strictly in chronological order from 09:30 ET and chart + indicators update on every tick.
2. **Given** a replay is in progress, **When** the user presses Pause, **Then** the simulated clock halts and no further market data is delivered until Resume.
3. **Given** a replay is in progress, **When** the user selects a different playback speed, **Then** the new pace takes effect from the next tick without restarting the session.
4. **Given** the simulated clock reaches the session close (16:00 ET, or the early close on shortened days), **When** the final bar is delivered, **Then** the replay ends and a session summary is shown.
5. **Given** the user selects a date with no market session (weekend/holiday) or missing data, **Then** the date is either not offered or a clear explanation is shown — never a broken replay.

---

### User Story 2 - Manually trade the replayed session (Priority: P2)

While a session replays, the user can place manual buy and sell orders against the historical prices — exactly as risk-gated as the live paper page. Every entry must carry a stop-loss and take-profit (no stop = no trade), the risk manager has absolute veto, and long-only rules apply (sells can only reduce or close an existing position, never go short). Fills are simulated from the historical data using the same honest cost model the backtester uses. Position, unrealized P&L, and realized P&L are visible throughout; at 15:55 ET simulated time, any open position is force-flattened just like the live engine would. Every action — submissions, fills, rejections, force-flat — lands in the replay journal in real time.

**Why this priority**: This is the hands-on educational heart of the feature — "could I have traded that day?" It requires the replay engine (US1) but is independent of strategy automation.

**Independent Test**: During a replay, submit a manual buy with stop and target, watch it fill at an honest historical price, then either exit manually or let the bracket/force-flat close it — and verify the journal recorded every step and the P&L math is consistent.

**Acceptance Scenarios**:

1. **Given** a replay is playing and the user has no position, **When** the user submits a buy with stop-loss and take-profit, **Then** the risk manager evaluates it and an approved order fills at a simulated price derived from the historical data with costs applied.
2. **Given** a manual order request without a stop-loss, **When** it is submitted, **Then** it is rejected with the rejection journaled — no stop-loss, no trade.
3. **Given** an open simulated position, **When** the historical price crosses the stop or target level, **Then** the corresponding protective exit fills and the other leg is cancelled — one leg's fill always cancels the other.
4. **Given** an open position as simulated time reaches 15:55 ET, **When** the force-flat window arrives, **Then** the position is closed at the prevailing historical price and journaled as a force-flat.
5. **Given** the user attempts to sell more than the held quantity (or sell with no position), **Then** the order is rejected — long-only, no shorting.

---

### User Story 3 - Watch the automated strategy trade the replay (Priority: P3)

The user toggles strategy automation on for a replay session and watches the same VWAP-pullback strategy that powers backtests and live paper trading evaluate the session in real (simulated) time: signals, window skips, risk approvals/rejections, simulated bracket entries, exits. The journal narrates every decision as it happens. The user can run automation alongside their own manual trades and compare outcomes at the recap.

**Why this priority**: "Seeing what strategies will work" — this turns an opaque backtest row into a watchable story, the strongest educational payoff. It layers on US1 (engine) and shares simulated-fill machinery with US2.

**Independent Test**: Replay a date where a backtest of the same configuration produced a known trade; verify automation produces the same entry/exit decisions during replay and that every decision (including skipped setups) appears in the journal.

**Acceptance Scenarios**:

1. **Given** automation is enabled for a replay, **When** a completed 5-minute bar produces a strategy signal that the risk manager approves, **Then** a simulated bracket entry (with stop and target) is placed and journaled.
2. **Given** automation is enabled, **When** the strategy evaluates a bar and produces no signal or a skipped setup, **Then** the evaluation outcome is journaled — skips included.
3. **Given** the same session date and configuration, **When** the replay completes with automation on, **Then** the strategy's entries and exits match what a backtest of that date with that configuration produces.
4. **Given** automation is mid-position, **When** the user pauses and later resumes, **Then** the position and pending simulated bracket state are preserved exactly.

---

### Edge Cases

- Selected date is a weekend, market holiday, or has missing/incomplete stored data → date unavailable or clearly explained; a mid-session data gap ends the replay gracefully with an explanation rather than fabricating prices.
- Early-close sessions (e.g., day after Thanksgiving, 13:00 ET close) → simulated clock, force-flat offset, and recap respect the actual session length.
- The user changes speed or pauses while a simulated order is pending → order semantics are unaffected; fills depend only on simulated time and historical prices, never wall-clock.
- Page refresh or navigation away mid-replay → the running replay survives (state is held server-side); the page reattaches to it on return. A backend restart, however, interrupts it (see below).
- Backend restart mid-replay → the replay is interrupted and never silently resumed (mirrors the live paper rule); the user starts a new replay explicitly.
- A live paper trading session is running at the same time → replay runs fully independently; it must never touch the live session, the real broker account, or pause/affect live automation in any way.
- Starting a new replay while one is already active → the user must explicitly stop the active replay first (one active replay at a time).
- Maximum speed across a fill-heavy session → all bars are still processed in order; no fills, journal entries, or force-flat events are skipped at any speed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a Historic Trade page reachable under the Trade section of the navigation, clearly presented as a sibling/child of the live Trade page.
- **FR-002**: Users MUST be able to choose any past market session date for which the system holds covered historical data; dates without a session or without data MUST be unavailable or clearly explained.
- **FR-003**: The replay MUST simulate the regular session only (09:30–16:00 ET, honoring early closes), driven by a simulated clock in the America/New_York timezone; all bar delivery, strategy evaluation, fills, and force-flat MUST key off simulated time, never wall-clock time.
- **FR-004**: Users MUST be able to control playback pace via the selectable speed settings 1s, 10s, 30s, 1m, 5m, 10m, 30m, 1hr, where the label denotes how much simulated market time elapses per one real second (1s = real-time/1×, 1hr = 3600×). The simulated clock advances continuously at the chosen rate; a stored 5-minute bar is delivered the instant the simulated clock crosses its boundary. No sub-bar prices are synthesized.
- **FR-005**: Users MUST be able to play, pause, resume, change speed at any point during a replay without restarting it, and stop a replay entirely.
- **FR-006**: The replay MUST present the same session market views the live Trade page provides (price chart with session VWAP and opening range), computed by the same definitions, updating as simulated time advances.
- **FR-007**: Strategy evaluation during replay MUST occur on completed 5-minute bars only, using the same strategy, indicator, and configuration machinery as backtests and live paper trading — identical decision logic, no replay-specific strategy behavior.
- **FR-008**: Every order in a replay — manual or automated — MUST pass through the risk manager, which retains absolute veto; every entry MUST carry both a stop-loss and a take-profit; long-only and SPY-only rules apply throughout.
- **FR-009**: Protective exits MUST behave as brackets within the simulation: stop and target are armed from entry acceptance, the first leg touched by historical prices fills, and the other leg is cancelled.
- **FR-010**: Simulated fills MUST be derived from the historical bar data using the same honest execution cost model as backtests (no free fills, no look-ahead — an order can only fill on data at or after the simulated time it was placed).
- **FR-011**: Position sizing MUST use the configured account value, exactly as backtests and live paper trading do, so replay outcomes are comparable to the archive.
- **FR-012**: The system MUST journal every replay event with full context — signals, skipped setups, risk approvals and rejections, submissions, fills, cancellations, force-flat — and the journal MUST be visible in the replay page as events occur.
- **FR-013**: Any open simulated position MUST be force-flattened at 15:55 ET simulated time (offset adjusted on early-close sessions), and the replay MUST end at session close with a recap of trades, P&L, and journal.
- **FR-014**: Replay activity MUST be strictly separate from the research archive and the forward paper record: replay sessions, orders, trades, and journal events MUST never appear in the runs/Insights archive, never feed validation gates or recommendations, and never mix with the live paper trading record.
- **FR-015**: Replay state MUST be ephemeral and held server-side in memory only for the duration of the active replay — reattachable across a page refresh, but never written to the database. It is lost when the replay stops or the backend restarts. No new persistent storage is introduced.
- **FR-016**: The replay experience MUST be unmistakably labeled as a historical simulation everywhere trading state is shown, so it can never be confused with the live paper page; it MUST never place orders with any real brokerage (paper or otherwise) and MUST function without a brokerage connection.
- **FR-017**: Replay market data MUST be sourced from the stored 5-minute bars (the data foundation's covered history) — the same data the strategy decides on. v1 does NOT fetch finer-grained (1-minute) historical bars; higher-fidelity replay is a documented future enhancement, out of scope here.
- **FR-018**: At most one replay session per user MUST be active at a time; replay MUST run independently of, and never interfere with, any live paper trading session.
- **FR-019**: Every new concept introduced by this page (replay, simulated clock, playback speed, simulated fills, recap) MUST ship with an educational help tooltip answering: what is this, why does it matter, how is the app using it.
- **FR-020**: A backend interruption during a replay MUST never silently resume the replay; the user starts a new replay explicitly.

### Key Entities

- **Replay Session**: One user-initiated playback of a single historical market session — the chosen date, configuration in effect, playback state (playing/paused/speed), simulated clock position, and lifecycle (active → completed/stopped/interrupted).
- **Playback Control State**: The user-adjustable pace and play/pause status; changes apply mid-session without restart.
- **Simulated Order**: A manual or strategy-originated order inside a replay — side, quantity, stop-loss, take-profit, risk decision, and fill outcome derived from historical prices; never visible to any real brokerage.
- **Simulated Trade**: A completed round-trip within a replay with entry/exit prices, costs, and realized P&L.
- **Replay Journal Event**: An append-only record of every decision and action during a replay, with simulated-time context.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can pick any covered historical session date and be watching it replay within 5 seconds of pressing Play.
- **SC-002**: At the fastest speed setting (1hr ≈ 3600×), a full 6.5-hour session replays to completion in roughly 7 seconds (and in well under 60 seconds at the 5m setting or faster), with zero skipped bars, fills, or journal events at any speed.
- **SC-003**: A user can complete a manual round-trip trade (entry with stop and target → exit) during a replay and see consistent position, fill, and P&L figures in the recap.
- **SC-004**: With automation enabled, a replay of a given date and configuration produces entry and exit decisions identical to a backtest of that same date and configuration, 100% of the time.
- **SC-005**: After any number of replay sessions, the runs/Insights archive and the live paper trading record contain zero replay-originated rows.
- **SC-006**: 100% of filled replay entries carry both a stop-loss and a take-profit at fill time; 100% of stop-less order attempts are rejected and journaled.
- **SC-007**: Every new concept on the page has a help tooltip; a first-time user can explain what the replay is doing (simulated clock, speed, simulated fills) using only the page's own explanations.

## Assumptions

- SPY only, long-only, rule-based v1 — the replay inherits all constitution constraints unchanged; it introduces no new instruments or strategy behavior.
- The replay reuses the existing strategy, risk manager, indicator, journaling, and charting machinery (and the live 1m→5m aggregation pipeline where applicable) rather than re-implementing them; "works exactly like paper trading" is interpreted as: same decision pipeline, same risk gates, same journal vocabulary, with the brokerage replaced by a historical-data fill simulator.
- Covered history is the data foundation's stored range (2018 → present, regular sessions); a date is replayable when its session data passes the same completeness expectations the data page reports.
- The replay uses the user's active named configuration (same as live paper trading); changing configuration mid-replay is out of scope.
- Single-operator app (existing authentication); concurrent replay by multiple users of one account is not a design target beyond the one-active-replay rule.
- Replays never write to the bar store, the research archive (runs/studies/insights), or the live paper trading tables.
- The recap is informational/educational; exporting or archiving recaps for analysis is out of scope for v1.
- Live paper trading and the rest of the app remain fully functional while a replay runs.
