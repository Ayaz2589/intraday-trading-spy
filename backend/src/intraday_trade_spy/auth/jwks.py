"""JWKS fetcher with TTL cache.

Used by `verify_jwt` to validate JWT signatures against the Supabase project's
public keys (production RS256/ES256). For local development with HS256 tokens
(supabase start), JWKS is not used — the secret comes from SUPABASE_JWT_SECRET.

15-minute TTL balances key-rotation safety with cold-path latency (research §1).
On a network failure with a stale cache entry, the stale value is returned
with a warning. On a network failure with no cache, JWKSFetchError is raised.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx


_TTL_SECONDS = 15 * 60
_FETCH_TIMEOUT_SECONDS = 5.0
_CACHE: dict[str, tuple[float, dict[str, Any]]] = {}

_log = logging.getLogger(__name__)


class JWKSFetchError(Exception):
    """Raised when JWKS cannot be fetched AND no stale cache is available."""


def _fetch_jwks(supabase_url: str) -> dict[str, Any]:
    """Fetch the project's JWKS from {supabase_url}/auth/v1/.well-known/jwks.json."""
    url = f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    response = httpx.get(url, timeout=_FETCH_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json()


def get_jwks(supabase_url: str) -> dict[str, Any]:
    """Return the JWKS for `supabase_url`, cached for 15 minutes.

    On cache miss: fetches via httpx with a 5-second timeout.
    On cache hit within TTL: returns cached value.
    On fetch failure: returns stale cache (with warning) if available; else raises.
    """
    now = time.monotonic()
    entry = _CACHE.get(supabase_url)

    if entry is not None and (now - entry[0]) < _TTL_SECONDS:
        return entry[1]

    try:
        fresh = _fetch_jwks(supabase_url)
    except Exception as exc:
        if entry is not None:
            _log.warning(
                "JWKS fetch failed for %s (%s); serving stale cache",
                supabase_url,
                exc,
            )
            return entry[1]
        raise JWKSFetchError(f"JWKS fetch failed and no cached entry: {exc}") from exc

    _CACHE[supabase_url] = (now, fresh)
    return fresh
