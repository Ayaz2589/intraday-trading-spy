# Phase 1 Data Model — Cloud-Persisted Backtest Storage

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Research**: [research.md](./research.md)

This document is the authoritative schema for feature 005. Each table is described as: purpose → columns → constraints → indexes → RLS policies → notes. The corresponding SQL lives in `backend/db/migrations/`.

## Glossary

| Term in spec.md / plan.md | Term here / in DB | Meaning |
|---|---|---|
| Operator | `auth.users` row, identified by `user_id` | The human running the CLI. In `auth.users`, their identity is a UUID (`id`). All user-scoped tables carry `user_id UUID REFERENCES auth.users(id)`. |
| User-scoped row | A row with `user_id = <some auth.users.id>` | Subject to the RLS policy `(user_id = auth.uid())`. |
| Service role | Supabase's privileged context bypassing RLS | Used by the CLI (FR-015) and the future FastAPI service. Never exposed to the browser. |
| Anon role | Unauthenticated context | Used by RLS denial tests in feature 005's `tests/storage/test_rls_anon.py`. |

## Conventions

- All primary keys are `UUID` (UUID v7 for user-generated rows; `gen_random_uuid()` for service-generated ones).
- All `created_at` and `updated_at` columns are `TIMESTAMPTZ NOT NULL DEFAULT now()`.
- All user-scoped tables have a `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`.
- All user-scoped tables have an RLS policy `(user_id = auth.uid())`.
- All money values are `NUMERIC(18, 6)` (sufficient for 12-digit dollar amounts with 6 decimal places of precision). Float types are avoided for cash.
- Bar prices and indicator values are `NUMERIC(12, 6)`.
- All percentage / ratio values are `NUMERIC(8, 6)`.
- Timestamps that represent market time (bar starts, signal emission) are `TIMESTAMPTZ` and the application is responsible for converting to `America/New_York` for display. The database does not interpret market time.

## Tables

### 1. `strategies`

Registry of available strategies. Seeded with `vwap_pullback_long`. Adding a strategy is one row insert plus a Python module that registers itself.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `key` | `TEXT` | NOT NULL UNIQUE | E.g., `vwap_pullback_long`. Used by configs and runs as a stable reference. |
| `display_name` | `TEXT` | NOT NULL | E.g., "VWAP Pullback (Long)". |
| `description` | `TEXT` | NOT NULL | One-paragraph explanation suitable for the future `HelpTooltip`. |
| `symbol` | `TEXT` | NOT NULL DEFAULT 'SPY' CHECK (symbol = 'SPY') | Constitution principle I. |
| `direction` | `TEXT` | NOT NULL CHECK (direction = 'LONG') | Constitution principle II. v1 long-only. |
| `kind` | `TEXT` | NOT NULL CHECK (kind = 'rule_based') | Constitution principle II. v1 rule-based only. |
| `enabled` | `BOOLEAN` | NOT NULL DEFAULT TRUE | Soft-disable without deleting. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; UNIQUE on `key`.

**RLS policies**:
- `SELECT`: `(true)` — every authenticated user can read the registry.
- `INSERT` / `UPDATE` / `DELETE`: `(auth.role() = 'service_role')` — only the service role manages the registry.

**Seed (in `0020_seed_strategies.sql`)**:
```sql
INSERT INTO strategies (key, display_name, description, symbol, direction, kind)
VALUES ('vwap_pullback_long', 'VWAP Pullback (Long)',
        'After the opening range completes, a long signal is generated when SPY pulls back to its VWAP from above, with confirmation. Stop below VWAP, target at the opening-range high or a configured R-multiple.',
        'SPY', 'LONG', 'rule_based')
ON CONFLICT (key) DO NOTHING;
```

---

### 2. `configs`

Per-user backtest configs. Replaces the single `backend/config/config.yaml` for cloud-stored runs. The YAML file remains the canonical default for the local CLI.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `user_id` | `UUID` | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | |
| `strategy_id` | `UUID` | NOT NULL REFERENCES strategies(id) | |
| `name` | `TEXT` | NOT NULL | Operator-facing label; unique per user. |
| `mode` | `TEXT` | NOT NULL CHECK (mode IN ('backtest', 'paper')) | Constitution principle V. |
| `live_auto_enabled` | `BOOLEAN` | NOT NULL DEFAULT FALSE CHECK (live_auto_enabled = FALSE) | Constitution principle V. Hard-pinned `FALSE` at the DB level in v1. |
| `timeframe` | `TEXT` | NOT NULL DEFAULT '5m' CHECK (timeframe = '5m') | v1 5-min only. |
| `params` | `JSONB` | NOT NULL | All numeric / threshold parameters (max_risk_per_trade, max_daily_loss, session times, etc.). Schema validated by Pydantic on read/write. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; UNIQUE on `(user_id, name)`; INDEX on `user_id`.

**RLS policies**:
- All operations: `(user_id = auth.uid())`.

**Validation note**: The `params` JSONB is structurally enforced by Pydantic `ConfigParams` model in `storage/models.py`. The Postgres-level guarantee is the CHECK on `live_auto_enabled` (cannot be `TRUE` in v1).

---

### 3. `runs`

One row per backtest invocation.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | Client-generated UUID v7 (research §5). |
| `user_id` | `UUID` | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | |
| `config_id` | `UUID` | NOT NULL REFERENCES configs(id) | |
| `strategy_id` | `UUID` | NOT NULL REFERENCES strategies(id) | Denormalized for query convenience. |
| `started_at` | `TIMESTAMPTZ` | NOT NULL | When the engine started running. |
| `finished_at` | `TIMESTAMPTZ` | NOT NULL | When the engine finished. |
| `range_start` | `DATE` | NOT NULL | First trading day in the backtest range. |
| `range_end` | `DATE` | NOT NULL CHECK (range_end >= range_start) | Last trading day. |
| `bar_count` | `INTEGER` | NOT NULL CHECK (bar_count > 0) | How many bars were replayed. |
| `summary` | `JSONB` | NOT NULL | Aggregate metrics: `{pnl, win_rate, sharpe, max_drawdown, total_trades, total_signals, rejected_signals}`. Pydantic-validated. |
| `data_fingerprint` | `TEXT` | NOT NULL | Hash of the input CSV (existing `data/fingerprint.py` logic) — reproducibility. |
| `app_version` | `TEXT` | NOT NULL | `intraday-trade-spy` version that produced the run. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; INDEX on `(user_id, started_at DESC)` (list-runs query); INDEX on `(user_id, strategy_id)`.

**RLS policies**:
- All operations: `(user_id = auth.uid())`.

**Atomicity**: All inserts into `runs` happen inside the `push_run(jsonb)` Postgres function (research §7), wrapped in a transaction with the dependent inserts into `trades`, `signals`, `journal_events`.

---

### 4. `trades`

Executed trades within a run. Long-only in v1 (constitution principle II).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `run_id` | `UUID` | NOT NULL REFERENCES runs(id) ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | Denormalized for RLS performance. |
| `direction` | `TEXT` | NOT NULL CHECK (direction = 'LONG') | Constitution principle II. |
| `quantity` | `NUMERIC(12, 4)` | NOT NULL CHECK (quantity > 0) | Shares. |
| `entry_at` | `TIMESTAMPTZ` | NOT NULL | |
| `entry_price` | `NUMERIC(12, 6)` | NOT NULL CHECK (entry_price > 0) | |
| `stop_price` | `NUMERIC(12, 6)` | NOT NULL CHECK (stop_price > 0) | Constitution principle III: no stop = no trade. NOT NULL is the database-level enforcement. |
| `target_price` | `NUMERIC(12, 6)` | NOT NULL CHECK (target_price > 0) | Constitution principle III: no target = no trade. |
| `exit_at` | `TIMESTAMPTZ` | NOT NULL | |
| `exit_price` | `NUMERIC(12, 6)` | NOT NULL CHECK (exit_price > 0) | |
| `exit_reason` | `TEXT` | NOT NULL CHECK (exit_reason IN ('target', 'stop', 'force_flat', 'timeout', 'other')) | |
| `pnl` | `NUMERIC(18, 6)` | NOT NULL | Realized P&L. |
| `r_multiple` | `NUMERIC(8, 4)` | NOT NULL | Realized R multiple. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; INDEX on `(run_id)`; INDEX on `(user_id, entry_at DESC)`.

**RLS policies**:
- All operations: `(user_id = auth.uid())`.

---

### 5. `signals`

Every signal emitted during a run — executed AND rejected. Rejected signals are first-class records (constitution principle VII).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `run_id` | `UUID` | NOT NULL REFERENCES runs(id) ON DELETE CASCADE | |
| `user_id` | `UUID` | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | |
| `emitted_at` | `TIMESTAMPTZ` | NOT NULL | When the strategy emitted the signal. |
| `direction` | `TEXT` | NOT NULL CHECK (direction = 'LONG') | Constitution principle II. |
| `entry_price` | `NUMERIC(12, 6)` | NOT NULL CHECK (entry_price > 0) | Proposed entry. |
| `stop_price` | `NUMERIC(12, 6)` | CHECK (stop_price IS NULL OR stop_price > 0) | NULL allowed only when rejection_reason = 'missing_stop'. |
| `target_price` | `NUMERIC(12, 6)` | CHECK (target_price IS NULL OR target_price > 0) | NULL allowed only when rejection_reason = 'missing_target'. |
| `executed` | `BOOLEAN` | NOT NULL | Discriminator (research §8). |
| `rejection_reason` | `TEXT` | CHECK ((executed AND rejection_reason IS NULL) OR (NOT executed AND rejection_reason IS NOT NULL)) | Enum-like; values listed below. |
| `trade_id` | `UUID` | REFERENCES trades(id) CHECK ((executed AND trade_id IS NOT NULL) OR (NOT executed AND trade_id IS NULL)) | The trade that resulted from this signal. |
| `indicator_context` | `JSONB` | NOT NULL | VWAP value, opening-range bounds, bar OHLCV at signal time. Pydantic-validated. |
| `reason_text` | `TEXT` | NOT NULL | Human-readable explanation suitable for the rejected-signal UI. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Rejection-reason enum (CHECK)**: `('missing_stop', 'missing_target', 'wrong_symbol', 'wrong_direction', 'daily_loss_hit', 'max_trades_hit', 'duplicate_signal', 'position_size_cap', 'stale_data', 'opening_range_not_complete', 'cooldown_after_loss', 'consecutive_loss_cap', 'no_new_trades_cutoff', 'force_flat_window', 'other')`

**Indexes**: PRIMARY KEY on `id`; INDEX on `(run_id)`; INDEX on `(user_id, emitted_at DESC)`; INDEX on `(run_id, executed)` (for the rejected-signal view).

**RLS policies**:
- All operations: `(user_id = auth.uid())`.

---

### 6. `journal_events`

Catch-all event stream — force-flat exits, risk decisions, errors, lifecycle events. Single write entry point: `journal/logger.py`. Constitution principle VII.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `run_id` | `UUID` | REFERENCES runs(id) ON DELETE CASCADE | NULL allowed for events not tied to a single run (e.g., cloud-push success/failure outside the engine). |
| `user_id` | `UUID` | NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE | |
| `occurred_at` | `TIMESTAMPTZ` | NOT NULL | |
| `kind` | `TEXT` | NOT NULL CHECK (kind IN ('force_flat', 'risk_decision', 'error', 'lifecycle', 'cloud_push_success', 'cloud_push_failure', 'other')) | |
| `severity` | `TEXT` | NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error')) | |
| `message` | `TEXT` | NOT NULL | Human-readable. |
| `details` | `JSONB` | NOT NULL DEFAULT '{}'::jsonb | Structured context. Pydantic-validated per kind. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; INDEX on `(run_id, occurred_at)`; INDEX on `(user_id, occurred_at DESC)`.

**RLS policies**:
- All operations: `(user_id = auth.uid())`.

---

### 7. `bars`

Shared cache of historical 5-minute SPY bars. Not user-scoped — read-public-authenticated, write-service-role-only. Avoids duplicate yfinance fetches.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY DEFAULT gen_random_uuid() | |
| `bar_start` | `TIMESTAMPTZ` | NOT NULL | Bar's open timestamp (America/New_York-equivalent UTC). |
| `open` | `NUMERIC(12, 6)` | NOT NULL CHECK (open > 0) | |
| `high` | `NUMERIC(12, 6)` | NOT NULL CHECK (high > 0) | |
| `low` | `NUMERIC(12, 6)` | NOT NULL CHECK (low > 0) | |
| `close` | `NUMERIC(12, 6)` | NOT NULL CHECK (close > 0) | |
| `volume` | `BIGINT` | NOT NULL CHECK (volume >= 0) | |
| `source` | `TEXT` | NOT NULL DEFAULT 'yfinance' | Provenance. |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT now() | |

**Indexes**: PRIMARY KEY on `id`; UNIQUE on `(bar_start, source)` (idempotent ingest).

**RLS policies**:
- `SELECT`: `(auth.role() = 'authenticated')` — any signed-in user reads.
- `INSERT` / `UPDATE` / `DELETE`: `(auth.role() = 'service_role')`.

---

## Storage Buckets

### Bucket `raw-data`

Holds yfinance-downloaded SPY CSVs.

**Path shape**: `{user_id}/spy_5m_{start}_{end}.csv`

**Policies**:
- `SELECT` / `INSERT` / `UPDATE` / `DELETE`: caller must be authenticated AND the first path segment must equal `auth.uid()::text` OR caller is the service role.

### Bucket `run-artifacts`

Holds manifest JSON, equity curves, and any other per-run files too heavy for a Postgres row.

**Path shape**: `{user_id}/{run_id}/{filename}`

**Policies**: same shape as `raw-data` — caller must be authenticated AND the first path segment must equal `auth.uid()::text` OR caller is the service role.

---

## Postgres Function: `push_run(payload jsonb)`

Single entry point for an atomic run push (research §7).

```sql
-- Pseudocode shape; full SQL in 0030_push_run_function.sql
CREATE OR REPLACE FUNCTION public.push_run(payload jsonb)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  run_uuid UUID := (payload->'run'->>'id')::UUID;
  caller_uid UUID := COALESCE(auth.uid(), (payload->'run'->>'user_id')::UUID);
BEGIN
  -- Service role may push on behalf of caller_uid; authenticated user must match.
  IF auth.role() <> 'service_role' AND caller_uid <> auth.uid() THEN
    RAISE EXCEPTION 'push_run: caller user_id mismatch';
  END IF;

  INSERT INTO runs SELECT * FROM jsonb_populate_record(NULL::runs, payload->'run');
  INSERT INTO trades SELECT * FROM jsonb_populate_recordset(NULL::trades, payload->'trades');
  INSERT INTO signals SELECT * FROM jsonb_populate_recordset(NULL::signals, payload->'signals');
  INSERT INTO journal_events SELECT * FROM jsonb_populate_recordset(NULL::journal_events, payload->'journal_events');

  RETURN run_uuid;
END;
$$;
```

**Behavior**:
- All four inserts run inside the implicit transaction of the function
- Any constraint violation (RLS, CHECK, FK) rolls back the entire push
- Returns the run UUID on success, raises on any error
- `SECURITY INVOKER` means the caller's RLS context applies — for authenticated users, RLS enforces `user_id = auth.uid()`; for the service role, RLS is bypassed but the function still validates the `caller_uid` matches the payload's `user_id`

---

## Pydantic Models (Python side)

Located in `backend/src/intraday_trade_spy/storage/models.py`. Each row type has a Pydantic model that mirrors the table schema; the JSONB columns (`config.params`, `run.summary`, `signal.indicator_context`, `journal_event.details`) have their own typed sub-models.

```python
# Sketch — full types in implementation phase
class StrategyRow(BaseModel): ...
class ConfigParams(BaseModel): ...  # the JSONB body
class ConfigRow(BaseModel): ...
class RunSummary(BaseModel): ...    # the JSONB body
class RunRow(BaseModel): ...
class TradeRow(BaseModel): ...
class SignalIndicatorContext(BaseModel): ...  # the JSONB body
class SignalRow(BaseModel): ...
class JournalEventDetails(BaseModel): ...     # the JSONB body, discriminated by kind
class JournalEventRow(BaseModel): ...
class BarRow(BaseModel): ...

class PushRunPayload(BaseModel):
    """The full atomic-push body. Pydantic validation MUST pass before the
    payload is sent — anything that fails at the DB CHECK layer should fail
    earlier here with a nicer error."""
    run: RunRow
    trades: list[TradeRow]
    signals: list[SignalRow]
    journal_events: list[JournalEventRow]
```

---

## Migration files

Numbered SQL files in `backend/db/migrations/`. Each migration is idempotent (uses `IF NOT EXISTS`) so reapplication to a non-empty database is safe.

| File | Purpose |
|---|---|
| `0001_strategies.sql` | `strategies` table + indexes |
| `0002_configs.sql` | `configs` table + indexes |
| `0003_runs.sql` | `runs` table + indexes |
| `0004_trades.sql` | `trades` table + indexes |
| `0005_signals.sql` | `signals` table + indexes |
| `0006_journal_events.sql` | `journal_events` table + indexes |
| `0007_bars.sql` | `bars` table + indexes |
| `0010_rls_enable.sql` | `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` for every user-scoped table |
| `0011_rls_policies_strategies.sql` | Strategy registry policies |
| `0012_rls_policies_user_scoped.sql` | `(user_id = auth.uid())` policies for the 5 user-scoped tables |
| `0013_rls_policies_bars.sql` | `bars` read-authenticated, write-service-role |
| `0020_seed_strategies.sql` | Seed `vwap_pullback_long` |
| `0030_push_run_function.sql` | `push_run(jsonb)` Postgres function |
| `0040_storage_buckets.sql` | Create `raw-data` and `run-artifacts` buckets + path-prefix policies |

---

## State transitions

The schema models persistent state, not workflow state. Two implicit transitions exist:

1. **Run lifecycle**: `(does not exist)` → `(persisted via push_run)`. Once persisted, a run is immutable — there is no UPDATE path on `runs`, `trades`, `signals`, or `journal_events` for an existing row. (A re-run of the same config produces a new `run_id`.) This is enforced by the absence of `UPDATE` policies in the RLS for user-authenticated callers; the service role can update for migration purposes only.
2. **Strategy lifecycle**: `(seeded)` → `(disabled)` via `UPDATE strategies SET enabled = FALSE` (service role only). Existing runs that referenced the strategy continue to be queryable because the FK is `RESTRICT` on delete and the row is never deleted.

---

## Validation rules cross-referenced to spec

| Spec FR | Schema enforcement |
|---|---|
| FR-001 (all 7 entities exist) | 7 tables defined above |
| FR-002 (user-scope) | `user_id` + RLS on the 5 user-scoped tables |
| FR-003 (bars read-public, write-service) | `bars` RLS policies |
| FR-006 (atomic push) | `push_run(jsonb)` transaction |
| FR-008 (rejected signals first-class) | `signals.executed BOOLEAN`, `rejection_reason` CHECK list |
| FR-009 (live_auto_enabled default false) | `configs.live_auto_enabled` DEFAULT FALSE + CHECK |
| FR-010 (strategy registry seeded) | `0020_seed_strategies.sql` |
| FR-011 (additive strategies) | New rows in `strategies`; existing `runs.strategy_id` FK unaffected |
| FR-015 (service-role credential safety) | Function uses `SECURITY INVOKER`; RLS is the actual gate |
