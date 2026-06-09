# Quickstart: Pre-Open Warmup for Live Paper Trading

## What changes for the operator

- You can start the paper-trading automation session **before 09:30 ET** (e.g. ~09:00). The session connects and market data starts flowing immediately.
- **No trades happen before 09:30.** Pre-open bars are recorded as data activity (journal `pre_open` events) and dropped — they never touch VWAP or the opening range.
- At 09:30 the system is already connected and primed; trading begins on the first regular-session bar exactly as if you'd started at 09:30.
- Starting **at or mid-session** now backfills the day's elapsed 09:30→now bars, so indicators are correct on the very first live bar instead of rebuilding from a partial frame.

Nothing about the strategy, risk limits, sizing, or end-of-day force-flat changes.

## How to verify (offline tests)

```bash
# from repo root
make test                                  # full offline suite stays green
backend/.venv/bin/pytest backend/tests/live -q   # the paper/live tests incl. new ones
```

Key tests to look for:
- **Pre-open guard parity**: an engine fed pre-open + RTH bars yields identical VWAP/OR to one fed only RTH bars (SC-002).
- **Warmup parity**: a session warmed up with 09:30→T then given the next live bar matches a session that processed 09:30→that-bar bar-by-bar (SC-003).
- **Aggregator boundary**: pre-open 1m bars don't contaminate the 09:30 5m bar.
- **No pre-open trades**: no `emitted/approved/executed` events for pre-open bars; a `pre_open` journal event per pre-open bar.

## How to verify (live, next session — deferred)

1. Before 09:30 ET, start automation from the `/trade` page.
2. Confirm the journal shows `warmup` then `pre_open` events and **zero** signal/trade events before 09:30.
3. At 09:30, confirm VWAP/OR values match a 09:30-start control and trading proceeds normally.

## Implementation notes (as built)

- Warmup uses **completed 5m buckets only** (the 1m REST frame is aggregated but the still-open final bucket is *not* flushed) — the live stream continues from that open bucket, so there is no duplicate bar at the warmup/live boundary.
- New journal kinds registered in `live/journal.py`: `pre_open` (per dropped pre-open bar) and `warmup` (one per session start, `loaded=N`).
- The guard compares `bar.timestamp` (in ET) to `clock.session_start` — no hardcoded 09:30.
- Warmup fetch is fully fail-soft: empty data or any error → `loaded=0`, session still starts and trades live.

## Test results (as built)

- `tests/live` + `tests/api/new/test_trade_api.py`: **91 passed**.
- Full offline backend suite (`-m "not slow and not integration"`): **982 passed, 0 failures**.
- New tests: 4 engine (US1) + 1 aggregator + 2 runner + 5 trade-api (US2). Lint clean on all changed/added files (2 pre-existing `B905` warnings in the untouched `/performance` handler left as-is).
- **Live-session walkthrough deferred** to the next market session (matching the 021/022 verification pattern): start automation pre-09:30 and confirm `warmup` → `pre_open` events with zero trades before the open.

## Scope reminders

- Backend automation only — no chart/UI change (pre-open bars are not drawn on the chart).
- No new config, no new dependency, no DB migration.
- Anchoring stays at 09:30 ET (constitution "regular session only" preserved).
