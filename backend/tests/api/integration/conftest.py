"""Integration test fixtures for the FastAPI API (Feature 006).

Reuses Feature 005's `tests/storage/conftest.py` fixtures (`local_supabase`,
`user_a_id`, `user_b_id`, `clean_db`). Adds:
- `fastapi_client` — a TestClient over the configured app.
- `local_supabase_jwt_secret` — pulled from `supabase status --output json`.
"""

from __future__ import annotations

import json
import subprocess

import pytest

# Note: storage-suite fixtures (local_supabase, user_a_id, user_b_id,
# clean_db) live in `backend/tests/storage/conftest.py`. To use them from
# this directory, they need to be referenced via fixture re-export. The
# cleanest path is to move them to `backend/tests/conftest.py` — but that
# changes Feature 005's setup. For now: integration tests in this directory
# must be run with `pytest tests/api/integration tests/storage` so pytest
# discovers both conftest trees, OR with `--rootdir=backend/tests` so the
# tests/storage fixtures are visible.


@pytest.fixture(scope="session")
def local_supabase_jwt_secret(local_supabase) -> str:
    """Read the local Supabase's JWT secret from `supabase status`."""
    status = subprocess.run(
        ["supabase", "status", "--output", "json"],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(status.stdout)
    return payload.get("JWT_SECRET") or "super-secret-jwt-token-with-at-least-32-characters-long"


@pytest.fixture()
def fastapi_client(monkeypatch, local_supabase, local_supabase_jwt_secret):
    """A TestClient over the production app, with env vars pointed at the
    local Supabase. Marked `api` (per the existing offline-test convention)
    so the socket blocker permits in-process TestClient calls."""
    from fastapi.testclient import TestClient

    monkeypatch.setenv("SUPABASE_URL", local_supabase["url"])
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", local_supabase["service_role_key"])
    monkeypatch.setenv("SUPABASE_JWT_SECRET", local_supabase_jwt_secret)

    # Force a fresh app instance with the env vars in place.
    from intraday_trade_spy.api.app import create_app

    app = create_app()
    with TestClient(app) as client:
        yield client
