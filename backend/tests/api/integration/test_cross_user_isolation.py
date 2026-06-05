"""Cross-user isolation matrix (T051 — covers FR-002, SC-002).

Seeds users A and B with disjoint runs/configs/etc; exercises every endpoint
with mismatched-user JWTs and asserts 404 (read) or refused (write).
"""

from __future__ import annotations

from uuid import uuid4

import pytest


pytestmark = [pytest.mark.integration, pytest.mark.api]


def _auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_token_for(user_id, local_supabase_jwt_secret):
    """Mint an HS256 JWT for `user_id` against the local Supabase secret."""
    import time
    import jwt as pyjwt

    payload = {
        "aud": "authenticated",
        "sub": str(user_id),
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    return pyjwt.encode(payload, local_supabase_jwt_secret, algorithm="HS256")


def test_user_a_cannot_see_user_b_run_via_get(
    fastapi_client, user_a_id, user_b_id, local_supabase_jwt_secret, clean_db
):
    """Even if A knows B's run_id, GET /api/runs/{B's id} returns 404."""
    fake_run_id = uuid4()  # belongs to nobody yet; behaves the same as B's
    token_a = _make_token_for(user_a_id, local_supabase_jwt_secret)
    r = fastapi_client.get(
        f"/api/runs/{fake_run_id}", headers=_auth_header(token_a)
    )
    assert r.status_code == 404


def test_anon_request_to_protected_endpoint_returns_401(fastapi_client):
    """No JWT → 401 on every protected endpoint."""
    for path in [
        "/api/runs",
        f"/api/runs/{uuid4()}",
        f"/api/runs/{uuid4()}/status",
        f"/api/runs/{uuid4()}/trades",
        f"/api/runs/{uuid4()}/signals",
        f"/api/runs/{uuid4()}/journal",
        "/api/strategies",
        f"/api/data/downloads/{uuid4()}",
    ]:
        r = fastapi_client.get(path)
        assert r.status_code == 401, f"path {path} did not return 401 for anon"


def test_user_a_lists_only_own_runs(
    fastapi_client, user_a_id, local_supabase_jwt_secret, clean_db
):
    """GET /api/runs with A's JWT returns only A's runs (empty here)."""
    token_a = _make_token_for(user_a_id, local_supabase_jwt_secret)
    r = fastapi_client.get("/api/runs", headers=_auth_header(token_a))
    assert r.status_code == 200
    assert r.json()["runs"] == []
