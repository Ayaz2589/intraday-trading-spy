# Contract: Backtest Summary (local artifact + API + cloud)

This feature extends three representations of a run summary. All changes are **additive**; legacy consumers keep working via defaults. No DB migration (`runs.summary` is JSONB).

---

## 1. Local artifact — `summary.json`

Produced by `compute_summary()` → serialized `SummaryMetrics`. New keys (over the existing `total_trades`, `win_rate`, `total_pnl_dollars`, `max_drawdown_r`, …):

```jsonc
{
  // ... existing fields ...
  "total_pnl_dollars": 118.00,         // now NET of costs
  "total_net_pnl_dollars": 118.00,
  "total_fees_dollars": 0.00,
  "total_slippage_dollars": 2.00,
  "expectancy_r": 0.18,
  "expectancy_dollars": 1.96,
  "sharpe": 1.12,                       // daily-return, rf=0, x sqrt(252)
  "sortino": 1.54,
  "max_drawdown_dollars": 340.00,
  "max_drawdown_pct": 0.0136,
  "max_drawdown_r": 2.0,                // retained
  "return_median_dollars": 1.50,
  "return_std_dollars": 22.4,
  "return_skew": -0.3,
  "win_rate_ci_low": 0.41,
  "win_rate_ci_high": 0.59,
  "low_confidence": false,
  "equity_curve": [
    { "timestamp": null,                 "equity": 25000.0, "cumulative_net_pnl": 0.0 },
    { "timestamp": "2022-03-01T14:35:00Z","equity": 25118.0, "cumulative_net_pnl": 118.0 }
  ],
  "hour_buckets":    [ { "key": "10", "trade_count": 812, "net_pnl_dollars": 940.0, "win_rate": 0.46, "expectancy_r": 0.21 } ],
  "weekday_buckets": [ { "key": "Tue", "trade_count": 790, "net_pnl_dollars": -120.0, "win_rate": 0.39, "expectancy_r": -0.05 } ],
  "month_buckets":   [ { "key": "3",  "trade_count": 333, "net_pnl_dollars": 410.0, "win_rate": 0.48, "expectancy_r": 0.22 } ]
}
```

Degenerate inputs: nullable metrics emit `null` (not `0`/`inf`). `equity_curve` always has ≥1 point (seed at `account_value`).

---

## 2. HTTP API — `GET /api/runs/{id}/summary`

Returns `SummaryMetricsView` (legacy surface consumed by `summary-metrics-card.tsx`). Same additive fields as §1. Backwards-compatible: a pre-010 run missing the new keys deserializes with `null`/`0`/`[]` defaults, and the card renders "—" with an explanatory tooltip.

`GET /api/runs/{id}` → `RunView.summary` (cloud `RunSummaryView`): scalar headline metrics only — adds `sortino`, `expectancy`, `expectancy_dollars`, `max_drawdown_pct`, `total_fees`, `total_slippage`, `low_confidence`, `win_rate_ci_low/high`; `sharpe` now populated; `max_drawdown` now carries `$` (was R).

---

## 3. Cloud persistence — `runs.summary` JSONB (`RunSummary`)

`push.py` maps local `summary.json` → cloud `RunSummary`. Changes:
- `sharpe`: was hardcoded `0.0` → now `summary_data["sharpe"]`.
- `max_drawdown`: was `max_drawdown_r` → now `max_drawdown_dollars`.
- add `sortino`, `expectancy`, `expectancy_dollars`, `max_drawdown_pct`, `total_fees`, `total_slippage`, `low_confidence`, `win_rate_ci_low/high`.

No schema change (JSONB). Existing rows remain valid; reads use view defaults.

---

## 4. Contract tests (TDD gates)

| Test | Asserts |
|---|---|
| `test_paper_broker_applies_slippage` | entry/exit fills moved adversely by `slippage_per_share` |
| `test_paper_broker_applies_fees` | `realized_pnl == gross − fees`, `fees == fee_ps × qty × 2` |
| `test_cost_fixture_exact_net_pnl` | committed fixture reproduces exact net PnL + total cost (SC-002) |
| `test_zero_vs_nonzero_cost_gap` | net total = zero-cost total − total modeled cost (SC-001) |
| `test_force_flat_incurs_costs` | force-flat exit is also net of costs |
| `test_metrics_expectancy/sharpe/sortino/dd/dist/buckets/ci` | each metric matches hand-computed fixture value |
| `test_metrics_degenerate_inputs` | 0/1-trade & all-win/all-loss → `None`, no exception |
| `test_summary_json_roundtrip` | new fields serialize/deserialize; legacy row defaults |
| `test_dead_knobs_removed` | config rejects/ignores removed knobs; identical backtest pre/post removal |
| `summary-metrics-card.test.tsx` | new Stat cells + HelpTooltips render; noise flag shows for low N |
| `per-bucket-card.test.tsx`, `equity-curve.test.tsx` | render from mock summary |
