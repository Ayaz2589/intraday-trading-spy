# API Contract — `/api/replay/*`

All endpoints are authenticated (`Depends(auth_user_id)`) and scoped to the user via
`Depends(get_storage_client)`, mirroring `api/routers/trade.py`. Router prefix `/replay`,
registered under `/api` in `api/app.py`. **No endpoint writes to the database** — all replay
state lives in the in-memory `REPLAY_RUNNING` registry. Responses reuse the live trade JSON
shapes (`TradeState`, `TradeBarsResponse`, `TradePerformance`, `PaperEvent`) so the frontend
reuses its types.

---

### `GET /api/replay/dates`
Replayable session dates (stored bars ∩ XNYS trading days), newest first.

**200**
```json
{ "dates": ["2026-06-05", "2026-06-04", "..."], "earliest": "2018-01-02", "latest": "2026-06-05" }
```

---

### `POST /api/replay/start`
Start a replay of one date under the user's active config. Rejects if a replay is already
active for the user (must stop first — FR-018) or the date isn't covered (FR-002).

**Body**: `{ "date": "2026-06-05", "speed": 60 }`  *(speed optional; defaults to `replay.default_speed`; must be one of `replay.speeds`)*

**201** → `ReplayState` (same shape as `GET /api/replay/state`)
**409** `{ "detail": "a replay is already active; stop it first" }`
**422** `{ "detail": "2026-06-07 has no covered session (weekend/holiday/missing data)" }`

---

### `POST /api/replay/control`
Adjust playback without restarting (FR-005).

**Body**: `{ "action": "play" | "pause" | "speed", "speed": 300 }`  *(`speed` required only when `action="speed"`)*

**200** → `ReplayState`
**404** `{ "detail": "no active replay" }`
**422** invalid action or speed not in `replay.speeds`.

---

### `POST /api/replay/stop`
Stop and discard the active replay (state is dropped from the registry).

**200** → `ReplayState` with `status: "stopped"`
**404** `{ "detail": "no active replay" }`

---

### `GET /api/replay/state`
Current replay snapshot; the page reattaches here on load/refresh.

**200**
```json
{
  "session": { "id": "ab12…", "session_date": "2026-06-05", "status": "playing",
               "speed": 60, "sim_clock": "2026-06-05T11:25:00-04:00",
               "bars_total": 78, "bars_delivered": 23 },
  "market": { "sim_now": "2026-06-05T11:25:00-04:00", "session_open": "…09:30…", "session_close": "…16:00…" },
  "position": { "qty": 47, "avg_entry": 531.20, "stop_loss": 530.10, "take_profit": 533.40,
                "unrealized_pnl": 12.34 } ,
  "today": { "trades": 1, "realized_pnl": 21.50, "realized_r": 0.86 },
  "account": { "sizing_account_value": 25000.0, "equity": 25021.50 }
}
```
`position` is `null` when flat. `session` is `null` when no replay is active (200, not 404, so
the page renders the empty/start state).

---

### `GET /api/replay/bars?since=<iso>`
Bars delivered so far (incremental). `since` is the last `t` the client holds.

**200** (reuses `TradeBarsResponse`)
```json
{ "view": "5m", "bars": [ { "t": "…09:30…", "o": 530.1, "h": 530.8, "l": 529.9, "c": 530.6, "v": 1200000, "vwap": 530.3 } ],
  "vwap_available": true, "vwap_reason": null,
  "position_levels": { "entry": 531.20, "stop": 530.10, "target": 533.40 },
  "next_since": "…11:25…" }
```

---

### `GET /api/replay/journal?since_seq=<int>`
Append-only events since a sequence cursor (reuses `PaperEvent`).

**200** `{ "events": [ { "seq": 12, "trading_day": "2026-06-05", "timestamp": "…11:20…", "kind": "executed", "payload": { "qty": 47, "entry_price": 531.20, "reason": "…" } } ] }`

---

### `GET /api/replay/performance`
Recap metrics + equity curve + per-trade rows (reuses `TradePerformance`).

**200**
```json
{ "summary": { "trades": 2, "win_rate": 0.5, "expectancy_r": 0.31, "total_r": 0.62, "gross_pnl": 41.0 },
  "equity_curve": [ { "t": "…", "equity": 25000.0 } ],
  "trades": [ { "origin": "strategy", "entry_time": "…", "exit_time": "…", "entry_price": 531.2,
                "exit_price": 533.4, "exit_reason": "target", "realized_r": 1.0, "gross_pnl": 41.0 } ] }
```

---

### `POST /api/replay/orders`
Manual buy. Mandatory stop+target; risk-validated; long-only. Fills at the **next** bar's open
(no-look-ahead). Rejected manual orders are journaled (constitution VII).

**Body**: `{ "stop_loss": 530.10, "take_profit": 533.40 }`

**202** `{ "accepted": true, "client_order_id": "manual-…" }`  *(pending fill on next bar)*
**409** `{ "accepted": false, "reason": "position already open" }`
**422** `{ "accepted": false, "reason": "stop_loss required" }`  *(no stop = no trade; journaled)*
**404** `{ "detail": "no active replay" }`

---

### `POST /api/replay/position/close`
Manual flat. Closes the open position at the next bar's open. No-op (409) if flat or over-qty
(long-only — cannot sell what isn't held).

**202** `{ "accepted": true }`
**409** `{ "accepted": false, "reason": "no open position" }`
**404** `{ "detail": "no active replay" }`

---

## Notes
- **No look-ahead** is enforced server-side: an order accepted while bar N is the latest
  delivered can only fill on bar N+1's open; the engine never fills on the bar the user has
  already seen close.
- Every response carries an explicit "this is a historical simulation" marker via the route
  itself; the frontend labels the page unmistakably (FR-016). No brokerage is contacted by any
  endpoint.
