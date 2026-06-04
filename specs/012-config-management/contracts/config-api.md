# Phase 1 — API Contract: Config Management

Extends the existing `api/routers/configs.py` (currently `GET /api/configs` + `PATCH /api/configs/{id}`). All endpoints authenticated (JWT → `auth_user_id`), owner-scoped via `SupabaseStorageClient(user_id=...)`. No endpoint accepts `symbol`, `direction`, or `live_auto_enabled` (server-pinned). Errors use the existing problem shape (`raise_validation_error` → 400, `raise_not_found` → 404).

---

## Existing (unchanged shape, `ConfigView` gains `is_active`)

- `GET /api/configs` → `{ configs: ConfigView[] }` — the operator's configs (now > 1).

`ConfigView`: `{ id, name, mode, timeframe, strategy_id, params, is_active }`

## New

### Create a config
`POST /api/configs` → `201 ConfigView`

```jsonc
{ "name": "tighter-stop",
  "source": "scratch" | "preset" | "duplicate",
  "preset_name": "low-risk",      // required when source=preset
  "from_config_id": "<uuid>" }    // required when source=duplicate
```
- `scratch` → seeded from the workable default params.
- `preset` → copy the named preset's params.
- `duplicate` → deep-copy `from_config_id`'s params.
- Errors: `400` duplicate/invalid name · `404` unknown preset / from_config · `422` missing the source-specific field.

### Duplicate (convenience)
`POST /api/configs/{id}/duplicate` `{ "name": "..." }` → `201 ConfigView`. (Equivalent to create with source=duplicate.)

### Rename / edit
`PATCH /api/configs/{id}` → `200 ConfigView`
```jsonc
{ "name": "new-name",   // optional — rename
  "params": { ... } }    // optional — edit knobs (existing behavior)
```
At least one of `name` / `params`. `400` on name collision; `404` if not owned.

### Delete
`DELETE /api/configs/{id}` → `200 { "deleted": "<id>" }`
- Refuses (`409 { error: "last_config" }`) if it's the operator's only config.
- If the deleted config was active, another remaining config is promoted to active (returned hint).
- Referencing runs are preserved (their `config_id` → NULL via `ON DELETE SET NULL`; snapshot intact).

### Activate
`POST /api/configs/{id}/activate` → `200 ConfigView` (the now-active config). Clears the previous active. `404` if not owned.

### Presets
`GET /api/configs/presets` → `{ presets: PresetView[] }`

`PresetView`: `{ name, description, params }` — read-only built-in templates (low-risk / balanced / aggressive / vwap-variant) for `source=preset` creation.

---

## Consumers (already call `listConfigs`; gain real choices + active pre-selection)
- Start-backtest (`POST /api/backtests`) — config picker.
- Start validation study (`POST /api/validation/studies`, Feature 011) — config picker.
- Lockbox run (`POST /api/validation/lockbox/run`, Feature 011) — candidate-config picker.

## Non-goals (this contract)
- Sharing configs across users; import/export; a presets *write* API (presets are read-only files).
- Automated parameter optimization (Principle II).
