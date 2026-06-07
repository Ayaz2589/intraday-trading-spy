# Contract: /api/trade/* (021)

All endpoints require the standard Supabase JWT (existing `deps.py` auth).
All times ISO-8601 with offset; all ET decisions delegate to MarketClock.

## GET /api/trade/state

The cockpit poll — one call returns everything the page header needs.

```jsonc
{
  "session": {                       // null when none running
    "id": "…", "status": "running",
    "entries_paused": false, "pause_reason": null,
    "started_at": "…", "config_name": "default",
    "trading_day": "2026-06-08"
  },
  "market": { "is_open": true, "next_open": "…", "allow_new_trades": true,
              "force_flat_at": "15:55", "data_fresh": true,
              "last_bar_at": "…" },
  "position": {                      // null when flat (broker truth)
    "qty": 12, "avg_entry": 525.10, "stop_loss": 524.20,
    "take_profit": 526.90, "unrealized_pnl": 14.40
  },
  "open_orders": [ { "leg": "stop_loss", "status": "accepted", "qty": 12,
                     "stop_price": 524.20, "broker_order_id": "…" } ],
  "today": { "fills": 3, "trades": 1, "realized_pnl": -12.5 },
  "account": { "broker_equity": 100231.55, "sizing_account_value": 25000.0,
               "reconciled_at": "…", "drift": false }
}
```

## POST /api/trade/automation/start → 201 / 409 / 422

Body: `{}` (uses the active config). Errors: 409 a session is already
running (FR-003); 422 credentials missing / non-paper endpoint detected
(constitution V). Market closed is NOT an error — the session arms
(journaled `armed`) and trades at next open.

## POST /api/trade/automation/stop → 200

Stops new entries immediately; open position continues to its broker-side
exits (FR-006). Response: the final session row.

## POST /api/trade/automation/ack-pause → 200

Operator acknowledges a `reconcile_mismatch` pause; clears
`entries_paused` after a fresh successful reconcile (FR-016).

## POST /api/trade/orders → 201 / 409 / 422

Manual entry (US4). Body:

```jsonc
{ "stop_loss": 524.20, "take_profit": 526.90 }   // entry = market
```

The risk manager sizes (config account_value) and validates exactly like a
strategy signal; rejection → 409 with the rejection_check code, journaled.
Missing stop or target → 422 before any broker call. Long/SPY implied —
anything else is structurally impossible in the schema.

## POST /api/trade/position/close → 200 / 409

Manual close (US4): cancels protective legs, closes the position at
market, journals exit_reason='manual'. 409 if flat.

## GET /api/trade/bars?view=1m|5m|1d|30d&since=<ts> → 200

Chart data with increments:

```jsonc
{ "view": "5m",
  "bars": [ { "t": "…", "o": 0, "h": 0, "l": 0, "c": 0, "v": 0,
              "vwap": 525.01 } ],        // vwap null on 30d view
  "vwap_available": true,                 // false + reason on 30d
  "position_levels": { "entry": 525.10, "stop": 524.20, "target": 526.90 },
  "next_since": "…" }
```

`since` omitted → full view window; provided → only bars after it
(empty list when nothing new). 1m/5m/1d views span the current (or most
recent) session; 30d = `paper.chart_30d_days` of daily bars.

## GET /api/trade/performance → 200

The forward record (US3):

```jsonc
{ "summary": { "trades": 14, "wins": 5, "win_rate": 0.357,
               "expectancy_r": 0.04, "total_r": 0.56,
               "total_gross_pnl": 118.20 },
  "equity_curve": [ { "t": "…", "cum_pnl": 0.0 } ],
  "trades": [ { "trading_day": "…", "entry_time": "…", "exit_time": "…",
                "entry_price": 0, "exit_price": 0, "qty": 0,
                "exit_reason": "target", "realized_r": 2.0,
                "origin": "strategy", "session_id": "…" } ],
  "sessions": [ { "id": "…", "started_at": "…", "status": "stopped",
                  "trades": 9, "total_r": 0.31 } ] }
```

## GET /api/trade/journal?session_id=<id>&since_seq=<n> → 200

Live journal rows (paper_events), ascending seq, incremental via
`since_seq`. Shape mirrors the backtest journal table fields inside
`payload` plus `kind`/`seq`/`timestamp`.

## Engine ↔ broker contract (internal, tested)

- Entry = bracket order (market + take_profit limit + stop_loss stop);
  the protective legs MUST exist at the broker from entry acceptance
  (SC-002). One leg's fill cancels the other (constitution test gate).
- `TradingClient` is constructed with `paper=True` at a single site; a
  guard asserts the paper endpoint and tests prove a live URL is
  unreachable.
- Force-flat: cancel open orders → close position → journal; runs at
  MarketClock.is_force_flat, never later than 15:55 ET (SC-005).
- Every broker rejection becomes a `broker_reject` event with the broker's
  reason (never swallowed).
