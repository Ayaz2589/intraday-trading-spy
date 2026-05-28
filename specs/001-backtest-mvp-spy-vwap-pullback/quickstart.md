# Quickstart: Backtest MVP — SPY VWAP Pullback

A developer with a fresh clone should be able to follow this in under
five minutes (success criterion SC-001).

## Prerequisites

- Python 3.11 or newer (`python --version`).
- A shell on macOS or Linux. Windows is untested for v1.
- Git (optional, but `run.yaml`'s `code_version` field will read
  `"unversioned"` without it).

## 1. Install backend dependencies

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"
```

This installs `intraday_trade_spy` in editable mode along with
development tools (pytest, pytest-cov, ruff, freezegun).

## 2. Run the test suite

```bash
pytest
```

Expected: all tests green. Coverage of `strategy/` and `risk/` should be
100% (spec SC-002).

## 3. Run a backtest against the bundled fixture

```bash
python -m intraday_trade_spy.cli.run_backtest \
    --config config/config.yaml
```

Or, equivalently, via the script entry point:

```bash
python scripts/run_backtest.py --config config/config.yaml
```

You should see:

1. A line like `Loaded 234 bars from data/raw/spy_5m_sample.csv`.
2. A per-trade table of emitted / approved / rejected / executed /
   exited rows.
3. A summary block under `=== SUMMARY ===` listing total trades, win
   rate, average R, total R, profit factor, and max drawdown.
4. A footer `Wrote run to data/backtests/<run-id>/`.

## 4. Inspect the run outputs

```bash
ls data/backtests/
# <run-id>/
ls data/backtests/<run-id>/
# journal.csv  run.yaml  summary.json
```

Open `journal.csv` to confirm every executed trade has an entry row
followed by an exit row, and every rejected signal has its
`rejection_check` populated. Open `summary.json` to see the run's
aggregate metrics. Open `run.yaml` to see the resolved config and the
input CSV's fingerprint.

## 5. Verify reproducibility

```bash
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml
# Compare the two newest journal.csv files
diff data/backtests/<first-run-id>/journal.csv \
     data/backtests/<second-run-id>/journal.csv
```

Expected: empty diff (spec FR-015, SC-003).

## 6. Try changing one config value

Edit `config/config.yaml` and change
`risk.max_risk_per_trade_pct` from `1.0` to `0.5`. Re-run the
backtest. The new `journal.csv` should show position sizes halved and
may show different rejection / execution rows compared to the previous
run (spec acceptance scenario US3-1).

## Troubleshooting

- **`ConfigValidationError: symbol must be 'SPY'`** — Someone edited
  `market.symbol` in config to a non-SPY value. Restore to `SPY`.
  Constitution principle I forbids other symbols in v1.
- **`ConfigValidationError: live_auto_enabled must be False`** — Same
  shape: constitution principle V keeps live trading off by default.
- **`OutOfOrderBarsError`** — The input CSV's bars are not strictly
  ascending in timestamp. Re-sort the CSV or regenerate it.
- **No `journal.csv` written** — Check exit code; a non-zero exit
  before write means a failure earlier (config / data / startup).
  Stderr will name the failure.
