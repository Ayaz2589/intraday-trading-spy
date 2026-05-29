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

# Serve the on-disk runs to the frontend viewer
python -m intraday_trade_spy.api.static_server --port 8000
# (or `intraday-trade-spy-server` if installed via the console scripts)
```

Outputs:
- Backtest: `backend/data/backtests/<run-id>/{journal.csv,summary.json,run.yaml}`
- Downloaded data: `backend/data/raw/<csv>` plus `<csv>.fetch.yaml` sidecar manifest

The static API server (`api/static_server.py`) is a tiny FastAPI app
exposing `/api/runs`, `/api/runs/{id}/journal`, `/api/runs/{id}/summary`,
`/api/runs/{id}/manifest`, and `/api/runs/{id}/bars` for the Backtest
Viewer at `../frontend/` (Feature 003). Run it via
`make ui-server` from the project root.

See `../specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md`,
`../specs/002-historical-spy-yfinance-loader/quickstart.md`, and
`../specs/003-backtest-viewer-ui/quickstart.md` for full quickstarts
and troubleshooting.
