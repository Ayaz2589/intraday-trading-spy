# Phase 1 Data Model: Pre-Open Warmup for Live Paper Trading

This feature introduces **no new persisted entities and no schema changes**. It operates entirely on existing in-memory structures and the existing journal. The "entities" below are conceptual/runtime only.

## Runtime concepts

### Pre-open bar (transient)
- **What**: A completed 5-minute `Bar` whose ET timestamp is before `clock.session_start`.
- **Source**: Live aggregator output while the session is connected before the open.
- **Lifecycle**: Detected in `LiveSessionEngine.on_five_minute_bar` → journaled as a `pre_open` lifecycle event → discarded. Never enters `SessionState`, never evaluated, never sized, never ordered.
- **Invariant**: Has zero effect on any indicator value or trade.

### Warmup bar set (transient)
- **What**: Today's already-elapsed regular-session 5-minute `Bar`s (09:30 → now) at the moment the session starts.
- **Source**: `fetch_intraday_df()` (1m REST, start=09:30) aggregated to 5m.
- **Lifecycle**: Applied once via `SessionState.warmup(bars)` before live streaming begins. Always RTH-only (never includes pre-open bars).
- **Invariant**: After warmup, the session's indicators equal those of a run that processed the same RTH bars bar-by-bar.

## Existing structures reused (unchanged shape)

- `models.Bar` — symbol, timestamp, OHLCV, session_date. Unchanged.
- `live.session_state.SessionState` — `warmup()` (already present) and `append()`. No code change expected.
- `live.journal.LiveJournal.lifecycle(kind, timestamp, trading_day, **ctx)` — reused for new `pre_open` and `warmup` event kinds. No new columns; `kind` is a free-form string today.
- `clock.MarketClock.session_start` — the authority for "before the open".

## Journal events (additions, no schema change)

| Event kind | When | Context fields |
|------------|------|----------------|
| `pre_open` | A 5m bar arrives with ET time < session_start | `timestamp`, `trading_day` (optionally bar count for the day) |
| `warmup` | Session start, after backfill applied | `timestamp`, `trading_day`, `loaded` (N bars) or `reason` (on empty/failed fetch) |

## State transitions (engine bar flow, additive)

```
on_five_minute_bar(bar):
    if bar.et_time < clock.session_start:        # NEW guard
        journal.lifecycle("pre_open", …)
        return                                    # drop — no append, no evaluate
    … existing flow unchanged (append → evaluate → …) …
```

```
session start (run_paper_session_task):
    warmup_bars = aggregate_5m(fetch_intraday_df())   # RTH-only, may be empty
    runner = PaperSessionRunner(…, warmup_bars=warmup_bars)
    # runner applies SessionState.warmup(warmup_bars) before streaming
    journal.lifecycle("warmup", loaded=len(warmup_bars))  # or reason on failure
    await runner.run()
```
