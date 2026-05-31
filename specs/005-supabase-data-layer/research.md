# Phase 0 Research — Cloud-Persisted Backtest Storage

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This document resolves every open technical decision the plan flagged. Each entry follows the format: **Decision → Rationale → Alternatives considered**.

## 1. Supabase Python client

**Decision**: Adopt the official `supabase-py` SDK (`supabase>=2.7`). Use its three subclients directly:
- `supabase.postgrest` for table reads/writes
- `supabase.auth` for the operator-facing CLI sign-in flow (later features)
- `supabase.storage` for bucket operations

**Rationale**:
- Single package, single auth context, single dependency to pin
- Active maintenance, official Supabase project, MIT licensed
- Supports both anon-key (RLS-enforced) and service-role (RLS-bypassing) modes
- Mature enough that pagination, retries, and error mapping are sensible defaults

**Alternatives considered**:
- **Direct `postgrest-py` + `storage3` + `gotrue-py`**: Lower-level, more code to maintain. Rejected — no upside over the wrapper for this feature.
- **Raw `psycopg`/`asyncpg` over the Supabase Postgres connection string**: Bypasses RLS entirely (always service-role). Rejected — defeats the multi-user isolation invariant for tests.
- **Custom HTTP client against the PostgREST REST API**: Maximum control, maximum maintenance burden. Rejected.

## 2. Schema migration tool

**Decision**: Use the Supabase CLI's built-in migration system. Migrations live as numbered SQL files in `backend/db/migrations/` (e.g., `0001_strategies.sql`). They are applied locally via `supabase db reset` (for tests) and `supabase db push` (for the dev project). The CI test fixture brings up a local Supabase via Docker and applies all migrations as part of test setup.

**Rationale**:
- Native, zero-friction with the chosen platform
- SQL-first: every migration is reviewable as plain SQL, no opaque DSL
- Idempotency is easy to enforce with `IF NOT EXISTS` and `ON CONFLICT DO NOTHING` seeds
- Supabase CLI handles the local-vs-cloud distinction automatically
- Future features (006-008) inherit the same migration system without rework

**Alternatives considered**:
- **Alembic** (the de-facto Python migration tool): Adds a SQLAlchemy dependency we don't otherwise need, generates migrations from ORM diffs (we don't have an ORM here — we use Pydantic models that talk to PostgREST). Rejected.
- **Hand-rolled bash scripts that `psql` raw SQL**: We'd reimplement what the Supabase CLI already does. Rejected.
- **Sqitch / Flyway / yoyo-migrations**: Mature, but additional tooling beyond what we need. Rejected — the CLI we already have to install ships migration support.

## 3. Local Supabase for integration tests

**Decision**: Use `supabase start` (which spins up Postgres + GoTrue + PostgREST + Storage in Docker locally) as the integration-test backend. Tests are marked `@pytest.mark.integration` so they can be opt-in (the existing offline test suite continues to be the default).

**Rationale**:
- Real PostgREST + real GoTrue exercise the actual RLS path (denial of cross-user reads / writes / anon access)
- No mocking of Supabase behavior — eliminates the class of "mock and prod diverged" bugs
- Same image the production environment will use → no behavioral drift

**Alternatives considered**:
- **`pytest-postgresql` + a hand-rolled PostgREST emulator**: Reimplements what Docker already provides, less faithful. Rejected.
- **A pure unit test that stubs `supabase-py`**: Wouldn't prove RLS policies. Rejected — the constitution's principle VII (journal everything) and the multi-user isolation invariant demand real-database tests.
- **Testcontainers-python**: Equivalent to `supabase start` but adds an extra abstraction layer. Rejected — Supabase CLI is the project's existing tool chain.

CI implication: Running integration tests requires Docker in CI. The existing offline suite stays the default `make test` target; integration tests run as `make test-integration` and gate on Docker presence.

## 4. MFA recovery mechanism

**Decision**: Use Supabase's built-in **TOTP backup codes**. At MFA enrollment, the system displays N (8) one-time backup codes; the user is required to acknowledge that they have saved them before completing enrollment. Lost-authenticator recovery is self-serve via a backup code, which then triggers re-enrollment.

**Rationale**:
- Supabase Auth supports backup codes natively — no custom flow to build
- Self-serve recovery means no admin operator is on the hook for support requests
- Standard pattern; users from other systems (1Password, GitHub, etc.) recognize it

**Alternatives considered**:
- **Admin-driven reset (operator manually clears MFA enrollment via the Supabase dashboard)**: Simpler implementation, but requires a 24/7 operator. Rejected for solo-developer ergonomics.
- **Email-based MFA bypass (resend OTP if TOTP unavailable)**: Reduces MFA to single-factor when MFA is the second factor. Rejected — defeats the point.
- **Hardware key (WebAuthn) as the second factor instead of TOTP**: Higher security but higher onboarding friction. Rejected for MVP; revisit if user base demands it.

## 5. Per-run identifier for retry safety

**Decision**: Each run is identified by a **client-generated UUID v7** (time-ordered) assigned at run start. The CLI generates the UUID, the run row's primary key is that UUID, and a `UNIQUE` constraint on `runs.id` makes a retry-after-success a no-op (with a clear error to the operator: "this run was already pushed").

**Rationale**:
- UUID v7 is time-sortable — listing runs ordered by creation is natural
- Client-generated lets the CLI know the ID before the push completes, so retries reference the same row
- A `UNIQUE` constraint makes accidental double-push detectable, not silent
- No coordination needed between client and server

**Alternatives considered**:
- **Server-generated UUID returned by the first write**: Retries can't reference the original row. Rejected.
- **Deterministic hash of inputs (config + date range + seed)**: Legitimate re-runs (same inputs, intentional rerun) collide. Rejected — the operator should be able to re-run the same config and get a distinct row.
- **Compound (user_id, started_at, config_id) natural key**: Verbose to query, doesn't help retry safety. Rejected.

## 6. Service-role credential delivery

**Decision**: The service-role key is delivered to the CLI via an environment variable: `SUPABASE_SERVICE_ROLE_KEY`. The CLI reads it once at startup; if absent and `--push-to-supabase` was passed, the CLI exits with an actionable error before running the backtest. The key is documented as a secret and is git-ignored via `.env` patterns in `.gitignore`.

**Rationale**:
- Standard Unix pattern; works with `direnv`, `.env`, CI secret managers, and operator memory
- Zero new dependency
- The CLI's only failure mode for missing key is at startup — no half-completed runs

**Alternatives considered**:
- **macOS Keychain / Secret Service via `keyring` library**: Cross-platform but adds a dependency and onboarding step for "where do I put this." Rejected — feature 008 deployment will use platform secret managers; the CLI doesn't need them.
- **Per-invocation prompt**: Wrong UX for a CI-able CLI. Rejected.
- **Reading from `~/.config/intraday-trade-spy/credentials`**: Equivalent in security to an env var but adds a new file format. Rejected.

## 7. Atomic push strategy

**Decision**: Use a single Postgres transaction wrapping all writes for one run. Implementation: a Postgres function `push_run(json_payload jsonb)` executes inserts into `runs`, `trades`, `signals`, `journal_events` inside a `BEGIN`/`COMMIT`. The client invokes this function via `supabase.rpc('push_run', {payload: ...})`. On any error inside the function, the entire transaction rolls back; the client sees an exception and no rows persist.

**Rationale**:
- Postgres native transactions are the strongest atomicity guarantee available
- Single RPC = single network round-trip for the whole payload (good for SC-007's 60-second budget for 10k signals)
- The client never needs to compensate for partial writes
- The function can be RLS-aware: it uses `SECURITY INVOKER` so the caller's role decides what's allowed (or `SECURITY DEFINER` with explicit `user_id` checking for the service-role path)

**Alternatives considered**:
- **Application-level saga (write run → write trades → write signals → write events; on failure, delete what we wrote)**: Complex compensation logic, hard to reason about, easy to leave orphans on a crash. Rejected.
- **Multi-statement PostgREST batch**: PostgREST batches don't share a transaction — each statement commits independently. Rejected — doesn't meet atomicity.
- **Two-phase commit via `pg_prepared_xacts`**: Massively over-engineered for one Postgres instance. Rejected.

Performance note: 10k signals + 1k trades + a few hundred journal events ≈ 15k INSERTs in one transaction. Postgres handles this in 1-5 seconds on Supabase's free tier. Well within SC-007's 60s budget.

## 8. Rejected-vs-executed signal schema

**Decision**: Single `signals` table with the following discriminator columns:
- `executed BOOLEAN NOT NULL` — was a trade created from this signal?
- `rejection_reason TEXT` — populated iff `executed = false`; constrained to a CHECK list matching the existing `RiskDecision` reasons (missing_stop, missing_target, wrong_symbol, daily_loss_hit, max_trades_hit, duplicate_signal, position_size_cap, stale_data, opening_range_not_complete, …)
- `trade_id UUID REFERENCES trades(id)` — populated iff `executed = true`; the trade that resulted from this signal

**Rationale**:
- Rejected signals are first-class records (constitution principle VII) — they live in the same table, queryable the same way
- A single SELECT on `signals WHERE executed = false` gives the rejected-signal stream the UI needs (in feature 007)
- CHECK constraint catches rejection-reason typos at write time

**Alternatives considered**:
- **Two tables (`executed_signals`, `rejected_signals`)**: Forces every reader to UNION ALL. Rejected — adds friction for what is logically one event stream.
- **Single `signals` table with a `status ENUM('executed','rejected','pending')`**: We don't have a `pending` state (the engine resolves every signal before persisting). Rejected — extra nullable state for no behavior.
- **Polymorphic JSON `details` column**: Loses type safety on `rejection_reason`. Rejected.

## 9. Constitutional PATCH amendment text

**Decision**: Amend `.specify/memory/constitution.md` Engineering Standards "Configuration" clause to read:

> **Configuration:** All magic numbers (limits, thresholds, timeframes, session times, risk parameters) live in `backend/config/config.yaml` AS THE DEFAULT CONFIGURATION. Per-user / per-run configuration overrides MAY be persisted in cloud storage (Supabase Postgres) once feature 005 ships. Hardcoded literals for these values in source code remain forbidden.

This is a **PATCH** (1.1.0 → 1.1.1) because it clarifies the scope of existing language without changing what the principle gates. Hardcoded literals remain forbidden; the constitution simply acknowledges that the same parameter set can also be carried in a per-user row.

**Rationale**:
- The constitution's intent (no hardcoded magic numbers) is preserved
- The PATCH leaves all NON-NEGOTIABLE principles intact
- The amendment is applied via `/speckit-constitution` after this plan's implementation is approved

**Alternatives considered**:
- **No amendment, treat per-user configs as "implementation detail"**: Risks future plan reviewers flagging this as a hidden constitution violation. Rejected.
- **MINOR amendment (1.1.0 → 1.2.0)**: Overstates the change. The principle's scope isn't expanded; the clause's wording is clarified. Rejected.
- **MAJOR amendment**: Not warranted — no principle is removed or weakened. Rejected.

## 10. Testing CI matrix

**Decision**: Two `pytest` invocations:
- `make test` (default): existing offline suite + new unit tests in `tests/storage/` that don't require Docker (Pydantic model validation, payload-shape contract tests).
- `make test-integration`: brings up a local Supabase via `supabase start`, runs migration tests, RLS tests, and the push-round-trip test. Gated on Docker; skipped with a clear message if Docker absent.

**Rationale**:
- Existing offline suite contributors run continues to be fast and dependency-light
- Integration tests run in CI environments that have Docker (GitHub Actions ubuntu-latest does)
- Local-developer onboarding doesn't require Docker for unit-level changes

**Alternatives considered**:
- **All tests require Supabase**: Friction for any contributor who doesn't have Docker. Rejected.
- **Use `pytest-docker` to start Supabase implicitly**: Adds a dependency for what `supabase start` already does. Rejected.

## 11. Storage bucket layout

**Decision**:
- Bucket `raw-data`: paths shaped `{user_id}/spy_5m_{start}_{end}.csv`. RLS policy: only the owning user (or the service role) may read or write.
- Bucket `run-artifacts`: paths shaped `{user_id}/{run_id}/manifest.json`, `{user_id}/{run_id}/equity_curve.png`, etc. RLS policy: only the owning user (or the service role) may read or write.

**Rationale**:
- User-scoped path prefixes + per-bucket RLS policy gives object-level isolation with minimal config
- Mirrors the existing local layout (`data/raw/spy_5m_*.csv`, `data/backtests/{run_id}/manifest.json`) for operator continuity
- Future deduplication of raw data (shared across users) is opt-in: a separate `shared-raw-data` bucket can land in a later feature without rework

**Alternatives considered**:
- **One bucket, RLS by file metadata**: Supabase Storage policies are easier to reason about with path prefixes than with metadata predicates. Rejected.
- **Per-user bucket**: Bucket creation is a privileged op; you'd need a Postgres trigger on user creation to create a bucket. Over-complicated. Rejected.

## 12. Connection pooling / async strategy

**Decision**: For the CLI's single-operator usage in this feature, use `supabase-py`'s default synchronous client. No connection pool needed (one CLI invocation = one short-lived process). Feature 006 (FastAPI service) will revisit this — async + pooling makes sense there.

**Rationale**:
- The CLI's connection lifetime is dominated by the push duration (seconds, not hours)
- Adding async to a CLI invocation introduces an event loop just for one HTTP request
- Premature optimization

**Alternatives considered**:
- **Adopt `supabase-py` async client from the start**: Touches the CLI's existing `argparse + sync main` shape. Rejected — defer to feature 006 where it's natural.

---

## Summary

Every spec-level decision and plan-level unknown is resolved. The 8 chosen technologies + patterns are:

1. `supabase>=2.7` Python SDK
2. Supabase CLI migrations (`backend/db/migrations/*.sql`)
3. Local Supabase via Docker for integration tests
4. TOTP backup codes for MFA recovery (Supabase native)
5. UUID v7 client-generated for run IDs
6. `SUPABASE_SERVICE_ROLE_KEY` env var for the CLI
7. Single Postgres function `push_run(jsonb)` for atomic push
8. Single `signals` table with `executed` discriminator + `rejection_reason` CHECK

The constitution receives a PATCH 1.1.0 → 1.1.1 to acknowledge cloud-backed per-user configs alongside the canonical YAML defaults.

No NEEDS CLARIFICATION markers remain. Ready for Phase 1.
