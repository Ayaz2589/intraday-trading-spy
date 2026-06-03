# Contract — Coverage endpoint (extended)

Extends the existing `GET /api/bars/coverage`. **Backward-compatible**: `earliest`/`latest` are unchanged; `regimes` is additive. Requires auth.

---

## GET `/api/bars/coverage`

**Response 200**
```json
{
  "earliest": "2018-01-02",
  "latest": "2026-06-01",
  "regimes": [
    {
      "name": "2020 volatility",
      "start": "2020-01-01",
      "end": "2020-12-31",
      "expected_sessions": 253,
      "present_sessions": 251,
      "completeness_pct": 99.2,
      "covered": true
    },
    {
      "name": "2022 bear",
      "start": "2022-01-01",
      "end": "2022-12-31",
      "expected_sessions": 251,
      "present_sessions": 120,
      "completeness_pct": 47.8,
      "covered": false
    }
  ]
}
```

**Field semantics**
- `earliest`/`latest`: oldest/newest cached `bar_start` (effective, any source). `null` when cache empty.
- `regimes[]`: one per configured `data.regimes` entry.
  - `expected_sessions`: NYSE trading days in `[start,end]` (`pandas-market-calendars`, R7). Future-dated portions of a regime window count only up to today.
  - `present_sessions`: distinct ET session-days in `[start,end]` with ≥1 bar (psycopg aggregate, R8).
  - `completeness_pct`: `round(present/expected*100, 1)`; `0` when `expected==0`.
  - `covered`: `completeness_pct >= data.regime_covered_threshold_pct` (default 90, clarify Q3).

**Empty cache**: `earliest`/`latest` null; every regime `present_sessions:0, completeness_pct:0, covered:false`.

---

## Contract tests (TDD)

Backend (`unit_client` + `stub_storage_client`):
- empty cache → `{earliest:null, latest:null, regimes:[...all covered:false, pct:0]}`.
- a regime ≥90% present → `covered:true`; a regime <90% → `covered:false` (boundary at exactly 90% → covered).
- regimes list length == configured regimes; names/bounds echo config.
- `expected==0` window → `completeness_pct:0`, no divide-by-zero.

Frontend (Vitest + Testing Library):
- coverage panel renders span + a row per regime with % and a covered/gap indicator.
- a `<90%` regime is visually flagged as a gap (FR-013, US3 scenario 2).
- each new concept (coverage, regime completeness, backfill, data source) renders a `HelpTooltip` (`help-content.ts` keys; constitution VI).
