# Quickstart — Validation Engine (Phase 2)

How to exercise and verify each capability once the feature lands. This is the operator's "prove the strategy wrong cheaply" loop, in order. Prerequisites: Phase 0 data backfilled (164,918 SIP bars 2018→2026) and Phase 1 net-of-cost metrics in place.

The exit-gate discipline: **walk-forward → sensitivity → significance → (only then) lockbox.** Burn the lockbox last, once, on a single frozen candidate.

---

## 0. Configure the split (once)

`backend/config/config.yaml` gains a `validation` block. Defaults:

```yaml
validation:
  split:
    train:      { start: 2018-01-01, end: 2022-12-31 }
    validation: { start: 2023-01-01, end: 2024-12-31 }
    lockbox:    { start: 2025-01-01, end: 2026-12-31 }   # most-recent slice, held out
  walk_forward: { mode: rolling, train_months: 12, step_months: 6, validation_months: 6 }
  sensitivity:  { default_metric: expectancy_dollars, max_grid_points_warn: 50 }
  significance: { bootstrap_iterations: 1000, permutation_iterations: 1000, confidence: 0.95, alpha: 0.05, seed: 20260603 }
  max_evaluations_warn: 200
```

Apply migrations `0110`–`0113` to Supabase (`psql "$SUPABASE_DB_URL" -f backend/db/migrations/0110_validation_studies.sql`, etc.).

---

## 1. Walk-forward (is the edge out-of-sample, or just fit?)

**UI:** Validation → New study → Walk-forward → base config `default` → segment `train_validation` → launch. Poll until finished.

**API:**
```bash
curl -XPOST $API/api/validation/studies -H "$AUTH" -d '{
  "kind":"walk_forward","config_name":"default","segment":"train_validation" }'
# → { "study_id":"...", "status":"queued", "planned_evaluations":11 }
curl $API/api/validation/studies/<id>/status -H "$AUTH"   # poll
```

**Verify (SC-001, SC-002):**
- The IS-vs-OOS table shows ~11 windows, each with train metrics next to the next window's OOS metrics and a color-coded `gap`.
- **No lockbox leakage:** every window's `out_of_sample.range_end` < `2025-01-01`. (A test also asserts zero lockbox bars were evaluated.)
- A healthy edge: OOS expectancy stays positive and the `mean_gap` is small. A large negative gap = overfit → distrust the config.

---

## 2. Parameter sensitivity (plateau or spike?)

**API (2-D grid):**
```bash
curl -XPOST $API/api/validation/studies -H "$AUTH" -d '{
  "kind":"sensitivity","config_name":"default","segment":"train",
  "metric":"expectancy_dollars",
  "grid":[
    {"knob":"strategy.vwap_pullback.target.risk_reward","values":[1.5,2.0,2.5,3.0]},
    {"knob":"strategy.vwap_pullback.max_distance_from_vwap_pct","values":[0.2,0.3,0.4]}
  ]}'
```

**Verify (SC-003):**
- The heatmap renders a 4×3 surface. A **plateau** = a block of similarly-good neighboring cells (prefer its boring middle). A **spike** = one bright cell surrounded by poor ones (distrust it — likely fit to noise).
- If the grid implies `> max_evaluations_warn` evaluations, the launch returns `409 large_study` until you resend with `"confirm_large":true` (no silent fan-out — FR-012).

---

## 3. Significance (edge or luck?)

Pick a result that survived steps 1–2 — e.g. an OOS window's `run_id`, or the candidate run over `train`.

```bash
curl -XPOST $API/api/validation/significance -H "$AUTH" -d '{ "run_id":"<oos-run-id>" }'
# → bootstrap CIs on expectancy/Sharpe + permutation p_value + significant:true|false
```

**Verify (SC-004):**
- A 95% bootstrap CI on expectancy that **excludes 0** is encouraging; one that straddles 0 is not.
- The **random-entry permutation** p-value answers "could random entries under identical exit/risk/cost rules have done this?" `significant:true` ⇒ `p < 0.05`.
- **Reproducibility:** re-POST with the same `seed` → byte-identical CI bounds, p-value, and verdict.

---

## 4. One-shot lockbox (the final, irreversible test)

Only after a single candidate config has survived 1–3. **You get one shot.**

```bash
curl $API/api/validation/lockbox -H "$AUTH"                 # status: unspent?
curl -XPOST $API/api/validation/lockbox/run -H "$AUTH" -d '{ "config_name":"default" }'
# → { "state":"spent", "summary": { ...net-of-cost metrics on 2025→2026... } }
```

**Verify (SC-005):**
- First run: `state:"spent"`, result recorded, a `lockbox_spent` journal event emitted.
- Re-running the **same** config: idempotent — returns the same recorded result.
- Running a **different** config: `409 lockbox_already_spent`. To proceed anyway you must pass `"override":true`, which returns `state:"burned", contaminated:true`, appends a `burned` ledger row, and journals `lockbox_burned` — permanently and visibly. The original result is never overwritten.

**Exit gate (SC-007):** a candidate that (a) survives walk-forward with a healthy trade count, (b) sits on a plateau, (c) is significant after costs, and (d) holds on the one-shot lockbox is a Phase-3 candidate. If it fails any step — that's a valid, money-saving result; pick a new candidate (the lockbox stays unspent until you deliberately spend it on one).

---

## 5. Tests to run

```bash
# backend
cd backend && pytest tests/validation -q          # split/window/wf/sweep/significance/lockbox
cd backend && pytest tests/ -k run_df -q           # engine in-memory equivalence fixture (FR-024)
# frontend
cd frontend && npx vitest run src/components/validation
```

Determinism check: run any significance/study twice with the same seed → identical verdicts.
