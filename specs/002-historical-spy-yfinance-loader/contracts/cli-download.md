# CLI Contract: `download_spy_data`

The user-facing surface of the historical-data CLI. Test target for
`tests/test_download_cli.py`.

## Invocation

```bash
python backend/scripts/download_spy_data.py \
    --start 2026-04-01 \
    --end 2026-05-28 \
    [--timeframe 5m] \
    [--out backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv] \
    [--force] \
    [--no-progress]
```

Equivalent module form:

```bash
python -m intraday_trade_spy.cli.download_spy_data \
    --start 2026-04-01 \
    --end 2026-05-28
```

## Flags

| Flag | Required? | Default | Meaning |
|------|-----------|---------|---------|
| `--start <YYYY-MM-DD>` | yes | — | First session to fetch (inclusive). |
| `--end <YYYY-MM-DD>` | yes | — | Last session to fetch (inclusive). |
| `--timeframe <tf>` | no | `5m` | Bar interval. Allowed: `5m`, `1m`. |
| `--out <path>` | no | `backend/data/raw/spy_{tf}_{start}_{end}.csv` | Output CSV path. |
| `--force` | no | false | Overwrite output if it exists. |
| `--no-progress` | no | false | Suppress per-chunk progress lines. |

**Absent on purpose**: `--symbol`, `--ticker`, `--instrument`,
`--source`. Constitution principle I locks symbol to SPY; data source
is fixed to yfinance for this feature.

## Stdout output

When `--no-progress` is NOT set:

1. `Resolved range: <start> → <end> (<timeframe>)`
2. For each chunk (only printed if more than one chunk):
   `Fetching chunk <i>/<n>: <chunk_start> → <chunk_end> ...`
3. `Dropped <N> rows with NaN/zero volume.` (if N > 0)
4. `Wrote <bar_count> bars to <out>` and
   `Wrote manifest to <out>.fetch.yaml`.

When `--no-progress` IS set, only line 4 is printed (and any error).

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Success. CSV and manifest written. |
| `2` | Argument validation failed (bad date format, start > end, future date, range > 730 days, output exists w/o --force). Error printed to stderr. |
| `3` | Constitution-related rejection (e.g., a future maintainer added a `--symbol` flag with a non-SPY value). Error names principle I. |
| `4` | yfinance returned zero rows. Stderr names the requested range. |
| `5` | yfinance returned a 429 after retry, or any other yfinance exception not classified above. |

## Side effects

- Writes one CSV file at `--out`.
- Writes one YAML manifest at `<--out>.fetch.yaml`.
- Reads from yfinance (network). Does NOT read from disk other than
  the existence-check on `--out`.

## Compatibility

The output CSV's column order, datatypes, and timestamp format are
identical to Feature 001's `data/loader.py` contract. Specifically:

| Column | Type | Format |
|--------|------|--------|
| `symbol` | str | always `"SPY"` |
| `timestamp` | datetime | ISO 8601 with ET offset, e.g. `2026-05-28T09:30:00-04:00` |
| `open` | float | `{:.4f}` |
| `high` | float | `{:.4f}` |
| `low` | float | `{:.4f}` |
| `close` | float | `{:.4f}` |
| `volume` | int | decimal |
