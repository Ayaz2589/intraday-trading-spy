# Contract: `<csv>.fetch.yaml` schema

Sidecar manifest written next to every CSV produced by this feature.
Together with the CSV (referenced by its `output_sha256`), this file
makes a fetch reproducible and auditable.

## Writer settings

- Encoding: UTF-8, no BOM.
- `yaml.safe_dump(..., sort_keys=True, default_flow_style=False)`.
- Trailing newline: yes (POSIX).

## Top-level keys (alphabetical because `sort_keys=True`)

```yaml
bar_count:           <integer>                          # row count of the CSV (not including header)
data_source:         <"yfinance" or "mock">
fetched_at:          <UTC ISO 8601>                     # e.g. 2026-05-28T17:42:11+00:00
gap_session_dates:   [<ISO date>, ...]                  # session dates within range with zero bars
output_path:         <string>                           # relative or absolute, as given to --out
output_sha256:       <64 hex chars>                     # SHA-256 of the CSV's bytes ON DISK
requested_end:       <ISO date>
requested_start:     <ISO date>
requested_timeframe: <"5m" or "1m">
session_count:       <integer>                          # distinct dates with at least one bar
yfinance_version:    <string>                           # e.g. "0.2.42"
```

## Field semantics

- `fetched_at` is the UTC wall-clock time the fetch began (or
  completed — the spec is silent and either is acceptable; pick one
  and stick to it in the implementation).
- `gap_session_dates` lists every ISO date in the closed range
  `[requested_start, requested_end]` that produced zero bars. Weekends
  and US market holidays will dominate this list; that's expected.
- `output_sha256` is computed AFTER the CSV is written, by reading
  the file bytes and hashing them. A user can verify with
  `sha256sum <csv>`.
- `data_source` is `"yfinance"` for production CLI invocations and
  `"mock"` for any test that injects a synthetic `download_fn`.

## Reproducibility contract

Two runs with identical CLI flags and identical `data_source: mock`
input (same mocked DataFrames) MUST produce byte-identical CSVs and
byte-identical manifests with the exception of `fetched_at`. The
spec FR-015 reproducibility test compares both files but excludes
`fetched_at` from the comparison.

## Example

```yaml
bar_count: 8190
data_source: yfinance
fetched_at: '2026-05-28T17:42:11+00:00'
gap_session_dates:
- 2026-04-03
- 2026-04-04
- 2026-04-10
- 2026-04-11
output_path: backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv
output_sha256: c3a1f78d9b2e4f5a6c8b7d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a
requested_end: 2026-05-28
requested_start: 2026-04-01
requested_timeframe: 5m
session_count: 42
yfinance_version: 0.2.42
```
