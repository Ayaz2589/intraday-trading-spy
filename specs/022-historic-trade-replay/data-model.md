# Phase 1 Data Model — Historic Trade Replay

**No database tables, no migration.** Every entity below is an **in-memory** structure that
lives for the duration of an active replay inside the `REPLAY_RUNNING` registry. Domain types
are **reused verbatim** from `backend/src/intraday_trade_spy/models.py` and friends.

## Reused domain models (unchanged)

| Type | Source | Used for |
|------|--------|----------|
| `Bar` | `models.py:25` | replayed 5-minute bars (`symbol="SPY"`, `timestamp`, OHLC, `volume`, `session_date`) |
| `IndicatorSnapshot` | `models.py:43` | per-bar VWAP / opening-range for chart + strategy |
| `Signal` / `WindowSkip` | `models.py:54,66` | strategy output (tri-state) |
| `RiskDecision` | `models.py:86` | risk verdict + sized quantity |
| `TradePlan` | `models.py:94` | approved signal + quantity handed to the broker |
| `Position` | `models.py:101` | open/closed position incl. cost-transparency fields (`gross_pnl`, `fees`, `slippage_cost`, `realized_r`, `same_bar_tiebreak`) |
| `RiskState` | `risk/state.py:7` | per-day risk counters (account_value, trades_taken_today, …) |
| `Config` | `config.py` | active named config (account_value, risk knobs, strategy knobs, entry_window, market times) |

## New in-memory entities

### ReplaySession (`replay/session.py`)
The full state of one replay. Pydantic model (frozen=False — it mutates as the replay runs).

| Field | Type | Notes |
|-------|------|-------|
| `id` | `str` (uuid4 hex) | identifies the replay in the registry & journal |
| `user_id` | `str` | owner; one active replay per user |
| `session_date` | `date` | the replayed market day |
| `config_snapshot` | `dict` | the active config captured at start (comparability) |
| `status` | `Literal["playing","paused","completed","stopped"]` | `armed` is a *derived UI* state (created but clock at open), never stored — mirrors the 021 decision |
| `speed` | `int` | simulated market-seconds per real second (from `replay.speeds`) |
| `sim_clock` | `datetime` (ET) | current simulated time; starts at session open |
| `bars_total` | `int` | count of session bars (for progress) |
| `bars_delivered` | `int` | bars emitted to the engine so far |
| `risk_state` | `RiskState` | live risk counters for the day |
| `open_position` | `Position \| None` | current simulated position |
| `trades` | `list[Position]` | closed round-trips (for performance/recap) |
| `events` | `list[ReplayEvent]` | append-only journal (see below) |
| `created_at` | `datetime` | wall-clock start |

**Lifecycle / state transitions**:
`(create)` → `playing` ⇄ `paused` (user control) → `completed` (sim_clock reaches session
close) **or** `stopped` (user stops). Backend restart drops the registry entry entirely
(interrupted; never silently resumed — FR-020). No transition ever writes to the DB.

**Invariants**:
- At most one `ReplaySession` per `user_id` in `REPLAY_RUNNING` (one active replay — FR-018).
- `open_position` is `None` unless an entry has filled and not yet exited.
- Bars are delivered strictly in ascending `timestamp` order; `bars_delivered ≤ bars_total`.

### ReplayEvent (`replay/journal.py`)
Append-only journal record, shaped **identically** to the live `PaperEvent` so the frontend
`LiveJournalTable` consumes it unchanged.

| Field | Type | Notes |
|-------|------|-------|
| `seq` | `int` | monotonically increasing within the replay |
| `trading_day` | `date` | the session date |
| `timestamp` | `datetime` (ET) | **simulated** time of the event |
| `kind` | `str` | signal kinds: `emitted`/`approved`/`rejected`/`executed`/`exited`/`force_flat`/`skipped_window`; lifecycle kinds: `session_started`/`day_rolled`/`replay_completed` |
| `payload` | `dict` | full context: prices, indicator values at signal time, reason string, qty, R, P&L impact (constitution VII) |

### SimulatedOrder / fill (transient)
Not a persisted entity — represented by the reused `TradePlan` → `Position` flow through
`broker/paper.py`. Each manual or automated entry becomes a `TradePlan`; the broker returns a
`Position`; bracket exits and force-flat mutate it to a closed `Position` appended to
`trades`. `origin` (`"strategy"` | `"manual"`) is carried in the event payload and on the
recap row.

## Reused queries (read-only, no writes)

| Function | Source | Purpose |
|----------|--------|---------|
| `list_bars(range_start, range_end)` | `storage/client.py:777` | load the chosen day's bars |
| `bars_present_session_dates(range_start, range_end)` | `storage/client.py:974` | dates with stored bars |
| `expected_session_dates(start, end)` | `data/market_calendar.py:23` | XNYS trading days |
| `get_active_config()` | `storage/client.py:481` | the config the replay runs under |

## Config additions (`backend/config/config.yaml`)

```yaml
replay:
  speeds: [1, 10, 30, 60, 300, 600, 1800, 3600]   # sim market-seconds per real second (1s…1hr)
  default_speed: 60                                  # 1m label — brisk but watchable
```
These are UI-presentation values (not risk/market thresholds); kept in config to honor the
"no hardcoded magic numbers" standard.
