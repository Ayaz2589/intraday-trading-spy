# Tasks: Human-Readable Config Descriptions

**Feature**: 025-config-descriptions | **Branch**: `025-config-descriptions`
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

**TDD is MANDATORY** (constitution P4). Every implementation task is preceded by a failing-test
task. All new code lives in `backend/src/` and `frontend/src/` (TDD-mandatory roots).

**Test commands** (stack runs in Docker):
- Backend: `docker compose exec -T backend python -m pytest <path> -q`
- Frontend: `docker compose exec -T frontend npx vitest run <path>`
- Frontend typecheck (deploy gate): `docker compose exec -T frontend npx tsc --noEmit -p tsconfig.app.json`

---

## Phase 1: Setup

- [x] T001 Confirm baseline green on the branch before changes: run `docker compose exec -T backend python -m pytest -q` and `docker compose exec -T frontend npx vitest run` and note the starting pass counts (no code change).

---

## Phase 2: Foundational (BLOCKING — all user stories depend on this)

Goal: the backend derives `summary`/`highlights` and exposes them on `ConfigView`; the frontend type
knows about them. Until this is done, no UI surface can render anything.

### Backend — pure derivation

- [x] T002 [P] Write FAILING unit tests in `backend/tests/test_config_summary.py` for `summarize_config(params)`: the contract test vectors (dist/buffer/rr/OR/window → exact one-line `summary`), deterministic (same params twice = identical), empty `{}` params → `"VWAP pullback"`, missing individual knobs omitted, unknown extra key ignored (never echoed), entry window 0–390 → `"all-day entry"` vs 60–300 → `"entry 60–300 min"`, number formatting trims trailing zeros (`2.0`→`2:1 R:R`, `1.5`→`1.5:1 R:R`; `1.0`→`≤1%`). Assert `highlights` are ordered `{label,value}` with labels sourced from `KNOB_REGISTRY`.
- [x] T003 Implement `backend/src/intraday_trade_spy/config_summary.py` to pass T002: frozen `ConfigHighlight(label,value)` + `ConfigSummary(summary, highlights)` dataclasses and a total, deterministic `summarize_config(params: dict) -> ConfigSummary`. Read labels from `validation/knobs.py::KNOB_REGISTRY`; derive the "all-day" thresholds from the entry-window `KnobSpec.min`/`.max` bounds (no literal). Lead with strategy family "VWAP pullback"; fixed knob order: max distance from VWAP → stop buffer → risk:reward → opening range → entry window. Never raise on missing/empty/non-dict/unknown params.

### Backend — API exposure

- [x] T004 [P] Write FAILING API-contract test in `backend/tests/api/test_configs_summary.py`: `GET /api/configs` returns each `ConfigView` with a non-empty `summary` (str, len ≥ 1) and a `highlights` array, AND the existing `description` field is unchanged/untouched. Include a config with empty params asserting `summary == "VWAP pullback"`. (Follow the existing configs-router test setup for auth + storage.)
- [x] T005 In `backend/src/intraday_trade_spy/api/schemas.py`: add `ConfigHighlightView(label: str, value: str)` and two Pydantic v2 `@computed_field`s on `ConfigView` — `summary: str` and `highlights: list[ConfigHighlightView]` — delegating to `config_summary.summarize_config(self.params)`. Leave all existing `ConfigView` fields (incl. `description`) untouched. Make T004 pass.

### Frontend — type

- [x] T006 [P] In `frontend/src/api/types.ts`: add `export type ConfigHighlight = { label: string; value: string }` and extend the `Config` type with `summary?: string` and `highlights?: ConfigHighlight[]`. Verify `frontend/src/api/configs.ts` passes these through untransformed (adjust the mapper if it whitelists fields).

**Checkpoint**: Backend returns summaries on every config response; FE types compile. Foundational done.

---

## Phase 3: User Story 1 — Understand what a config does at a glance (P1) 🎯 MVP

Goal: the Strategies page config list shows each config's human-readable summary next to its
technical name. **Independent test**: load Strategies page → every row shows a non-empty summary
alongside its name.

- [x] T007 [P] [US1] Write FAILING test `frontend/src/components/strategies/config-summary.test.tsx`: given `summary` + `highlights`, the component renders the one-line summary text; renders a chip per highlight (label+value); with empty `highlights` it still renders the `summary` line; with no summary it renders nothing/cleanly.
- [x] T008 [US1] Implement `frontend/src/components/strategies/config-summary.tsx`: a small presentational component taking `{ summary?, highlights? }` and rendering the one-line summary (and optionally chips). Tailwind, matches existing strategies styles. Make T007 pass.
- [x] T009 [P] [US1] Write FAILING test `frontend/src/components/strategies/config-list.test.tsx` (new or extend existing): a config with a `summary` renders the summary via `<ConfigSummary>` AND still renders the technical `name` (name not replaced).
- [x] T010 [US1] Edit `frontend/src/components/strategies/config-list.tsx` to render `<ConfigSummary summary={config.summary} highlights={config.highlights} />` beneath the technical name. Do NOT touch the existing `description` rendering. Make T009 pass.

**Checkpoint**: US1 independently testable & demoable — Strategies page is self-explanatory. This is a
shippable MVP on its own.

---

## Phase 4: User Story 2 — Distinguish configs while selecting one to run (P2)

Goal: the topbar config selector shows the summary per option. **Independent test**: open the
selector → each option shows summary + name.

- [x] T011 [P] [US2] Write FAILING test `frontend/src/components/strategy-config-dropdown.test.tsx` (new or extend): each rendered option shows both the config `name` and its `summary`; the active config's summary is available on the trigger (inline or via title/tooltip).
- [x] T012 [US2] Edit `frontend/src/components/strategy-config-dropdown.tsx` to render the config `summary` per option (reusing `<ConfigSummary>` or a compact inline form) and surface the active config's summary on the trigger. Keep `name` visible. Make T011 pass.

**Checkpoint**: US2 independently testable — selection is unambiguous.

---

## Phase 5: User Story 3 — Learn how the summary is produced (P3)

Goal: an educational `HelpTooltip` explains the summary is auto-derived from params. **Independent
test**: Strategies page summary has a `?` tooltip answering What / Why / How-derived.

- [x] T013 [P] [US3] Write FAILING test (extend `config-list.test.tsx` or `config-summary.test.tsx`) asserting a `HelpTooltip` accompanies the summary on the Strategies page and its content mentions the summary is derived from the config's parameters (not stored/editable).
- [x] T014 [US3] Add a `HelpTooltip` (existing `../help-tooltip` component) next to the summary on the Strategies page, with What / Why / How(=auto-derived from params, not editable) copy. Make T013 pass.

**Checkpoint**: US3 done — educational-UI principle satisfied.

---

## Phase 6: Polish & Cross-Cutting

- [x] T015 Run full backend suite green: `docker compose exec -T backend python -m pytest -q`. Record new test count delta in plan.md.
- [x] T016 Run full frontend suite green AND typecheck (deploy gate): `docker compose exec -T frontend npx vitest run` + `docker compose exec -T frontend npx tsc --noEmit -p tsconfig.app.json`. (Pre-existing price-chart baseline failures, if any, are noted not introduced.)
- [x] T017 [P] Manual smoke per [quickstart.md](./quickstart.md) against the running stack: confirm SC-001 (every config has a summary), SC-002 (two configs differing in one knob read differently), SC-005/FR-008 (`description` untouched), SC-006 (empty-params config shows "VWAP pullback").
- [x] T018 [P] Update [plan.md](./plan.md) status → implemented (with test counts) and update the CLAUDE.md active-plan line status from "planned" to "implemented".

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)** must complete before any user story.
- **Phase 2** blocks Phase 3/4/5 (they consume `ConfigView.summary`/`highlights` + the FE type).
- **US1 (Phase 3)** before **US2/US3** only because US2 reuses `<ConfigSummary>` (T008) and US3
  decorates the US1 surface. US2 and US3 are otherwise independent of each other.
- **Phase 6 (Polish)** last.

### TDD ordering (within every story)
Test task (FAILING) → implementation task. Never implement before its red test.

### Parallel opportunities
- T002, T004, T006 are `[P]` — different files (backend test, backend api-test, frontend type). Note
  T004's assertion only fully passes after T005, and T002 after T003 — write the red tests in
  parallel, then implement.
- Within a story, the `[P]` test task can be authored alongside the prior story's impl, but each
  impl task depends on its own red test.

## Implementation Strategy

- **MVP = Phase 1 + 2 + 3 (US1)**: backend derivation + API + Strategies-list rendering. Shippable
  and delivers the headline value (configs become self-explanatory).
- **Increment 2 = US2**: selector summaries.
- **Increment 3 = US3**: educational tooltip (completes the constitution's educational-UI bar).
- No DB migration, no new deps, read-only — low risk; the gate is the frontend `tsc` typecheck
  (the same check that blocks Vercel deploys).
