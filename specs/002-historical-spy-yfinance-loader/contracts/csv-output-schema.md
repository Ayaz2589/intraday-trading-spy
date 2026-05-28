# Contract: Output CSV schema

The CSV written by this feature MUST be consumable by Feature 001's
`data/loader.py::load_bars()` with zero modifications (spec FR-014).

## Reference

See Feature 001's `contracts/journal-csv-schema.md` for the writer
settings convention. This file documents only the differences and
the bar-specific columns.

## Writer settings

- Encoding: UTF-8, no BOM.
- Line terminator: `\n` (LF only).
- Quoting: `csv.QUOTE_MINIMAL`.
- Delimiter: `,`.
- Header: present, exactly the column order below.

## Columns (exact order, exactly 7)

| # | Column | Type | Format |
|---|--------|------|--------|
| 1 | `symbol` | str | always `"SPY"` |
| 2 | `timestamp` | datetime | ISO 8601 with ET offset, e.g. `2026-05-28T09:30:00-04:00` |
| 3 | `open` | float | `{:.4f}` |
| 4 | `high` | float | `{:.4f}` |
| 5 | `low` | float | `{:.4f}` |
| 6 | `close` | float | `{:.4f}` |
| 7 | `volume` | int | decimal |

## Differences from Feature 001's journal.csv

- No `row_seq` column — this is raw market data, not a journal.
- No `status`, `setup`, `direction`, or any signal/risk fields.
- All rows are bars; no rejection or lockout rows.

## Sort order

Rows are sorted ascending by `timestamp`. Duplicate timestamps are
dropped (keep first occurrence).

## Row count invariant

- Number of rows MUST equal the manifest's `bar_count`.
- All rows MUST fall inside the regular session window
  (09:30–16:00 ET, half-open at 16:00).
- All rows' `volume` MUST be > 0 (NaN and zero-volume rows are
  dropped before write per FR-011).

## Example

```csv
symbol,timestamp,open,high,low,close,volume
SPY,2026-04-01T09:30:00-04:00,524.1200,524.4500,523.8900,524.2300,1843299
SPY,2026-04-01T09:35:00-04:00,524.2300,524.6800,524.1100,524.5500,981244
...
```
