"""JWT verification tests (T012)."""

from __future__ import annotations

import time
from uuid import UUID, uuid4

import jwt
import pytest


def test_verify_jwt_returns_user_id_for_valid_token(make_token, hs256_secret, monkeypatch):
    from intraday_trade_spy.auth.token import verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    user_id = uuid4()
    token = make_token(user_id)
    result = verify_jwt(token)
    assert isinstance(result, UUID)
    assert result == user_id


def test_verify_jwt_raises_on_empty():
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    with pytest.raises(AuthError):
        verify_jwt("")


def test_verify_jwt_raises_on_malformed():
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    with pytest.raises(AuthError):
        verify_jwt("not.a.valid.jwt")


def test_verify_jwt_raises_on_wrong_signature(make_token, monkeypatch):
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", "the-correct-secret-with-at-least-32-chars-long")
    bad_token = make_token(uuid4(), secret="some-other-secret-with-at-least-32-chars-long-x")
    with pytest.raises(AuthError):
        verify_jwt(bad_token)


def test_verify_jwt_raises_on_wrong_audience(hs256_secret, monkeypatch):
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    # Service-role JWT — must be rejected (FR-014)
    payload = {
        "aud": "service_role",
        "sub": str(uuid4()),
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "service_role",
    }
    token = jwt.encode(payload, hs256_secret, algorithm="HS256")
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_raises_on_expired(hs256_secret, monkeypatch):
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    payload = {
        "aud": "authenticated",
        "sub": str(uuid4()),
        "iat": int(time.time()) - 7200,
        "exp": int(time.time()) - 3600,
        "role": "authenticated",
    }
    token = jwt.encode(payload, hs256_secret, algorithm="HS256")
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_raises_on_missing_sub(hs256_secret, monkeypatch):
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    payload = {
        "aud": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    token = jwt.encode(payload, hs256_secret, algorithm="HS256")
    with pytest.raises(AuthError):
        verify_jwt(token)


def test_verify_jwt_raises_on_non_uuid_sub(hs256_secret, monkeypatch):
    from intraday_trade_spy.auth.token import AuthError, verify_jwt

    monkeypatch.setenv("SUPABASE_JWT_SECRET", hs256_secret)
    payload = {
        "aud": "authenticated",
        "sub": "not-a-uuid",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    token = jwt.encode(payload, hs256_secret, algorithm="HS256")
    with pytest.raises(AuthError):
        verify_jwt(token)
