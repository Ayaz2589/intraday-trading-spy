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
        """Upsert a config row by (user_id, name). Returns the row id.

        Reuses the existing row's id if one exists for (user_id, name) — otherwise
        Postgres would try to overwrite the id and trip runs_config_id_fkey when
        prior runs reference the old config id.
        """
        if str(config.user_id) != self.user_id:
            raise AuthError(
                f"upsert_config: config.user_id {config.user_id} does not match "
                f"client user_id {self.user_id}"
            )
        if config.live_auto_enabled:
            raise SchemaError(
                "live_auto_enabled may not be True in v1 (constitution principle V)"
            )

        existing = self.get_config_by_name(config.name)
        body = config.model_dump(mode="json", exclude_none=True)
        if existing is not None:
            body["id"] = existing["id"]

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

    # ---------- Feature 006 methods (HTTP API) ----------

    def push_run_finalize(self, payload):
        """Atomic finalize via the push_run_finalize(jsonb) RPC.

        Behaves like push_run() but ALSO flips runs.status to 'finished' in
        the same transaction. The run row must already exist with
        status='running'; otherwise the RPC rejects.

        See clarification 2026-05-30 / Q1.
        """
        if str(payload.run.user_id) != self.user_id:
            raise AuthError(
                f"push_run_finalize: payload user_id {payload.run.user_id} does not match "
                f"client user_id {self.user_id}"
            )
        try:
            body = payload.model_dump(mode="json", exclude_none=True)
            self._client.rpc("push_run_finalize", {"payload": body}).execute()
        except Exception as exc:
            message = str(exc).lower()
            if "401" in message or "403" in message or "unauthorized" in message:
                raise AuthError(f"push_run_finalize auth failure: {exc}") from exc
            if "check" in message or "violates" in message or "constraint" in message:
                raise SchemaError(f"push_run_finalize schema violation: {exc}") from exc
            if "expected running" in message or "not found" in message:
                raise SchemaError(f"push_run_finalize state violation: {exc}") from exc
            raise CloudPushError(f"push_run_finalize failed: {exc}") from exc
        return str(payload.run.id)

    def insert_queued_run(
        self,
        *,
        run_id,
        config_id,
        strategy_id,
        started_at,
        range_start,
        range_end,
        bar_count,
        data_fingerprint,
        app_version,
    ) -> str:
        """Insert a runs row in status='queued'. Used by the API at request time."""
        body = {
            "id": str(run_id),
            "user_id": self.user_id,
            "config_id": str(config_id),
            "strategy_id": str(strategy_id),
            "started_at": started_at,
            "finished_at": started_at,  # will be updated on finalize
            "range_start": str(range_start),
            "range_end": str(range_end),
            "bar_count": bar_count,
            "summary": {},
            "data_fingerprint": data_fingerprint,
            "app_version": app_version,
            "status": "queued",
        }
        try:
            response = self._client.table("runs").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"insert_queued_run failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("insert_queued_run returned no row")
        return response.data[0]["id"]

    def update_run_status(
        self,
        *,
        run_id,
        status: str,
        failure_reason: str | None = None,
    ) -> None:
        """Update a run's status. Used for queued→running and running→failed."""
        body: dict = {"status": status}
        if failure_reason is not None:
            body["failure_reason"] = failure_reason
        try:
            self._client.table("runs").update(body).eq("id", str(run_id)).execute()
        except Exception as exc:
            raise CloudPushError(f"update_run_status failed: {exc}") from exc

    def get_config_by_name(self, name: str):
        """Fetch a config row owned by the current user by name, or None."""
        try:
            response = (
                self._client.table("configs")
                .select("*")
                .eq("user_id", self.user_id)
                .eq("name", name)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_config_by_name failed: {exc}") from exc
        return response.data[0] if response.data else None

    def get_config_by_id(self, *, config_id, user_id):
        try:
            response = (
                self._client.table("configs")
                .select("*")
                .eq("id", str(config_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_config_by_id failed: {exc}") from exc
        return response.data[0] if response.data else None

    def get_strategy_by_id(self, *, strategy_id):
        try:
            response = (
                self._client.table("strategies")
                .select("*")
                .eq("id", str(strategy_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_strategy_by_id failed: {exc}") from exc
        return response.data[0] if response.data else None

    def get_run(self, *, run_id, user_id):
        """Fetch a run row. Returns None if not found OR if it belongs to a
        different user (caller-supplied user_id is checked)."""
        try:
            response = (
                self._client.table("runs")
                .select("*")
                .eq("id", str(run_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_run failed: {exc}") from exc
        if not response.data:
            return None
        row = response.data[0]
        # Coerce nested summary into the expected RunSummary shape if it's a dict already.
        return row

    def get_run_status(self, *, run_id, user_id):
        """Return {status, status_updated_at, failure_reason} for a run, or None."""
        try:
            response = (
                self._client.table("runs")
                .select("status,status_updated_at,failure_reason")
                .eq("id", str(run_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_run_status failed: {exc}") from exc
        if not response.data:
            return None
        return response.data[0]

    def list_runs(self, *, user_id, limit: int, cursor: str | None):
        """List a user's runs newest-first. Returns ListPage(runs, next_cursor)."""
        from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

        q = (
            self._client.table("runs")
            .select("*")
            .eq("user_id", str(user_id))
            .order("started_at", desc=True)
            .order("id", desc=True)
            .limit(limit + 1)
        )
        decoded = decode_cursor(cursor)
        if decoded is not None:
            started_at_str, id_str = decoded
            # Naive cursor scan: filter for rows strictly older than the boundary.
            q = q.lt("started_at", started_at_str)
        try:
            response = q.execute()
        except Exception as exc:
            raise CloudPushError(f"list_runs failed: {exc}") from exc

        rows = response.data or []
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = encode_cursor(last["started_at"], last["id"])

        class _Page:
            pass
        page = _Page()
        page.runs = rows
        page.next_cursor = next_cursor
        return page

    def list_trades(self, *, run_id, user_id, limit: int, cursor: str | None):
        return self._list_run_children(
            table="trades",
            run_id=run_id,
            user_id=user_id,
            limit=limit,
            cursor=cursor,
            ordering_column="entry_at",
            result_attr="trades",
        )

    def list_signals(self, *, run_id, user_id, limit: int, cursor: str | None, executed=None):
        return self._list_run_children(
            table="signals",
            run_id=run_id,
            user_id=user_id,
            limit=limit,
            cursor=cursor,
            ordering_column="emitted_at",
            result_attr="signals",
            extra_filter=("executed", executed) if executed is not None else None,
        )

    def list_journal(self, *, run_id, user_id, limit: int, cursor: str | None):
        return self._list_run_children(
            table="journal_events",
            run_id=run_id,
            user_id=user_id,
            limit=limit,
            cursor=cursor,
            ordering_column="occurred_at",
            result_attr="events",
        )

    def _list_run_children(
        self,
        *,
        table: str,
        run_id,
        user_id,
        limit: int,
        cursor: str | None,
        ordering_column: str,
        result_attr: str,
        extra_filter: tuple[str, object] | None = None,
    ):
        from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

        q = (
            self._client.table(table)
            .select("*")
            .eq("run_id", str(run_id))
            .eq("user_id", str(user_id))
            .order(ordering_column, desc=False)
            .order("id", desc=False)
            .limit(limit + 1)
        )
        if extra_filter is not None:
            col, val = extra_filter
            q = q.eq(col, val)
        decoded = decode_cursor(cursor)
        if decoded is not None:
            boundary_value, _ = decoded
            q = q.gt(ordering_column, boundary_value)
        try:
            response = q.execute()
        except Exception as exc:
            raise CloudPushError(f"list {table} failed: {exc}") from exc

        rows = response.data or []
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = encode_cursor(last[ordering_column], last["id"])

        class _Page:
            pass
        page = _Page()
        setattr(page, result_attr, rows)
        page.next_cursor = next_cursor
        return page

    def list_strategies(self, *, enabled_only: bool = True):
        q = self._client.table("strategies").select("*")
        if enabled_only:
            q = q.eq("enabled", True)
        try:
            response = q.execute()
        except Exception as exc:
            raise CloudPushError(f"list_strategies failed: {exc}") from exc
        return response.data or []

    def delete_run(self, *, run_id, user_id) -> None:
        """Delete a single run. ON DELETE CASCADE handles signals/trades/journal_events."""
        try:
            (
                self._client.table("runs")
                .delete()
                .eq("id", str(run_id))
                .eq("user_id", str(user_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"delete_run failed: {exc}") from exc

    def delete_all_runs(self, *, user_id) -> int:
        """Delete every run for a user. Returns deleted count."""
        try:
            response = (
                self._client.table("runs")
                .delete()
                .eq("user_id", str(user_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"delete_all_runs failed: {exc}") from exc
        return len(response.data or [])

    def list_bars(self, *, range_start: str, range_end: str):
        """Shared OHLC bars within a date range. Bars are not user-scoped.
        range_end is inclusive — we filter bar_start < range_end + 1 day."""
        from datetime import date, timedelta

        end_exclusive = (date.fromisoformat(range_end) + timedelta(days=1)).isoformat()
        try:
            response = (
                self._client.table("bars")
                .select("bar_start,open,high,low,close,volume")
                .gte("bar_start", range_start)
                .lt("bar_start", end_exclusive)
                .order("bar_start", desc=False)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"list_bars failed: {exc}") from exc
        return response.data or []

    def upsert_bars(self, rows: list[dict]) -> int:
        """Insert/upsert bars. Each row must have: bar_start (ISO 8601 str or datetime),
        open, high, low, close, volume. source defaults to 'yfinance'.
        ON CONFLICT (bar_start, source) DO NOTHING — safe to re-run."""
        if not rows:
            return 0
        prepared = []
        for r in rows:
            prepared.append({
                "bar_start": r["bar_start"] if isinstance(r["bar_start"], str) else r["bar_start"].isoformat(),
                "open": float(r["open"]),
                "high": float(r["high"]),
                "low": float(r["low"]),
                "close": float(r["close"]),
                "volume": int(r["volume"]),
                "source": r.get("source", "yfinance"),
            })
        try:
            response = (
                self._client.table("bars")
                .upsert(prepared, on_conflict="bar_start,source", ignore_duplicates=True)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"upsert_bars failed: {exc}") from exc
        return len(response.data or [])

    def insert_data_download_job(
        self,
        *,
        job_id,
        start_date,
        end_date,
    ) -> str:
        body = {
            "id": str(job_id),
            "user_id": self.user_id,
            "start_date": str(start_date),
            "end_date": str(end_date),
            "status": "queued",
        }
        try:
            response = self._client.table("data_download_jobs").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"insert_data_download_job failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("insert_data_download_job returned no row")
        return response.data[0]["id"]

    def update_data_download_job(
        self,
        *,
        job_id,
        status: str,
        storage_path: str | None = None,
        failure_reason: str | None = None,
    ) -> None:
        body: dict = {"status": status}
        if storage_path is not None:
            body["storage_path"] = storage_path
        if failure_reason is not None:
            body["failure_reason"] = failure_reason
        try:
            (
                self._client.table("data_download_jobs")
                .update(body)
                .eq("id", str(job_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_data_download_job failed: {exc}") from exc

    def count_active_data_downloads(self, *, user_id) -> int:
        try:
            response = (
                self._client.table("data_download_jobs")
                .select("id", count="exact")
                .eq("user_id", str(user_id))
                .in_("status", ["queued", "running"])
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"count_active_data_downloads failed: {exc}") from exc
        return response.count or 0

    def get_data_download_job(self, *, job_id, user_id):
        try:
            response = (
                self._client.table("data_download_jobs")
                .select("*")
                .eq("id", str(job_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_data_download_job failed: {exc}") from exc
        return response.data[0] if response.data else None

    def sweep_stale_runs(self, *, max_age_minutes: int = 15) -> int:
        """Find runs stuck in `running` older than `max_age_minutes` and
        transition them to `failed`. Returns the number of rows reaped."""
        try:
            # Use a raw SQL-via-RPC pattern would be cleanest; here we use a
            # two-step SELECT + UPDATE for simplicity. Idempotent.
            from datetime import datetime, timedelta, timezone

            threshold = (
                datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
            ).isoformat()

            stale = (
                self._client.table("runs")
                .select("id")
                .eq("status", "running")
                .lt("status_updated_at", threshold)
                .execute()
            )
            ids = [row["id"] for row in (stale.data or [])]
            for rid in ids:
                (
                    self._client.table("runs")
                    .update({
                        "status": "failed",
                        "failure_reason": "Run interrupted by service restart",
                    })
                    .eq("id", rid)
                    .execute()
                )
            return len(ids)
        except Exception as exc:
            raise CloudPushError(f"sweep_stale_runs failed: {exc}") from exc
