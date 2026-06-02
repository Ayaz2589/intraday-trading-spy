"""Config name uniqueness (migration 0092 / schema 0002 UNIQUE(user_id, name)).

A user may have at most one config per name. This is what makes
get_config_by_name deterministic (LIMIT 1 over a unique (user_id, name)) and
prevents the non-deterministic-config-selection class of dedup bug, where two
rows named 'default' let different runs read different knobs.

The auto-seed trigger (0070) already creates exactly one 'default' config per
new user, so these tests build on that seeded row.
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


def test_duplicate_config_name_for_same_user_is_rejected(db_url):
    """Inserting a second 'default' for the same user violates uniqueness."""
    import psycopg

    user_id = _create_user(db_url, f"uniq-{uuid4()}@test.intraday.local")
    # The auto-seed trigger already created one 'default' config for this user.
    seeded = _exec(
        db_url,
        "SELECT strategy_id, mode, params FROM public.configs WHERE user_id = %s AND name = 'default'",
        (str(user_id),),
    )
    assert len(seeded) == 1
    strategy_id, mode, params = seeded[0]

    with pytest.raises(psycopg.errors.UniqueViolation):
        _exec(
            db_url,
            """
            INSERT INTO public.configs (id, user_id, strategy_id, name, mode, params)
            VALUES (%s, %s, %s, 'default', %s, %s)
            """,
            (str(uuid4()), str(user_id), str(strategy_id), mode, psycopg.types.json.Json(params)),
        )


def test_same_name_allowed_for_different_users(db_url):
    """Two users may each own a 'default' config — uniqueness is per user."""
    u1 = _create_user(db_url, f"uniq-a-{uuid4()}@test.intraday.local")
    u2 = _create_user(db_url, f"uniq-b-{uuid4()}@test.intraday.local")
    rows = _exec(
        db_url,
        "SELECT user_id, name FROM public.configs WHERE user_id IN (%s, %s) AND name = 'default'",
        (str(u1), str(u2)),
    )
    owners = {str(r[0]) for r in rows}
    assert str(u1) in owners
    assert str(u2) in owners
