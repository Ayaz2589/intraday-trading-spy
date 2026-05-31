"""Auto-seed default config trigger tests (Feature 007 T010, FR-021 / Q4).

Verifies the migration 0070 trigger:
- A new auth.users row creates exactly one configs row with name='default'
- Idempotent: same user inserted twice doesn't duplicate
- The seeded config has live_auto_enabled=FALSE (constitution V)
- The seeded config references the vwap_pullback_long strategy
"""

from __future__ import annotations

from uuid import uuid4

import pytest


pytestmark = pytest.mark.integration


def _exec(db_url, sql, params=()):
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() if cur.description else []
        conn.commit()
    return rows


def _create_user(db_url, email):
    user_id = uuid4()
    _exec(
        db_url,
        """
        INSERT INTO auth.users (id, email, instance_id, aud, role, email_confirmed_at, created_at, updated_at)
        VALUES (%s, %s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), now())
        ON CONFLICT (id) DO NOTHING
        """,
        (str(user_id), email),
    )
    return user_id


def test_trigger_seeds_default_config_for_new_user(db_url):
    user_id = _create_user(db_url, f"seed-{uuid4()}@test.intraday.local")
    rows = _exec(
        db_url,
        """
        SELECT name, mode, live_auto_enabled, (params->>'max_risk_per_trade')::float
          FROM public.configs WHERE user_id = %s
        """,
        (str(user_id),),
    )
    assert len(rows) == 1, f"expected one config, got {rows}"
    name, mode, live, risk = rows[0]
    assert name == "default"
    assert mode == "backtest"
    assert live is False
    assert risk == 0.01


def test_trigger_uses_vwap_pullback_long_strategy(db_url):
    user_id = _create_user(db_url, f"strategy-{uuid4()}@test.intraday.local")
    rows = _exec(
        db_url,
        """
        SELECT s.key
          FROM public.configs c
          JOIN public.strategies s ON s.id = c.strategy_id
         WHERE c.user_id = %s
        """,
        (str(user_id),),
    )
    assert len(rows) == 1
    assert rows[0][0] == "vwap_pullback_long"


def test_trigger_is_idempotent(db_url):
    user_id = _create_user(db_url, f"idem-{uuid4()}@test.intraday.local")
    # Manually call the seed function a second time for the same user
    _exec(db_url, "SELECT public.seed_default_config_for_user(%s)", (str(user_id),))
    rows = _exec(
        db_url,
        "SELECT count(*) FROM public.configs WHERE user_id = %s",
        (str(user_id),),
    )
    assert rows[0][0] == 1, "ON CONFLICT DO NOTHING should prevent duplicate"


def test_migration_can_be_reapplied(db_url):
    """The migration's CREATE OR REPLACE + DROP TRIGGER IF EXISTS make it
    safe to re-run against an already-migrated database."""
    import psycopg
    from pathlib import Path

    migration_path = (
        Path(__file__).resolve().parents[2]
        / "db"
        / "migrations"
        / "0070_seed_default_config_on_signup.sql"
    )
    sql = migration_path.read_text()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    # Sanity: trigger still exists
    rows = _exec(
        db_url,
        """
        SELECT 1 FROM pg_trigger
         WHERE tgname = 'on_auth_user_created_seed_config'
        """,
    )
    assert rows
