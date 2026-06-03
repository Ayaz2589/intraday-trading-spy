# Quickstart: Make the Backtest Honest

How to run and verify Phase 1 once implemented. Assumes the Phase 0 SIP dataset is in place.

## 1. Run a net-of-cost backtest

```bash
cd backend
# Default config now ships fees=$0.00/share, slippage=$0.01/share
python -m intraday_trade_spy.cli backtest --config config/config.yaml
```

Open the run in the UI (`run-viewer`). The **Summary Metrics** card now shows: net PnL, expectancy (R and $), Sharpe, Sortino, max drawdown ($ and %), return distribution, sample size N with a 95% win-rate CI, and a "noise" badge when N < 30. The **Per-Bucket** card shows hour/weekday/month performance; an **Equity Curve** sparkline shows account equity over the trade sequence. Every new label has a `?` tooltip.

## 2. Prove costs are applied (the exit-gate fixture)

```bash
cd backend
pytest tests -k cost_fixture -q          # SC-002: exact net PnL on a known fixture
pytest tests -k "zero_vs_nonzero" -q     # SC-001: net = zero-cost − total modeled cost
```

Manual sanity check — run the same data with costs off vs on:

```bash
python -m intraday_trade_spy.cli backtest --config config/config.yaml \
  --set broker.slippage_per_share=0.0 --set broker.fees_per_share=0.0   # zero-cost baseline
```

The non-zero run's total PnL must be strictly lower, and the gap must equal the total modeled cost.

## 3. Verify metric correctness

```bash
pytest tests -k "metrics" -q             # expectancy, Sharpe, Sortino, DD $/%, distribution, buckets, CI
pytest tests -k "degenerate" -q          # 0/1-trade & all-win/all-loss -> None, no crash
```

## 4. Verify dead-knob removal

```bash
pytest tests -k "dead_knobs" -q          # config no longer carries the 3 knobs; identical result pre/post
grep -rn "min_minutes_after_open\|require_close_above" backend/src backend/config   # expect: no hits
```

## 5. Frontend checks

```bash
cd frontend
npm test -- summary-metrics-card per-bucket-card equity-curve help
```

## Exit-gate checklist (maps to spec Success Criteria)

- [ ] SC-001/002: net-of-cost, fixture proves exact deduction
- [ ] SC-003: expectancy, Sharpe, Sortino, DD $/%, distribution, equity curve, per-bucket all present & correct
- [ ] SC-004: N + 95% CI shown; N<30 flagged; large N not flagged
- [ ] SC-005: zero parsed-but-ignored knobs remain
- [ ] SC-006: every new concept has a HelpTooltip
- [ ] SC-007: default run is net-of-cost with no manual config change
