# Quickstart — verifying Feature 014 end-to-end

Prereqs: Docker dev stack up (backend :8001, frontend :5173), cloud Supabase
creds auto-load from `backend/.env`. Rebuild containers if deps changed
(none expected for 014 — zero new packages, zero migrations).

## 1. Run the offline test suites (the TDD gate)

```bash
cd backend && PYTHONPATH=. .venv/bin/pytest -q \
  --ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py
cd frontend && npx vitest run
```

Expected: all green (3 pre-existing `price-chart.test.tsx` failures are
baseline, not regressions).

## 2. Persist children via a real study

1. Open `http://localhost:5173/validation`.
2. Start a small walk-forward study (e.g. `default` config, short span).
3. While it runs: progress behaves exactly as before (per-eval ticks).
4. When finished, open the study detail page → redesigned page: header card,
   stat cards, expandable window rows.
5. Expand a window → IS and OOS panels each show **View run →**.

## 3. Drill down + significance (SC-001, SC-006)

1. Click an OOS **View run →** → lands on `/runs/$runId` with trades, journal,
   chart, and the config snapshot for that window.
2. The run header shows **Part of study — window N · validation** linking back.
3. Run a significance test from this run page — no 404.

## 4. Runs list stays clean (SC-004)

Open the main runs list/sidebar → none of the study children appear; your
standalone backtests still do.

## 5. Re-run an old study (SC-005)

1. On `/validation`, find a pre-014 study (e.g. the `wf-rr3` walk-forward) —
   its detail page shows **no** run links.
2. Click **Re-run study** (row or detail page) → new study starts with
   identical params; when finished, every window is drillable.

## 6. Lockbox link

After any post-014 lockbox one-shot, the lockbox card links to its run
(`segment='lockbox'`). Pre-014 ledger entries show no link.
**Reminder: the lockbox is one-shot — do NOT spend it for testing; verify on a
dev/user account or defer to the real, significance-gated spend.**

## 7. Dedup spot-check (SC-007)

Re-run the SAME study twice back-to-back → the second study's windows reference
the same run ids as the first (query: two studies' results share `run_id`s; the
runs table gained no duplicate rows for those windows).

## 8. Cloud sanity (direct SQL, optional)

```sql
-- children tagged correctly
select study_id, segment, window_index, count(*) from runs
where study_id is not null group by 1,2,3 order by 1,3;
-- lockbox ledger linked
select id, run_id from lockbox_ledger order by created_at desc limit 3;
```

(Use the established `SUPABASE_DB_URL` + psycopg pattern; sandbox needs
`dangerouslyDisableSandbox` for cloud access.)
