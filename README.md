# intraday-trade-spy

A standalone SPY-only intraday trading research, paper-trading, and
learning app.

## Status

- **Feature 001 (Backtest MVP)** — implemented. CLI backtester with
  VWAP-pullback long strategy, risk manager with absolute veto,
  paper broker, journal, and run manifest. See
  `specs/001-backtest-mvp-spy-vwap-pullback/`.
- **Feature 002 (Historical SPY Loader)** — spec/plan/tasks complete;
  implementation pending. yfinance downloader for real SPY 5-minute
  data. See `specs/002-historical-spy-yfinance-loader/`.

## Quickstart

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
python -m intraday_trade_spy.cli.run_backtest --config config/config.yaml
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
