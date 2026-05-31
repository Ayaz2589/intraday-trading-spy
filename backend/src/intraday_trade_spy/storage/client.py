"""Typed wrapper around supabase-py.

This module is the ONLY place that imports the supabase library. Every other
module in the codebase goes through `SupabaseStorageClient`.

See contracts/storage-client.md for the full public surface.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING
from uuid import UUID

from supabase import create_client

from intraday_trade_spy.storage.exceptions import (
    AuthError,
    CloudPushError,
    SchemaError,
)
from intraday_trade_spy.storage.models import (
    ConfigRow,
    PushRunPayload,
    StrategyRow,
)

if TYPE_CHECKING:
    from supabase import Client


HEALTH_CHECK_TIMEOUT_S = 5.0


class SupabaseStorageClient:
    """Service-role-authenticated Supabase client scoped to a single operator.

    Every write call asserts that the payload's `user_id` matches `self.user_id`.
    The service-role JWT bypasses RLS — application code is the gate.
    """

    def __init__(self, url: str, service_role_key: str, user_id: str) -> None:
        # Validate user_id is a UUID (caller mistake should fail fast)
        UUID(user_id)
        self.url = url
        self.user_id = user_id
        self._service_role_key = service_role_key
        self._client: "Client" = create_client(url, service_role_key)

    @classmethod
    def from_env(cls) -> "SupabaseStorageClient":
        """Construct from environment variables.

        Reads SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_USER_ID.
        Raises AuthError naming every missing variable.
        """
        required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_USER_ID"]
        missing = [name for name in required if not os.environ.get(name)]
        if missing:
            raise AuthError.missing_env_vars(missing)

        return cls(
            url=os.environ["SUPABASE_URL"],
            service_role_key=os.environ["SUPABASE_SERVICE_ROLE_KEY"],
            user_id=os.environ["SUPABASE_USER_ID"],
        )

    def health_check(self, timeout_s: float = HEALTH_CHECK_TIMEOUT_S) -> None:
        """Lightweight reachability + schema-presence check.

        Selects one row from the strategies registry. Raises CloudPushError on
        timeout, non-200, or empty result (registry not seeded).
        """
        try:
            response = (
                self._client.table("strategies")
                .select("key")
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"health_check: failed to reach Supabase: {exc}") from exc

        if not response.data:
            raise CloudPushError(
                "health_check: strategies registry is empty — has supabase db push run?"
            )

    # ---------- US1 methods (T045-T047) ----------

    def push_run(self, payload: PushRunPayload) -> str:
        """Atomic upload of a complete run via the `push_run(jsonb)` RPC.

        Returns the run_id on success. Raises:
          - AuthError on 401/403
          - SchemaError on 400 (CHECK / FK / RLS violation)
          - CloudPushError on any other failure
        """
        if str(payload.run.user_id) != self.user_id:
            raise AuthError(
                f"push_run: payload user_id {payload.run.user_id} does not match "
                f"client user_id {self.user_id}"
            )

        try:
            # exclude_none so optional auto-generated fields (created_at, etc.)
            # fall back to their DB DEFAULTs instead of being explicitly NULL.
            # Semantically-null fields (signal.stop_price for missing_stop,
            # signal.trade_id for rejected, etc.) are also omitted — the DB
            # column is nullable for those and the CHECK constraint accepts
            # missing values as NULL.
            body = payload.model_dump(mode="json", exclude_none=True)
            response = self._client.rpc("push_run", {"payload": body}).execute()
        except Exception as exc:
            message = str(exc).lower()
            if "401" in message or "403" in message or "unauthorized" in message:
                raise AuthError(f"push_run auth failure: {exc}") from exc
            if "check" in message or "violates" in message or "constraint" in message:
                raise SchemaError(f"push_run schema violation: {exc}") from exc
            raise CloudPushError(f"push_run failed: {exc}") from exc

        return str(payload.run.id)

    def upsert_config(self, config: ConfigRow) -> str:
        """Upsert a config row by (user_id, name). Returns the row id."""
        if str(config.user_id) != self.user_id:
            raise AuthError(
                f"upsert_config: config.user_id {config.user_id} does not match "
                f"client user_id {self.user_id}"
            )
        if config.live_auto_enabled:
            raise SchemaError(
                "live_auto_enabled may not be True in v1 (constitution principle V)"
            )

        body = config.model_dump(mode="json", exclude_none=True)
        try:
            response = (
                self._client.table("configs")
                .upsert(body, on_conflict="user_id,name")
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"upsert_config failed: {exc}") from exc

        if not response.data:
            raise CloudPushError("upsert_config returned no row")
        return response.data[0]["id"]

    def get_strategy_by_key(self, key: str) -> StrategyRow:
        """Fetch the strategy registry row by its stable key."""
        try:
            response = (
                self._client.table("strategies")
                .select("*")
                .eq("key", key)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_strategy_by_key failed: {exc}") from exc

        if not response.data:
            raise SchemaError(f"strategy with key '{key}' not found in registry")
        return StrategyRow.model_validate(response.data[0])
