# CLI Contract: `run_backtest`

This document defines the user-facing surface of the backtest CLI. It
is the test target for `tests/test_cli.py` and for the integration
scenario in User Story 1.

## Invocation

```bash
python backend/scripts/run_backtest.py \
    --config backend/config/config.yaml \
    [--data backend/data/raw/spy_5m_sample.csv] \
    [--out backend/data/backtests]
```

Equivalent module form:

```bash
python -m intraday_trade_spy.cli.run_backtest \
    --config config/config.yaml \
    [--data data/raw/spy_5m_sample.csv] \
    [--out data/backtests]
```

## Flags

| Flag | Required? | Default | Meaning |
|------|-----------|---------|---------|
| `--config <path>` | yes | — | Path to the YAML config file. Relative to cwd. |
| `--data <path>` | no | value of `data.csv_path` in config | Override the input CSV path. |
| `--out <dir>` | no | value of `data.output_dir` in config | Override the output base directory. |
| `--quiet` | no | false | Suppress stdout journal/summary; still writes files. |

## Run identity

A run id is generated as `YYYYMMDD-HHMMSS-<short-data-hash>`, where:
- `YYYYMMDD-HHMMSS` is the UTC start time, second-precision.
- `<short-data-hash>` is the first 8 hex chars of the SHA-256 of the
  input CSV.

The run directory is `<out>/<run-id>/`.

## Stdout output (when `--quiet` is not set)

The CLI prints, in order:

1. A one-line "Loaded N bars from `<path>`" message (N = post-filter
   count).
2. A per-trade table of journal rows (formatted human-readable, NOT
   the CSV). Columns: `timestamp`, `status`, `setup`, `entry`,
   `stop`, `target`, `qty`, `risk_$`, `exit`, `realized_$`,
   `realized_R`, `reason`.
3. A summary block headed `=== SUMMARY ===` containing the fields from
   `SummaryMetrics` (see `summary-json-schema.md`).
4. A footer line `Wrote run to <run-dir>`.

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Backtest completed and outputs written. |
| `2` | Config validation failed (FR-001). Stderr names the offending field. |
| `3` | Constitution violation at startup (e.g., `market.symbol` != "SPY"). Stderr cites the principle. |
| `4` | Data load failed (file missing, wrong timezone, etc.). |
| `5` | Internal invariant failure (e.g., out-of-order bars detected). |

## Side effects

The CLI writes the following files into the run directory:

- `journal.csv` — see `journal-csv-schema.md`.
- `summary.json` — see `summary-json-schema.md`.
- `run.yaml` — see `run-yaml-schema.md`.

The CLI does NOT write to stdin or to any path outside the run
directory and the cwd.
