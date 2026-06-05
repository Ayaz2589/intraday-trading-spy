# Tasks: Cross-Run Insights, Pooled Study Gate & Advisory Claude Narrative

**Input**: Design documents from `/specs/016-insights/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md, quickstart.md

**Tests**: MANDATORY (constitution principle IV, v1.1.0). Every task touching
`backend/src/**/*.py` or `frontend/src/**/*.{ts,tsx}` is preceded by a
failing-test task. Exempt: `pyproject.toml`, `config.yaml`, `migrations/*.sql`,
`*.md`. The Anthropic SDK is FULLY MOCKED in all tests — no network.

**Organization**: by user story (US1 pooled gate → US2 insights views →
US3 Claude narrative → US4 trust/education). US1 and US2 are independent of
each other; US3 depends on both (its payloads consume the gate and the
aggregates); US4 sweeps last.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Add `anthropic>=0.40` to backend/pyproject.toml dependencies and install into backend/.venv (config change — TDD-exempt; container rebuild happens in Polish)
- [x] T002 Write backend/migrations/0123_insight_analyses.sql (insight_analyses + insight_settings per data-model.md §B, RLS pair per the 0110 pattern) and apply to cloud via the direct-psycopg route (SUPABASE_DB_URL)

---

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Failing tests: `PooledGateConfig` defaults (alpha=0.05, seed=20260605) nested as `ValidationConfig.pooled_gate`, and `InsightsClaudeConfig` (model='claude-opus-4-8', max_tokens=8000, max_timeseries_windows=200) nested as `Config.insights.claude`, incl. YAML round-trip of both blocks, in backend/tests/validation/test_config_validation.py and backend/tests/test_config.py
- [x] T004 Implement `PooledGateConfig`, `InsightsClaudeConfig`, `InsightsConfig` in backend/src/intraday_trade_spy/config.py and add the `validation.pooled_gate` + `insights.claude` blocks to backend/config/config.yaml (data-model.md §D)

**Checkpoint**: config loads — story work can begin (US1 and US2 in either order).

---

## Phase 3: User Story 1 - Run the pooled gate on a walk-forward study (Priority: P1) 🎯 MVP

**Goal**: the productized lockbox gate — fast sync verdict + full background
mode, persisted on the study, rendered as the headline panel.

**Independent Test**: run the gate on the wf-rr3 study and reproduce the
2026-06-05 ad-hoc verdict exactly (SC-001); re-run → identical numbers;
refusals are plain-English.

### Tests for User Story 1 (write first, must fail)

- [x] T005 [P] [US1] Failing unit tests in backend/tests/validation/test_pooled.py: sign test closed form (9/12 → 0.073242; all-positive → 1/2^n; none-positive → 1.0), Fisher combined (X²=85, df=24 → ≈9.53e-9; a p=1.0 entry contributes 0), window-ordered pooling, zero-trade windows excluded-but-counted, gate-rule boundary (CI low exactly 0 → NOT passed; strictly >0 → passed), `PooledGateResult` assembly, seeded determinism (two calls → identical model dump)
- [x] T006 [US1] Implement backend/src/intraday_trade_spy/validation/pooled.py (`sign_test_p`, `fisher_combined`, `pool_windows`, `compute_pooled_gate` composing existing `bootstrap_ci` + `run_monte_carlo`) and add `CIStat` + `PooledGateResult` family to backend/src/intraday_trade_spy/models.py (data-model.md §A/§C)
- [x] T007 [US1] Failing API contract tests in backend/tests/api/new/test_pooled_gate_api.py (unit_client + mocked storage): fast-mode 200 matching contracts/api.md (incl. RMW persistence — assert `update_validation_study` called with prior result keys preserved + `pooled_gate` added); 404 unknown study; 400 sensitivity study; 400 no persisted children (message points at re-run); 400 <2 pooled trades; 400 inconsistent child configs; full-mode 202 + background task registered; 409 `pooled_gate_running` while a full gate is active; determinism across two fast calls
- [x] T008 [US1] Implement in backend/src/intraday_trade_spy/api/validation_lifecycle.py: `gather_pooled_oos()` (children fetch + per-child trades via `list_trades`, window-ordered; refusal exceptions), `run_pooled_gate()` fast path with read-modify-write persistence (research R2), full-mode background task + in-process per-study guard with `PooledGateAlreadyRunning` (research R3) — **the full-gate task NEVER writes study progress/status fields** (they describe the study's own run; analyze I1): completion is signaled solely by `result.pooled_gate.mode == 'full'`; add `PooledGateRequest` to backend/src/intraday_trade_spy/api/schemas.py; add `POST /studies/{study_id}/pooled-gate` to backend/src/intraday_trade_spy/api/routers/validation.py
- [x] T009 [P] [US1] Failing component tests in frontend/src/components/validation/PooledGatePanel.test.tsx: verdict banner renders PASSED and NOT PASSED variants with the rule text (CI vs zero); stat row (pooled trades, OOS PnL, CIs, windows-positive + sign p); MC strip present; "Run gate" + "Run full gate" buttons; not-yet-computed empty state; refusal message state; per-window p-values + Fisher line appear when full result present; HelpTooltips (`pooled_gate`, `sign_test`, `fisher_combined`) present

### Implementation for User Story 1

- [x] T010 [US1] Add `PooledGateResult`/`CIStat` TS mirrors + optional `pooled_gate` on `ValidationStudy['result']` in frontend/src/api/types.ts; `runPooledGate()` in frontend/src/api/validation.ts; `usePooledGate()` mutation (retry: false) in frontend/src/hooks/useStudies.ts
- [x] T011 [US1] Implement frontend/src/components/validation/PooledGatePanel.tsx (banner, stat row, MC strip reusing 015 distribution-strip pieces, run buttons, full-result enrichment) and add `pooled_gate`, `sign_test`, `fisher_combined` entries to frontend/src/components/help-content.ts (+ extend the help-content census test counts)
- [x] T012 [US1] Failing test: walk-forward study detail mounts the gate panel between stat cards and window rows (extend frontend/src/components/validation/StudyDetailPage.test.tsx); sensitivity studies do NOT mount it
- [x] T013 [US1] Mount `<PooledGatePanel/>` in frontend/src/components/validation/StudyDetailPage.tsx (~line 52, walk_forward only) with full-gate completion polling: poll the study GET until `result.pooled_gate.mode === 'full'` (indeterminate "running…" state; never reads study progress fields — analyze I1)

**Checkpoint**: US1 e2e-able — the gate exists in the product.

---

## Phase 4: User Story 2 - See the edge across time and configs (Priority: P2)

**Goal**: Insights page (split Layout A) with edge time-series + per-config
distribution over the OOS archive. Independent of US1.

**Independent Test**: with two configs' studies in the archive, the page shows
one point per OOS window per config, points click through to runs,
distribution compares configs; empty archive shows instructive empty states.

### Tests for User Story 2 (write first, must fail)

- [x] T014 [P] [US2] Failing storage tests in backend/tests/storage/test_insights_aggregates.py (mock `get_pool()`/cursor per the 013 pattern): `insights_edge_timeseries(user_id)` SQL parameterization (user-scoped, segment='validation' only, optional config filter) + row mapping; `insights_config_distribution(user_id)` mapping; `snapshot_fingerprint` determinism and sensitivity to (count, max created_at, sum trades)
- [x] T015 [US2] Implement `insights_edge_timeseries()` + `insights_config_distribution()` (+ fingerprint helper) in backend/src/intraday_trade_spy/storage/client.py per research R4
- [x] T016 [P] [US2] Failing API contract tests in backend/tests/api/new/test_insights_api.py: GET /api/insights/edge-timeseries 200 shape (+ `config_name` filter, empty archive → `points: []` + `"empty"` fingerprint); GET /api/insights/config-distribution 200 shape + empty state
- [x] T017 [US2] Implement backend/src/intraday_trade_spy/api/routers/insights.py (the two GETs), response schemas in backend/src/intraday_trade_spy/api/schemas.py, and register the router in the FastAPI app
- [x] T018 [P] [US2] Failing component tests: frontend/src/components/charts/line-scatter.test.tsx (multi-series render, zero-line, point click callback with datum); frontend/src/components/insights/EdgeTimeseries.test.tsx (one point per window per config from fixture, click → run link, empty state); frontend/src/components/insights/ConfigDistribution.test.tsx (side-by-side rows, empty state)

### Implementation for User Story 2

- [x] T019 [US2] Add `EdgeTimeseriesResponse`/`ConfigDistributionResponse` TS types in frontend/src/api/types.ts; create frontend/src/api/insights.ts (client fns) and frontend/src/hooks/useInsights.ts (queries)
- [x] T020 [US2] Implement frontend/src/components/charts/line-scatter.tsx (reusable SVG multi-series line/scatter) + frontend/src/components/insights/EdgeTimeseries.tsx + frontend/src/components/insights/ConfigDistribution.tsx, with `edge_timeseries` + `window_distribution` help-content entries (+ census counts)
- [x] T021 [US2] Failing tests: InsightsPage split Layout A renders charts column + right rail placeholder, empty states wire through (frontend/src/components/insights/InsightsPage.test.tsx); side-nav contains an Insights item (extend the existing side-nav test if present, else create frontend/src/components/side-nav.test.tsx)
- [x] T022 [US2] Implement frontend/src/components/insights/InsightsPage.tsx (Layout A split), frontend/src/routes/_authenticated.insights.tsx (TanStack file route), add the Insights entry to NAV_ITEMS in frontend/src/components/side-nav.tsx + `InsightsIcon` in frontend/src/components/nav-icons.tsx

**Checkpoint**: US1 + US2 independently shippable.

---

## Phase 5: User Story 3 - Get Claude's read (Priority: P3)

**Goal**: advisory narrative on both surfaces — structured cited-claims,
snapshot-pinned, idempotent by hash, billing-pause kill switch. Depends on
US1 (study payload includes the gate) and US2 (insights payload + fingerprint).

**Independent Test**: generate a read on each surface (SDK mocked in tests /
real key live); findings cite payload metrics; second request returns the
stored analysis with no provider call; billing failure pauses with re-enable.

### Tests for User Story 3 (write first, must fail)

- [x] T023 [P] [US3] Failing unit tests in backend/tests/api/new/test_claude_analyst.py (anthropic SDK fully mocked): payload builders produce deterministic sorted-key JSON → stable sha256 across dict orderings; study payload embeds study id + gate computed_at, insights payload embeds snapshot fingerprints; truncation at max_timeseries_windows sets `truncated: true`; system block carries a `cache_control` marker; `messages.parse` called with the `ClaudeAnalysis` schema and adaptive thinking; idempotency (latest stored analysis hash == current → return stored, SDK NOT called; `force=true` → called); `billing_error` (`APIStatusError.type == 'billing_error'`) → settings flipped to (false, 'billing') AND 409 claude_paused; `AuthenticationError` → 503 claude_unconfigured-style hint and settings NOT flipped; `RateLimitError` → transient 502-style message, nothing persisted; parse failure → 502; missing env key → 503 claude_unconfigured without constructing a client
- [x] T024 [US3] Implement backend/src/intraday_trade_spy/api/claude_analyst.py (lazy client singleton, payload builders, hash, system prompt constant with methodology glossary + advisory boundary, call/parse/error mapping, store/fetch) and add `ClaudeFinding`/`ClaudeExperiment`/`ClaudeAnalysis`/`StoredAnalysisView`/`InsightSettingsView` to backend/src/intraday_trade_spy/models.py
- [x] T025 [US3] Failing API contract tests (extend backend/tests/api/new/test_insights_api.py): POST /api/insights/claude-analysis 200 stored-view shape; 400 unknown scope / missing scope_id / nothing-to-analyze; 409 claude_paused when settings disabled; GET latest 200/204; GET claude-settings lazily upserts default; PATCH claude-settings enable/disable (manual reason set/cleared)
- [x] T026 [US3] Implement storage methods in backend/src/intraday_trade_spy/storage/client.py (`insert_insight_analysis`, `get_latest_insight_analysis(user_id, scope, scope_id)`, `get_insight_settings` w/ lazy upsert, `update_insight_settings`), the claude endpoints in backend/src/intraday_trade_spy/api/routers/insights.py, and request schemas in backend/src/intraday_trade_spy/api/schemas.py
- [x] T027 [P] [US3] Failing component tests in frontend/src/components/insights/ClaudeReadCard.test.tsx: renders summary markdown, findings table with cited metric values rendered from supplied payload data beside claims, risks + experiments lists, footer (snapshot hash · model · date); Regenerate disabled when stored hash == current fingerprint, enabled when different; paused state shows billing banner + Re-enable button firing the settings PATCH; unconfigured state shows quiet setup hint; **manual pause toggle** fires the settings PATCH and sets reason 'manual' (analyze M2); a finding whose `evidence_metric` is absent from the payload data renders a visible "⚠ metric not found" treatment (analyze M3 / US4-AC2); advisory HelpTooltip (`claude_advisory`, `snapshot_pin`) present

### Implementation for User Story 3

- [x] T028 [US3] Add `ClaudeAnalysis` family + `StoredAnalysisView` + `InsightSettingsView` TS types in frontend/src/api/types.ts; analysis + settings client fns in frontend/src/api/insights.ts; `useClaudeAnalysis`/`useClaudeSettings` in frontend/src/hooks/useInsights.ts (mutations retry: false)
- [x] T029 [US3] Implement frontend/src/components/insights/ClaudeReadCard.tsx (all states incl. manual pause toggle and the unverifiable-metric treatment) + `claude_advisory`, `snapshot_pin` help-content entries (+ census counts)
- [x] T030 [US3] Failing tests: InsightsPage right rail hosts ClaudeReadCard wired to the insights scope (extend InsightsPage.test.tsx); PooledGatePanel hosts the study-scope card beneath the verdict (extend PooledGatePanel.test.tsx)
- [x] T031 [US3] Wire ClaudeReadCard into frontend/src/components/insights/InsightsPage.tsx (right rail) and frontend/src/components/validation/PooledGatePanel.tsx (beneath verdict)

**Checkpoint**: all three components live.

---

## Phase 6: User Story 4 - Trust boundaries and education (Priority: P4)

**Goal**: tooltip completeness + the explicit determinism split.

### Tests for User Story 4 (write first, must fail)

- [ ] T032 [P] [US4] Failing sweep tests: every new concept key (`pooled_gate`, `sign_test`, `fisher_combined`, `edge_timeseries`, `window_distribution`, `claude_advisory`, `snapshot_pin`) exists in HELP_CONTENT and is rendered by its surface (extend the relevant component tests + frontend/src/components/help-content.test.ts census); gate panel labels its numbers as seeded/reproducible while ClaudeReadCard labels itself advisory/non-deterministic (assert the label text in both component tests)

### Implementation for User Story 4

- [ ] T033 [US4] Close any gaps the sweep finds (labels/tooltips) in frontend/src/components/validation/PooledGatePanel.tsx and frontend/src/components/insights/ClaudeReadCard.tsx

---

## Phase 7: Polish & Verification

- [ ] T034 [P] Full backend suite green: `PYTHONPATH=. .venv/bin/pytest -q --ignore=tests/api/integration --ignore=tests/test_yfinance_integration.py` from backend/
- [ ] T035 [P] Full frontend suite + types: `npm test -- --run` and `npx tsc --noEmit` from frontend/ (3 price-chart failures remain the known baseline)
- [ ] T036 Rebuild backend container (`docker compose up -d --build backend` — picks up the anthropic dep) and verify new endpoints in OpenAPI + 401 unauthenticated; observe fast-gate wall time (<10 s, SC-002 / analyze L4)
- [ ] T037 Live e2e per quickstart.md (user-driven): SC-001 — run the pooled gate on wf-rr3 and confirm it reproduces the 2026-06-05 verdict (NOT PASSED, $0.91, CI [−0.53, +2.56], 2,607 trades); full gate background completion; Insights page with both configs; Claude's read on both surfaces; pause/re-enable
- [ ] T038 [P] Update docs/research-tooling-uplift.md roadmap (016 status + scope-as-built) — docs, TDD-exempt

---

## Dependencies & Execution Order

- **Setup → Foundational** block everything.
- **US1 (Phase 3)** and **US2 (Phase 4)** are mutually independent (different
  modules/pages); priority order is US1 first, but US2 may start any time
  after Phase 2.
- **US3 (Phase 5)** requires US1 (gate in study payload) AND US2 (aggregates +
  fingerprint in insights payload; InsightsPage hosts the card).
- **US4 (Phase 6)** after US1–US3 (it sweeps their surfaces).
- **Polish (Phase 7)** last; T037 is the user's acceptance moment.

### Parallel Opportunities

- T005 ∥ T009 (backend engine tests vs frontend panel tests); T014 ∥ T016 ∥
  T018; T023 ∥ T027; T034 ∥ T035 ∥ T038.
- Backend impl and frontend test-authoring of the same story can overlap
  (different files); stories themselves are sequential for a single developer.

## Implementation Strategy

**MVP = Phases 1–3 (US1)**: the gate alone retires the ad-hoc analysis and
satisfies SC-001/002/003 — stop and validate on the real wf-rr3 study before
building the page. Then US2 (independent), then US3 (consumes both), then the
US4 sweep. Commit after each test+implementation pair or logical group; live
e2e is user-verified in the browser before merge, per project convention.
