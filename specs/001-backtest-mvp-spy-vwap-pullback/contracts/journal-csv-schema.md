# Contract: `journal.csv` schema

Single CSV file written per run at
`<run-dir>/journal.csv`. The byte-identical reproducibility property
(spec FR-015) depends on every detail in this document being honored
exactly.

## Writer settings

- Encoding: UTF-8, no BOM.
- Line terminator: `\n` (LF only). Never `\r\n`.
- Quoting: `csv.QUOTE_MINIMAL`.
- Delimiter: `,`.
- Header: present, exactly the column order below.

## Sort order

Rows are sorted before write by the composite key
`(timestamp_iso, status_priority, row_seq)` where `status_priority` is:

| `status` | priority |
|---|---|
| `emitted` | 0 |
| `approved` | 1 |
| `rejected` | 1 |
| `executed` | 2 |
| `exited` | 3 |
| `force_flat` | 3 |
| `lockout` | 4 |

`row_seq` is the integer insertion order assigned by the journal
logger.

## Columns (exact order)

| # | Column | Type | Format | Null serialization |
|---|--------|------|--------|---------------------|
| 1 | `row_seq` | int | decimal | — |
| 2 | `timestamp` | datetime | ISO 8601 with ET offset, e.g. `2026-05-28T10:15:00-04:00` | — |
| 3 | `status` | enum | one of `emitted`, `approved`, `rejected`, `executed`, `exited`, `force_flat`, `lockout` | — |
| 4 | `setup` | str | e.g., `vwap_pullback_long` | empty |
| 5 | `direction` | enum | `long` | empty |
| 6 | `planned_entry` | float | `{:.4f}` | empty |
| 7 | `stop_loss` | float | `{:.4f}` | empty |
| 8 | `take_profit` | float | `{:.4f}` | empty |
| 9 | `quantity` | int | decimal | empty |
| 10 | `planned_risk_dollars` | float | `{:.2f}` | empty |
| 11 | `actual_entry` | float | `{:.4f}` | empty |
| 12 | `actual_exit` | float | `{:.4f}` | empty |
| 13 | `exit_reason` | enum | `stop`, `target`, `force_flat` | empty |
| 14 | `realized_pnl` | float | `{:.2f}` | empty |
| 15 | `realized_r` | float | `{:.3f}` | empty |
| 16 | `vwap` | float | `{:.4f}` | empty |
| 17 | `or_high` | float | `{:.4f}` | empty |
| 18 | `or_low` | float | `{:.4f}` | empty |
| 19 | `distance_from_vwap_pct` | float | `{:.4f}` | empty |
| 20 | `prior_bar_close` | float | `{:.4f}` | empty |
| 21 | `reason` | str | human-readable, comma-safe (auto-quoted by csv) | required |
| 22 | `rejection_check` | str | one of the FR-007 check names (snake_case) | empty |
| 23 | `same_bar_tiebreak` | enum | `none`, `stop_first` | empty |

## Cross-field invariants

- `status=emitted` rows MUST populate columns 4–8 and 16–21.
- `status=approved` / `status=rejected` rows MUST populate columns
  4–10 and 16–21. `status=rejected` rows MUST also populate column 22.
- `status=executed` rows MUST populate columns 4–11 and 16–21.
- `status=exited` rows MUST populate columns 4–10, 12–15, and 21–23.
- `status=force_flat` rows MUST populate columns 4–10, 12–15 (with
  `exit_reason=force_flat`), and 21.
- `status=lockout` rows MUST populate columns 21 only (plus the
  identifying columns 1–3).

## Example rows

```csv
row_seq,timestamp,status,setup,direction,planned_entry,stop_loss,take_profit,quantity,planned_risk_dollars,actual_entry,actual_exit,exit_reason,realized_pnl,realized_r,vwap,or_high,or_low,distance_from_vwap_pct,prior_bar_close,reason,rejection_check,same_bar_tiebreak
0,2026-05-28T09:45:00-04:00,lockout,,,,,,,,,,,,,,,,,,Daily loss limit not reached; state initialized,,
1,2026-05-28T10:15:00-04:00,emitted,vwap_pullback_long,long,525.1000,524.6000,526.1000,,,,,,,,524.8800,525.0000,523.9000,0.0420,525.0500,Close above prior bar high and above VWAP after pullback within 0.25% of VWAP,,
2,2026-05-28T10:15:00-04:00,approved,vwap_pullback_long,long,525.1000,524.6000,526.1000,20,10.40,,,,,,524.8800,525.0000,523.9000,0.0420,525.0500,Risk checks passed; sized to 20 shares at $0.52/share risk,,
3,2026-05-28T10:16:00-04:00,executed,vwap_pullback_long,long,525.1000,524.6000,526.1000,20,10.40,525.1200,,,,,524.9200,525.0000,523.9000,0.0568,525.1000,Filled at next bar's open after approval,,
4,2026-05-28T10:42:00-04:00,exited,vwap_pullback_long,long,525.1000,524.6000,526.1000,20,10.40,525.1200,526.0500,target,18.60,1.788,525.4200,525.0000,523.9000,0.1199,526.0000,Take-profit reached; bracket stop cancelled,,none
```
