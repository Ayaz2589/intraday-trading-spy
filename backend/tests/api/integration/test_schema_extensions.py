"""Schema extension tests for Feature 006 (T006).

Verifies the new migrations 0050, 0051, 0052, 0060 land correctly:
- runs.status / status_updated_at / failure_reason columns
- journal_events.kind CHECK extended with api_* / data_* / auth_failure
- push_run_finalize(jsonb) Postgres function exists
- data_download_jobs table + RLS + indexes
"""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration


def _has_column(db_url, table, column):
    import psycopg

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name=%s AND column_name=%s
            """,
            (table, column),
        )
        return cur.fetchone() is not None


def _check_clause(db_url, table):
    import psycopg

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT cc.check_clause
              FROM information_schema.table_constraints tc
              JOIN information_schema.check_constraints cc
                ON tc.constraint_name = cc.constraint_name
             WHERE tc.table_schema='public' AND tc.table_name=%s
               AND tc.constraint_type='CHECK'
            """,
            (table,),
        )
        return " ".join(row[0] for row in cur.fetchall()).upper()


def test_runs_has_status_column(db_url):
    assert _has_column(db_url, "runs", "status")
    assert _has_column(db_url, "runs", "status_updated_at")
    assert _has_column(db_url, "runs", "failure_reason")


def test_runs_status_check_constraint(db_url):
    checks = _check_clause(db_url, "runs")
    assert "STATUS" in checks
    for state in ["QUEUED", "RUNNING", "FINISHED", "FAILED"]:
        assert state in checks, f"runs.status CHECK missing {state}"


def test_journal_events_kind_includes_api_lifecycle(db_url):
    checks = _check_clause(db_url, "journal_events")
    for kind in [
        "API_REQUEST_RECEIVED",
        "BACKTEST_STARTED",
        "BACKTEST_FINISHED",
        "BACKTEST_FAILED",
        "DATA_DOWNLOAD_STARTED",
        "DATA_DOWNLOAD_FINISHED",
        "AUTH_FAILURE",
    ]:
        assert kind in checks, f"journal_events.kind CHECK missing {kind}"


def test_push_run_finalize_function_exists(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT 1 FROM pg_proc WHERE proname = 'push_run_finalize'"
        )
        assert cur.fetchone() is not None


def test_data_download_jobs_table_exists(db_url):
    for col in [
        "id",
        "user_id",
        "start_date",
        "end_date",
        "status",
        "storage_path",
        "status_updated_at",
        "failure_reason",
        "created_at",
    ]:
        assert _has_column(db_url, "data_download_jobs", col), \
            f"data_download_jobs missing {col}"


def test_data_download_jobs_has_rls(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT c.relrowsecurity FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname='public' AND c.relname='data_download_jobs'
            """
        )
        row = cur.fetchone()
        assert row is not None
        assert row[0] is True
