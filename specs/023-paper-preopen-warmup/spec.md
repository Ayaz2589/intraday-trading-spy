# Feature Specification: Pre-Open Warmup for Live Paper Trading

**Feature Branch**: `023-paper-preopen-warmup`

**Created**: 2026-06-09

**Status**: Draft

**Input**: User description: "in the paper trading section can we start pulling market data from 9 am est with pre-open data" — refined to: let the operator start the paper-trading automation session before the 09:30 ET regular-session open so market data is already flowing and indicators are primed at the open, WITHOUT changing any strategy semantics (warmup-only; trading and indicator anchoring stay at 09:30).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start automation before the open without corrupting the strategy (Priority: P1)

The operator starts the paper-trading automation session during the pre-market window (for example around 09:00 ET, before the 09:30 regular-session open). The session connects and market data begins flowing immediately. Pre-open bars are recorded as data activity but are **not** allowed to influence the strategy: VWAP still resets at 09:30 and the opening range is still measured from 09:30. When the regular session opens, the system is already connected and trading begins on the first regular-session bar exactly as if it had been started at 09:30.

**Why this priority**: This is the core ask. Today, starting before the open silently corrupts the session-anchored VWAP and opening range (pre-open bars enter the indicator frame), so this is both the requested capability and a latent-correctness fix. Without it, the feature has no value and pre-open starts are unsafe.

**Independent Test**: Start a session with simulated pre-open bars (09:00–09:25) followed by regular-session bars (09:30+). Verify no entries occur before 09:30, verify the VWAP and opening-range values at 09:30 and after are byte-identical to a session that received only the regular-session bars, and verify each pre-open bar produced a recorded "pre-open data" journal event.

**Acceptance Scenarios**:

1. **Given** an automation session started at 09:00 ET, **When** pre-open bars (timestamps before 09:30 ET) arrive, **Then** no trade is ever evaluated or placed and the strategy's VWAP/opening-range state is unchanged by those bars.
2. **Given** pre-open bars have arrived, **When** the 09:30 bar and subsequent regular-session bars arrive, **Then** VWAP, opening-range high/low, and opening-range-complete flags are identical to a control session that received only the 09:30+ bars.
3. **Given** a pre-open bar arrives, **When** it is dropped from the trading frame, **Then** a journal event is recorded showing market data is flowing (so the operator and audit trail can see the session is live and receiving data before the open).

---

### User Story 2 - Indicators are correct on the first live bar when starting at or after the open (Priority: P2)

The operator starts (or restarts) the automation session at the open or partway through the regular session. The session backfills the regular-session bars that already elapsed today (from 09:30 up to "now") so that the very first live bar it acts on has a correct, fully-anchored VWAP and opening range — rather than rebuilding indicators from a mid-session starting point.

**Why this priority**: A documented capability of the paper-trading feature (the warmup hook) exists but was never invoked, meaning a mid-session start currently computes indicators from an incomplete frame. This makes that start path correct. It is P2 because it is independent of (and complementary to) the pre-open guard in Story 1.

**Independent Test**: Start a session at a simulated 11:00 ET with the day's 09:30–11:00 regular-session bars available to backfill. Verify the indicator values on the first live (11:05) bar match a session that processed all of 09:30–11:05 bar-by-bar.

**Acceptance Scenarios**:

1. **Given** the regular session has been open for some time and a session is started, **When** the engine initializes, **Then** today's already-elapsed regular-session bars (09:30 → now) are loaded so indicators are correct on the first live bar.
2. **Given** a session is started before the open (no regular-session bars exist yet), **When** the engine initializes, **Then** the backfill is empty and the session waits for the first regular-session bar — no error, no corruption.

---

### Edge Cases

- **Pre-open partial bucket**: A pre-open bar that would aggregate into the 09:30 boundary must not leak pre-open price/volume into the 09:30 regular-session bar. The first bar entering the trading frame must be a clean regular-session bar timestamped at or after 09:30.
- **Backfill data unavailable**: If the regular-session backfill fetch fails or returns nothing, the session must still start and trade live (degraded to "no warmup"), with the failure recorded — never crash and never silently mark itself running while broken.
- **Weekend / holiday / pre-open-only run**: A session started pre-open that never reaches a regular session (e.g. a non-trading day) takes no trades and records data activity only.
- **Force-flat and end-of-day**: Pre-open behavior must not alter existing end-of-session controls (no-new-trades cutoff, force-flat) — those remain anchored to the regular session.
- **Stale-data detection**: The existing "no data for N seconds → pause entries" safety must not false-trigger during the pre-open window in a way that blocks the regular session.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST allow an automation session to be started during the pre-market window (before the configured regular-session open) without error.
- **FR-002**: The system MUST NOT evaluate, approve, or place any trade for a bar whose timestamp is before the configured regular-session open.
- **FR-003**: The system MUST exclude pre-open bars from the strategy's indicator/session frame so that VWAP and the opening range remain anchored to the regular-session open exactly as today.
- **FR-004**: Indicator outputs (VWAP, opening-range high/low, opening-range-complete) for every regular-session bar MUST be identical whether or not pre-open bars were received earlier in the same run (backtest/live parity preserved).
- **FR-005**: The system MUST record a journal event for pre-open data activity so the audit trail reflects that the session was live and receiving data before the open.
- **FR-006**: On session start, the system MUST backfill today's already-elapsed regular-session bars (from the regular-session open up to the current time) into the session frame so indicators are correct on the first live bar.
- **FR-007**: The backfill MUST include only regular-session bars (09:30+); it MUST NOT include pre-open bars.
- **FR-008**: If the backfill source is unavailable or empty, the system MUST start the session anyway, record the condition, and proceed live without corrupting indicators.
- **FR-009**: All existing end-of-day controls (no-new-trades cutoff, force-flat, stale-data pause, reconciliation) MUST remain anchored to the regular session and behave exactly as before.
- **FR-010**: The change MUST NOT alter strategy, risk, or indicator math; it MUST NOT add external dependencies; and it MUST NOT add or change any database schema.

### Key Entities *(include if feature involves data)*

- **Pre-open bar**: A completed market-data bar whose timestamp falls before the regular-session open. Recorded as data activity; excluded from trading.
- **Warmup bar set**: The collection of today's regular-session bars that elapsed before the session started, loaded so indicators are anchored correctly. Distinct from pre-open bars (never includes them).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can start the automation session any time from the pre-market window onward and it remains connected and receiving data until the regular session opens, with zero trades before the open.
- **SC-002**: For any regular-session bar, the VWAP and opening-range values are 100% identical between a pre-open-started session and a 09:30-started control session (exact-match parity test).
- **SC-003**: A session started mid-session produces indicator values on its first live bar that are 100% identical to a session that processed the full day bar-by-bar (exact-match warmup test).
- **SC-004**: The full backend test suite stays green, including the existing paper-trading suite (no regressions), with new tests covering the pre-open guard and warmup.
- **SC-005**: No new database tables/migrations and no new third-party dependencies are introduced.

## Assumptions

- "Pre-open" / "9 am" means the regular-session open stays at the configured 09:30 ET; only the operator's allowed start time and the data stream move earlier. (Confirmed with the user: "warmup only — be ready at 09:30".)
- The regular-session open, no-new-trades cutoff, and force-flat times remain governed by existing configuration; no new session-time configuration is required.
- The existing regular-session intraday data fetcher (which already begins at the regular-session open) is the warmup source; no new data source is introduced.
- The existing market-data stream naturally delivers pre-open bars once the session is connected before the open; no change to subscription scope is required beyond handling those bars safely.
- Scope is backend automation only — no frontend/chart changes are required for this feature (pre-open bars are not added to the chart view).
- Reusing the existing in-memory session/engine architecture; no persistence changes.
