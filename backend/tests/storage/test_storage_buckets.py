"""Storage bucket policy tests (T035).

Integration: requires a local Supabase instance.
"""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.integration


def test_raw_data_bucket_exists(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM storage.buckets WHERE id = 'raw-data'")
            assert cur.fetchone() is not None


def test_run_artifacts_bucket_exists(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM storage.buckets WHERE id = 'run-artifacts'")
            assert cur.fetchone() is not None


def test_buckets_are_not_public(db_url):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, public FROM storage.buckets WHERE id IN ('raw-data', 'run-artifacts')"
            )
            rows = cur.fetchall()
    assert len(rows) == 2
    for _, is_public in rows:
        assert is_public is False, "buckets must not be public"


def test_storage_policies_use_path_prefix(db_url):
    """The RLS policies check (storage.foldername(name))[1] = auth.uid()::text."""
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT polname, pg_get_expr(polqual, polrelid)
                  FROM pg_policy p
                  JOIN pg_class c ON p.polrelid = c.oid
                  JOIN pg_namespace n ON c.relnamespace = n.oid
                 WHERE n.nspname = 'storage' AND c.relname = 'objects'
                """
            )
            rows = cur.fetchall()

    quals = " ".join(qual or "" for _, qual in rows)
    assert "foldername" in quals, "expected (storage.foldername(name))[1] in policy"
    assert "auth.uid" in quals
