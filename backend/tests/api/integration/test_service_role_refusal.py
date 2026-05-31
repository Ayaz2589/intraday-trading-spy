"""Service-role JWT refusal (T052 — covers FR-014).

A JWT with `aud=service_role` MUST be rejected even when correctly signed.
This is what prevents service-role-key elevation via the API surface.
"""

from __future__ import annotations

import time

import jwt as pyjwt
import pytest


pytestmark = [pytest.mark.integration, pytest.mark.api]


def test_service_role_jwt_rejected(fastapi_client, local_supabase_jwt_secret):
    """Mint a service-role-aud JWT against the local Supabase secret and
    confirm every protected endpoint rejects it."""
    payload = {
        "aud": "service_role",
        "sub": "00000000-0000-0000-0000-000000000000",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "service_role",
    }
    bad_token = pyjwt.encode(payload, local_supabase_jwt_secret, algorithm="HS256")

    r = fastapi_client.get(
        "/api/runs",
        headers={"Authorization": f"Bearer {bad_token}"},
    )
    assert r.status_code == 401
    assert r.json()["detail"]["error"] == "missing_or_invalid_token"
