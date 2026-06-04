# Implementation Plan: First-Class Config Management

**Branch**: `012-config-management` | **Date**: 2026-06-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-config-management/spec.md`

## Summary

Make a strategy config a **first-class, named object** so the validation engine (011) has more than one config to compare and the operator can do real parameter research. Today the app uses a single mutable `default`; the `configs` table already supports multiple named configs (`UNIQUE(user_id, name)`) and every run already snapshots the exact knobs it ran with (migration 0092) — what's missing is the lifecycle (create / duplicate / rename / delete), the multi-config UI, safe-delete semantics, an "active" designation, and workable shipped defaults.

Four slices:
1. **Create + select** (P1): create a config from a built-in preset, by duplicating, or from sane defaults; every config-picker surface (backtest / study / lockbox) selects from the real list, with one **active** config pre-selected (backward-compatible with today's implicit `default`).
2. **Edit per-config** (P2): the existing single-config editor becomes a per-selected-config editor.
3. **Duplicate / rename / safe delete** (P3): delete any config except the last; deletion nullifies the run's live link (`runs.config_id` → nullable, `ON DELETE SET NULL`) while the run's snapshot preserves history.
4. **Workable defaults & presets** (P2): fix the discovered 0-trade wall — the shipped default's `max_position_value_pct=100` rejects the risk-based intraday size (`position_size_cap`); ship `≈400` (4× intraday buying power) so backtests execute, and make the presets span low-risk → aggressive *and actually trade*.

Live stays disabled at every config path (`live_auto_enabled` pinned `FALSE`); the risk manager keeps its absolute veto; config lifecycle events are journaled; every new concept ships a `HelpTooltip`; all behavior changes are test-first.

## Technical Context

**Language/Version**: Python ≥3.11 (backend), TypeScript / React 18 (frontend)

**Primary Dependencies**: FastAPI, Pydantic v2, supabase-py, pyyaml (preset loading), pytest (backend); React + Vite + Tailwind, `@tanstack/react-query`, TanStack Router, Radix Popover (`HelpTooltip`), vitest + @testing-library/react (frontend). No new dependencies.

**Storage**: Supabase Postgres. Reuses the `configs` table (no new table). Migrations: add `configs.is_active` (one active per user) + reseed a workable default; make `runs.config_id` nullable with `ON DELETE SET NULL`. Built-in presets are read from `backend/config/presets/*.yaml`.

**Testing**: pytest (storage CRUD + safe-delete + active-flag invariants + preset loading + a "no config path enables live" guard + a backtest-executes-trades check on the shipped default/presets); vitest + testing-library (the multi-config manager UI + pickers + tooltips).

**Target Platform**: Linux server (FastAPI in Docker), modern browser (SPA).

**Project Type**: Web application (`backend/` + `frontend/`).

**Performance Goals**: Config CRUD is trivial (single-row ops). The only non-trivial check is the "shipped default/presets execute trades" test — a multi-month backtest (~10–20k bars, ~2–3s) per preset.

**Constraints**: `live_auto_enabled` stays `Literal[False]` at the Pydantic, DB-CHECK, and storage-validator layers. Raising `max_position_value_pct` changes *buying-power headroom*, not the loss controls — per-trade risk, daily-loss limit, max-trades/day, and the stop+target requirement are unchanged, so the risk veto is not weakened. Names unique per user; at least one config always exists; exactly one active per user. Run history is immutable (snapshot) regardless of config deletion.

**Scale/Scope**: Single operator; a handful to dozens of named configs; SPY-only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0).

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes (indirect) | Configs stay SPY-only: every config references the `vwap_pullback_long` strategy (SPY), `market.symbol: SPY`, `timeframe='5m'` CHECK. Presets and created configs cannot introduce another symbol. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | Config management is **manual parameter management** — no ML, no optimizer, no auto-search. Knobs are the existing rule-based risk/strategy params; `Direction` stays LONG. Comparing configs is the operator's manual research (Principle II's allowed activity). |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | **yes** | Every config's risk knobs are still enforced by the risk manager with absolute veto; stop **and** target remain required; daily-loss / max-trades / cooldown / consecutive-loss limits remain. Raising `max_position_value_pct` (the workable-default fix) only relaxes the *position-VALUE/buying-power* cap (standard 4× intraday) — it does **not** raise per-trade risk, the daily-loss circuit breaker, or remove any veto. A test asserts the loss controls still bind. All limits remain in config (per-config), never hardcoded. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Failing-test-first for: each storage method (create/duplicate/rename/delete/set-active/get-active/list-presets), the name-uniqueness + last-config + one-active invariants, the `ON DELETE SET NULL` run-history-preservation, preset loading, the shipped-default/presets-execute-trades check, and every endpoint + UI component. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | `configs.live_auto_enabled` keeps its `CHECK (= FALSE)`; `ConfigRow`/create paths keep `Literal[False]`; create-from-preset/duplicate/scratch cannot set it true. A test asserts no config path (any endpoint) can enable live. Mode stays `backtest`/`paper`. |
| VI | Educational UI: Every Concept Is Explained | yes | New `HELP_CONTENT` keys + `HelpTooltip`s for: a named/saved config, active config, duplicate-vs-edit, why deleting is safe for run history, intraday buying power / the position-value cap. |
| VII | Journal Everything | yes | Config create / duplicate / rename / delete / activate emit `journal_events` (`kind='lifecycle'`, details `{event: "config_*", name}`) via the existing journal sink. |

**Engineering standards check:**

- [x] Timezone `America/New_York` unaffected (no new time logic).
- [x] New limits/thresholds live in config (the workable default + presets are config/seed values, `backend/config/config.yaml` + the seed function + `backend/config/presets/*.yaml`), not hardcoded in source.
- [x] Backend Python ≥3.11 / FastAPI / Pydantic v2 / pytest.
- [x] Frontend React + TypeScript + Vite + Tailwind.

No NON-NEGOTIABLE principle is violated. The one load-bearing nuance (III): raising the position-value cap relaxes buying-power headroom, not the loss veto — proven by a test that the daily-loss/per-trade limits still bind. **Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/012-config-management/
├── plan.md              # This file
├── research.md          # Phase 0 — active-flag modeling, safe-delete (SET NULL), preset exposure, workable-default values, UI evolution
├── data-model.md        # Phase 1 — configs.is_active + runs.config_id nullable; ConfigRow/views; preset model; state transitions
├── quickstart.md        # Phase 1 — create/duplicate/rename/delete/activate a config + verify trades execute
├── contracts/
│   └── config-api.md     # /api/configs CRUD + presets + activate endpoints
├── checklists/
│   └── requirements.md  # spec quality checklist (from /speckit-specify)
└── tasks.md             # /speckit-tasks output (NOT created here)
```

### Source Code (repository root)

```text
backend/
├── config/
│   ├── config.yaml                          # workable default: risk.max_position_value_pct 100 -> 400 (EDIT)
│   └── presets/*.yaml                        # ensure each preset actually trades (cap fix); these become creatable templates (EDIT)
├── db/migrations/
│   ├── 0120_configs_active_flag.sql          # ADD configs.is_active + partial unique (one active/user); mark existing default active (NEW)
│   ├── 0121_runs_config_id_nullable.sql      # runs.config_id -> NULLABLE; drop+recreate FK with ON DELETE SET NULL (NEW)
│   └── 0122_workable_default_seed.sql         # update seed_default_config_for_user params (cap=400) + reseed mis-sized defaults (NEW)
├── src/intraday_trade_spy/
│   ├── config_presets.py                     # load backend/config/presets/*.yaml -> {name, params} (NEW)
│   ├── api/
│   │   ├── routers/configs.py                # POST create / POST {id}/duplicate / PATCH {id} (rename+params) / DELETE {id} / POST {id}/activate / GET presets (EDIT)
│   │   └── schemas.py                        # ConfigCreateRequest / ConfigRenameRequest / PresetView; ConfigView + is_active (EDIT)
│   └── storage/
│       ├── client.py                         # create_config / duplicate_config / rename_config / delete_config / set_active_config / get_active_config / list_presets (EDIT)
│       └── models.py                         # ConfigRow + is_active; RunRow config_id Optional (EDIT)
└── tests/
    └── (storage + api + a presets-execute-trades check)   # failing-test-first (NEW/EDIT)

frontend/
├── src/
│   ├── api/configs.ts                        # createConfig / duplicateConfig / renameConfig / deleteConfig / activateConfig / listPresets (EDIT)
│   ├── hooks/useConfigs.ts                    # mutations + active-config awareness (EDIT)
│   ├── routes/_authenticated.strategies.tsx   # evolve into the multi-config manager home (EDIT)
│   └── components/
│       ├── strategy-config-dropdown.tsx       # becomes config selector incl. active marker (EDIT)
│       ├── strategies/config-manager.tsx      # list + create/duplicate/rename/delete/activate (NEW)
│       └── help-content.ts                    # new HELP_CONTENT keys (EDIT)
└── src/components/strategies/*.test.tsx       # vitest tests (NEW/EDIT)
```

**Structure Decision**: Existing web-app layout. Additive + evolutionary: reuse the `configs` table (no new table), add three migrations (active flag, nullable run FK, workable seed), add config-lifecycle storage methods + endpoints + a preset loader, and evolve the single-config editor into a multi-config manager. The Feature 011 config pickers (study launcher, lockbox) and the start-backtest flow already call `listConfigs`, so they gain real choices automatically once create/duplicate exist.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
