# Quickstart — First-Class Config Management

How to exercise and verify the feature. Prereq: migrations `0120`–`0122` applied to Supabase.

## 0. Apply migrations
```bash
psql "$SUPABASE_DB_URL" -f backend/db/migrations/0120_configs_active_flag.sql
psql "$SUPABASE_DB_URL" -f backend/db/migrations/0121_runs_config_id_nullable.sql
psql "$SUPABASE_DB_URL" -f backend/db/migrations/0122_workable_default_seed.sql
```

## 1. Create a second config (US1)
**UI:** Strategies → config manager → New config → from preset `low-risk` (or duplicate `default`) → name it → it appears in the list.

**API:**
```bash
curl -XPOST $API/api/configs -H "$AUTH" -d '{"name":"low-risk","source":"preset","preset_name":"low-risk"}'   # 201 ConfigView
curl $API/api/configs -H "$AUTH"   # now lists default + low-risk; one is_active:true
```
**Verify (SC-001/002):** launch a backtest selecting `low-risk`; the run's snapshot reflects `low-risk`'s knobs, not `default`'s.

## 2. Edit per-config (US2)
Select `low-risk`, change `strategy.vwap_pullback.target.risk_reward`, save (`PATCH /api/configs/{id}` `{params}`). Re-open → persisted; `default` unchanged; past runs unaffected.

## 3. Duplicate / rename / safe delete (US3)
```bash
curl -XPOST $API/api/configs/<id>/duplicate -H "$AUTH" -d '{"name":"low-risk-2"}'
curl -XPATCH $API/api/configs/<id2> -H "$AUTH" -d '{"name":"experiment-A"}'
curl -XDELETE $API/api/configs/<id2> -H "$AUTH"     # 200 {deleted}
```
**Verify (SC-004):** a past run that used the deleted config still opens and still shows its original knobs (its `config_id` is now NULL, snapshot intact). Deleting your **last** config → `409 last_config`. Deleting the **active** config promotes another to active.

## 4. Workable default + presets (US4) — the 0-trade fix
Create a config from the shipped default (and each preset) → run a multi-month SPY backtest → **executes a non-trivial trade count** (not ~0), because `max_position_value_pct=400` lets the risk-based intraday size through. The daily-loss / per-trade veto still binds (a too-risky config still locks out).

## 5. Active config (clarified behavior)
`POST /api/configs/{id}/activate` sets the active config; every picker (backtest / study / lockbox) pre-selects it, so no-explicit-pick flows keep working. Exactly one active per user (DB-enforced).

## 6. Tests
```bash
cd backend && pytest tests -k "config" -q                  # CRUD + invariants + safe-delete + presets-trade + no-live guard
cd frontend && npx vitest run src/components/strategies     # config manager UI
```
Determinism/safety checks: name collision → 400; last-config delete → 409; no config path can set live_auto_enabled true.
