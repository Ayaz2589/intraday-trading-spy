"""Pytest fixtures for Supabase storage integration tests (Feature 005).

These fixtures bring up a local Supabase instance via the Supabase CLI's
`supabase start` command, apply all migrations under `backend/db/migrations/`,
and provide two pre-seeded test users plus anon and service-role clients.

Tests in this directory are marked `integration` and are skipped when:
- Docker is not running, or
- The Supabase CLI is not installed, or
- The `SUPABASE_INTEGRATION` env var is unset (opt-in gate).

The default test run (`pytest`) excludes integration tests via the
`-m 'not integration'` marker filter in repo conventions.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from collections.abc import Iterator
from pathlib import Path
from uuid import UUID, uuid4

import pytest


REPO_ROOT = Path(__file__).resolve().parents[3]
BACKEND_DIR = REPO_ROOT / "backend"
MIGRATIONS_DIR = BACKEND_DIR / "db" / "migrations"


def _supabase_cli_available() -> bool:
    return shutil.which("supabase") is not None


def _docker_available() -> bool:
    if shutil.which("docker") is None:
        return False
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=10,
            check=False,
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, OSError):
        return False


def _integration_gate_open() -> bool:
    return os.environ.get("SUPABASE_INTEGRATION", "").lower() in {"1", "true", "yes"}


@pytest.fixture(scope="session")
def local_supabase() -> Iterator[dict[str, str]]:
    """Session-scoped fixture that starts a local Supabase via the CLI.

    Yields a dict with `url`, `anon_key`, `service_role_key`, `db_url`.
    Skips the test if Docker / Supabase CLI / opt-in flag are not all present.
    """
    if not _integration_gate_open():
        pytest.skip(
            "SUPABASE_INTEGRATION env var not set; skipping integration test. "
            "Set SUPABASE_INTEGRATION=1 to enable."
        )
    if not _supabase_cli_available():
        pytest.skip("Supabase CLI not installed; skipping integration test.")
    if not _docker_available():
        pytest.skip("Docker not running; skipping integration test.")

    subprocess.run(
        ["supabase", "start"],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
    )

    status = subprocess.run(
        ["supabase", "status", "--output", "json"],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
        text=True,
    )

    import json
    payload = json.loads(status.stdout)
    env = {
        "url": payload["API_URL"],
        "anon_key": payload["ANON_KEY"],
        "service_role_key": payload["SERVICE_ROLE_KEY"],
        "db_url": payload["DB_URL"],
    }

    subprocess.run(
        ["supabase", "db", "reset"],
        cwd=BACKEND_DIR,
        check=True,
        capture_output=True,
    )

    yield env

    subprocess.run(
        ["supabase", "stop"],
        cwd=BACKEND_DIR,
        check=False,
        capture_output=True,
    )


@pytest.fixture(scope="session")
def supabase_url(local_supabase: dict[str, str]) -> str:
    return local_supabase["url"]


@pytest.fixture(scope="session")
def anon_key(local_supabase: dict[str, str]) -> str:
    return local_supabase["anon_key"]


@pytest.fixture(scope="session")
def service_role_key(local_supabase: dict[str, str]) -> str:
    return local_supabase["service_role_key"]


@pytest.fixture(scope="session")
def db_url(local_supabase: dict[str, str]) -> str:
    return local_supabase["db_url"]


@pytest.fixture(scope="session")
def user_a_id(db_url: str) -> UUID:
    """Seed `user_a` into auth.users for cross-user RLS tests."""
    return _seed_user(db_url, email="user-a@test.intraday-trade-spy.local")


@pytest.fixture(scope="session")
def user_b_id(db_url: str) -> UUID:
    """Seed `user_b` into auth.users for cross-user RLS tests."""
    return _seed_user(db_url, email="user-b@test.intraday-trade-spy.local")


def _seed_user(db_url: str, email: str) -> UUID:
    """Insert a row into auth.users and return its id.

    Uses psycopg via the local Supabase's DB URL. Each test session creates
    fresh users to keep tests deterministic.
    """
    import psycopg

    user_id = uuid4()
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth.users (id, email, instance_id, aud, role, email_confirmed_at, created_at, updated_at)
                VALUES (%s, %s, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', now(), now(), now())
                ON CONFLICT (id) DO NOTHING
                """,
                (str(user_id), email),
            )
        conn.commit()
    return user_id


@pytest.fixture()
def clean_db(db_url: str) -> Iterator[None]:
    """Per-test fixture that truncates all user-scoped tables.

    Strategy and bars tables are not truncated (seeded / shared cache).
    """
    import psycopg

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "TRUNCATE configs, runs, trades, signals, journal_events RESTART IDENTITY CASCADE"
            )
        conn.commit()

    yield


def jwt_for_user(service_role_key: str, user_id: UUID) -> str:
    """Mint a short-lived JWT for `user_id` using the service role's HS256 secret.

    The service-role JWT in Supabase local is signed with a known HS256 secret
    derived from the `service_role_key` (per the Supabase CLI's local config).
    Tests use this to impersonate a specific user when exercising RLS.
    """
    import jwt
    import time

    # Local Supabase signs with the JWT_SECRET that the CLI prints.
    # We accept the service_role_key as a stand-in path; tests that need a real
    # user JWT should derive it from the CLI's printed JWT_SECRET.
    payload = {
        "aud": "authenticated",
        "exp": int(time.time()) + 3600,
        "sub": str(user_id),
        "role": "authenticated",
    }
    secret = os.environ.get("SUPABASE_JWT_SECRET", "super-secret-jwt-token-with-at-least-32-characters-long")
    return jwt.encode(payload, secret, algorithm="HS256")
