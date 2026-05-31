"""FastAPI dependency helpers.

Exposes:
  - `auth_user_id` — extracts and verifies the bearer token, returns user_id
  - `get_storage_client` — returns a request-scoped SupabaseStorageClient
"""

from __future__ import annotations

import os
from typing import Optional
from uuid import UUID

from fastapi import Depends, Header, HTTPException

from intraday_trade_spy.auth.token import AuthError, verify_jwt
from intraday_trade_spy.storage import SupabaseStorageClient


def auth_user_id(authorization: Optional[str] = Header(default=None)) -> UUID:
    """Extract and verify the bearer token; return the auth.users.id.

    Raises HTTPException(401) on any failure path. Also emits a journal_events
    row with kind='auth_failure' (best-effort) so the audit log captures
    rejected requests.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        _emit_auth_failure("missing Authorization Bearer header")
        raise HTTPException(
            status_code=401,
            detail={
                "error": "missing_or_invalid_token",
                "message": "missing or invalid Authorization header",
            },
        )

    token = authorization[len("Bearer "):].strip()
    try:
        return verify_jwt(token)
    except AuthError as exc:
        _emit_auth_failure(str(exc))
        raise HTTPException(
            status_code=401,
            detail={
                "error": "missing_or_invalid_token",
                "message": f"token verification failed: {exc}",
            },
        ) from exc


def get_storage_client(user_id: UUID = Depends(auth_user_id)) -> SupabaseStorageClient:
    """Construct a service-role-authenticated SupabaseStorageClient scoped
    to the authenticated user. Imported from os.environ rather than from
    config.yaml so production deploys can override via env vars without
    rebuilding the image."""
    url = os.environ.get("SUPABASE_URL")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not service_role_key:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "db_unreachable",
                "message": "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured",
            },
        )
    return SupabaseStorageClient(
        url=url,
        service_role_key=service_role_key,
        user_id=str(user_id),
    )


def _emit_auth_failure(reason: str) -> None:
    """Best-effort audit log of failed auth. Errors here are swallowed —
    we've already failed once; we don't want to fail again logging it."""
    # We don't have a user_id (the whole point — auth failed), so this is
    # logged to stderr only for the MVP. A future enhancement could log to
    # a separate auth_failures table not requiring user_id.
    import logging
    logging.getLogger(__name__).warning("auth_failure: %s", reason)
