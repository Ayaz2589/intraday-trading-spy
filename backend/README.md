# backend — intraday-trade-spy

## Quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"

# Run the test suite
pytest

# Run a backtest against the bundled fixture
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml

# Outputs land at backend/data/backtests/<run-id>/{journal.csv,summary.json,run.yaml}
```

See `../specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` for
the full quickstart and troubleshooting.
