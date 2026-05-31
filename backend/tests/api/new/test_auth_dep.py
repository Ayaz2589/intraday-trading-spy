"""auth_user_id dependency tests (T017)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException


def test_auth_user_id_rejects_missing_header():
    from intraday_trade_spy.api.deps import auth_user_id

    with pytest.raises(HTTPException) as exc:
        auth_user_id(authorization=None)
    assert exc.value.status_code == 401
    assert exc.value.detail["error"] == "missing_or_invalid_token"


def test_auth_user_id_rejects_non_bearer():
    from intraday_trade_spy.api.deps import auth_user_id

    with pytest.raises(HTTPException) as exc:
        auth_user_id(authorization="Basic dXNlcjpwYXNz")
    assert exc.value.status_code == 401


def test_auth_user_id_rejects_malformed_jwt(monkeypatch):
    from intraday_trade_spy.api.deps import auth_user_id

    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret-with-at-least-32-characters-long")
    with pytest.raises(HTTPException) as exc:
        auth_user_id(authorization="Bearer not.a.real.jwt")
    assert exc.value.status_code == 401


def test_auth_user_id_returns_uuid_for_valid(monkeypatch, make_token, hs256_secret):
    from intraday_trade_spy.api.deps import auth_user_id

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    from uuid import uuid4

    user_id = uuid4()
    token = make_token(user_id)
    assert auth_user_id(authorization=f"Bearer {token}") == user_id
