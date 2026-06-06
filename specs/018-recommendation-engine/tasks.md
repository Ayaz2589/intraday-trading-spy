# Tasks: Recommendation Engine — Config Health + Evidence-Backed Suggestions

**Input**: Design documents from `/specs/018-recommendation-engine/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: Per constitution principle IV (Test-First Everywhere, NON-NEGOTIABLE,
v1.1.0) every implementation task touching `backend/src/**/*.py` or
`frontend/src/**/*.{ts,tsx}` is preceded by its failing-test task below.
Exempt artifacts in this feature: migration SQL (T002), `config.yaml` (T003),
ops application of the migration (T006), and the `recommend/__init__.py`
package marker (T001).

**Organization**: Grouped by user story; each story is independently
implementable and testable (US1 alone is the MVP).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1 (health verdicts), US2 (recommendations), US3 (trial ledger)

## Phase 1: Setup

**Purpose**: Skeletons and TDD-exempt artifacts every story builds on.

- [X] T001 Create package skeletons: `backend/src/intraday_trade_spy/recommend/__init__.py` (≤5-line marker) and `backend/tests/recommend/__init__.py`
- [X] T002 [P] Write migration `backend/db/migrations/0125_recommendation_trials.sql` per data-model.md: `recommendation_trials` table (user_id/strategy_id/config_id ON DELETE SET NULL/config_name/analysis_id/source CHECK/created_at), family index, RLS policies mirroring 0123, and widen `insight_analyses.scope` CHECK to `('study','insights','recommend')` — use `DROP CONSTRAINT IF EXISTS insight_analyses_scope_check` (PG auto-name for 0123's inline column CHECK; verify actual name via pg_constraint at T006) (analyze U3)
- [X] T003 [P] Add threshold blocks to `backend/config/config.yaml` per research R1/R3: `insights.health {min_windows: 6, recent_windows: 4, degradation_margin_r: 0.02}` and `insights.recommend {min_improvement_r: 0.01, min_shared_windows: 4, max_candidates: 5}`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Threshold plumbing and applied schema — both stories' backends read these.

**⚠️ CRITICAL**: Complete before any user story phase.

- [X] T004 Failing tests: config loader exposes `insights.health` and `insights.recommend` thresholds (types, defaults, FR-003 no-hardcoding seam) in `backend/tests/recommend/test_thresholds.py`
- [X] T005 Implement threshold exposure in `backend/src/intraday_trade_spy/config.py` (mirror the existing `insights.claude` access pattern)
- [X] T006 Apply migration 0125 to the dev/cloud database and verify: `recommendation_trials` exists with RLS; `insight_analyses` accepts `scope='recommend'` (ops; record verification output in the PR)

**Checkpoint**: Thresholds readable; schema live — user stories can begin.

---

## Phase 3: User Story 1 — Honest health verdict per config (Priority: P1) 🎯 MVP

**Goal**: Deterministic ok/degrading/failing/insufficient-evidence verdict per config with cited inputs, surfaced as a badge on the Strategies active config and consumable by the Insights panel later.

**Independent Test**: quickstart §1 — `GET /api/recommend/health` returns rule-correct, recompute-identical verdicts for the seeded archive; the Strategies page shows the badge + tooltip with the cited numbers.

### Tests for User Story 1 (write first, must fail)

- [X] T007 [P] [US1] Failing unit tests for the verdict rule in `backend/tests/recommend/test_health.py`: ordered rule matrix (insufficient when windows < min_windows; failing requires gate-failed AND recent median R ≤ 0; degrading when recent median < baseline median − margin; ok otherwise), determinism (double-call → byte-identical serialized verdict), cited inputs + thresholds echoed (FR-002/FR-003)
- [X] T008 [P] [US1] Failing API tests for `GET /api/recommend/health` in `backend/tests/api/new/test_recommend_api.py` (unit_client + stub_storage_client pattern): per-config verdict rows composed from edge-timeseries + distribution aggregates, zero-OOS-history configs omitted, thresholds echoed, endpoint never touches the Claude analyst
- [X] T009 [P] [US1] Failing frontend tests: `frontend/src/components/recommend/HealthBadge.test.tsx` (verdict→variant mapping ok=profit / degrading=warn / failing=loss / insufficient=faint; cited inputs rendered; `health_verdict` HelpTooltip present per FR-014) + `health_verdict` key coverage in `frontend/src/components/help-content.test.ts` + active-config row renders the badge in `frontend/src/components/strategies/config-list.test.tsx`

### Implementation for User Story 1

- [X] T010 [US1] Implement `backend/src/intraday_trade_spy/recommend/health.py` (pure verdict function per research R1) + `HealthVerdict` view model in `backend/src/intraday_trade_spy/models.py` → T007 green
- [X] T011 [US1] Implement `backend/src/intraday_trade_spy/api/routers/recommend.py` with `GET /api/recommend/health` (composes existing `insights_edge_timeseries` + `insights_config_distribution` storage calls + configs list) and register the router in `backend/src/intraday_trade_spy/api/app.py` → T008 green
- [X] T012 [US1] Implement `frontend/src/api/recommend.ts` (`getRecommendHealth`) + `frontend/src/hooks/useRecommend.ts` (`useConfigHealth`) + view types in `frontend/src/api/types.ts`
- [X] T013 [US1] Implement `frontend/src/components/recommend/HealthBadge.tsx` + `health_verdict` copy in `frontend/src/components/help-content.ts` → HealthBadge/help tests green
- [X] T014 [US1] Mount HealthBadge on the active config row in `frontend/src/components/strategies/config-list.tsx` (data via `useConfigHealth` from `config-manager.tsx` composition) → config-list test green

**Checkpoint**: US1 fully functional — verdicts deterministic and visible. Stop, validate quickstart §1, demo.

---

## Phase 4: User Story 2 — Evidence-backed recommendations (Priority: P2)

**Goal**: Evidence packs from persisted artifacts, deterministic ranked candidates in three classes, advisory narration via scope='recommend', and Draft-config actuation — all rendering fully with Claude off.

**Independent Test**: quickstart §2–4 steps 1–2 — pack endpoint returns whitelisted, cited, recompute-identical candidates incl. stop-tuning on the all-gates-fail archive; panel renders with Claude paused; Draft config → prefills Strategies without creating anything.

### Tests for User Story 2 (write first, must fail)

- [X] T015 [P] [US2] Failing storage tests in `backend/tests/storage/test_recommend_storage.py` (fake-cursor pattern): fetch sensitivity surfaces (`validation_studies` kind='sensitivity' → `SensitivitySurface` parse), fetch family configs' registry-knob projections from `configs.params`; user-scoped queries with deterministic ORDER BY
- [X] T016 [P] [US2] Failing unit tests for pack assembly in `backend/tests/recommend/test_evidence.py`: matched-window grouping across configs by (range_start, range_end), knob diffs restricted to `KNOB_REGISTRY` paths (≤2 knobs), regime-bleed computation from config.yaml regimes, validation-segment-only sources (FR-012 audit), `sort_keys=True` serialization + snapshot-fingerprint stability (recompute-identical, SC-002)
- [X] T017 [P] [US2] Failing unit tests for candidates in `backend/tests/recommend/test_candidates.py`: plateau candidate from a surface fixture (neighborhood mean, `low_confidence` points excluded), cross-config transfer candidate (≥ min_shared_windows), score = improvement_r × log2(1+evidence_n) with lexicographic tie-break (stable order), already-tried knob-set detection (FR-006), gather_evidence when surface missing or config never studied, stop_tuning iff every family gate computed and failed (SC-006), every emitted change on-whitelist and in-bounds
- [X] T018 [P] [US2] Failing API tests for `GET /api/recommend/pack` in `backend/tests/api/new/test_recommend_api.py`: 404 unknown config, 422 missing config_id, response shape `{pack, candidates, trial_counts, snapshot_fingerprint}`, no analyst invocation (FR-009)
- [X] T019 [P] [US2] Failing analyst tests for `scope='recommend'` in `backend/tests/api/new/test_claude_analyst.py`: payload = evidence pack with hash pinning/idempotency, `suggested_config_changes` sanitized via the 017 whitelist before storage, prompt includes deterministic candidates + trial count + registry bounds, billing pause honored; `routers/insights.py` accepts scope='recommend' + scope_id=config_id (extend `backend/tests/api/new/test_insights_api.py` if scope validation lives there)
- [X] T020 [P] [US2] Failing component tests `frontend/src/components/recommend/RecommendationCard.test.tsx`: knob-delta chips via `knobLabel`, cited evidence values rendered, already_tried renders flag + config link and NO draft button, gather_evidence and stop_tuning class renderings, "Draft config →" encodes the draft (decodeDraft roundtrip: changes + analysis_id + hypothesis) and navigates to /strategies; NEGATIVE assertion: the card never invokes config-create (mock `@/api/configs`, assert zero calls — FR-010/SC-004, analyze C2)
- [X] T021 [P] [US2] Failing component tests `frontend/src/components/recommend/RecommendationsPanel.test.tsx`: per-config verdict rows WITH cited inputs visible (FR-002, analyze U4), generate action POSTs scope='recommend', narrative renders via `ClaudeReadCard scope='recommend'` (analyze U1 — inherits read-while-paused/disclaimer behavior), deterministic candidates render while Claude is paused/unconfigured (FR-009/SC-005), stale-snapshot marker + regenerate when fingerprints differ, determinism-split labeling (FR-013), `recommendation_classes` + `evidence_pack` HelpTooltips (+ keys in `frontend/src/components/help-content.test.ts`); NEGATIVE assertion: the panel never invokes config-create (analyze C2)
- [X] T022 [US2] Failing test: Insights page mounts the panel below Claude's read in `frontend/src/components/insights/InsightsPage.test.tsx`

### Implementation for User Story 2

- [X] T023 [US2] Implement storage fetches in `backend/src/intraday_trade_spy/storage/client.py` (sensitivity surfaces, family knob projections) → T015 green
- [X] T024 [US2] Implement `backend/src/intraday_trade_spy/recommend/evidence.py` (+ EvidencePack view models in `backend/src/intraday_trade_spy/models.py`) → T016 green
- [X] T025 [US2] Implement `backend/src/intraday_trade_spy/recommend/candidates.py` → T017 green
- [X] T026 [US2] Implement `GET /api/recommend/pack` in `backend/src/intraday_trade_spy/api/routers/recommend.py` → T018 green
- [X] T027 [US2] Implement `scope='recommend'` in `backend/src/intraday_trade_spy/api/claude_analyst.py` (payload builder + prompt; scope plumbing in `backend/src/intraday_trade_spy/api/routers/insights.py`) → T019 green
- [X] T028 [US2] Implement `frontend/src/components/recommend/RecommendationCard.tsx` (reuse `frontend/src/lib/draft-config.ts` encodeDraft + `frontend/src/lib/config-knobs.ts` knobLabel) → T020 green
- [X] T029 [US2] Implement `frontend/src/components/recommend/RecommendationsPanel.tsx` (advisory narrative rendered by REUSING `ClaudeReadCard` with scope='recommend' scopeId=configId — analyze U1) + extend `frontend/src/api/recommend.ts` / `frontend/src/hooks/useRecommend.ts` (getRecommendPack / useEvidencePack) + widen the `'study' | 'insights'` scope unions to include `'recommend'` in `frontend/src/api/insights.ts` (×2), `frontend/src/hooks/useInsights.ts` (×2), `frontend/src/components/insights/ClaudeReadCard.tsx` (analyze C1) + `recommendation_classes`, `evidence_pack` copy in `frontend/src/components/help-content.ts` → T021 green
- [X] T030 [US2] Mount RecommendationsPanel below ClaudeReadCard in `frontend/src/components/insights/InsightsPage.tsx` → T022 green

**Checkpoint**: US1 + US2 independently functional — recommendations end-to-end with Claude on or off.

---

## Phase 5: User Story 3 — Data-snooping trial ledger (Priority: P3)

**Goal**: Deletion-surviving per-family trial counts, written at human-gated config creation, surfaced on the panel and embedded in packs.

**Independent Test**: quickstart §4–5 — drafting a config writes a ledger row; counts show "N drafted · M validated"; deleting the config does not decrease the count; no surface touches lockbox data.

### Tests for User Story 3 (write first, must fail)

- [X] T031 [P] [US3] Failing storage tests in `backend/tests/storage/test_recommend_storage.py`: insert trial row, family counts (drafted = rows; validated = rows whose config has a finished walk-forward study), deletion survival (config delete → config_id NULL, config_name retained, counts unchanged), same `config_name` under two `strategy_id`s counts separately per family (analyze U5)
- [X] T032 [P] [US3] Failing API tests in `backend/tests/api/new/test_configs_endpoints.py`: `POST /api/configs` with `provenance{analysis_id, source}` writes the ledger row in the same transaction; request without provenance behaves exactly as before (regression guard)
- [X] T033 [P] [US3] Failing tests: evidence pack embeds `trial_counts` (extend `backend/tests/recommend/test_evidence.py`); panel renders the ledger line "N drafted · M validated against this archive" + data-snooping warning + `trial_count` HelpTooltip (extend `frontend/src/components/recommend/RecommendationsPanel.test.tsx`, `frontend/src/components/help-content.test.ts`)
- [X] T034 [P] [US3] Failing test: DraftConfigPanel's create call passes provenance for EVERY draft-flow creation (analyze A1 decision): draft with analysis id → `provenance{analysis_id, source:'claude'}` (incl. 017 experiment drafts — same panel); draft without analysis id (deterministic candidate card) → `provenance{analysis_id: null, source:'deterministic'}` — in `frontend/src/components/strategies/DraftConfigPanel.test.tsx`

### Implementation for User Story 3

- [X] T035 [US3] Implement `recommendation_trials` CRUD + family-count queries in `backend/src/intraday_trade_spy/storage/client.py` → T031 green
- [X] T036 [US3] Implement provenance handling on config create in `backend/src/intraday_trade_spy/api/routers/configs.py` + the storage create path → T032 green
- [X] T037 [US3] Implement trial counts in `backend/src/intraday_trade_spy/recommend/evidence.py` + ledger line/warning/help copy in `frontend/src/components/recommend/RecommendationsPanel.tsx` and `frontend/src/components/help-content.ts` → T033 green
- [X] T038 [US3] Implement provenance pass-through in `frontend/src/components/strategies/DraftConfigPanel.tsx` + create-config API fn in `frontend/src/api/configs.ts` (or its existing home) → T034 green

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T039 [P] Update the /docs page for the new surface: Insights page-card copy + research-pipeline step mention recommendations in `frontend/src/components/docs/DocsPage.tsx` (extend `frontend/src/components/docs/DocsPage.test.tsx` first; glossary inherits the four new help keys automatically — assert count still tracks `HELP_CONTENT`)
- [X] T040 [P] Run quickstart.md end-to-end against the dev stack and record outcomes: verdict determinism (SC-002), Claude-off rendering (SC-005), stop-tuning presence on the all-fail archive (SC-006), draft→ledger→deletion-survival, verdict→draft in under 2 minutes (SC-007)
- [X] T041 Full verification: backend `python -m pytest` green, frontend `npx vitest run` green (3 price-chart baseline failures excepted), `npm run typecheck` + build clean; update `CLAUDE.md` prior-plans entry for 018 on completion

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none — start immediately; T002/T003 parallel after T001
- **Foundational (Phase 2)**: needs T003 (config values) for T004/T005; T006 needs T002 — BLOCKS all stories
- **US1 (Phase 3)**: needs Phase 2 (thresholds) — independent of US2/US3
- **US2 (Phase 4)**: needs Phase 2; reuses US1's `health.py` inside packs (T024 depends on T010) and the US1 router file (T026 extends T011's `recommend.py`) — still independently *testable* via its own tests
- **US3 (Phase 5)**: needs Phase 2 (migration applied); panel tasks (T033/T037) build on US2's panel; storage/API tasks (T031/T032/T035/T036) only need Phase 2
- **Polish (Phase 6)**: after desired stories complete

### Within Each Story

Failing tests strictly before their paired implementation (constitution IV);
models → engine modules → endpoints → frontend api/hooks → components → mounts.

### Parallel Opportunities

- Phase 1: T002 ∥ T003 (after T001)
- US1: T007 ∥ T008 ∥ T009 (three test files); then T010 → T011 backend while T012–T014 frontend proceed after T009
- US2: T015–T022 all parallel (eight distinct test files); implementations chain T023→T024→T025→T026 (backend) ∥ T028→T029→T030 (frontend, after their tests) with T027 independent after T019
- US3: T031–T034 all parallel; T035–T038 then pair off
- Polish: T039 ∥ T040

## Parallel Example: User Story 2 test authoring

```bash
# Eight failing-test tasks, eight different files — author together:
Task: "T015 storage tests in backend/tests/storage/test_recommend_storage.py"
Task: "T016 pack assembly tests in backend/tests/recommend/test_evidence.py"
Task: "T017 candidate tests in backend/tests/recommend/test_candidates.py"
Task: "T018 pack API tests in backend/tests/api/new/test_recommend_api.py"
Task: "T019 analyst scope tests in backend/tests/api/new/test_claude_analyst.py"
Task: "T020 card tests in frontend/src/components/recommend/RecommendationCard.test.tsx"
Task: "T021 panel tests in frontend/src/components/recommend/RecommendationsPanel.test.tsx"
Task: "T022 mount test in frontend/src/components/insights/InsightsPage.test.tsx"
```

## Implementation Strategy

### MVP First (US1 only)

1. Phases 1–2 (setup + thresholds + applied migration)
2. Phase 3 → **STOP**: validate quickstart §1 (deterministic verdicts, badge on Strategies) — this alone answers "is my config still working?"

### Incremental Delivery

1. US1 → demo verdicts (MVP)
2. US2 → demo recommendations with Claude off, then on; draft a config
3. US3 → demo the honesty ledger surviving a config deletion
4. Polish → docs + quickstart sweep + suites green

### Notes

- Every backend/frontend implementation task lists its paired failing-test task — do not invert the order
- Commit after each task or coherent pair (repo convention)
- US2's stop-tuning test fixture (all gates fail) mirrors the real current archive — the honest case is the first-class case
