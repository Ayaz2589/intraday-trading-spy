# Tasks: Automated Strategy Research

**Input**: Design documents from `/specs/019-auto-research/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Per constitution principle IV (Test-First Everywhere,
NON-NEGOTIABLE, v1.1.0) every task below that touches `backend/src/**/*.py`
or `frontend/src/**/*.{ts,tsx}` is preceded by its failing-test task.
Exempt (no test gate): config.yaml, .env additions, Makefile targets,
migration SQL, the ≤5-line console-script wrapper, docs.

**Organization**: grouped by user story (US1 = CLI, US2 = campaign engine,
US3 = dashboard) so each ships independently.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add `research:` section to backend/config/config.yaml (`default_budget: 6`, `base_alpha: 0.05`, `backfill_start: "2018-01-01"`) — config, exempt
- [x] T002 [P] Add `SUPABASE_ANON_KEY` to backend/.env (value = frontend `VITE_SUPABASE_ANON_KEY`) and document it in backend/.env.example if present — config, exempt
- [x] T003 [P] Register console script `intraday-trade-spy-research = "intraday_trade_spy.cli.research:main"` in backend/pyproject.toml `[project.scripts]` — metadata, exempt

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: typed access to the new `research.*` config — needed by the API (US1's list response seeds the budget), the campaign engine (US2), and the launch form (US3).

- [x] T004 Failing tests: `ResearchConfig` model loads `research:` defaults/overrides from YAML and rejects out-of-range values (`base_alpha` ∈ (0, 0.5], `default_budget` ≥ 0) in backend/tests/test_config.py
- [x] T005 Implement `ResearchConfig` (Pydantic v2) wired into the existing `Config` loader in backend/src/intraday_trade_spy/config.py

**Checkpoint**: foundation ready — user stories can begin.

---

## Phase 3: User Story 1 - Research CLI (Priority: P1) 🎯 MVP

**Goal**: every pipeline step is one authenticated terminal command; session via one-time email-OTP, persisted + auto-refreshed; no privileged-credential fallback.

**Independent Test**: with the API running, `login` → `backfill` → `study-wf --wait` → `gate` → `recommend` completes from the terminal only (quickstart flow), and the artifacts are visible in the web UI (SC-001).

### Tests for User Story 1 (write first, watch fail)

- [x] T006 [P] [US1] Failing tests for the session module in backend/tests/cli/test_session.py: OTP login writes session file mode 0600 (mock GoTrue via httpx.MockTransport: `/auth/v1/otp` then `/verify`); refresh-when-near-expiry rotates BOTH tokens atomically; 401 from API → one refresh+retry then exit-3 hint; missing session → exit 3 with `login` instruction; `create_user: false` sent; `SUPABASE_SERVICE_ROLE_KEY` never read; tokens never appear in stdout/stderr (contracts/cli-auth.md invariants)
- [x] T007 [P] [US1] Failing tests for the command surface in backend/tests/cli/test_research_cli.py: subcommand arg parsing per contracts/cli.md; `study-sens` knob validation (dotted path, unique leaf, invalid → exit 2 + valid-knob list, FR-005); `lockbox-run` without `--confirm` → exit 2 and NO request sent (FR-004), `--override` requires `--confirm`; `--json` emits the raw API body; human output includes artifact id + UI location (FR-003); exit codes 0/1/2/3 per contract; no `reset` subcommand exists

### Implementation for User Story 1

- [x] T008 [US1] Implement `cli/session.py` (login/whoami/logout, session file 0600 incl. fixing lax modes, refresh, authed httpx client factory) in backend/src/intraday_trade_spy/cli/session.py
- [x] T009 [US1] Implement `cli/research.py` (argparse subcommands: login/whoami/logout/backfill/study-wf/study-sens/studies/study-status/gate/significance/monte-carlo/lockbox/lockbox-run/health/recommend/analyze/campaign-start/campaign-status/campaign-list/campaign-cancel; `--wait` pollers; `main()` entry) in backend/src/intraday_trade_spy/cli/research.py
- [x] T010 [US1] Add the Makefile research section (research-login, backfill, study-wf, study-sens, gate, significance, monte-carlo, lockbox, lockbox-run, health, recommend, campaign, campaign-status, campaign-cancel — each a ≤2-line delegation per contracts/cli.md) in Makefile — config, exempt

**Checkpoint**: US1 fully functional — terminal-driven research works end to end (campaign-* subcommands return the API's 404 until US2 lands; their parsing/JSON behavior is already tested).

---

## Phase 4: User Story 2 - Auto-research campaign (Priority: P2)

**Goal**: one action runs unattended freshness→study→gate→act cycles with the tightened bar, halting only at ready_for_lockbox / stop_tuning / budget_exhausted / cancelled / failed; never touches the lockbox; every candidate in the trial ledger.

**Independent Test**: against stub storage, a campaign with budget 2 over a gate-failing config runs 2 cycles, writes 2 provenance-stamped ledger rows, halts `budget_exhausted`, and the lockbox tables receive zero writes (SC-002/003/004).

### Story-specific setup

- [x] T011 [US2] Write migration backend/db/migrations/0126_research_campaigns.sql (research_campaigns table + one-running partial unique index + RLS; ALTER recommendation_trials ADD campaign_id/cycle/family + family-count index — per data-model.md) — SQL, exempt
- [x] T012 [US2] Apply 0126 to cloud Supabase via psycopg + `SUPABASE_DB_URL` and verify columns/indexes exist — operational

### Tests for User Story 2 (write first, watch fail)

- [x] T013 [P] [US2] Failing tests for the bar schedule in backend/tests/research/test_bar_schedule.py: `level(k) = 1 − α₀/k`; monotone non-loosening in k; family key = sorted comma-joined knob paths vs starting config ("" for cycle 1); k counts only matching non-NULL families; SC-006 worked example — identical pooled stats pass at k=1 and fail at k=5
- [x] T014 [P] [US2] Failing tests for candidate naming in backend/tests/research/test_naming.py: `auto{seq:02d}-c{cycle}-{leaf}{value:g}` format, trailing-zero trimming, collision → skip to next ranked candidate
- [x] T015 [P] [US2] Failing test: pooled-gate computation accepts an optional CI level and persists `pooled_gate.bar = {k, level}` alongside the verdict (recompute-identical, SC-005) in backend/tests/api/new/test_validation_endpoints.py (or the existing pooled-gate test module)
- [x] T016 [P] [US2] Failing tests for storage campaign CRUD in backend/tests/storage/test_campaigns.py: insert assigns per-user `seq`; second `running` insert rejected (one-active rule); cycle append is read-modify-write merge; status+verdict flip atomic + write-once; trial insert carries campaign_id/cycle/family; campaign deletion nulls trial campaign_id (provenance survives)
- [x] T017 [US2] Failing tests for the cycle engine in backend/tests/research/test_campaign.py (stubbed storage + stubbed study/gate/recommend/backfill collaborators): gate pass → `ready_for_lockbox` naming the candidate; stop-tuning verdict → halt; budget exhausted; `cancel_requested` honored at stage boundary → `cancelled`; duplicate candidate skipped, none left → `stop_tuning(no_novel_candidates)`; gather-evidence runs its prescribed study at most once per family — a repeat prescription for the same family halts `stop_tuning(no_novel_candidates)` (analyze G1, guarantees termination); empty cache → full-span backfill, stale → incremental, backfill failure → `failed(no-data)`; stage exception → `failed(reason)` fail-soft; starting config gates at k=1 with no ledger row; each candidate → exactly one ledger row (SC-004); journal event per stage transition (VII); **zero lockbox writes across every scenario (SC-003)**; no analyst/Claude call in any scenario (FR-013, analyze C2); no broker or live-trading collaborator ever invoked (FR-012, analyze C1)
- [x] T018 [P] [US2] Failing tests for the router in backend/tests/api/new/test_research_endpoints.py: POST 202 starts + enqueues; 404 unknown config; 409 second campaign; GET list (newest first, `default_budget` from config); GET detail; POST cancel (200 / 409 not_running); startup reconciler marks `running` rows `failed(service restart)`; GETs are pure reads

### Implementation for User Story 2

- [x] T019 [US2] Implement backend/src/intraday_trade_spy/research/bar_schedule.py (level, family key, k count via storage)
- [x] T020 [US2] Implement backend/src/intraday_trade_spy/research/naming.py
- [x] T021 [US2] Thread the optional CI level + bar recording through the pooled-gate path in backend/src/intraday_trade_spy/api/validation_lifecycle.py
- [x] T022 [US2] Implement campaign CRUD + trial provenance columns in backend/src/intraday_trade_spy/storage/client.py
- [x] T023 [US2] Implement the cycle engine in backend/src/intraday_trade_spy/research/campaign.py (stages data/study/gate/act; in-process composition of make_study_persist / run_pooled_gate_fast / recommend candidates; thresholds frozen at launch)
- [x] T024 [US2] Implement backend/src/intraday_trade_spy/api/routers/research.py (+ register in api/app.py, BackgroundTasks enqueue, startup reconciler)
- [x] T025 [US2] Failing test then implementation: factory reset wipes research_campaigns (extend backend/tests/storage/test_factory_reset.py and the reset wipe list in backend/src/intraday_trade_spy/storage/client.py)

**Checkpoint**: campaigns run end to end via the US1 CLI (`make campaign CONFIG=default BUDGET=2`).

---

## Phase 5: User Story 3 - Dashboard panel (Priority: P3)

**Goal**: launch/monitor/cancel campaigns from a Validation-page Auto-research section; per-campaign detail page; every new concept tooltipped.

**Independent Test**: with mocked API, launching from the panel shows live stage progress; a halted campaign's detail view shows the verdict, every cycle (gate CI vs bar applied), and links to study/config/ledger artifacts.

### Tests for User Story 3 (write first, watch fail)

- [x] T026 [P] [US3] Failing tests for fetchers + hooks in frontend/src/hooks/useCampaigns.test.ts: start/list/status/cancel call the contract endpoints; status polls (refetchInterval) while `running`, stops when halted
- [x] T027 [P] [US3] Failing tests for the launch/progress card in frontend/src/components/validation/AutoResearchCard.test.tsx: config select (active pre-selected) + budget seeded from `default_budget`; launch posts {config_name, budget}; running state shows cycle/stage strip + cancel; `ready_for_lockbox` verdict shows candidate + link to the lockbox card and **no spend control** (FR-016); `stop_tuning` shows the engine's rationale; 409 already-running surfaced; tooltips present for campaign/trial budget/stopping rules (FR-017)
- [x] T028 [P] [US3] Failing tests for history + detail in frontend/src/components/validation/CampaignsTable.test.tsx and frontend/src/components/research/CampaignDetailPage.test.tsx: table lists newest-first with verdict chips; detail renders the cycle timeline — stage outcomes, gate CI vs bar applied (k, level) with `tightened_bar` tooltip, action taken, links to `/validation/{study}`, config row, ledger count

### Implementation for User Story 3

- [x] T029 [US3] Implement frontend/src/api/research.ts + Campaign types in frontend/src/api/types.ts + frontend/src/hooks/useCampaigns.ts
- [x] T030 [US3] Add HELP_CONTENT keys (`auto_research_campaign`, `trial_budget`, `tightened_bar`, `stopping_rules`, `ready_for_lockbox`) in frontend/src/components/help-content.ts (covered by T027/T028 tooltip assertions; glossary picks them up automatically)
- [x] T031 [US3] Implement frontend/src/components/validation/AutoResearchCard.tsx and CampaignsTable.tsx
- [x] T032 [US3] Implement frontend/src/components/research/CampaignDetailPage.tsx + route frontend/src/routes/_authenticated.validation_.campaigns.$campaignId.tsx
- [x] T033 [US3] Wire the Auto-research section into frontend/src/routes/_authenticated.validation.tsx (+ extend its structural test for the new section)

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T034 Run the full verification gates: backend `PYTHONPATH=src .venv/bin/python -m pytest` (env-gated suites excluded), frontend `npx vitest run` (3-test price-chart baseline) + `npm run typecheck`, `ruff check`
- [x] T035 Live e2e per specs/019-auto-research/quickstart.md: `make research-login` (real OTP), terminal pass (backfill → study-wf → gate → recommend), then `make campaign CONFIG=default BUDGET=2` watched from the dashboard; verify lockbox before/after identical and ledger rows match trials_used (SC-001/002/003/004)
- [x] T036 [P] Docs sweep: cross-link quickstart from README/Makefile help; annotate CLAUDE.md active-plan line as implemented — docs, exempt

---

## Dependencies & Execution Order

- **Setup (P1)** → **Foundational (P2)** → user stories.
- **US1 (Phase 3)**: depends only on Foundational. MVP — ship alone.
- **US2 (Phase 4)**: depends on Foundational; independently testable (engine tests stub everything); *operationally* exercised via US1's `campaign-*` commands.
- **US3 (Phase 5)**: depends on US2's API contract (mocked in tests, so implementable in parallel with US2 after T011's shapes are fixed; live only after US2).
- **Polish (Phase 6)**: after desired stories.
- Within stories: failing tests strictly before their implementation task (constitution IV); T021 before T023 (engine consumes the level param); T022 before T023/T024.

## Parallel Opportunities

- T002 ∥ T003 (setup); T006 ∥ T007 (US1 tests); T013 ∥ T014 ∥ T015 ∥ T016 ∥ T018 (US2 tests, distinct files); T026 ∥ T027 ∥ T028 (US3 tests); T019 ∥ T020 after their tests; US3 implementation ∥ US2 implementation once contracts are pinned.

## Implementation Strategy

MVP = Phases 1–3 (US1): immediately useful terminal research + the auth
story de-risked. Then US2 (the engine, the feature's headline), validated
through the CLI before any UI exists. US3 last, against a working API.
Commit after each task or logical pair; stop at every checkpoint to validate
the story independently.
