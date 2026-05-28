# Contract: `summary.json` schema

Single JSON file written per run at `<run-dir>/summary.json`.

## Writer settings

- Encoding: UTF-8, no BOM.
- `json.dumps(..., indent=2, sort_keys=True, ensure_ascii=False)`.
- Trailing newline: yes (POSIX).
- Floats formatted using Python's default repr (round-trippable).

## Schema (JSON Schema-like)

```json
{
  "type": "object",
  "required": [
    "total_trades", "wins", "losses",
    "win_rate", "average_win_r", "average_loss_r", "average_r", "total_r",
    "profit_factor", "max_drawdown_r",
    "best_trade_r", "worst_trade_r",
    "longest_consecutive_loss_streak",
    "rejected_signal_count", "rejection_breakdown"
  ],
  "properties": {
    "total_trades":                    {"type": "integer", "minimum": 0},
    "wins":                            {"type": "integer", "minimum": 0},
    "losses":                          {"type": "integer", "minimum": 0},
    "win_rate":                        {"type": "number",  "minimum": 0.0, "maximum": 1.0},
    "average_win_r":                   {"type": "number"},
    "average_loss_r":                  {"type": "number"},
    "average_r":                       {"type": "number"},
    "total_r":                         {"type": "number"},
    "profit_factor":                   {"type": ["number", "null"]},
    "max_drawdown_r":                  {"type": "number"},
    "best_trade_r":                    {"type": ["number", "null"]},
    "worst_trade_r":                   {"type": ["number", "null"]},
    "longest_consecutive_loss_streak": {"type": "integer", "minimum": 0},
    "rejected_signal_count":           {"type": "integer", "minimum": 0},
    "rejection_breakdown": {
      "type": "object",
      "additionalProperties": {"type": "integer", "minimum": 1},
      "description": "Keys are the snake_case rejection check names from FR-007; values are counts."
    }
  }
}
```

## Field semantics

- `total_trades` counts only `executed` rows in the journal.
- `wins` is the count of `exited` rows with `exit_reason=target`. (For
  v1, "win" is "hit target." This is a v1 simplification; a later
  feature may refine to "exited above entry.")
- `losses` is the count of `exited` rows with `exit_reason=stop`.
  `force_flat` rows are NOT counted as wins OR losses.
- `win_rate` = `wins / total_trades`. When `total_trades` is 0, the
  value is `0.0`.
- `average_win_r` is the mean of `realized_r` over winning trades; `0.0`
  if no wins.
- `average_loss_r` is the mean of `realized_r` over losing trades
  (will be negative); `0.0` if no losses.
- `profit_factor` is `sum(R over wins) / abs(sum(R over losses))`. If
  there are no losses but there ARE wins, it is `null`. If there are
  no trades, it is `null`.
- `max_drawdown_r` is the maximum peak-to-trough drop in cumulative R
  across the chronologically-sorted sequence of executed trades.
- `rejection_breakdown` only includes keys with count ≥ 1.

## Example

```json
{
  "average_loss_r": -1.0,
  "average_r": 0.394,
  "average_win_r": 1.788,
  "best_trade_r": 1.788,
  "longest_consecutive_loss_streak": 1,
  "losses": 1,
  "max_drawdown_r": -1.0,
  "profit_factor": 1.788,
  "rejected_signal_count": 2,
  "rejection_breakdown": {
    "daily_loss_limit_reached": 1,
    "position_already_open": 1
  },
  "total_r": 0.788,
  "total_trades": 2,
  "win_rate": 0.5,
  "wins": 1,
  "worst_trade_r": -1.0
}
```
