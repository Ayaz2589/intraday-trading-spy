# Phase 1 Contracts: Pre-Open Warmup

**No new HTTP endpoints.** The existing `/api/trade/automation/start` and `/stop` contracts are unchanged in shape. This feature changes internal behavior only. The contracts below are the internal seams the tests assert against.

## C1 — `LiveSessionEngine.on_five_minute_bar(bar: Bar) -> None`

**Pre-condition added**: a bar with `bar.timestamp` (in ET) earlier than `self.clock.session_start` is a *pre-open* bar.

**Contract**:
- For a pre-open bar: MUST journal exactly one `pre_open` lifecycle event and MUST return without calling `session_state.append`, `_roll_day` trading effects, or `_evaluate`. `session_state.bar_count` MUST be unchanged. No order, no state mutation that affects trading.
- For a regular-session bar (ET time ≥ session_start): behavior is byte-for-byte identical to today.

**Test assertions**:
- After feeding pre-open bars then RTH bars, indicator snapshots for each RTH bar equal a control engine fed only the RTH bars (exact match) — SC-002.
- No `emitted`/`approved`/`executed` signal events occur for any pre-open bar.
- A `pre_open` journal event exists for each pre-open bar — FR-005.

## C2 — Warmup application at session start

**Contract**:
- On start, the runner MUST apply the supplied RTH warmup 5m bars to the engine's `SessionState` (via `warmup()`) before any live bar is processed.
- Given warmup bars covering 09:30 → T, the indicator snapshot produced for the first live bar after T MUST equal the snapshot from a control that processed 09:30 → first-live-bar entirely bar-by-bar — SC-003.
- If the warmup fetch is empty or raises, the session MUST still start and run live; a `warmup` journal event records `loaded=0` / the failure reason — FR-008. No exception escapes to fail the start.
- Warmup bars MUST contain only RTH bars (the fetcher guarantees start=09:30) — FR-007.

## C3 — Aggregator boundary (regression lock)

**Contract**: Feeding 1m bars spanning 09:25–09:34 to `BarAggregator` MUST emit a pre-open 5m bar (09:25 bucket) distinct from the 09:30 bucket; the 09:30 5m bar MUST NOT include any pre-open (≤09:29) volume or extreme. (Documents the boundary the guard relies on.)

## Unchanged contracts (must not regress)

- End-of-day controls: `no_new_trades_after`, `is_force_flat`, stale-data pause, reconcile — all still anchored to the regular session and behave as today — FR-009.
- Risk veto, bracket submission, fill handling — untouched — Principle III.
- `paper_*` tables and the `/automation/*` request/response JSON — unchanged — FR-010.
