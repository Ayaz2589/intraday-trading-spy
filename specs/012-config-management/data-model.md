# Phase 1 — Data Model: First-Class Config Management

## A. Database schema changes (Supabase Postgres)

### A1. `configs` — add active flag (migration `0120`)

Reuses the existing table (id, user_id, strategy_id, name, mode, live_auto_enabled CHECK=FALSE, timeframe CHECK='5m', params JSONB, created/updated, UNIQUE(user_id, name)). Add:

| Column | Type | Notes |
|---|---|---|
| `is_active` | BOOLEAN NOT NULL DEFAULT false | exactly one true per user |

**Index:** `CREATE UNIQUE INDEX configs_one_active_per_user ON public.configs (user_id) WHERE is_active;` (enforces ≤1 active per user). Migration backfills: set each user's `default` (or earliest) config `is_active = true`.

### A2. `runs.config_id` — nullable + SET NULL (migration `0121`)

Today: `config_id UUID NOT NULL REFERENCES public.configs(id)`. Change to nullable with `ON DELETE SET NULL` so deleting a config preserves run history (the run keeps its `config_snapshot`):

```sql
ALTER TABLE public.runs ALTER COLUMN config_id DROP NOT NULL;
ALTER TABLE public.runs DROP CONSTRAINT <runs_config_id_fkey>;   -- verify name
ALTER TABLE public.runs ADD CONSTRAINT runs_config_id_fkey
    FOREIGN KEY (config_id) REFERENCES public.configs(id) ON DELETE SET NULL;
```

### A3. Workable default seed (migration `0122`)

`CREATE OR REPLACE FUNCTION seed_default_config_for_user(uid)` with `risk.max_position_value_pct = 400` (≈4× intraday buying power) in the seeded params; reseed existing `default` configs whose params still carry the mis-sized cap. Idempotent (safe to re-run; safe against the already-hand-patched live default).

## B. Backend models (`storage/models.py`, `api/schemas.py`)

```python
# storage/models.py
class ConfigRow(_Base):
    ...existing... 
    is_active: bool = False          # NEW

class RunRow(_Base):
    ...
    config_id: Optional[UUID] = None # CHANGED: nullable (was required)

# api/schemas.py
class ConfigView(_ResponseBase):
    id, name, mode, timeframe, strategy_id, params, is_active: bool   # + is_active

class ConfigCreateRequest(_Base):
    name: str (1..200, trimmed)
    source: Literal["scratch", "preset", "duplicate"]
    preset_name: Optional[str]       # required when source == "preset"
    from_config_id: Optional[UUID]   # required when source == "duplicate"
    # symbol / direction / live_auto_enabled rejected at the boundary

class ConfigRenameRequest(_Base):
    name: str (1..200, trimmed)

class PresetView(_ResponseBase):
    name: str
    description: str
    params: dict

class PresetListResponse(_ResponseBase):
    presets: list[PresetView]
```

## C. Storage methods (`storage/client.py`)

| Method | Behavior |
|---|---|
| `create_config(*, name, params, strategy_id, mode="backtest")` | insert; reject duplicate name (422); `live_auto_enabled` forced false |
| `duplicate_config(*, src_id, new_name)` | deep-copy src params into a new named config |
| `rename_config(*, config_id, new_name)` | update name; reject collision |
| `delete_config(*, config_id)` | guard: refuse if it's the user's last config; if it was active, promote another to active; then delete (FK SET NULL nulls referencing runs' config_id) |
| `set_active_config(*, config_id)` | transaction: clear current active, set this one |
| `get_active_config()` | the user's active config row, or None |
| `list_presets()` | read `backend/config/presets/*.yaml` → PresetView list (via `config_presets.py`) |
| *(reuse)* `list_configs`, `get_config_by_id`, `update_config` | unchanged |

## D. State transitions

**Active config (per user):** exactly one active at all times (enforced by the partial unique index + always-≥1-config rule). `set_active_config(X)` → X active, prior unset. `delete_config(active)` → another remaining config becomes active.

**Config lifecycle:** create → (edit | rename | duplicate | activate)\* → delete. Delete blocked when it's the last config. Past runs are unaffected by any of these (snapshot is immutable); deleting a config nulls referencing runs' `config_id`.

## E. Validation rules (enforced + tested)

- Name unique per user (create + rename); non-empty, trimmed, length-bounded.
- Always ≥ 1 config per user; the last config cannot be deleted.
- Exactly 1 active config per user (DB-enforced).
- `live_auto_enabled` can never be set true via any create/duplicate/preset/edit path (Pydantic `Literal[False]` + DB CHECK + storage assertion).
- Deleting a config never breaks run history (runs keep snapshot; `config_id` → NULL; no dangling FK).
- Shipped default + every preset execute a non-trivial trade count on a multi-month SPY backtest (cap sized for the intraday risk-based position); the daily-loss / per-trade veto still binds.
- Configs remain SPY-only, `5m`, `backtest`/`paper`.
