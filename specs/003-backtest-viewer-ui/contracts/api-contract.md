# API Contract: Backtest Viewer Static Server

Base URL during development: `http://localhost:8000`
Base URL via Vite proxy: `http://localhost:5173/api/*` → forwarded to
the backend.

All responses are JSON with `Content-Type: application/json`. All
endpoints are GET only. No auth.

---

## `GET /api/runs`

**Purpose**: List every backtest run on disk for the sidebar.

**Behavior**: Scans `backend/data/backtests/` for subdirectories.
Skips any subdirectory missing `run.yaml`. Returns an array sorted by
`started_at` descending (newest first).

**Response 200**:

```json
[
  {
    "run_id": "20260528-220714-7697908e",
    "started_at": "2026-05-28T22:07:14.123456+00:00",
    "summary": {
      "total_trades": 4,
      "wins": 1,
      "losses": 2,
      "win_rate": 0.25,
      "total_r": 1.596,
      "average_r": 0.399,
      "max_drawdown_r": -2.0,
      "profit_factor": 1.0,
      "rejected_signal_count": 66,
      "rejection_breakdown": {
        "position_value_exceeds_cap": 38,
        "consecutive_losses_reached": 21,
        "no_new_trades_after": 7
      },
      "best_trade_r": 2.0,
      "worst_trade_r": -1.0,
      "longest_consecutive_loss_streak": 2,
      "average_win_r": 2.0,
      "average_loss_r": -1.0
    }
  }
]
```

**Empty case**: returns `[]`, status 200.

---

## `GET /api/runs/{run_id}/journal`

**Purpose**: Return the run's full journal as JSON for the table.

**Path params**: `run_id` (the run directory name).

**Behavior**: Reads `backend/data/backtests/{run_id}/journal.csv`,
parses each row to a `JournalRowView`. Empty cells become `null`.
Float cells are parsed with the precision the CSV file holds.

**Response 200**: array of `JournalRowView` (see data-model.md).

**Response 404**:

```json
{ "error": "run_not_found", "run_id": "...", "missing": "journal.csv" }
```

Triggered when the run directory or `journal.csv` doesn't exist.

---

## `GET /api/runs/{run_id}/summary`

**Purpose**: Return the run's pre-computed summary metrics.

**Behavior**: Reads `backend/data/backtests/{run_id}/summary.json` and
returns its content unchanged.

**Response 200**: `SummaryMetricsView` (see data-model.md).

**Response 404**: same shape as `/journal`, with `"missing": "summary.json"`.

---

## `GET /api/runs/{run_id}/manifest`

**Purpose**: Return the run's `run.yaml` parsed to JSON for the header
section (run id, started_at, code version, fingerprint) and chart
session-picker (data_fingerprint.earliest/latest_timestamp).

**Behavior**: Reads `backend/data/backtests/{run_id}/run.yaml`, parses
with `yaml.safe_load`, and returns the resulting dict.

**Response 200**: `RunManifestView`.

**Response 404**: same shape as `/journal`, with `"missing": "run.yaml"`.

---

## `GET /api/runs/{run_id}/bars`

**Purpose**: Return the bars CSV the run consumed, parsed to JSON for
the chart.

**Behavior**:
1. Reads `run.yaml` to find `config_snapshot.data.csv_path`.
2. Reads that CSV.
3. Parses each row into a `BarView`.
4. Returns the array.

**Response 200**: array of `BarView`.

**Response 404**:

- If the run id doesn't exist: `{ "error": "run_not_found", ... }`.
- If `run.yaml` exists but the referenced CSV is missing:
  `{ "error": "source_data_missing", "run_id": "...", "expected_path": "..." }`.

The frontend differentiates these two cases via the `error` discriminator.

---

## CORS

The server enables CORS for `http://localhost:5173` (Vite dev server)
only. Production deployment is out of scope.

---

## Exit codes (server process)

| Code | Meaning |
|------|---------|
| `0`  | Server stopped cleanly (SIGINT / SIGTERM). |
| `1`  | Startup failure (port in use, etc.). |

The server is intended to run as a long-lived process; it does not
return exit codes for individual requests.

---

## CLI surface

```bash
intraday-trade-spy-server                # default port 8000
intraday-trade-spy-server --port 9000    # override
intraday-trade-spy-server --help         # show argparse help
```

The console script entry is `intraday-trade-spy-server`. Equivalent
module form: `python -m intraday_trade_spy.api.static_server`.

---

## Performance expectations

- Per-request latency on the largest realistic run (~270 journal rows,
  ~780 bars) MUST be < 200 ms warm.
- The server reads files on every request (no caching). Acceptable for
  v1 scale; revisit if the dataset grows.
