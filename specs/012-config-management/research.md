# Phase 0 — Research: First-Class Config Management

Grounded against the existing `configs` substrate. Format: **Decision · Rationale · Alternatives rejected**.

## R1 — Active-config modeling

**Decision.** Add a nullable `is_active BOOLEAN` column to `configs` with a **partial unique index** `WHERE is_active` per user (`UNIQUE(user_id) WHERE is_active = true`), guaranteeing at most one active config per user. Migration marks each user's existing `default` active. `set_active_config` flips the flag in a transaction (unset the old, set the new). Config-picker surfaces default their selection to the active config.

**Rationale.** Minimal schema change; the DB enforces the "exactly one active" invariant; backward-compatible (the implicit `default` becomes the active one). Clarified: keep a designated active config (no forced explicit selection).

**Alternatives rejected.** A separate `user_settings.active_config_id` pointer (extra table/row to keep in sync); client-only "last selected" (not durable across devices/sessions; the picker would have no server truth).

## R2 — Safe delete (clarified: SET NULL)

**Decision.** Make `runs.config_id` **nullable** and change its FK to `ON DELETE SET NULL` (migration: drop the existing NOT-NULL + FK, re-add nullable + `ON DELETE SET NULL`). `delete_config` then simply deletes the row; referencing runs keep their immutable `config_snapshot` (migration 0092) and their `config_id` becomes NULL. Deletion is blocked for the operator's last remaining config; deleting the active config promotes another remaining config to active (in the same transaction).

**Rationale.** Matches the clarified choice (allow deleting any config, nullify the link, history preserved by snapshot). The snapshot already decouples run history from the live config, so SET NULL loses nothing the UI needs. FK never dangles.

**Validation (TDD).** A test inserts a run referencing config C (with snapshot), deletes C, and asserts: the run still loads, its snapshot is intact, `config_id` is NULL, and no FK error. A second test asserts deleting the *last* config is rejected, and deleting the *active* config promotes another.

**Alternatives rejected.** `RESTRICT` (your most-used configs could never be deleted); soft-delete (adds a deleted-state to filter everywhere + a restore surface — heavier than the snapshot already gives us).

## R3 — Preset exposure

**Decision.** A small `config_presets.py` loads `backend/config/presets/*.yaml` into `{name, description, params}` (params reshaped to the nested `{risk, strategy, market, ...}` form the configs/loader expect). `GET /api/configs/presets` returns them; "create from preset" copies a preset's params into a new named config. Presets are **read-only templates** (not user-editable in place).

**Rationale.** Presets already exist as files; exposing them is the cheapest way to give "create from preset" real starting points. Keeping them read-only avoids a second editing surface.

**Note.** The shipped preset files currently encode the position-cap problem (the `aggressive` preset header literally says "most signals will reject" because the cap binds). R5 fixes them so each preset actually trades.

**Alternatives rejected.** Seeding presets as per-user configs at signup (clutters every user's list with 4–5 configs they didn't make); a DB presets table (files are simpler and already the source of truth).

## R4 — Config lifecycle storage + API

**Decision.** Add to `storage/client.py`: `create_config(name, params, strategy_id, mode)`, `duplicate_config(src_id, new_name)`, `rename_config(id, new_name)`, `delete_config(id)` (with last-config guard + active promotion), `set_active_config(id)`, `get_active_config()`, `list_presets()`. Reuse existing `list_configs` / `get_config_by_id` / `update_config`. New endpoints on the existing `configs` router: `POST /api/configs` (create: source = scratch | preset | duplicate), `POST /api/configs/{id}/duplicate`, `PATCH /api/configs/{id}` (extend the existing params-patch to also accept an optional `name` rename), `DELETE /api/configs/{id}`, `POST /api/configs/{id}/activate`, `GET /api/configs/presets`. All owner-scoped, all reject `symbol`/`direction`/`live_auto_enabled` at the boundary.

**Rationale.** Reuses the existing router + storage patterns (mirrors how runs/studies CRUD is done); minimal new surface.

**Validation (TDD).** Name-collision rejected (create + rename); create-from-preset/duplicate copies params and never enables live; uniqueness + last-config + one-active invariants hold.

## R5 — Workable default + presets (the 0-trade fix)

**Decision.** Set `risk.max_position_value_pct = 400` (≈4× intraday day-trading buying power — standard for a same-day strategy) in: (a) `backend/config/config.yaml` (the canonical default), (b) the `seed_default_config_for_user` function (migration 0122) so new users get a workable default, with a reseed of existing `default` configs still on the mis-sized cap; and adjust each preset in `backend/config/presets/*.yaml` (and its header note) so it actually executes trades while still representing a distinct risk profile. Keep per-trade risk and the daily-loss limit sane (the loss veto is unchanged).

**Rationale.** Empirically (this session) `cap=100` yields ~0–2 trades over 2024 (`position_size_cap` rejects the risk-based size); `cap=400` yields ~358 trades at risk 0.5%, ~506 at risk 0.25%. 4× buying power is realistic for intraday, not leverage fantasy. This relaxes buying-power headroom only — per-trade risk and the daily-loss circuit breaker are untouched (Principle III preserved).

**Validation (TDD).** A test creates a config from the shipped default (and from each preset) and asserts a multi-month SPY backtest executes a non-trivial trade count (> 0, realistically dozens+). A separate test asserts the daily-loss/per-trade limits still bind (the cap raise didn't disable the veto).

**Alternatives rejected.** Lowering `max_risk_per_trade_pct` instead (also works, but makes positions tiny and is a less honest fix for an intraday strategy that should be able to size up to 4×); a bigger `account_value` (cosmetic — the trade-count depends on the risk%/cap% ratio, not account size).

## R6 — Frontend: multi-config manager

**Decision.** Evolve the existing single-config surface (`strategy-config-dropdown.tsx` + `_authenticated.strategies.tsx`) into a **config manager**: a list of configs (active one marked), create (from preset / duplicate / scratch), rename, delete (with a confirm + the run-history-safe note), activate, and edit the selected config's knobs. The Feature 011 pickers (study launcher, lockbox) + start-backtest already consume `listConfigs`, so they gain real choices and pre-select the active config. New `HELP_CONTENT` keys for the new concepts.

**Rationale.** Reuses the existing config-editing UI + react-query patterns; no new top-level area.

**Alternatives rejected.** A brand-new "Configs" page disconnected from strategies (fragments the IA); leaving the dropdown single-config (defeats the feature).

## R7 — Migration sequencing

**Decision.** New migrations in the **`0120-` range** (latest is `0112`): `0120_configs_active_flag.sql`, `0121_runs_config_id_nullable.sql`, `0122_workable_default_seed.sql`. Applied via direct psycopg + `SUPABASE_DB_URL` (sandbox off). `0121` must drop the existing `runs_config_id_fkey` and re-add it nullable with `ON DELETE SET NULL` — verify the constraint name first.

**Rationale.** Feature-grouped numbering; idempotent where possible. The running operator's `default` was already hand-patched to `cap=400` this session — `0122`'s reseed is written to be safe/idempotent against that.
