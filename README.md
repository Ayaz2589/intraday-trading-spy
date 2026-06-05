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
- **Features 004–008 (design system, cloud, API, auth)** —
  implemented. Design-system adoption (004); Supabase data layer (005);
  FastAPI service expansion with per-user runs/auth (006); frontend
  auth + API migration (007); soft-delete retention (008, trimmed).
- **Feature 009 (Data foundation)** — implemented, exit gate met.
  Alpaca **SIP** historical source + bulk backfill: **164,918 5-min
  bars, 2018→2026**, all four market regimes 100% covered. See
  `specs/009-data-foundation/`.
- **Feature 010 (Honest backtest)** — implemented, exit gate met.
  Net-of-cost fills (fees + slippage) + real edge metrics (expectancy,
  Sharpe/Sortino, drawdown $/%, distribution, per-bucket, N + Wilson
  95% CI + noise flag). See `specs/010-honest-backtest/`.
- **Feature 011 (Validation engine)** — implemented & merged.
  Train/validation/lockbox split, walk-forward, parameter-sensitivity
  surface, bootstrap + random-entry-permutation significance, and the
  one-shot lockbox gate — backend + UI at `/api/validation/*`. See
  `specs/011-validation-engine/`.
- **Feature 012 (First-class configs)** — implemented. Create /
  duplicate / rename / delete / activate named configs (manager on the
  Strategies page); presets as starting points; a SPY-workable default
  (`max_position_value_pct: 400`) that fixes the 0-trade wall; every
  picker pre-selects the active config so the validation engine has
  real configs to compare. See `specs/012-config-management/` and
  [`docs/research-tooling-uplift.md`](docs/research-tooling-uplift.md).
- **Feature 013 (Data observability)** — implemented. Data-page uplift:
  backfill job history with persistent failure reasons, cache summary +
  no-missing-session verdict, year×month completeness heatmap with
  exact missing-day hover, and a light lineage line. See
  `specs/013-data-observability/`.
- **Feature 014 (Study child-runs + drill-down)** — implemented. Every
  validation-study evaluation (walk-forward window, sensitivity grid
  point, lockbox one-shot) persists as a real, drillable run — trades,
  journal, chart, and significance included. Study detail page
  redesigned with expandable IS/OOS window rows; child runs are hidden
  from the main runs list and badge back to their study; "Re-run
  study" clones any pre-014 study into a drillable one. See
  `specs/014-study-run-persistence/`.

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
make backtest CONFIG=config/presets/aggressive.yaml        # backtest a preset config
make ui-install                                 # one-time: npm install in frontend/
make ui-server                                  # Terminal A: FastAPI on :8000 (PORT=9000 to change)
make ui-dev                                     # Terminal B: Vite dev on :5173
make api-dev                                    # Feature 006: authenticated HTTP API on :8001
make test-api-integration                       # Feature 006: integration tests (needs Docker + Supabase CLI)
```

For the viewer, open http://localhost:5173/ — it lands on the most
recent run with chart, journal, summary, and HelpTooltips.

## Experiments log

Every deliberate config change should be recorded in
[`EXPERIMENTS.md`](./EXPERIMENTS.md) so the research history is
durable. Invoke `/experiment` (see
`.claude/skills/experiment/SKILL.md`) after running a baseline +
experiment pair — it diffs the configs + summaries and appends a
new entry with hypothesis + lesson.

All targets `cd` into `backend/` internally, so the relative paths
in `config.yaml` (`data/raw/…`, `data/backtests/…`) resolve correctly
no matter where you invoke `make` from.

If you'd rather skip the Makefile, the console scripts are
`intraday-trade-spy-backtest` and `intraday-trade-spy-download` (run
`--help` on either).

See `specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md` for full
details.

## Local development with Docker

Run the whole local app in containers — no Python venv or Node install
needed, just Docker. One command brings up the backend API and the
frontend dev server with hot reload:

```bash
make docker-up      # build + start: backend :8001 + frontend :5173 (hot reload)
make docker-down    # stop + remove
```

(or `docker compose up --build` / `docker compose down` directly).

- **Backend** — FastAPI on http://localhost:8001 via `uvicorn --reload`;
  source is bind-mounted, so edits reload automatically.
- **Frontend** — Vite dev server on http://localhost:5173 with HMR;
  `node_modules` lives in a named volume (no host/container clashes).
- Both read the **remote** Supabase project from `backend/.env` and
  `frontend/.env` — copy the `.env.example` files and fill them in first.
  The browser calls the API at `VITE_API_BASE_URL` (default
  `http://localhost:8001`), so no extra wiring is needed.

Run one-off backend commands inside the stack with, e.g.,
`docker compose exec backend intraday-trade-spy-backtest --help`.

This is a **development** stack only. Production builds from
`backend/Dockerfile` (deployed to Fly.io) and the frontend deploys to
Vercel — neither uses `docker-compose.yml`.

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
