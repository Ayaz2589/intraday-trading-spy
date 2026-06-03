# Quickstart — Data Foundation (009)

End-to-end: load multi-year SPY history and verify the Phase 0 **exit gate** (≥2–3 years across four regimes; a default backtest yields hundreds+ trades).

## Prerequisites

1. **Credentials** in `backend/.env` (already set; gitignored — never commit):
   ```
   ALPACA_API_KEY=...
   ALPACA_SECRET_KEY=...
   ALPACA_PAPER=true            # stored for future phases; data path is read-only
   ```
   `.env.example` documents these with placeholders.
2. **Dependencies** installed: `alpaca-py`, `pandas-market-calendars` (added to `backend/pyproject.toml`).
3. **Migrations applied manually** in the Supabase SQL editor (project practice):
   - `0093_bars_bar_start_index.sql` — `CREATE INDEX ON bars (bar_start)`
   - `0094_backfill_jobs.sql` — `backfill_jobs` table + RLS

## 1. Trigger the backfill (in-app)

From the **Data** page, set the range (e.g. `2018-01-01 → today`) and click **Backfill history**. Or via API:

```bash
curl -sX POST "$API/api/bars/backfill" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"start":"2018-01-01","end":"2026-06-01","source":"alpaca"}'
# → {"job_id":"...","status":"queued"}
```

## 2. Watch progress

The UI polls and shows `windows_done/windows_total`, `bars_added`, and any `gap_session_dates`. Or:

```bash
curl -s "$API/api/bars/backfill/$JOB_ID" -H "Authorization: Bearer $TOKEN"
# status: queued → running → finished
```

Re-running the same range is safe (idempotent): `bars_added` will be ~0 on a second pass.

## 3. Verify coverage (exit-gate part 1)

Open the **Data** coverage panel (or call `GET /api/bars/coverage`). Confirm:
- `earliest` ≈ 2018, `latest` ≈ today (≥2–3 years span).
- **All four regimes** (2020 vol, 2021 bull, 2022 bear, 2023–24 chop/trend) show `covered: true` (≥90% completeness). Any `<90%` shows as a gap — re-backfill that window.

## 4. Run a default backtest over the full span (exit-gate part 2)

Start a backtest spanning the full cached range. Confirm:
- It completes in **seconds** (the `bar_start` index keeps the read fast).
- It reports a date range spanning multiple years and executes **several hundred+ trades** (vs ~6 before).

## 5. Honesty check — IEX vs consolidated VWAP (R6)

Because the free Alpaca tier is the **IEX feed** (a few % of volume) and this is a **VWAP** strategy, before trusting multi-year results, quantify the VWAP discrepancy on the ~60-day window where Alpaca(IEX) and yfinance(consolidated) overlap:
- compute VWAP from `source='alpaca'` vs `source='yfinance'` bars over the overlap;
- if drift is material, decide: proceed on IEX (documented) or upgrade to Alpaca **SIP** (paid). This is the one operator decision Phase 0 surfaces.

## Done When

- [ ] Backfill job reaches `finished`; coverage shows ≥2–3 yr span, all four regimes `covered`.
- [ ] A full-span default backtest yields hundreds+ trades in seconds.
- [ ] Re-running backfill adds ~0 bars (idempotent); a two-source overlap fixture yields exactly one bar per timestamp (Alpaca preferred).
- [ ] IEX-vs-consolidated VWAP discrepancy measured and recorded.
