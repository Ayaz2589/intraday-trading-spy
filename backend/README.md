# backend — intraday-trade-spy

## Quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install -e ".[dev]"

# Run the test suite (offline by default; socket-blocker fixture enforces it)
pytest

# Run the opt-in integration test against real yfinance (needs internet)
pytest -m slow

# Run a backtest against the bundled fixture
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml

# Download real SPY 5-minute bars from Yahoo Finance
python -m intraday_trade_spy.cli.download_spy_data \
    --start 2026-04-01 --end 2026-04-15

# Backtest against the downloaded real data
python -m intraday_trade_spy.cli.run_backtest \
    --config config/config.yaml \
    --data data/raw/spy_5m_2026-04-01_2026-04-15.csv
```

Outputs:
- Backtest: `backend/data/backtests/<run-id>/{journal.csv,summary.json,run.yaml}`
- Downloaded data: `backend/data/raw/<csv>` plus `<csv>.fetch.yaml` sidecar manifest

See `../specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` and
`../specs/002-historical-spy-yfinance-loader/quickstart.md` for the
full quickstarts and troubleshooting.
