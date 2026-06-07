# Phase 0 Research — Historic Trade Replay

All spec `[NEEDS CLARIFICATION]` markers were resolved in the 2026-06-07 clarify session
(see spec `## Clarifications`). This file records the architectural decisions that flow from
those clarifications and from the codebase reuse survey.

---

## R1 — Which engine drives automation: live engine vs. backtest primitives?

**Decision**: Drive replay automation through the **backtest decision+fill primitives** —
`strategy.evaluate` → `RiskManager.validate` → `broker/paper.py` `PaperBroker`
(`simulate_entry`/`simulate_bar`/`force_flat`) — reproducing the per-bar sequence of
`backtest/engine.py`. **Do NOT** route automation through `live/engine.py`.

**Rationale**: The two paths have *different fill conventions*, confirmed in the survey:
- `live/engine.py` submits a bracket **market** order on the signal bar; Alpaca fills it
  ~immediately at the prevailing price.
- `backtest/engine.py` fills the entry at the **next** bar's open
  (`paper.py:27` `next_bar.open + slippage_per_share`), checks bracket exits intrabar on each
  subsequent bar (`paper.py:59-83`), with a conservative **stop-first** tiebreak when one bar
  spans both legs, and force-flats at 15:55 at the next bar's open (or synthesized close on the
  last bar).

**SC-004 requires replay automation to match a _backtest_ of the same date/config exactly.**
Therefore the backtest convention is mandatory; using the live engine would match live-paper
behavior and *fail* SC-004. As a bonus this is the more education-honest model: the replay then
agrees with the runs/Insights archive the user already trusts ("see what strategies will work").

**Alternatives considered**:
- *Reuse `live/engine.py` with a simulated broker that emits `on_order_update`.* Rejected: to
  hit SC-004 the simulated broker would have to defer entry fills to the next bar and replicate
  the backtest's exact per-bar ordering — re-implementing the backtest inside a broker shim,
  more code and more divergence risk than reusing the backtest primitives directly.
- *Run the real backtest engine and "scrub" through results.* Rejected: precludes live manual
  trading interleaved with automation (US2/US3) and the live unfolding clock (US1).

**Consequence**: We reuse the live page's *experience* (cockpit panels, journal `kind`
vocabulary, API shape) but the *fill math* is the backtest's. Documented in plan Summary.

---

## R2 — Playback time model

**Decision**: The selected interval is a **speed**: simulated market-time elapsed per one real
second (1s = 1× real-time … 1hr = 3600×). The runner advances a continuous simulated clock at
that rate; a stored 5-minute bar is delivered to the engine the instant the simulated clock
crosses its `bar_start` boundary. Pause stops clock advance; speed changes apply from the next
real tick without restart. **No sub-bar prices are synthesized** (FR-004).

**Rationale**: Matches "speed up time," satisfies SC-002 (1hr → ~7s full session), needs no
intra-bar fabrication (honest), and keeps the engine on completed 5-minute bars only (FR-007,
parity with backtest). The simulated clock is a *pacing + display* device; all market-time
gates (OR-complete, no-new-trades, force-flat) still go through `MarketClock` keyed on bar
timestamps — so force-flat fires on exactly the bar a backtest would use.

**Implementation note**: The runner loop computes, per real tick, how much sim-time elapsed
(`real_dt × speed`), advances the sim clock, and flushes every bar whose boundary was crossed
in order. At very high speed multiple bars flush per tick — all are processed, none skipped
(SC-002). Real-tick cadence is an internal constant (e.g. ~10 Hz), not a risk/market value.

**Alternatives considered**: inter-bar wall-clock delay (rejected: 1s delay × 78 bars = 78s >
SC-002 budget, and "1hr delay" would be absurdly slow); fixed sim-time step per tick (rejected:
finer-than-5m steps demand fabricated sub-bar prices).

---

## R3 — Data source & granularity

**Decision**: Stored **5-minute bars only**, read via `storage.list_bars(range_start,
range_end)` for the chosen session date, converted UTC→ET and filtered to the regular session
exactly as `data/loader.py` does. No 1-minute historical fetch in v1 (FR-017).

**Rationale**: Works for every covered date (2018→present) with no provider-availability gaps;
the strategy already decides on 5-minute bars; maximal parity with the backtest. Higher-fidelity
1-minute replay is a documented future enhancement.

**Alternatives considered**: fetch 1m bars from Alpaca per date (rejected for v1: coverage
varies by date, adds a brokerage dependency the feature otherwise avoids, and the strategy
wouldn't use the finer bars anyway).

---

## R4 — Persistence & lifecycle

**Decision**: **Ephemeral, in-memory.** A module-level `REPLAY_RUNNING: dict[str,
ReplayRunner]` registry (one entry per user) holds the active replay, mirroring
`live/runner.py:29`'s `RUNNING`. Nothing is written to the database — no migration, no tables.
A replay survives a page refresh (the page reattaches via `GET /api/replay/state`) but is lost
on stop or backend restart (FR-015, FR-020). On restart there is simply no entry in the
registry; the page shows "no active replay" and the user starts a new one — never a silent
resume.

**Rationale**: The recap is informational (assumptions); ephemeral state is sufficient, far
simpler, and makes SC-005 (zero archive/paper leakage) *structurally* true — there is no table
to leak into. Reuses the proven registry pattern.

**Alternatives considered**: a `replay_*` table set mirroring `paper_*` (rejected: needless
schema, migration, RLS, and a leakage surface for a tool whose output is explicitly not
archived).

---

## R5 — Replayable-date discovery

**Decision**: Intersect `storage.bars_present_session_dates(range_start, range_end)` (ET
session-days with ≥1 stored bar) with `data/market_calendar.expected_session_dates(start,
end)` (XNYS trading days). Surface the intersection as the date-picker options via `GET
/api/replay/dates`. A date the user somehow requests that isn't covered → 422 with a clear
reason (FR-002 / US1 AS5).

**Rationale**: Reuses the exact coverage logic the Data page (feature 013) already uses; no new
completeness math. Bounds the picker to dates that will actually replay cleanly.

---

## R6 — Manual order fill semantics

**Decision**: Manual buys and manual closes fill at the **next** bar's open with the same
`PaperBroker` honest-cost model (entry: `next_bar.open + slippage`; close: `raw_level -
slippage`). Resting bracket stop/target legs fill **intrabar** via `simulate_bar` when the
historical high/low crosses them (legitimate — they are resting orders). A manual buy carries a
mandatory stop+target and is risk-validated; a manual sell/close is rejected if there is no
position or it exceeds the held quantity (US2 AS5 — long-only).

**Rationale**: No-look-ahead honesty (you cannot fill on a bar you have already watched close)
and consistency with the automated path; resting protective legs filling intrabar is exactly
the backtest's bracket model.

---

## R7 — Journal vocabulary & frontend reuse

**Decision**: `ReplayJournal` appends append-only events shaped exactly like the live
`PaperEvent` (`seq`, `trading_day`, `timestamp`, `kind`, `payload`) into an in-memory list,
reusing the live `kind` vocabulary: `emitted` / `approved` / `rejected` / `executed` /
`exited` / `force_flat` / `skipped_window` (signal kinds) and lifecycle kinds
(`session_started` / `day_rolled` / `replay_completed`). The frontend `LiveJournalTable`,
`ForwardPerformance`, `AccountPanel`, and `LiveChart` consume these shapes unchanged.

**Rationale**: Satisfies "works exactly like paper trading" at the presentation layer with zero
new display components; the journal is the educational core (constitution VI/VII) and stays
identical to what the user already learned on the live page.

---

## R8 — Routing & navigation placement

**Decision**: New TanStack file route `_authenticated.trade_.historic.tsx` → URL
`/trade/historic` (the trailing-underscore form keeps `/trade` a leaf, no layout refactor). Nav
adds a **Historic Trade** entry at `depth: 1` directly under **Trade** in `side-nav.tsx`,
honoring "lives under /trade."

**Rationale**: Literally nests the page under `/trade` per the user's framing without
restructuring the existing live route, and reuses the existing depth-indent nav idiom (the same
one that nests Validation/Insights/Backtests under Strategy).

**Alternatives considered**: sibling `/trade-historic` (rejected: doesn't read as "under
/trade"); making `/trade` a layout with index + child (rejected: needless churn to the shipped
live route).
