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

## Cloud-persisted backtests (Feature 005)

The CLI can push each backtest run to a Supabase Postgres database for
multi-user, durable research history. Setup is documented in detail at
[`../specs/005-supabase-data-layer/quickstart.md`](../specs/005-supabase-data-layer/quickstart.md).

Quick reference:

```bash
# One-time: install the Supabase CLI
brew install supabase/tap/supabase    # macOS
# or
npm install -g supabase

# One-time: link this repo to your Supabase project
cd backend
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>

# One-time: apply migrations to your project
supabase db push

# Copy .env.example to .env and fill in real values
cp .env.example .env
# edit .env — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID

# Push a backtest run to the cloud (loads .env automatically with direnv or
# `set -a; source .env; set +a`)
intraday-trade-spy-backtest --push-to-supabase

# Or via the Makefile shortcut from the repo root
make backtest PUSH=1
```

Integration tests against a local Supabase (requires Docker):

```bash
# From backend/
make test-integration
```

Without the flag, the CLI's existing local-only behavior is unchanged.
