# intraday-trade-spy

A standalone SPY-only intraday trading research, paper-trading, and
learning app.

## Status

- **Feature 001 (Backtest MVP)** — implemented. CLI backtester with
  VWAP-pullback long strategy, risk manager with absolute veto,
  paper broker, journal, and run manifest. See
  `specs/001-backtest-mvp-spy-vwap-pullback/`.
- **Feature 002 (Historical SPY Loader)** — implemented. yfinance
  downloader CLI that fetches real SPY 5-minute bars, chunks
  >60-day ranges transparently, writes a CSV consumable by
  Feature 001's loader plus a fetch-manifest sidecar. See
  `specs/002-historical-spy-yfinance-loader/`.

## Quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Backtest against the synthetic fixture (offline)
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml

# Or: download real SPY data, then backtest it
python -m intraday_trade_spy.cli.download_spy_data --start 2026-04-01 --end 2026-04-15
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml \
    --data data/raw/spy_5m_2026-04-01_2026-04-15.csv
```

See `specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` for full
details.

## Constitution

`.specify/memory/constitution.md` defines the seven governing
principles. Five are NON-NEGOTIABLE: SPY-only, long-only and
rule-based, risk manager has absolute veto, test-first everywhere,
paper-first with live trading disabled by default.

## Architecture

```
Strategy suggests → Risk manager approves/rejects → Broker executes only approved trades → Journal logs everything.
```

Every magic number lives in `backend/config/config.yaml`. Every
strategy / risk / broker / backtest change starts with a failing
test.
