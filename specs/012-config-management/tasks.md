---
description: "Task list for Feature 012 — First-Class Config Management"
---

# Tasks: First-Class Config Management

**Input**: Design documents from `/specs/012-config-management/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/config-api.md, quickstart.md

**Tests**: MANDATORY per constitution IV for every task touching `backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}`; each implementation task is preceded by its failing-test task. Exempt: `config.yaml`, preset `*.yaml`, SQL migrations, `*.md`. NOTE: storage-client tests are integration-style (gated on local/cloud Supabase, as in Feature 011) — verified via cloud smoke; pure logic (preset loader, trades-execute check, no-live guard), API (TestClient + stub storage), and frontend (vitest) are locally unit-testable.

## Format: `[ID] [P?] [Story?] Description with file path`

---

## Phase 1: Setup

- [X] T001 [P] Author migration `backend/db/migrations/0120_configs_active_flag.sql` — ADD `configs.is_active BOOLEAN NOT NULL DEFAULT false`, partial unique index `(user_id) WHERE is_active`, backfill each user's `default` (or earliest) config active.
- [X] T002 [P] Author migration `backend/db/migrations/0121_runs_config_id_nullable.sql` — `runs.config_id` DROP NOT NULL; drop the existing FK (verify constraint name first) and re-add `FOREIGN KEY (config_id) REFERENCES configs(id) ON DELETE SET NULL`.
- [X] T003 [P] Author migration `backend/db/migrations/0122_workable_default_seed.sql` — `CREATE OR REPLACE FUNCTION seed_default_config_for_user` with `risk.max_position_value_pct=400`; idempotently reseed existing `default` configs still on the mis-sized cap (safe against the already-hand-patched live default).
- [X] T004 Apply migrations 0120/0121/0122 to Supabase via direct psycopg + `SUPABASE_DB_URL` (sandbox off if blocked); verify `is_active`, the nullable FK, and the seed function.
- [X] T005 [P] Set `risk.max_position_value_pct: 400` in `backend/config/config.yaml` and adjust each `backend/config/presets/*.yaml` (and its header note) so every preset executes trades while staying a distinct risk profile (the `aggressive` preset's "most signals reject" note must no longer hold).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ Blocks all stories**: the shared `is_active` / nullable-`config_id` model surface every story reads.

- [X] T006 [P] Failing test: `ConfigRow` gains `is_active`; `RunRow.config_id` is `Optional` — in `backend/tests/storage/test_models_payload.py`.
- [X] T007 Add `is_active: bool` to `ConfigRow` and make `RunRow.config_id: Optional[UUID]` in `backend/src/intraday_trade_spy/storage/models.py`.
- [X] T008 Failing test: `ConfigView` exposes `is_active` and `GET /api/configs` returns it — in `backend/tests/api/new/test_configs_api.py`.
- [X] T009 Add `is_active` to `ConfigView` in `backend/src/intraday_trade_spy/api/schemas.py` and ensure `list_configs` surfaces it.

**Checkpoint**: model surface ready — stories can begin.

---

## Phase 3: User Story 1 — Create a config & select it (Priority: P1) 🎯 MVP

**Goal**: create a config (preset / duplicate / scratch), select it everywhere, with one active config pre-selected.

**Independent Test**: create "low-risk" from a preset, launch a backtest selecting it, confirm the run's snapshot reflects that config (SC-001/002).

- [X] T010 [P] [US1] Failing test: `load_presets()` reads `backend/config/presets/*.yaml` → `{name, description, params}` (nested shape) in `backend/tests/test_config_presets.py`.
- [X] T011 [US1] Implement `backend/src/intraday_trade_spy/config_presets.py` (preset loader).
- [X] T012 [US1] Failing test (integration-style): `create_config` (duplicate-name → 422, `live_auto_enabled` forced false), `duplicate_config`, `set_active_config` / `get_active_config`, one-active invariant — in `backend/tests/storage/test_client_configs.py`.
- [X] T013 [US1] Implement `create_config` / `duplicate_config` / `set_active_config` / `get_active_config` / `list_presets` in `backend/src/intraday_trade_spy/storage/client.py`; create/duplicate emit a `journal_events` lifecycle row.
- [X] T014 [US1] Failing test: `POST /api/configs` (scratch/preset/duplicate), `POST /api/configs/{id}/activate`, `GET /api/configs/presets` — in `backend/tests/api/new/test_configs_api.py` (TestClient + stub storage, `pytestmark = pytest.mark.api`).
- [X] T015 [US1] Implement create / duplicate / activate / presets endpoints in `backend/src/intraday_trade_spy/api/routers/configs.py` + `ConfigCreateRequest` / `PresetView` / `PresetListResponse` in `api/schemas.py` (reject symbol/direction/live_auto_enabled at the boundary).
- [X] T016 [P] [US1] Frontend failing test: config manager creates from preset/duplicate, marks the active config, and pickers pre-select active — in `frontend/src/components/strategies/config-manager.test.tsx`.
- [X] T017 [US1] Implement `frontend/src/components/strategies/config-manager.tsx` (create/duplicate/activate) + `createConfig`/`duplicateConfig`/`activateConfig`/`listPresets` in `frontend/src/api/configs.ts` + mutations in `frontend/src/hooks/useConfigs.ts` + active pre-selection in the study/backtest/lockbox pickers.
- [X] T018 [P] [US1] Add `HELP_CONTENT` keys `saved_config`, `active_config` to `frontend/src/components/help-content.ts` + `HelpTooltip`s in `config-manager.tsx`; assert in its test.

**Checkpoint**: US1 independently functional (MVP) — more than one config exists and is selectable.

---

## Phase 4: User Story 2 — Edit a config per-config (Priority: P2)

**Goal**: edit the selected named config's knobs; saving affects only that config.

**Independent Test**: edit "low-risk"'s risk-reward, save, confirm `default` is unchanged and past runs are unaffected.

- [X] T019 [P] [US2] Failing test (integration-style): `update_config` edits only the targeted config (owner+id scoped); other configs and finished runs unchanged — in `backend/tests/storage/test_client_configs.py`.
- [X] T020 [P] [US2] Frontend failing test: editing the selected config saves only that config (no cross-config bleed) in `frontend/src/components/strategies/config-manager.test.tsx`.
- [X] T021 [US2] Wire per-selected-config editing into `config-manager.tsx` (reuse the existing `PATCH /api/configs/{id}` params path); ensure the editor is scoped to the selected config.

**Checkpoint**: US1 + US2 functional.

---

## Phase 5: User Story 3 — Duplicate, rename & safe delete (Priority: P3)

**Goal**: rename and delete configs without corrupting run history; can't delete the last config.

**Independent Test**: delete a config a past run used; the run still opens with its original knobs (its `config_id` is now NULL). Last-config delete is blocked.

- [X] T022 [US3] Failing test (integration-style): `rename_config` (collision → reject), `delete_config` (last-config → 409, active-config deletion promotes another, `ON DELETE SET NULL` preserves run history) — in `backend/tests/storage/test_client_configs.py`.
- [X] T023 [US3] Implement `rename_config` + `delete_config` (last-config guard, active promotion, journal lifecycle event) in `backend/src/intraday_trade_spy/storage/client.py`.
- [X] T024 [US3] Failing test: `PATCH /api/configs/{id}` rename + `DELETE /api/configs/{id}` (409 last-config, run still resolvable after delete) — in `backend/tests/api/new/test_configs_api.py`.
- [X] T025 [US3] Implement rename in `PATCH /configs/{id}` (extend to accept optional `name`) + `DELETE /configs/{id}` in `routers/configs.py` + `ConfigRenameRequest` in `api/schemas.py`.
- [X] T026 [P] [US3] Frontend failing test: rename + delete (confirm dialog + run-history-safe note; last-config delete disabled) in `frontend/src/components/strategies/config-manager.test.tsx`.
- [X] T027 [US3] Implement rename/delete in `config-manager.tsx` + `renameConfig`/`deleteConfig` in `frontend/src/api/configs.ts` + mutations in `useConfigs.ts`.
- [X] T028 [P] [US3] Add `HELP_CONTENT` keys `duplicate_vs_edit`, `delete_safe` to `frontend/src/components/help-content.ts` + `HelpTooltip`s in `config-manager.tsx`; assert in its test.

**Checkpoint**: US1–US3 functional.

---

## Phase 6: User Story 4 — Workable default & presets that trade (Priority: P2)

**Goal**: the shipped default + presets execute a non-trivial trade count on SPY; no more 0-trade wall.

**Independent Test**: a config from the shipped default (and each preset) executes trades over a multi-month backtest; a too-risky config still hits the daily-loss veto.

- [X] T029 [US4] Failing test: a backtest with the shipped default params over a committed multi-month fixture CSV (`backend/data/raw/spy_5m_2026-04-29_2026-05-28.csv`) executes a non-trivial trade count (cap=400 → trades > 0; assert cap=100 → ~0 for contrast) — in `backend/tests/test_workable_default.py`.
- [X] T030 [US4] Failing test: each built-in preset, loaded via `config_presets`, executes trades over the fixture and the daily-loss / per-trade veto still binds (loss controls not weakened by the cap raise) — in `backend/tests/test_workable_default.py`.
- [X] T031 [US4] Finalize `backend/config/config.yaml` + `backend/config/presets/*.yaml` values so T029/T030 pass (presets span low-risk → aggressive, all trading). (Config files — verified by the tests above.)

**Checkpoint**: all four stories functional.

---

## Phase 7: Polish & Cross-Cutting

- [X] T032 [P] Guard test: no config path (create/duplicate/preset/edit, any endpoint) can set `live_auto_enabled` true; the CHECK + `Literal[False]` hold — in `backend/tests/api/new/test_configs_api.py`.
- [X] T033 [P] Test: config create/duplicate/rename/delete/activate emit `journal_events` lifecycle rows (constitution VII) — in `backend/tests/storage/test_client_configs.py`.
- [X] T034 [P] Update `docs/research-tooling-uplift.md` (012 status) + the roadmap §10 feature map (012 done).
- [X] T035 Run `quickstart.md` end-to-end against cloud (create→edit→duplicate→safe-delete→activate; confirm a fresh-default backtest trades).
- [X] T036 [P] Verify the Feature 011 pickers (study launcher, lockbox) + start-backtest now list multiple configs and pre-select the active one (closes SC-007).

---

## Dependencies & Execution Order

- **Setup (Ph1)** → **Foundational (Ph2)** blocks all stories. Within Foundational: T006→T007, T008→T009.
- **US1 (P1)** depends on Foundational → MVP. Within US1: T010→T011 (presets), T012→T013 (storage), T014→T015 (API), T016→T017 (UI), T018 (tooltips).
- **US2 (P2)** depends on Foundational; mostly UI (edit already exists as PATCH params).
- **US3 (P3)** depends on Foundational + the `0121` SET NULL migration (Setup). Independent of US2.
- **US4 (P2)** depends on the `0122` seed + config/preset edits (Setup) + the engine; independent of US2/US3.
- **Polish (Ph7)** after the stories you intend to ship.

### Parallel opportunities
- Setup T001–T003, T005 all [P]; T004 (apply) after them.
- Foundational test-authoring [P]; then impl.
- Across stories: once Foundational lands, US1–US4 are largely independent tracks (distinct files); within a story, [P] tasks are different files (e.g. the frontend test, the tooltip task).

---

## Implementation Strategy

**MVP = Setup + Foundational + US1.** Once you can create a second config and select it (with the workable default from Setup so it trades), the validation engine finally has real configs to compare — the core unlock. Then US2 (edit) → US3 (rename/safe-delete) → US4 (presets across the risk spectrum). Each story is independently demoable.

## Notes
- Every `backend/src`/`frontend/src` implementation task is preceded by its failing test (constitution IV). Storage-client tests are integration-style (cloud-smoke-verified, as in Feature 011); preset-loader / trades-execute / API / frontend tests run locally.
- Migrations 0120/0121/0122 in Setup; the workable default + presets land in version control (config.yaml + seed + presets), not just the patched live DB.
- Commit after each task or logical group; stop at any checkpoint to validate a story.
