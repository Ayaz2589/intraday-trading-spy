"""JWT verification.

Validates Supabase-issued JWTs and returns the auth.users.id. See
contracts/jwt-auth.md for the full contract.

Three signing algorithms accepted:
- HS256 — used by local Supabase (supabase start); secret from SUPABASE_JWT_SECRET
- RS256 / ES256 — used by production Supabase; keys from JWKS

Critical security property: tokens with `aud != "authenticated"` are REJECTED.
This is what prevents service-role JWTs (aud=service_role) from being used as
bearer tokens to elevate privileges through the API (FR-014).
"""

from __future__ import annotations

import os
from uuid import UUID

import jwt
from jwt import PyJWKClient

from intraday_trade_spy.auth.jwks import get_jwks


_EXPECTED_AUDIENCE = "authenticated"
_ALGORITHMS_HS = ["HS256"]
_ALGORITHMS_ASYM = ["RS256", "ES256"]


class AuthError(Exception):
    """Raised when JWT verification fails for any reason."""


def verify_jwt(token: str) -> UUID:
    """Verify a Supabase JWT and return the auth.users.id (sub claim).

    Raises AuthError on any failure path — empty, malformed, wrong signature,
    expired, wrong audience, missing/invalid sub.
    """
    if not token:
        raise AuthError("empty token")

    # Try HS256 first if SUPABASE_JWT_SECRET is set (local-dev path).
    hs_secret = os.environ.get("SUPABASE_JWT_SECRET")
    if hs_secret:
        try:
            payload = jwt.decode(
                token,
                hs_secret,
                algorithms=_ALGORITHMS_HS,
                audience=_EXPECTED_AUDIENCE,
            )
            return _extract_user_id(payload)
        except jwt.InvalidAudienceError as exc:
            raise AuthError(f"invalid audience: {exc}") from exc
        except jwt.ExpiredSignatureError as exc:
            raise AuthError(f"token expired: {exc}") from exc
        except jwt.InvalidTokenError as exc:
            # Fall through to asymmetric verification — the token may have been
            # issued by production Supabase.
            hs_error: Exception | None = exc
        else:
            hs_error = None
    else:
        hs_error = None

    # Try asymmetric (RS256/ES256) via JWKS.
    supabase_url = os.environ.get("SUPABASE_URL")
    if not supabase_url:
        if hs_error is not None:
            raise AuthError(f"HS256 verification failed: {hs_error}")
        raise AuthError("SUPABASE_URL not set; cannot verify asymmetric JWT")

    try:
        jwks_url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
        jwk_client = PyJWKClient(jwks_url, cache_keys=True)
        signing_key = jwk_client.get_signing_key_from_jwt(token).key
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=_ALGORITHMS_ASYM,
            audience=_EXPECTED_AUDIENCE,
        )
        return _extract_user_id(payload)
    except jwt.InvalidAudienceError as exc:
        raise AuthError(f"invalid audience: {exc}") from exc
    except jwt.ExpiredSignatureError as exc:
        raise AuthError(f"token expired: {exc}") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError(f"invalid token: {exc}") from exc
    except Exception as exc:
        raise AuthError(f"JWT verification failed: {exc}") from exc


def _extract_user_id(payload: dict) -> UUID:
    sub = payload.get("sub")
    if not sub:
        raise AuthError("missing sub claim")
    try:
        return UUID(sub)
    except ValueError as exc:
        raise AuthError(f"sub claim is not a UUID: {sub}") from exc
