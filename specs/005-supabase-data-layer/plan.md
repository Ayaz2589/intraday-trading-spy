# Implementation Plan: Cloud-Persisted Backtest Storage with Multi-User Access

**Branch**: `005-supabase-data-layer` | **Date**: 2026-05-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-supabase-data-layer/spec.md`

**Cross-feature design**: [`docs/migrations/2026-05-30-supabase-vercel-migration.md`](../../docs/migrations/2026-05-30-supabase-vercel-migration.md) — this feature is 1 of 4 sequential features migrating the app to Supabase + Fly.io + Vercel.

## Summary

Introduce a cloud-backed storage layer using Supabase (Postgres + Auth + Storage) that holds every backtest's runs, trades, signals (executed and rejected), journal events, configs, a strategy registry, and a shared historical-bars cache — every user-owned row scoped via Row-Level Security. Add an opt-in `--push-to-supabase` flag to the existing backtest CLI so a completed run can be uploaded atomically to the operator's cloud account. The existing local file-based CLI workflow continues to operate unchanged when the flag is absent. Auth is configured for email OTP + TOTP MFA so the credentials match what feature 007's web UI will accept. This is the foundation for features 006 (FastAPI service), 007 (frontend auth + API migration), and 008 (production deployment).

## Technical Context

**Language/Version**: Python 3.11 (existing). No new languages introduced in this feature.

**Primary Dependencies**:
- Existing: `pydantic>=2.6`, `pandas>=2.2`, `pyyaml>=6.0`, `python-dateutil>=2.9`, `yfinance>=0.2.40`, `fastapi>=0.115`, `uvicorn>=0.32`
- New: `supabase>=2.7` (official `supabase-py`, provides Postgres + Auth + Storage clients in one), `postgrest>=0.18` (transitively pulled in by `supabase-py`, called directly for batched RPC where needed)
- Dev (new): `pytest-asyncio>=0.24` (Supabase client uses async/await for some operations)

**Storage**:
- Supabase Postgres (multi-tenant tables with Row-Level Security)
- Supabase Storage (buckets: `raw-data`, `run-artifacts`)
- Local filesystem (unchanged — coexists with cloud sink)

**Testing**:
- `pytest` (existing) for unit tests
- Local Supabase instance via the official Supabase CLI (`supabase start`) for integration tests against a real Postgres + GoTrue
- Tests for RLS policies exercise both the anon key (denied) and an authenticated-but-wrong-user JWT (denied)
- Existing test suite must continue to pass with no behavior changes

**Target Platform**: Developer machines running Python 3.11 on macOS / Linux. CLI operation only in this feature. (Containerized deployment lands in feature 008.)

**Project Type**: Web-service evolution — the existing monorepo gains a new `backend/src/intraday_trade_spy/storage/` submodule and the CLI gains an additional flag. No new top-level project.

**Performance Goals**:
- Push 10,000 signals in under 60 seconds (SC-007)
- Read back a full run in under 1 second after a push (SC-001)
- Schema provisioning of a fresh database under 10 minutes (SC-008)

**Constraints**:
- Atomic push: no partial run lands in cloud storage
- No data loss when cloud push fails (local results always preserved)
- Service-role key never embedded in any user-facing surface
- Existing local-only workflow must continue to work bit-for-bit (SC-004)
- `live_auto_enabled: false` remains the default for every newly-created config

**Scale/Scope**:
- Single operator at a time (concurrent CLI usage is not a target)
- Single Supabase project per environment (dev only in this feature; production project provisioned in feature 008)
- Schema covers 7 tables + 2 storage buckets

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). For each principle below, state which parts of this feature touch it and prove non-violation. If a tension exists, defer the justification to the **Complexity Tracking** table at the bottom of this plan.

| # | Principle | Touched? | How this plan complies |
|---|-----------|----------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | Schema does NOT introduce a `symbol` column on `configs`, `runs`, `trades`, or `signals`. The symbol is implicit and constrained to SPY at the type/validation boundary in `models.py` (existing `Symbol` literal type). `data-model.md` records a `CHECK` clause on `strategies.symbol = 'SPY'` for completeness. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | yes | The `strategies` registry table has a `direction` column constrained to `('LONG')` (a CHECK constraint) so an attempt to seed a SHORT strategy is rejected at the database. The `strategy_kind` enum is `('rule_based')` for v1. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | no (engine unchanged) | The backtest engine, risk manager, broker, and bracket-order logic are not touched. The cloud push happens AFTER the engine has produced its outputs; nothing about cloud storage can re-order, re-approve, or bypass a risk decision. |
| IV | Test-First Everywhere (NON-NEGOTIABLE) | yes | Every implementation task in `tasks.md` (generated by `/speckit-tasks`) will be preceded by a failing-test task. New code lives in `backend/src/intraday_trade_spy/storage/` and `backend/src/intraday_trade_spy/cli/run_backtest.py` (modified). The schema migration files live in `backend/db/migrations/` (declarative SQL — config-adjacent; tests are integration tests that apply the migrations). The TDD-mandatory in-scope set includes all of this. |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | yes | Every `configs` row written to the database carries `live_auto_enabled BOOLEAN NOT NULL DEFAULT FALSE`. A CHECK constraint on the `mode` column accepts only `('backtest', 'paper')` in v1. The `configs` table has no foreign key to a "live trading enabled" credential. |
| VI | Educational UI: Every Concept Is Explained | no | This feature ships NO UI changes. Feature 007 carries the UI obligations for any new user-facing concept (login flow, MFA, strategy selector). The existing UI in `frontend/` continues to read from the existing local file-backed API in feature 005. |
| VII | Journal Everything | yes | The `journal_events` table is the cloud sink for `journal/logger.py`. The logger gains a Supabase write path but remains the SINGLE entry point for all trade-lifecycle events — no code outside `journal/logger.py` writes to `journal_events`. Rejected signals are persisted in the `signals` table with `executed = false`; they are first-class queryable records. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any new time logic; `clock.py` is consulted, not reimplemented. *(No new time-of-day logic added; cloud writes are wall-clock-tagged via `TIMESTAMPTZ` columns whose intent is "when the row was written," not market time.)*
- [x] Any new limits, thresholds, or session times added live in `backend/config/config.yaml`, not in source. *(The cloud-push retry budget and timeout are added to `config.yaml` under a `cloud:` section. No hardcoded magic numbers in source.)*
- [x] Backend code is Python ≥3.11 / FastAPI / Pydantic v2 / pytest. *(Confirmed. New `storage/` submodule follows the existing pattern.)*
- [x] Frontend code is React + TypeScript + Vite + Tailwind. *(N/A in this feature; no frontend changes.)*

**Constitutional amendment required (PATCH 1.1.0 → 1.1.1)**: The Engineering Standards' "Configuration" clause currently reads "All magic numbers ... live in `backend/config/config.yaml`. Hardcoded literals for these values in source code are forbidden." This feature persists per-user configs in cloud storage in addition to (not instead of) `config.yaml`. A PATCH-level amendment to the constitution clarifies that the original intent — "no hardcoded magic numbers in source code" — is preserved. The default-shipped `config.yaml` still defines the canonical values; cloud storage holds per-user copies and overrides. The amendment is drafted in `research.md` and applied during this feature's implementation phase via `/speckit-constitution`.

All NON-NEGOTIABLE principles are honored. No Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/005-supabase-data-layer/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli-flag.md
│   ├── storage-client.md
│   └── schema-migrations.md
└── tasks.md             # Phase 2 output (NOT created by /speckit-plan; created by /speckit-tasks)
```

### Source Code (repository root)

The existing monorepo is extended; no new top-level projects.

```text
backend/
├── src/intraday_trade_spy/
│   ├── storage/                       # NEW — Supabase wrapper
│   │   ├── __init__.py
│   │   ├── client.py                  # SupabaseStorageClient (Pydantic-validated wrapper)
│   │   ├── models.py                  # Pydantic row models (RunRow, TradeRow, SignalRow, …)
│   │   ├── push.py                    # push_run() — atomic upload of a completed run
│   │   └── exceptions.py              # CloudPushError, AuthError, SchemaError
│   ├── cli/
│   │   └── run_backtest.py            # MODIFIED — adds --push-to-supabase flag
│   ├── journal/
│   │   └── logger.py                  # MODIFIED — optional Supabase sink
│   ├── (existing modules unchanged)
│   └── ...
├── db/                                # NEW — declarative SQL artifacts
│   ├── migrations/                    # Numbered SQL migration files
│   │   ├── 0001_strategies.sql
│   │   ├── 0002_configs.sql
│   │   ├── 0003_runs.sql
│   │   ├── 0004_trades.sql
│   │   ├── 0005_signals.sql
│   │   ├── 0006_journal_events.sql
│   │   ├── 0007_bars.sql
│   │   ├── 0010_rls_policies.sql
│   │   └── 0020_seed_strategies.sql
│   └── README.md
├── config/
│   └── config.yaml                    # MODIFIED — adds `cloud:` section (retries, timeouts)
└── tests/
    ├── storage/                       # NEW — integration tests against local Supabase
    │   ├── test_schema.py             # migrations apply, idempotency, seeds present
    │   ├── test_rls.py                # cross-user denial on every table
    │   ├── test_push_round_trip.py    # end-to-end push + read-back parity
    │   ├── test_push_atomic.py        # partial-failure rollback
    │   └── conftest.py                # supabase fixtures, two-user setup
    └── (existing tests unchanged)

frontend/                              # UNCHANGED in this feature

docs/
└── migrations/
    └── 2026-05-30-supabase-vercel-migration.md   # Already exists; referenced from this plan
```

**Structure Decision**: The existing monorepo layout (Option 2 — backend + frontend) continues. This feature adds:

- A new `backend/src/intraday_trade_spy/storage/` Python submodule following the existing pattern (one folder per responsibility, small files, Pydantic models in `models.py`).
- A new `backend/db/` top-level folder for declarative SQL migrations. The migrations are version-controlled SQL files (not Python — they're config per constitution principle IV's exempt list), applied by the Supabase CLI.
- A new `backend/tests/storage/` test package for integration tests.

The CLI module gets a single new flag; `journal/logger.py` gets an optional sink. No existing modules are restructured.

## Complexity Tracking

No NON-NEGOTIABLE principle is violated; this table is intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|
| *(none)* | | |
