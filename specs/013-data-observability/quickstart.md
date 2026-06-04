# Quickstart — verify 013 data observability end-to-end

Prereqs: dev stack up (`make docker-up` → backend :8001, frontend :5173),
cloud creds in `backend/.env`, populated bars cache.

## 1. Page snapshot (US2 — what's in the cache)

Open `http://localhost:5173/data`:

- Summary strip shows total bars (~165k), sessions (~2.1k), span
  (2018-01-02 → today), source(s), and a last-updated time.
- The heatmap renders one row per year (2018 → current); past months in the
  span are green (complete), the current month renders as in-progress, months
  after today render as dots (future). Legend visible.
- Hover any complete cell → "<Month YYYY>: N/N sessions · X bars · complete".

## 2. Holes (US3)

- With a fully covered cache, the page shows the explicit "no missing
  sessions" indication.
- Synthetic gap check (offline test covers this too): the unit tests doctor a
  month by removing one session date and assert that month flips to partial
  with exactly that date listed; a market holiday (e.g. 2026-01-01) must NOT
  appear as missing. Live spot-check: pick a holiday month (January) and
  confirm it still shows complete.

## 3. Backfill history (US1)

- The job history table lists recent jobs newest-first with started time,
  range, windows, bars added, duration, status.
- The 2026-06-04 failed job ("No module named 'alpaca'") is visible with its
  failure reason on hover — even though a later job succeeded.
- Click "Backfill history" for a recent range → the running job shows live
  progress (existing behavior); when it completes, the history table, summary
  strip, and heatmap refresh without a manual reload.

## 4. Lineage (US4)

- The summary strip's lineage line shows "feeds N backtests + M studies ·
  latest <date>"; N/M match the Runs page counts; the link navigates to /runs.

## 5. Tooltips (constitution VI)

- `?` tooltips render for: the heatmap (cache_heatmap), the job history
  (backfill_job_history — explains why "1 bars added" on a full cache is
  healthy), and the lineage line (data_lineage).

## 6. Test suites

```bash
cd backend  && PYTHONPATH=. .venv/bin/pytest -q   # incl. test_coverage_months + stats endpoint tests
cd frontend && npm run typecheck && npx vitest run
```
