---

description: "Tasks for Feature 005 — Cloud-Persisted Backtest Storage with Multi-User Access"
---

# Tasks: Cloud-Persisted Backtest Storage with Multi-User Access

**Input**: Design documents from `/specs/005-supabase-data-layer/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Per constitution principle IV (Test-First Everywhere, NON-NEGOTIABLE, v1.1.0), tests are MANDATORY for any task that touches:

- `backend/src/**/*.py` (all backend source)
- `frontend/src/**/*.{ts,tsx}` (all frontend source — N/A this feature)
- `backend/scripts/**/*.py` when the script contains logic — N/A this feature

For those tasks, the failing-test task MUST be authored and observed to fail before the implementation task. The pairing is explicit below: an implementation task always has a preceding test task with the same scope.

Tests are OPTIONAL (welcome but not gated) for: SQL migration files (`backend/db/migrations/*.sql`, treated as config-adjacent), YAML configs, READMEs, `.gitignore`, ≤5-line wrappers. *Where SQL migrations encode constitutional invariants (CHECK constraints, RLS policies, the `push_run` function), this feature DOES write integration tests against them anyway — those tests live in `backend/tests/storage/`.*

**Organization**: Tasks are grouped by user story (US1 = push, US2 = sign-in, US3 = isolation). Phase 1 + Phase 2 are shared foundation.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Maps task to user story for traceability
- Every task names exact file paths

## Path Conventions

This is a **web app** monorepo: backend at `backend/`, frontend at `frontend/`. This feature touches `backend/` only.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level setup that every user story builds on.

- [X] T001 Add `supabase>=2.7` to `dependencies` and `pytest-asyncio>=0.24` to `[project.optional-dependencies].dev` in `backend/pyproject.toml`
- [X] T002 [P] Create `backend/db/migrations/` directory with a `README.md` explaining the migration-file naming convention from [contracts/schema-migrations.md](./contracts/schema-migrations.md)
- [X] T003 [P] Create `backend/.env.example` documenting `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_USER_ID` with placeholders and inline comments
- [X] T004 [P] Add `.env`, `.env.*`, and `.supabase/` to `backend/.gitignore`
- [X] T005 [P] Document Supabase CLI install + `supabase login` + `supabase link` steps in `backend/README.md` (cross-link to `specs/005-supabase-data-layer/quickstart.md`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema, Pydantic models, storage-client skeleton, and test fixtures that ALL user stories depend on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### 2a. Test fixtures

- [X] T006 Create `backend/tests/storage/conftest.py` with fixtures: (a) `supabase_url` / `service_role_key` / `anon_key` from env, (b) `local_supabase` session-scoped fixture that runs `supabase start` if Docker is available else skips, (c) `user_a_id` / `user_b_id` fixtures that seed two test users in `auth.users`, (d) `clean_db` per-test fixture that truncates user-scoped tables

### 2b. Schema migrations (one test file, parallel migration files)

- [X] T007 Write failing schema tests covering all 7 base tables (existence, columns, types, NOT NULL, CHECK constraints listed in [data-model.md](./data-model.md)) in `backend/tests/storage/test_schema_tables.py`
- [X] T008 [P] Create migration `backend/db/migrations/0001_strategies.sql` (per data-model.md §1)
- [X] T009 [P] Create migration `backend/db/migrations/0002_configs.sql` (per data-model.md §2)
- [X] T010 [P] Create migration `backend/db/migrations/0003_runs.sql` (per data-model.md §3)
- [X] T011 [P] Create migration `backend/db/migrations/0004_trades.sql` (per data-model.md §4)
- [X] T012 [P] Create migration `backend/db/migrations/0005_signals.sql` (per data-model.md §5)
- [X] T013 [P] Create migration `backend/db/migrations/0006_journal_events.sql` (per data-model.md §6)
- [X] T014 [P] Create migration `backend/db/migrations/0007_bars.sql` (per data-model.md §7)

### 2c. RLS policies

- [X] T015 Write failing RLS-foundation tests (RLS enabled on every user-scoped table; default policies behave per [contracts/schema-migrations.md](./contracts/schema-migrations.md) matrix) in `backend/tests/storage/test_rls_foundation.py`
- [X] T016 Create migration `backend/db/migrations/0010_rls_enable.sql` (ALTER TABLE ... ENABLE ROW LEVEL SECURITY for the 5 user-scoped tables)
- [X] T017 [P] Create migration `backend/db/migrations/0011_rls_policies_strategies.sql` (SELECT-all-authenticated, mutate-service-role-only)
- [X] T018 [P] Create migration `backend/db/migrations/0012_rls_policies_user_scoped.sql` (`(user_id = auth.uid())` on configs, runs, trades, signals, journal_events)
- [X] T019 [P] Create migration `backend/db/migrations/0013_rls_policies_bars.sql` (SELECT-authenticated, mutate-service-role-only)

### 2d. Strategy registry seed

- [X] T020 Append failing seed test (assert exactly one row in `strategies`, key = `vwap_pullback_long`, symbol/direction/kind match constitutional invariants) to `backend/tests/storage/test_schema_tables.py`
- [X] T021 Create migration `backend/db/migrations/0020_seed_strategies.sql` with `INSERT ... ON CONFLICT DO NOTHING` per [data-model.md](./data-model.md) §1 seed

### 2e. Idempotency check

- [X] T022 Append failing idempotency test (apply all migrations twice; assert no duplicate rows, no extra indexes, no errors) to `backend/tests/storage/test_schema_tables.py`
- [X] T023 Audit every migration file from T008-T021 for `IF NOT EXISTS` / `OR REPLACE` / `ON CONFLICT DO NOTHING` clauses; patch any that are missing

### 2f. Strategy lifecycle invariant (FR-011 — covers analyze finding C2)

- [X] T023a [P] Write test asserting that disabling a strategy (UPDATE strategies SET enabled=FALSE) leaves existing runs queryable AND inserting a NEW strategy row does not invalidate any existing runs/configs/trades/signals that reference the prior strategy in `backend/tests/storage/test_strategy_lifecycle.py`. Verifies FR-011 ("adding a new strategy MUST NOT invalidate existing runs").

### 2g. Pydantic row models

- [X] T024 Write failing tests for `StrategyRow`, `ConfigRow`, `ConfigParams` (including live_auto_enabled=True rejection) in `backend/tests/storage/test_models_strategy_config.py`
- [X] T025 Write failing tests for `RunRow`, `RunSummary`, `TradeRow` (including direction='LONG' enforcement, stop/target NOT NULL) in `backend/tests/storage/test_models_run_trade.py`
- [X] T026 Write failing tests for `SignalRow` (executed-vs-rejected XOR), `SignalIndicatorContext`, `JournalEventRow`, `JournalEventDetails`, `BarRow` in `backend/tests/storage/test_models_signal_event_bar.py`
- [X] T027 Write failing test for `PushRunPayload` (composite validation rolls up to row-level errors) in `backend/tests/storage/test_models_payload.py`
- [X] T028 Implement all row models + `PushRunPayload` in `backend/src/intraday_trade_spy/storage/models.py` (one file; tests T024-T027 all pass)

### 2h. Exceptions and module init

- [X] T029 [P] Write failing tests for `CloudPushError`, `AuthError`, `SchemaError`, `PartialPushError` (constructors, message format, base-class hierarchy) in `backend/tests/storage/test_exceptions.py`
- [X] T030 [P] Implement `backend/src/intraday_trade_spy/storage/exceptions.py`
- [X] T031 [P] Create `backend/src/intraday_trade_spy/storage/__init__.py` exporting `SupabaseStorageClient` and all models/exceptions per [contracts/storage-client.md](./contracts/storage-client.md)

### 2i. SupabaseStorageClient foundation

- [X] T032 Write failing tests for `SupabaseStorageClient.__init__` (user_id validation), `.from_env()` (missing env var error messages name each missing var), `.health_check()` (timeout, non-200) in `backend/tests/storage/test_client_foundation.py`
- [X] T033 Implement `SupabaseStorageClient.__init__`, `.from_env()`, `.health_check()` in `backend/src/intraday_trade_spy/storage/client.py`

**Checkpoint**: Foundation ready — schema deployed, models validated, client can health-check. User story implementation can now begin.

---

## Phase 3: User Story 1 — Push a backtest run to cloud storage (Priority: P1) 🎯 MVP

**Goal**: An operator running the existing backtest CLI with `--push-to-supabase` uploads the completed run (run row, trades, signals, journal events) atomically to Supabase scoped to their account. The local file-based workflow is bit-for-bit unchanged when the flag is absent.

**Independent Test**: Run the backtest CLI with the flag on the bundled synthetic fixture; query Supabase via psql or the dashboard and confirm every trade, signal (executed + rejected), and journal event matches the local manifest. Re-run without the flag; confirm no Supabase rows are written and local outputs are identical to pre-feature behavior.

### Tests for User Story 1 ⚠️

> Write these tests FIRST and confirm they FAIL before implementation.

- [X] T034 [P] [US1] Write failing test for `push_run(jsonb)` Postgres function atomicity (valid payload commits all four tables; payload with constraint-violating trade rolls back run + all trades + all signals + all events) in `backend/tests/storage/test_push_atomic.py`
- [X] T035 [P] [US1] Write failing test for storage bucket policies (own-user upload/read OK; cross-user denied; anon denied; path prefix enforced) in `backend/tests/storage/test_storage_buckets.py`
- [X] T036 [P] [US1] Write failing test for `SupabaseStorageClient.push_run()` (success path, mismatched user_id raises before HTTP, RLS denial wraps to `SchemaError`) in `backend/tests/storage/test_client_push.py`
- [X] T037 [P] [US1] Write failing test for `SupabaseStorageClient.upsert_config()` (creates new, returns existing id by name, rejects `live_auto_enabled=True`) in `backend/tests/storage/test_client_upsert_config.py`
- [X] T038 [P] [US1] Write failing test for `SupabaseStorageClient.get_strategy_by_key()` (returns row for `vwap_pullback_long`, raises `SchemaError` for unknown key) in `backend/tests/storage/test_client_strategies.py`
- [X] T039 [P] [US1] Write failing test for `storage.push.gather_run_outputs()` (reads local `data/backtests/{run_id}/` artifacts into a valid `PushRunPayload`) in `backend/tests/storage/test_push_gather.py`
- [X] T040 [P] [US1] Write failing tests for `journal/logger.py` cloud sink (logger writes `cloud_push_success` and `cloud_push_failure` events locally; when supabase client provided, also writes to `journal_events`) in `backend/tests/journal/test_logger_cloud.py`
- [X] T041 [US1] Write failing tests for `--push-to-supabase` CLI flag covering all six exit codes from [contracts/cli-flag.md](./contracts/cli-flag.md) (success, missing env, unreachable supabase, RPC failure, payload validation failure, plus the "flag absent → bit-identical to pre-feature" path) in `backend/tests/cli/test_run_backtest_push.py`
- [X] T042 [US1] Write end-to-end round-trip integration test (run engine on bundled fixture → push → read back via separate authenticated context → assert byte parity within float tolerance for run + all trades + all signals + all journal events) in `backend/tests/storage/test_push_round_trip.py`
- [X] T042b [P] [US1] Performance test (SC-007 — covers analyze finding C1): synthesize a `PushRunPayload` with 10,000 signals + 500 trades + 200 journal events, push via `client.push_run()`, assert push wall-time ≤60s on the local Supabase test fixture. Marked `@pytest.mark.slow` so it does not run in the default offline suite. In `backend/tests/storage/test_push_perf.py`.

### Implementation for User Story 1

- [X] T043 [US1] Create migration `backend/db/migrations/0030_push_run_function.sql` implementing the `push_run(jsonb)` Postgres function per [data-model.md](./data-model.md) §Postgres Function (single transaction, SECURITY INVOKER, caller_uid check)
- [X] T044 [US1] Create migration `backend/db/migrations/0040_storage_buckets.sql` creating `raw-data` and `run-artifacts` buckets with path-prefix RLS policies per [data-model.md](./data-model.md) §Storage Buckets
- [X] T045 [P] [US1] Implement `SupabaseStorageClient.push_run()` (calls `supabase.rpc('push_run', ...)`, maps errors to `CloudPushError`/`AuthError`/`SchemaError`) in `backend/src/intraday_trade_spy/storage/client.py`
- [X] T046 [P] [US1] Implement `SupabaseStorageClient.upsert_config()` in `backend/src/intraday_trade_spy/storage/client.py` (depends on T028 ConfigRow)
- [X] T047 [P] [US1] Implement `SupabaseStorageClient.get_strategy_by_key()` in `backend/src/intraday_trade_spy/storage/client.py`
- [X] T048 [US1] Implement `backend/src/intraday_trade_spy/storage/push.py` exposing `gather_run_outputs(run_dir: Path) -> PushRunPayload` and `push_run(client: SupabaseStorageClient, run_dir: Path) -> str` (orchestrates the read-from-disk + client.push_run)
- [X] T049 [US1] Modify `backend/src/intraday_trade_spy/journal/logger.py` to accept an optional `supabase_client` parameter and route `cloud_push_success` / `cloud_push_failure` events to both local and (if provided) Supabase sinks. The logger remains the single writer for `journal_events`.
- [X] T050 [US1] Modify `backend/src/intraday_trade_spy/cli/run_backtest.py` to add `--push-to-supabase` and `--config-name` flags. On `--push-to-supabase`: load env via `SupabaseStorageClient.from_env()`, run health check, then (after engine completes) call `storage.push.push_run()`. Map every documented exit code per [contracts/cli-flag.md](./contracts/cli-flag.md)
- [X] T051 [US1] Add `cloud:` section to `backend/config/config.yaml` with `health_check_timeout_s: 5.0`, `push_retries: 0` (no retries in v1; retries happen via re-invocation), `push_timeout_s: 60`
- [X] T052 [US1] Add `PUSH=1` and `test-integration` Make targets in root `Makefile`. `PUSH=1`: `intraday-trade-spy-backtest --push-to-supabase $(ARGS)`. `test-integration`: `cd backend && pytest -m integration`. Document both in `make help`.

**Checkpoint**: User Story 1 is fully functional. An operator can run `make backtest PUSH=1` and the run lands in Supabase. The existing offline workflow is unchanged. SC-001, SC-003, SC-004, SC-005, SC-007 are demonstrable.

---

## Phase 4: User Story 2 — Sign in with email OTP + MFA (Priority: P2)

**Goal**: An operator can sign in to the Supabase dashboard with a 6-digit email OTP + TOTP authenticator. New accounts are required to enroll MFA on first sign-in. The credentials configured here are what feature 007's web UI will accept.

**Independent Test**: From the Supabase dashboard, sign up with a fresh email, enroll TOTP, sign out, sign back in providing both factors. Confirm that sign-in is rejected if either factor is missing or wrong. Confirm that a backup code recovers a lost-authenticator scenario.

US2 is largely Supabase Auth configuration + documentation. No new backend Python code is required.

### Configuration tasks

- [ ] T053 [US2] In the Supabase dashboard for the dev project: Authentication → Providers → Email — enable "Email OTP" (Magic link disabled, OTP code enabled, code length 6). Save. **Deliverable (covers analyze finding D1)**: save an annotated screenshot to `docs/auth/dashboard-config/email-otp-provider.png` so reviewers can verify the configuration without dashboard access.
- [ ] T054 [US2] In the Supabase dashboard for the dev project: Authentication → Multi-Factor Authentication → enable the TOTP factor. Set "Require MFA for all users" if available, otherwise document the per-user enrollment flow. **Deliverable (D1)**: save an annotated screenshot to `docs/auth/dashboard-config/mfa-totp.png`.
- [ ] T055 [US2] In the Supabase dashboard for the dev project: Authentication → Email Templates — set the OTP template to the project's house style (sender name "intraday-trade-spy", subject "Your sign-in code"). **Deliverable (D1)**: save an annotated screenshot to `docs/auth/dashboard-config/email-template.png` AND commit the template body itself as plain text to `docs/auth/dashboard-config/email-template.txt` for diff-able review.

### Documentation tasks

- [ ] T056 [P] [US2] Verify and (if needed) flesh out the MFA enrollment + backup-codes section in [quickstart.md](./quickstart.md) §5 (currently lists "Save the backup codes displayed during enrollment" — confirm the actual dashboard UX matches what we documented; adjust if it diverged)
- [ ] T057 [P] [US2] Document MFA recovery in `docs/auth/mfa-recovery.md`: (a) self-serve via backup code, (b) admin-driven reset (Supabase dashboard → Users → select user → "Reset MFA") for backup-code loss
- [ ] T058 [P] [US2] Add a manual end-to-end verification runbook in `backend/tests/storage/manual/MFA_VERIFICATION.md` covering, in order: (a) signup with fresh email → OTP entry → account created; (b) **MFA-skip path (covers spec edge case + analyze finding C3)**: dismiss the MFA enrollment prompt → attempt any protected action (view Users table, push a backtest with the new user's JWT) → confirm BLOCKED with a clear "MFA required" error; (c) re-enter MFA enrollment → enroll TOTP authenticator → save backup codes → confirm enrollment complete; (d) sign out → sign in with email OTP + TOTP → success; (e) sign in with WRONG TOTP code → rejected; (f) sign in with WRONG email OTP → rejected; (g) self-serve backup-code recovery → sign in with backup code → confirm MFA is reset and re-enrollment is required. (Manual because it requires a real email inbox.)

**Checkpoint**: An operator can sign in with email OTP + TOTP MFA. SC-006 demonstrable manually via the runbook.

---

## Phase 5: User Story 3 — Verify multi-user isolation (Priority: P3)

**Goal**: Automated tests prove that no user can read or write another user's runs/trades/signals/journal_events/configs. The shared bars cache is readable by any authenticated user but not writable by them. SC-002 = 100% denial of cross-user access — every cell in the test matrix from [contracts/schema-migrations.md](./contracts/schema-migrations.md) is exercised.

**Independent Test**: `make test-integration` runs the full test_rls_*.py suite. Every cell of the test matrix passes. Adding a new column to any user-scoped table without an RLS policy update would cause these tests to fail.

US3 is test-only — no production code in this phase. Tests live under `backend/tests/storage/` and rely on the foundation built in Phase 2.

### Tests for User Story 3

- [ ] T059 [P] [US3] Write tests for ANON-context access on every table (strategies SELECT OK; bars SELECT denied; configs / runs / trades / signals / journal_events SELECT denied; every INSERT/UPDATE/DELETE denied) in `backend/tests/storage/test_rls_anon.py`
- [ ] T060 [P] [US3] Write tests for AUTHENTICATED-WRONG-USER context on every user-scoped table (user A authenticated tries to SELECT/UPDATE/DELETE user B's row — denied) in `backend/tests/storage/test_rls_cross_user.py`
- [ ] T061 [P] [US3] Write tests for AUTHENTICATED-OWN-USER context (user A reads/writes their own rows successfully on every user-scoped table) in `backend/tests/storage/test_rls_own_access.py`
- [ ] T062 [P] [US3] Write tests for SERVICE-ROLE context (bypasses RLS on every table; can SELECT/INSERT/UPDATE/DELETE) in `backend/tests/storage/test_rls_service_role.py`
- [ ] T063 [P] [US3] Write tests for `bars` cache specifically: any authenticated user can SELECT; INSERT/UPDATE/DELETE denied to authenticated; INSERT allowed to service role; anon SELECT denied in `backend/tests/storage/test_rls_bars.py`

**Checkpoint**: SC-002 demonstrable — 100% of cross-user access attempts denied. Any future schema change that omits an RLS policy update will trip these tests in CI.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Constitutional amendment, end-to-end documentation validation, and the analyze gate before implementation merges.

- [ ] T064 Apply constitutional PATCH amendment 1.1.0 → 1.1.1 via `/speckit-constitution`. Amendment text drafted in [research.md](./research.md) §9 — updates the "Configuration" clause of Engineering Standards to acknowledge cloud-backed per-user configs alongside the canonical `backend/config/config.yaml` defaults.
- [ ] T065 [P] Update root `README.md` with a "Cloud-persisted backtests" subsection linking to `specs/005-supabase-data-layer/quickstart.md` and adding `make backtest PUSH=1` to the essentials list
- [ ] T066 [P] Update `backend/README.md` with the same cloud-push subsection (mirror of T065 but backend-scoped)
- [ ] T067 Run [quickstart.md](./quickstart.md) end-to-end on a fresh machine (or container) and fix any documentation drift. Sign-off blocks the feature.
- [ ] T068 Run `/speckit-analyze` to cross-check spec ↔ plan ↔ tasks consistency. Address any findings before declaring the feature complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Story 1 (Phase 3 — P1, MVP)**: Depends on Foundational. Independent of US2 and US3.
- **User Story 2 (Phase 4 — P2)**: Depends on Foundational. Independent of US1 and US3 (configuration + docs only).
- **User Story 3 (Phase 5 — P3)**: Depends on Foundational. Independent of US1 and US2 (tests-only; uses Phase 2's RLS policies).
- **Polish (Phase 6)**: T064 depends on Foundational. T065-T068 depend on US1 completion.

### Within Phase 2 (Foundational)

- T006 (conftest) MUST land before T007 onward (every later test imports it)
- T007 (schema-tests file) MUST be written before T008-T014 (TDD — tests fail until migrations exist)
- T015 (RLS-foundation tests) MUST be written before T016-T019
- T020 (seed test) appended after T007; runs after T021 (seed migration)
- T022 (idempotency test) appended after T020; runs after T023 (audit pass)
- T023a (strategy lifecycle test) depends on T021 (seed migration) and T010 (runs migration); fully parallel with T024-T027
- T024-T027 (model tests) MUST be written before T028 (single implementation file)
- T029 (exceptions test) MUST be written before T030
- T031 (`__init__.py`) needs T028 and T030 first
- T032 (client foundation tests) MUST be written before T033

### Within Phase 3 (US1)

- T034-T042 + T042b (all tests) MUST be written and observed to FAIL before any implementation task (T043 onward) starts. T042b is a performance test — it will FAIL with "fixture too small" until the push pipeline can synthesize a 10k-signal payload (so it lands after T028's `PushRunPayload` exists, but before T045's `client.push_run` ships).
- T043 (push_run function) needed before T045 (client.push_run uses the RPC)
- T044 (storage buckets) is independent of T043 (paralllelizable)
- T045-T047 all touch `client.py` — sequential, not parallel, despite each being a logical [P] candidate
- T048 (push.py) depends on T045 and T028 (PushRunPayload)
- T049 (logger.py modification) is independent of the storage client — parallelizable with T045-T048
- T050 (CLI flag) depends on T048 and T049
- T051 (config.yaml) and T052 (Makefile) parallelizable with T050 — different files

### Within Phase 5 (US3)

- All test files (T059-T063) are independent — fully parallelizable

### Parallel Opportunities

**Phase 1 setup**: T002, T003, T004, T005 in parallel (T001 first because deps install affects everything).

**Phase 2 — migration files**: T008, T009, T010, T011, T012, T013, T014 all in parallel after T007 lands.

**Phase 2 — RLS files**: T017, T018, T019 in parallel after T015 + T016 land.

**Phase 2 — Pydantic model tests**: T024, T025, T026, T027 in parallel (different test files). T028 implementation is sequential after all four.

**Phase 2 — strategy lifecycle**: T023a runs in parallel with any Pydantic test (T024-T027) — different file, different concern.

**Phase 2 — exceptions + init**: T029-T031 in parallel.

**Phase 3 — US1 tests**: T034, T035, T036, T037, T038, T039, T040 all in parallel (different test files). T041, T042, T042b sequential after.

**Phase 5 — US3 tests**: T059, T060, T061, T062, T063 all fully in parallel.

**Phase 6 polish**: T065 and T066 in parallel.

---

## Parallel Example: Phase 3 — User Story 1 tests

```bash
# Launch all US1 test files in parallel BEFORE writing any implementation:
Task: "T034 push_run atomicity test → backend/tests/storage/test_push_atomic.py"
Task: "T035 storage buckets test → backend/tests/storage/test_storage_buckets.py"
Task: "T036 client.push_run test → backend/tests/storage/test_client_push.py"
Task: "T037 client.upsert_config test → backend/tests/storage/test_client_upsert_config.py"
Task: "T038 client.get_strategy_by_key test → backend/tests/storage/test_client_strategies.py"
Task: "T039 push.gather_run_outputs test → backend/tests/storage/test_push_gather.py"
Task: "T040 journal logger cloud sink test → backend/tests/journal/test_logger_cloud.py"
# Run all → confirm RED → proceed to implementation
```

---

## Implementation Strategy

### MVP scope (User Story 1 only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1 (push)
4. **STOP and VALIDATE**: Run the round-trip test (T042). Run `make backtest PUSH=1`. Inspect Supabase dashboard.
5. The MVP delivers SC-001, SC-003, SC-004, SC-005, SC-007. SC-002 awaits US3; SC-006 awaits US2.

### Incremental delivery

1. Setup + Foundational → schema deployed, RLS active, client can health-check.
2. + US1 (push) → operator can push runs; MVP.
3. + US3 (isolation tests) → SC-002 demonstrable in CI; safety net for future schema changes.
4. + US2 (auth config + docs) → SC-006 demonstrable; foundation for feature 007's web UI.
5. + Polish → constitution PATCH, README updates, analyze gate.

### Parallel-team strategy

If two developers work this feature simultaneously after Foundational completes:

- **Dev A**: US1 (P1) — the entire push pipeline.
- **Dev B**: US3 (P3) — the cross-user isolation test suite (operates on Phase 2's already-deployed RLS policies; doesn't touch anything Dev A is editing).
- **Either dev**: US2 (configuration + docs).

US1 and US3 share zero files. Conflicts are zero.

---

## Notes

- `[P]` = parallelizable: different files, no shared state, no dependencies on incomplete tasks.
- `[Story]` label maps task to user story for traceability through CI and PR descriptions.
- Every test task name starts with "Write failing test". This is the explicit TDD step per principle IV — the task is COMPLETE when the test exists AND has been observed to fail. The implementation task that follows turns it green.
- SQL migration files (T008-T023 — and T043, T044) are config-adjacent per the constitution's principle-IV exempt list. They're paired with integration tests anyway because the constraints/policies/function they encode are behavior that needs verification.
- The constitutional amendment (T064) MUST happen during this feature's implementation — it's drafted in research.md §9 but not yet applied. Don't merge the feature without it.
- Commit after each test/implementation pair lands green. Avoid lumpy "Phase 2 complete" mega-commits.
- Stop at any checkpoint to demo the partial result; this is a multi-story feature explicitly designed to ship in increments.
