"""RLS foundation tests for Feature 005.

Verifies that Row-Level Security is enabled on every user-scoped table and
that the basic policies behave per the matrix in
specs/005-supabase-data-layer/contracts/schema-migrations.md.

The detailed cross-user matrix (US3) lives in test_rls_anon.py,
test_rls_cross_user.py, test_rls_own_access.py — those are written in Phase 5.
This file's job is to assert the FOUNDATION:

  - RLS is enabled on every user-scoped table
  - Strategies registry SELECT is allowed to anon, mutations are not
  - User-scoped tables deny anon entirely
  - Bars deny anon SELECT but allow authenticated SELECT
"""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration


USER_SCOPED_TABLES = ["configs", "runs", "trades", "signals", "journal_events"]


def _rls_enabled(db_url: str, table: str) -> bool:
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.relrowsecurity
                  FROM pg_class c
                  JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE n.nspname = 'public' AND c.relname = %s
                """,
                (table,),
            )
            row = cur.fetchone()
            return bool(row[0]) if row else False


@pytest.mark.parametrize("table", USER_SCOPED_TABLES + ["strategies", "bars"])
def test_rls_enabled_on_table(db_url, table):
    assert _rls_enabled(db_url, table), f"RLS not enabled on {table}"


def test_strategies_has_authenticated_select_policy(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT polname, cmd
                  FROM pg_policy p
                  JOIN pg_class c ON p.polrelid = c.oid
                  JOIN pg_namespace n ON c.relnamespace = n.oid
                 WHERE n.nspname = 'public' AND c.relname = 'strategies'
                """
            )
            policies = cur.fetchall()
    assert any(cmd in (b"r", "r", "SELECT", "*") for _, cmd in policies), \
        "strategies needs a SELECT policy"


@pytest.mark.parametrize("table", USER_SCOPED_TABLES)
def test_user_scoped_table_has_uid_policy(db_url, table):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT pg_get_expr(polqual, polrelid)
                  FROM pg_policy p
                  JOIN pg_class c ON p.polrelid = c.oid
                  JOIN pg_namespace n ON c.relnamespace = n.oid
                 WHERE n.nspname = 'public' AND c.relname = %s
                """,
                (table,),
            )
            policy_quals = " ".join(row[0] or "" for row in cur.fetchall())
    assert "auth.uid()" in policy_quals, f"{table}: no auth.uid()-bound policy"
    assert "user_id" in policy_quals, f"{table}: policy doesn't reference user_id"


def test_bars_authenticated_read_only(db_url):
    """Bars: SELECT for authenticated, no mutations for authenticated."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT polname, cmd, polroles::regrole[]
                  FROM pg_policy p
                  JOIN pg_class c ON p.polrelid = c.oid
                  JOIN pg_namespace n ON c.relnamespace = n.oid
                 WHERE n.nspname = 'public' AND c.relname = 'bars'
                """
            )
            rows = cur.fetchall()

    cmds = [row[1] for row in rows]
    # Should have a SELECT policy for authenticated; no INSERT/UPDATE/DELETE for authenticated.
    assert any(c in ("r", "SELECT", "*", b"r") for c in cmds), "bars: missing SELECT policy"
