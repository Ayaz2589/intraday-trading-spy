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
- **Feature 003 (Backtest Viewer UI)** — implemented. React + Vite
  + Tailwind + shadcn/ui single-page app at http://localhost:5173/
  with a candlestick chart (VWAP line + opening-range bands), full
  trade journal, summary metrics, rejection breakdown, and a
  HelpTooltip on every concept. Backed by a tiny FastAPI static
  server exposing `/api/runs/*`. See
  `specs/003-backtest-viewer-ui/`.

## Quickstart

The `Makefile` at the project root wraps every common workflow.
Run `make help` for the full target list. The essentials:

```bash
make install                                    # one-time: create venv + install deps
make test                                       # run the offline test suite
make backtest                                   # backtest the bundled synthetic fixture
make demo                                       # backtest with a permissive cap → real trades visible
make download START=2026-04-01 END=2026-04-15   # fetch real SPY data
make backtest-real DATA=spy_5m_2026-04-01_2026-04-15.csv   # backtest the downloaded data
make ui-install                                 # one-time: npm install in frontend/
make ui-server                                  # Terminal A: FastAPI on :8000 (PORT=9000 to change)
make ui-dev                                     # Terminal B: Vite dev on :5173
```

For the viewer, open http://localhost:5173/ — it lands on the most
recent run with chart, journal, summary, and HelpTooltips.

All targets `cd` into `backend/` internally, so the relative paths
in `config.yaml` (`data/raw/…`, `data/backtests/…`) resolve correctly
no matter where you invoke `make` from.

If you'd rather skip the Makefile, the console scripts are
`intraday-trade-spy-backtest` and `intraday-trade-spy-download` (run
`--help` on either).

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
