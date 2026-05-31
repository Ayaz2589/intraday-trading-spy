"""Schema-level integration tests for Feature 005.

Verifies that every migration in `backend/db/migrations/` lands the tables,
columns, types, NOT NULL, and CHECK constraints documented in
`specs/005-supabase-data-layer/data-model.md`.

These tests are integration tests — they run against a local Supabase instance
and require Docker + Supabase CLI + SUPABASE_INTEGRATION=1.
"""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration


def _columns(db_url: str, table: str) -> dict[str, dict]:
    """Return {column_name: {data_type, is_nullable, column_default}} for a table."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default
                  FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = %s
                """,
                (table,),
            )
            return {
                row[0]: {"data_type": row[1], "is_nullable": row[2], "column_default": row[3]}
                for row in cur.fetchall()
            }


def _check_constraints(db_url: str, table: str) -> list[str]:
    """Return CHECK constraint expressions for a table."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT cc.check_clause
                  FROM information_schema.table_constraints tc
                  JOIN information_schema.check_constraints cc
                    ON tc.constraint_name = cc.constraint_name
                 WHERE tc.table_schema = 'public'
                   AND tc.table_name = %s
                   AND tc.constraint_type = 'CHECK'
                """,
                (table,),
            )
            return [row[0] for row in cur.fetchall()]


# ---------- strategies ----------

def test_strategies_table_exists_with_required_columns(db_url):
    cols = _columns(db_url, "strategies")
    assert "id" in cols
    assert "key" in cols
    assert cols["key"]["is_nullable"] == "NO"
    assert "symbol" in cols
    assert cols["symbol"]["is_nullable"] == "NO"
    assert "direction" in cols
    assert "kind" in cols
    assert "enabled" in cols
    assert "created_at" in cols
    assert "updated_at" in cols


def test_strategies_constitutional_checks(db_url):
    checks = " ".join(_check_constraints(db_url, "strategies")).upper()
    assert "SYMBOL" in checks and "SPY" in checks, "Constitution I: symbol must be 'SPY'"
    assert "DIRECTION" in checks and "LONG" in checks, "Constitution II: direction must be 'LONG'"
    assert "KIND" in checks and "RULE_BASED" in checks, "Constitution II: rule-based only"


# ---------- configs ----------

def test_configs_table_exists(db_url):
    cols = _columns(db_url, "configs")
    for required in [
        "id", "user_id", "strategy_id", "name", "mode",
        "live_auto_enabled", "timeframe", "params", "created_at",
    ]:
        assert required in cols, f"configs missing column: {required}"


def test_configs_live_auto_enabled_pinned_false(db_url):
    checks = " ".join(_check_constraints(db_url, "configs")).upper()
    assert "LIVE_AUTO_ENABLED" in checks and "FALSE" in checks, \
        "Constitution V: live_auto_enabled must be FALSE in v1"
    assert "MODE" in checks and ("BACKTEST" in checks and "PAPER" in checks), \
        "Constitution V: mode must be backtest or paper"


# ---------- runs ----------

def test_runs_table_exists(db_url):
    cols = _columns(db_url, "runs")
    for required in [
        "id", "user_id", "config_id", "strategy_id", "started_at",
        "finished_at", "range_start", "range_end", "bar_count",
        "summary", "data_fingerprint", "app_version",
    ]:
        assert required in cols, f"runs missing column: {required}"


def test_runs_range_check(db_url):
    checks = " ".join(_check_constraints(db_url, "runs")).upper()
    assert "RANGE_END" in checks and "RANGE_START" in checks


# ---------- trades ----------

def test_trades_table_exists(db_url):
    cols = _columns(db_url, "trades")
    for required in [
        "id", "run_id", "user_id", "direction", "quantity",
        "entry_at", "entry_price", "stop_price", "target_price",
        "exit_at", "exit_price", "exit_reason", "pnl", "r_multiple",
    ]:
        assert required in cols, f"trades missing column: {required}"


def test_trades_stop_and_target_not_null(db_url):
    """Constitution III: no trade without both a stop and a target."""
    cols = _columns(db_url, "trades")
    assert cols["stop_price"]["is_nullable"] == "NO", "Constitution III: stop_price NOT NULL"
    assert cols["target_price"]["is_nullable"] == "NO", "Constitution III: target_price NOT NULL"


def test_trades_long_only(db_url):
    checks = " ".join(_check_constraints(db_url, "trades")).upper()
    assert "DIRECTION" in checks and "LONG" in checks, "Constitution II: trades must be LONG"


# ---------- signals ----------

def test_signals_table_exists(db_url):
    cols = _columns(db_url, "signals")
    for required in [
        "id", "run_id", "user_id", "emitted_at", "direction",
        "entry_price", "stop_price", "target_price",
        "executed", "rejection_reason", "trade_id",
        "indicator_context", "reason_text",
    ]:
        assert required in cols, f"signals missing column: {required}"


def test_signals_executed_rejected_xor(db_url):
    """Rejected signals carry rejection_reason; executed carry trade_id. Mutually exclusive."""
    checks = " ".join(_check_constraints(db_url, "signals")).upper()
    assert "REJECTION_REASON" in checks
    assert "TRADE_ID" in checks
    assert "EXECUTED" in checks


# ---------- journal_events ----------

def test_journal_events_table_exists(db_url):
    cols = _columns(db_url, "journal_events")
    for required in [
        "id", "run_id", "user_id", "occurred_at", "kind",
        "severity", "message", "details",
    ]:
        assert required in cols, f"journal_events missing column: {required}"


def test_journal_events_kind_check(db_url):
    checks = " ".join(_check_constraints(db_url, "journal_events")).upper()
    assert "KIND" in checks
    assert "FORCE_FLAT" in checks
    assert "CLOUD_PUSH_SUCCESS" in checks
    assert "CLOUD_PUSH_FAILURE" in checks


# ---------- bars ----------

def test_bars_table_exists(db_url):
    cols = _columns(db_url, "bars")
    for required in [
        "id", "bar_start", "open", "high", "low", "close",
        "volume", "source",
    ]:
        assert required in cols, f"bars missing column: {required}"
    assert "user_id" not in cols, "bars is shared; no user_id column"


# ---------- seed (T020 — appended) ----------

def test_strategy_registry_seeded_vwap_pullback_long(db_url):
    """FR-010: registry seeded with vwap_pullback_long as the only initial strategy."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT key, symbol, direction, kind FROM strategies")
            rows = cur.fetchall()

    assert len(rows) == 1, f"Expected exactly one seeded strategy; got {len(rows)}"
    key, symbol, direction, kind = rows[0]
    assert key == "vwap_pullback_long"
    assert symbol == "SPY"
    assert direction == "LONG"
    assert kind == "rule_based"


# ---------- idempotency (T022 — appended) ----------

def test_migrations_idempotent_on_reapply(db_url):
    """Edge case: applying migrations a second time MUST be a no-op.

    The fixture has already applied migrations once. We re-apply via
    `supabase db reset` would re-create from scratch; instead we test that
    re-running our migration SQL is safe.
    """
    import psycopg
    from pathlib import Path

    migrations = sorted(Path(__file__).resolve().parents[2].joinpath("db", "migrations").glob("*.sql"))
    assert migrations, "no migration files found"

    with psycopg.connect(db_url) as conn:
        for migration in migrations:
            sql = migration.read_text()
            with conn.cursor() as cur:
                cur.execute(sql)
            conn.commit()

    # After re-running: strategies still has exactly one row
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM strategies")
            assert cur.fetchone()[0] == 1, "re-apply duplicated seed row"
