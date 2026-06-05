# Quickstart: Recommendation Engine (018)

How to exercise the feature end-to-end once implemented.

## Prerequisites

- Migration `0125_recommendation_trials.sql` applied.
- An archive with OOS history: at least one walk-forward study per config you
  want verdicts for (the existing `wf-rr3` + `default` studies suffice), and
  ideally one sensitivity study for plateau-sourced candidates.
- `ANTHROPIC_API_KEY` set only if you want the advisory narrative — every
  deterministic surface works without it.

## 1. Health verdicts (US1)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/recommend/health | jq '.verdicts[] | {config_name, verdict, inputs}'
```

- Expect one row per config with OOS windows; `wf-rr3` should read
  `failing` (gate failed, recent windows ≤ 0) against the seeded archive.
- Recompute — the bytes must not change (SC-002).
- UI: Strategies page → active config row shows the health badge with the
  cited numbers in its tooltip; Insights page → Recommendations panel lists
  every config's verdict.

## 2. Evidence pack + deterministic candidates (US2, Claude off)

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/recommend/pack?config_id=$CONFIG_ID" \
  | jq '{candidates: .candidates, trials: .trial_counts}'
```

- Every `knob_delta` candidate: registry path, in-bounds value, ≥1 cited
  evidence entry; candidates matching an existing config carry
  `already_tried`.
- With every family gate failing, a `stop_tuning` candidate is present.
- Pause Claude (Insights → Claude's read → Pause) and reload the panel:
  verdicts, candidates, citations, and trial counts all still render
  (FR-009 / SC-005).

## 3. Advisory narrative (US2, Claude on)

In the Recommendations panel, click "Get Claude's read" (or:)

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"scope\":\"recommend\",\"scope_id\":\"$CONFIG_ID\",\"force\":false}" \
  http://localhost:8000/api/insights/claude-analysis | jq '.analysis.suggested_experiments'
```

- Claims cite pack metric paths; suggested changes are on-whitelist
  (anything else was sanitized before storage).
- Re-POST without data changes → identical stored analysis (snapshot pin).

## 4. Draft → validate loop (US2 actuation + US3 ledger)

1. On a `knob_delta` card click **Draft config →** — lands on Strategies
   with the prefilled, badged draft (017 flow).
2. Create it (explicit human action). The configs table gains the row AND
   `recommendation_trials` gains a row (`source`, `analysis_id` when from a
   narrative card).
3. Run a walk-forward study on the new config; when it finishes, the
   panel's ledger line increments: "N drafted · M validated against this
   archive".
4. Delete the drafted config: the ledger count must NOT decrease
   (deletion-surviving trail).

## 5. Honesty checks (US3)

- The panel shows the trial counts with the data-snooping HelpTooltip.
- Grep the feature's responses for lockbox: no surface cites or reads
  lockbox segments (FR-012) — pack sources filter `segment='validation'`.

## Test suites

```bash
# backend (from backend/)
python -m pytest tests/recommend tests/api/new/test_recommend_api.py tests/storage/test_recommend_storage.py -q

# frontend (from frontend/)
npx vitest run src/components/recommend src/hooks/useRecommend.test.ts
```
