# Verification: Live Paper Trading (021)

## Off-hours e2e (2026-06-07, Sunday — quickstart's off-hours path)

Live stack (Docker :8001), real Supabase, real Alpaca credentials, real
paper account. Sequence executed via authenticated API calls:

| step | result |
|---|---|
| GET /api/trade/state | 200 — `market.is_open: false` (Sunday; clock weekday fix verified live) |
| POST /api/trade/automation/start | 201 — session `9d1c8d5f` `running`, config `default` snapshotted |
| runner + broker construction | REAL Alpaca paper TradingClient constructed; paper-endpoint guard passed (after the enum fix below) |
| GET /api/trade/journal | `session_started` … then `reconcile_mismatch` |
| GET /api/trade/bars?view=1m / 5m | 200 — 0 bars (no Sunday session), vwap_available true |
| GET /api/trade/bars?view=30d | 200 — **22 real daily SPY bars from Alpaca SIP**, vwap_available false with reason |
| GET /api/trade/performance | 200 — empty forward record, well-formed summary |
| POST /api/trade/automation/stop | 200 — `stopped`; journal shows `session_stopped` |

**The `reconcile_mismatch` event is the drift detection WORKING**: the
operator's paper account holds a pre-existing position the app did not
open; the engine paused entries and journaled within one reconcile cycle
(FR-016/SC-007 behavior observed live).

## Live-found bugs, fixed TDD during verification

1. **Paper guard rejected the real paper client** — alpaca-py stores
   `_base_url` as the `BaseURL.TRADING_PAPER` enum (str() ==
   `"BaseURL.TRADING_PAPER"`), not a URL string; the guard's substring
   check missed it. Fixed: normalize via `.value` + case-insensitive
   (failing test `test_real_alpaca_enum_base_url_is_recognized_as_paper`
   first). The crash happened FAIL-SOFT exactly as designed: the session
   was marked `interrupted` with the reason — never a phantom 'running'.
2. **`MarketClock.is_market_open` was true on a Sunday** — it only checked
   time-of-day (fine for backtests where bars only exist on trading days;
   wrong for a live loop asking about NOW). Fixed: weekday check
   (failing test `test_market_is_closed_on_weekends` first). Holidays are
   intentionally not modeled: on a holiday the loop sees no data and the
   stale-data pause covers it, journaled.

## Suites

- Backend: **932 passed** (offline, `-m "not slow and not integration"`).
- Frontend: **755 passed**, 4 failed = the pre-existing 3 price-chart
  baseline + the help-tooltip coverage load-timeout flake (passes in
  isolation — verified twice this session).
- Ruff clean on all files added/changed by this feature.
- Migration `0129_paper_trading.sql` applied to live Supabase.

## Deferred to the next market session (live-fire)

SC-001/004/005/008 need real market hours: first qualifying setup →
bracket order placed; stop blocks entries mid-session; force-flat by
15:55; unattended full day. The off-hours path proves the wiring;
live-fire proves the behavior. Run during the next session and append
results here.
