# Quickstart: Backtest Viewer UI

Assumes Features 001 and 002 are installed (you have a Python venv at
`backend/.venv` and at least one backtest run sitting in
`backend/data/backtests/`).

## 1. Install Node.js dependencies (one-time, ~30s)

```bash
make ui-install
```

This runs `npm install` inside `frontend/`. Requires Node.js ≥20.

## 2. Run the API server (terminal A)

```bash
make ui-server
# → Uvicorn running on http://0.0.0.0:8000
```

The server serves the on-disk runs over HTTP. It scans
`backend/data/backtests/` on every `/api/runs` request, so you don't
need to restart it after running new backtests.

## 3. Run the Vite dev server (terminal B)

```bash
make ui-dev
# → VITE v6 ready in NNN ms
# → Local: http://localhost:5173/
```

The Vite dev server proxies `/api/*` requests to `http://localhost:8000`
via the proxy configured in `vite.config.ts`.

## 4. Open the browser

```bash
open http://localhost:5173/   # macOS; or xdg-open on Linux
```

You should see:

- A sidebar listing every backtest run, sorted newest first.
- The newest run's header (run id, started_at, code version, data fingerprint).
- Summary metrics card (total trades, wins/losses, win rate, total R, etc.).
- Journal table with every row from `journal.csv`.
- Rejection breakdown card grouping rejections by `rejection_check`.
- (P2) A candlestick chart with VWAP line + opening-range bands.
- (P3) Entry / exit markers on the chart for executed trades.
- (P4) `?` icons next to every concept; hover to read.

## 5. Generate a new run and refresh

```bash
# In a third terminal
make backtest
```

Refresh the browser. The new run appears in the sidebar at the top.
(There's no live update — refresh is required for now.)

## 6. Run the tests

```bash
make test                # offline backend suite
cd frontend && npm test  # Vitest suite
```

Both should run in under 10 seconds combined.

## 7. Typecheck + lint the frontend

```bash
cd frontend
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
```

Both MUST pass with zero errors before any commit.

## 8. Production build

```bash
make ui-build
# → frontend/dist/index.html + assets
```

Static bundle ready for deployment. Production deployment itself is
out of scope for this feature.

## Troubleshooting

- **`http://localhost:8000/api/runs` returns []`** — no runs exist
  yet. Run `make backtest` to generate one.
- **`make ui-dev` fails with "Cannot find module"** — you forgot
  `make ui-install`.
- **Browser shows "Failed to fetch /api/runs"** — the API server
  isn't running. Start it with `make ui-server` in another terminal.
- **Browser console shows CORS errors** — the proxy isn't kicking
  in. Confirm Vite is on 5173 and the API is on 8000.
- **Chart blank** — bars CSV referenced by `run.yaml::config_snapshot.data.csv_path`
  is missing. Sidecar error appears in place of the chart.
