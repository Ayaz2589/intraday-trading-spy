# Phase 1 Data Model: Make the Backtest Honest

Additive changes to existing Pydantic models in `backend/src/intraday_trade_spy/models.py` (local) and `storage/models.py` (cloud), plus mirrored TypeScript types in `frontend/src/api/`. New value objects are nested under the summary. **No DB migration** — `runs.summary` is JSONB.

---

## 1. `Position` (models.py) — cost fields

| Field | Type | New? | Notes |
|---|---|---|---|
| `entry_price` | float | — | now slippage-adjusted (`+ slippage_per_share`) |
| `exit_price` | float\|None | — | now slippage-adjusted (`− slippage_per_share`) |
| `gross_pnl` | float\|None | **new** | `(exit_price − entry_price) × quantity` |
| `fees` | float\|None | **new** | `fees_per_share × quantity × 2` |
| `slippage_cost` | float\|None | **new** | `slippage_per_share × quantity × 2` (reporting only; already in prices) |
| `realized_pnl` | float\|None | — | redefined = **net** = `gross_pnl − fees` |
| `realized_r` | float\|None | — | price-based (reflects slippage), unchanged formula |

**Rule**: slippage is always adverse; `entry_price ≥ next_bar.open`, `exit_price ≤ raw exit level`. Asserted by test.

---

## 2. `JournalEntry` (models.py) — cost transparency (VII)

Add the same `gross_pnl`, `fees`, `slippage_cost` fields (all `float | None`, default `None`). `realized_pnl` continues to carry the **net** figure. These flow through `journal/logger.py` and into the CSV export, so a reader can see "gross 120.00 − fees 0.00 − slippage 2.00 = net 118.00".

---

## 3. `SummaryMetrics` (models.py) — new metric fields

Existing fields retained. New (all computed over **net** results):

| Field | Type | Meaning |
|---|---|---|
| `expectancy_r` | float\|None | `(win_rate·avg_win_r) − (loss_rate·\|avg_loss_r\|)` |
| `expectancy_dollars` | float\|None | mean net `$` per trade |
| `total_net_pnl_dollars` | float | sum of net per-trade `$` (== `total_pnl_dollars`, now explicitly net) |
| `total_fees_dollars` | float | sum of fees across trades |
| `total_slippage_dollars` | float | sum of slippage cost across trades |
| `sharpe` | float\|None | daily-return, rf=0, ×√252 |
| `sortino` | float\|None | daily-return downside-deviation, ×√252 |
| `max_drawdown_dollars` | float | peak-to-trough of equity curve, `$` |
| `max_drawdown_pct` | float\|None | peak-to-trough / running peak |
| `return_median_dollars` | float\|None | median net per-trade `$` |
| `return_std_dollars` | float\|None | sample stdev of net per-trade `$` |
| `return_skew` | float\|None | Fisher-Pearson skew (None if n<3) |
| `win_rate_ci_low` | float\|None | Wilson 95% lower bound |
| `win_rate_ci_high` | float\|None | Wilson 95% upper bound |
| `low_confidence` | bool | `total_trades < metrics.low_confidence_trade_count` |
| `equity_curve` | list[EquityPoint] | ordered curve (see §4) |
| `hour_buckets` | list[Bucket] | per hour-of-day (NY) |
| `weekday_buckets` | list[Bucket] | per weekday (NY) |
| `month_buckets` | list[Bucket] | per calendar month 1–12 |

Retained for continuity: `max_drawdown_r`, `profit_factor`, `best_trade_r`, `worst_trade_r`, `average_win_r`, `average_loss_r`, `average_r`, `total_r`, `longest_consecutive_loss_streak`, `rejected_signal_count`, `rejection_breakdown`.

---

## 4. New value objects (nested, frozen `BaseModel`s)

### `EquityPoint`
| Field | Type | Notes |
|---|---|---|
| `timestamp` | AwareDatetime\|None | exit timestamp of the trade; `None` for the seed point |
| `equity` | float | `account_value + cumulative_net_pnl` |
| `cumulative_net_pnl` | float | running sum of net `$` |

Seed: the curve starts with one point at `equity = account_value`, `cumulative_net_pnl = 0`.

### `Bucket`
| Field | Type | Notes |
|---|---|---|
| `key` | str | e.g. `"10"` (hour), `"Tue"` (weekday), `"3"` (month) |
| `trade_count` | int | trades whose entry falls in this bucket |
| `net_pnl_dollars` | float | sum of net `$` in bucket |
| `win_rate` | float\|None | decisive win rate within bucket |
| `expectancy_r` | float\|None | expectancy (R) within bucket |

---

## 5. Cloud `RunSummary` (storage/models.py) + `RunSummaryView` (api/schemas.py)

JSONB body — extend both (view with safe defaults for pre-010 rows):

| Field | Type | Default (view) |
|---|---|---|
| `sharpe` | float | 0.0 (now populated for real) |
| `sortino` | float | 0.0 |
| `expectancy` | float | 0.0 |
| `expectancy_dollars` | Decimal | 0 |
| `max_drawdown` | Decimal | 0 (retained, R or `$`? → set to **`$`** going forward; see note) |
| `max_drawdown_pct` | float | 0.0 |
| `total_fees` | Decimal | 0 |
| `total_slippage` | Decimal | 0 |
| `low_confidence` | bool | false |
| `win_rate_ci_low` / `win_rate_ci_high` | float | 0.0 / 0.0 |

**Note on `max_drawdown`**: today `push.py` maps cloud `max_drawdown` from local `max_drawdown_r`. Going forward it maps from `max_drawdown_dollars` (with `max_drawdown_pct` added as a sibling). Equity curve and per-bucket detail stay in the **local** `summary.json` / legacy `/summary` surface (rich detail for the run-detail view); the cloud summary keeps the scalar headline metrics for cross-run aggregation (Phase 2).

---

## 6. Frontend types (mirror)

- `SummaryMetricsView` (`api/legacy-types.ts`): add every `SummaryMetrics` field above (camel-preserving snake_case as the API already does), including `equity_curve`, `*_buckets`, CI bounds, `low_confidence`.
- `RunSummary` (`api/types.ts`): add `sortino`, `expectancy`, `max_drawdown_pct`, `low_confidence`, CI bounds (it already has `sharpe`).

---

## 7. Config additions (`config.py` + `config.yaml`)

```yaml
broker:
  fees_per_share: 0.0
  slippage_per_share: 0.01      # was 0.0

metrics:                         # NEW block
  trading_days_per_year: 252
  risk_free_rate: 0.0
  win_rate_ci_confidence: 0.95
  low_confidence_trade_count: 30
```

`config.py`: add `MetricsConfig` model + `metrics` field on `Config`. **Delete** `VwapPullbackConfirmationConfig`, its `confirmation` field, and `VwapPullbackConfig.min_minutes_after_open`.

---

## 8. Validation rules

- Slippage adverse-only (entry ≥ raw, exit ≤ raw) — invariant test.
- `net_pnl == gross_pnl − fees` exactly — fixture test.
- All `…|None` metrics are `None` (not `0.0`/`inf`) on degenerate inputs (D8).
- `low_confidence == (total_trades < threshold)`.
- Equity curve length == completed-trade count + 1 (seed).
- Bucket `trade_count` sums (across each dimension) == completed-trade count.
