# Tasks: Clickable Claude Experiments → Draft Configs

**Input**: Design documents from `/specs/017-claude-experiment-drafts/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: MANDATORY (constitution IV). Every task touching `backend/src/**`
or `frontend/src/**` is preceded by a failing-test task. Exempt:
`migrations/*.sql`, `*.md`. The Anthropic SDK stays FULLY MOCKED (016
pattern). The sanitizer gets adversarial fixtures — never trust model output.

**Organization**: US1 (sanitized structured suggestions) → US2 (one-click
draft flow) → US3 (boundary/education sweep). US2 depends on US1's stored
shape; US3 sweeps both.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [ ] T001 Write backend/db/migrations/0124_configs_description.sql (`ALTER TABLE public.configs ADD COLUMN IF NOT EXISTS description TEXT;` per data-model §C) and apply to cloud via the direct-psycopg route (SUPABASE_DB_URL); verify column exists

---

## Phase 2: Foundational (Blocking Prerequisites)

- [ ] T002 [P] Failing tests in backend/tests/validation/test_knobs.py: KNOB_REGISTRY contains exactly the 8 seeded paths with research-R9 bounds; `sanitize_changes` keeps valid changes, drops off-registry paths, drops out-of-bounds values (e.g. risk_reward 9000), coerces int-kind knobs (minutes 15.7 → 16? no — defines: int-kind coerces via round, test pins it), keeps only the valid subset of a mixed list, returns [] for None/[]/malformed entries (non-dict, missing keys, string values) WITHOUT raising; `registry_prompt_section()` mentions every path and its bounds
- [ ] T003 Implement backend/src/intraday_trade_spy/validation/knobs.py (`KnobSpec`, `KNOB_REGISTRY`, `sanitize_changes`, `registry_prompt_section` per data-model §A) and add `ConfigChange` + `ClaudeExperiment.suggested_config_changes: list[ConfigChange] = []` to backend/src/intraday_trade_spy/models.py (data-model §B)

**Checkpoint**: the registry exists — story work can begin.

---

## Phase 3: User Story 1 - Experiments carry safe, structured knob suggestions (Priority: P1) 🎯 MVP

**Goal**: analyses store only whitelist-valid suggestions; cards display them;
pre-017 analyses untouched.

**Independent Test**: regenerate an analysis → stored experiments carry only
registry-valid changes; hand-built off-list/out-of-bounds fixtures are
stripped before storage; cards render "knob → value"; old analyses render
text-only.

### Tests for User Story 1 (write first, must fail)

- [ ] T004 [US1] Failing analyst tests (extend backend/tests/api/new/test_claude_analyst.py, SDK mocked): system prompt contains the registry section (every knob path + bounds present — generated, not hardcoded); a parsed analysis whose experiment mixes valid + off-list + out-of-bounds suggestions is STORED with only the valid ones (assert `insert_insight_analysis` kwargs); an experiment whose suggestions all die is stored with `[]`; both payload builders include `analysis_schema_version: 2` and the resulting payload_hash differs from a version-less payload (research R3 — pre-017 idempotency invalidation); an analysis with no suggestions behaves exactly as in 016

### Implementation for User Story 1

- [ ] T005 [US1] Implement in backend/src/intraday_trade_spy/api/claude_analyst.py: append `registry_prompt_section()` to SYSTEM_PROMPT composition; `_sanitize_experiments(analysis_dict)` applied after `parsed.model_dump()` and BEFORE `insert_insight_analysis` (research R4); add `"analysis_schema_version": 2` to `build_insights_payload` and `build_study_payload`
- [ ] T006 [P] [US1] Failing component tests (extend frontend/src/components/insights/ClaudeReadCard.test.tsx): an experiment fixture with `suggested_config_changes` renders each change as a "label → value" chip (friendly label, e.g. "risk:reward target → 2.5"); an experiment with `[]` or a missing key renders text-only with NO chips and NO draft button (FR-008/SC-005)
- [ ] T007 [US1] Implement: `ConfigChange` type + `suggested_config_changes?: ConfigChange[]` on the experiment type + `ConfigRow.description` in frontend/src/api/types.ts; path→label map exported from frontend/src/lib/config-knobs.ts (fallback: path leaf); chips on the experiment cards in frontend/src/components/insights/ClaudeReadCard.tsx

**Checkpoint**: US1 shippable — suggestions are visible and provably safe.

---

## Phase 4: User Story 2 - One click drafts a config to review, create, and run (Priority: P2)

**Goal**: "Draft config →" → `/strategies?draft=` → badged prefilled panel →
standard create with provenance → runnable config. Dismiss = no trace.

**Independent Test**: click the button on a suggestion-bearing experiment;
verify the panel (base, highlights, name, badge, provenance); create; config
exists with description and runs; dismiss persists nothing; malformed link →
friendly notice.

### Tests for User Story 2 (write first, must fail)

- [ ] T008 [P] [US2] Failing tests in frontend/src/lib/draft-config.test.ts: `encodeDraft`/`decodeDraft` round-trip the DraftConfig shape (data-model §E); `decodeDraft` returns null for garbage strings, valid-base64-wrong-shape JSON, and oversized input — never throws
- [ ] T009 [US2] Implement frontend/src/lib/draft-config.ts (base64url encode/decode with defensive parsing)
- [ ] T010 [P] [US2] Failing API contract tests in backend/tests/api/new/test_configs_description.py (unit_client + stub storage): POST /api/configs with `description` passes it to `create_config` and echoes it in the response; description > 500 chars → 400; omitted → null; GET /api/configs rows include `description`
- [ ] T011 [US2] Implement: `description` on the config create request/views in backend/src/intraday_trade_spy/api/schemas.py; pass-through in backend/src/intraday_trade_spy/api/routers/configs.py; `create_config(..., description=None)` + row mapping in backend/src/intraday_trade_spy/storage/client.py
- [ ] T012 [P] [US2] Failing component tests in frontend/src/components/strategies/DraftConfigPanel.test.tsx: renders the badge ("review before creating"), provenance line, and base → suggested rows with the changed values highlighted; resolves the base config by name from the supplied configs list; missing base → falls back to the active config WITH a substitution notice (FR-004); suggested name is `<base>-exp-<n>` and suffixes on collision with existing names; Create calls the standard create API with merged params + description; Dismiss fires the dismiss callback and creates nothing
- [ ] T013 [US2] Implement frontend/src/components/strategies/DraftConfigPanel.tsx (props: draft, configs, activeConfig, onDismiss; merge changes over the base's params; create via the existing configs API client; highlight changed knobs using the config-knobs labels)
- [ ] T014 [US2] Failing integration tests: ClaudeReadCard shows "Draft config →" ONLY on experiments with surviving changes and clicking navigates to /strategies with the encoded draft (mock router — extend ClaudeReadCard.test.tsx); the strategies surface renders DraftConfigPanel when a valid `?draft=` is present and a friendly notice + normal page when the param is malformed (extend/create frontend/src/components/strategies/config-manager.test.tsx)
- [ ] T015 [US2] Implement: draft button + navigate in frontend/src/components/insights/ClaudeReadCard.tsx; `validateSearch` for `draft` in frontend/src/routes/_authenticated.strategies.tsx (sign-in precedent); host DraftConfigPanel + malformed-param notice in frontend/src/components/strategies/config-manager.tsx

**Checkpoint**: full loop works — insight → draft → reviewed create → run.

---

## Phase 5: User Story 3 - The boundary explains itself (Priority: P3)

**Goal**: tooltips, badge language, visible provenance.

### Tests for User Story 3 (write first, must fail)

- [ ] T016 [P] [US3] Failing tests: `claude_experiment_draft` exists in HELP_CONTENT and is rendered on both the experiment chips area and the draft panel (extend ClaudeReadCard.test.tsx + DraftConfigPanel.test.tsx; update the help-content census count + run-viewer sweep, +1 concept); the ConfigManager list renders a config's `description` (provenance) muted under its name (extend config-manager.test.tsx — FR-007/SC-004)

### Implementation for User Story 3

- [ ] T017 [US3] Implement: `claude_experiment_draft` entry in frontend/src/components/help-content.ts ("Claude suggests — you create"); HelpTooltips wired on the chips area + panel; description display in frontend/src/components/strategies/config-manager.tsx

---

## Phase 6: Polish & Verification

- [ ] T018 [P] Full backend suite green: `PYTHONPATH=. .venv/bin/pytest -q --ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py` from backend/
- [ ] T019 [P] Full frontend suite + types: `npm test -- --run` and `npx tsc --noEmit` from frontend/ (3 price-chart failures remain the known baseline)
- [ ] T020 Rebuild backend container (`docker compose up -d --build backend`) and verify the configs create schema exposes `description` in OpenAPI + endpoints still 401 unauthenticated
- [ ] T021 Live e2e per quickstart.md (user-driven): Regenerate the insights analysis (one fresh paid call — schema-version bump), confirm ≥1 experiment carries chips (SC-006), Draft config → panel → edit → Create → config visible with provenance (SC-004) → launch a study (SC-001, under 2 min); dismiss + malformed-param + pre-017-analysis negative checks (SC-005)
- [ ] T022 [P] Update docs/research-tooling-uplift.md roadmap (017 scope-as-built) — docs, TDD-exempt

---

## Dependencies & Execution Order

- **Setup (T001)** independent; needed before live e2e, not before tests.
- **Foundational (T002–T003)** blocks everything story-side.
- **US1 (Phase 3)** before **US2 (Phase 4)** — the draft flow consumes US1's
  sanitized stored shape and card rendering. Within US2: T008/T010/T012 are
  parallel test-authoring; T014/T015 last (wire-up).
- **US3 (Phase 5)** after US1+US2 (it sweeps their surfaces).
- **Polish (Phase 7)** last; T021 is the user's acceptance moment.

### Parallel Opportunities

- T002 ∥ (nothing — lone foundational test, but T001 can run alongside)
- T004 ∥ T006 (backend analyst tests vs frontend card tests)
- T008 ∥ T010 ∥ T012 (pure lib / backend contract / panel component)
- T018 ∥ T019 ∥ T022

## Implementation Strategy

**MVP = Phases 1–3 (US1)**: sanitized, visible suggestions deliver standalone
value and prove the trust boundary (SC-002) before any navigation exists.
Then US2 (the loop), then the US3 sweep. Commit per test+impl pair or logical
group; live e2e is user-verified in the browser before merge, per project
convention.
