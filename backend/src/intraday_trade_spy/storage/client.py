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


class ConfigNameConflict(Exception):
    """A config name collides with an existing one (or is empty) — Feature 012."""


class LastConfigError(Exception):
    """Refusing to delete the operator's only remaining config — Feature 012."""


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
        study_id=None,
        segment: str | None = None,
        window_index: int | None = None,
    ) -> str:
        """Insert a runs row in status='queued'. Used by the API at request time.

        Feature 011: optional study tags (study_id / segment / window_index) mark
        the run as a child of a validation study. Set at queue time here; the
        finalize RPC preserves them (so no RPC migration is needed)."""
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
        if study_id is not None:
            body["study_id"] = str(study_id)
        if segment is not None:
            body["segment"] = segment
        if window_index is not None:
            body["window_index"] = int(window_index)
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

    def set_run_spec_hash(self, *, run_id, spec_hash: str) -> None:
        """Best-effort: stamp a run with its dedup spec hash. No-ops if the
        `spec_hash` column doesn't exist yet (migration 0091 not applied), so
        run creation keeps working pre-migration."""
        try:
            self._client.table("runs").update({"spec_hash": spec_hash}).eq(
                "id", str(run_id)
            ).execute()
        except Exception:  # noqa: BLE001 — column may not exist yet; dedup is optional
            pass

    def set_run_config_snapshot(self, *, run_id, config_snapshot: dict) -> None:
        """Best-effort: stamp a run with the effective config it actually ran
        with, so the run is a faithful, reproducible record and the UI can show
        per-run knobs instead of the shared, mutable live config. No-ops if the
        `config_snapshot` column doesn't exist yet (migration 0092 not applied)."""
        try:
            self._client.table("runs").update({"config_snapshot": config_snapshot}).eq(
                "id", str(run_id)
            ).execute()
        except Exception:  # noqa: BLE001 — column may not exist yet; snapshot is optional
            pass

    def find_finished_run_by_spec(self, *, spec_hash: str):
        """Return the id of the most recent FINISHED run for the current user
        with this spec hash, or None. Returns None (skips dedup) if the
        `spec_hash` column doesn't exist yet."""
        try:
            response = (
                self._client.table("runs")
                .select("id")
                .eq("user_id", self.user_id)
                .eq("spec_hash", spec_hash)
                .eq("status", "finished")
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception:  # noqa: BLE001 — column may not exist yet; skip dedup
            return None
        return response.data[0]["id"] if response.data else None

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

    def list_configs(self, *, user_id) -> list[dict]:
        try:
            response = (
                self._client.table("configs")
                .select("*")
                .eq("user_id", str(user_id))
                .order("name", desc=False)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"list_configs failed: {exc}") from exc
        return response.data or []

    def update_config(self, *, config_id, user_id, params: dict) -> dict:
        from datetime import datetime, timezone
        body = {"params": params, "updated_at": datetime.now(timezone.utc).isoformat()}
        try:
            response = (
                self._client.table("configs")
                .update(body)
                .eq("id", str(config_id))
                .eq("user_id", str(user_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_config failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("update_config returned no row")
        return response.data[0]

    # ---------- Feature 012: config lifecycle ----------

    def _journal_config_event(self, event: str, name: str) -> None:
        """Best-effort lifecycle journal for a config mutation (constitution VII)."""
        import uuid
        from datetime import datetime, timezone

        try:
            self.insert_journal_event(
                event_id=uuid.uuid4(),
                occurred_at=datetime.now(timezone.utc).isoformat(),
                kind="lifecycle",
                message=f"config {event}: {name}",
                details={"event": f"config_{event}", "config_name": name},
            )
        except Exception:  # noqa: BLE001 — journaling must never block the mutation
            pass

    def create_config(
        self, *, name: str, params: dict, strategy_id=None, mode: str = "backtest",
        description: str | None = None,
    ) -> dict:
        """Create a new named config. Rejects empty/duplicate names; pins the
        SPY strategy (FR-014); live stays disabled. Returns the row.
        017: optional description = durable provenance."""
        import uuid

        name = (name or "").strip()
        if not name:
            raise ConfigNameConflict("config name must not be empty")
        if self.get_config_by_name(name) is not None:
            raise ConfigNameConflict(f"config name '{name}' is already in use")
        if strategy_id is None:
            strategy_id = self.get_strategy_by_key("vwap_pullback_long").id  # SPY-only
        body = {
            "id": str(uuid.uuid4()),
            "user_id": self.user_id,
            "strategy_id": str(strategy_id),
            "name": name,
            "mode": mode,
            "params": params or {},
            "is_active": False,
            "description": (description or "").strip() or None,
        }
        try:
            response = self._client.table("configs").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"create_config failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("create_config returned no row")
        self._journal_config_event("created", name)
        return response.data[0]

    def duplicate_config(self, *, src_id, new_name: str) -> dict:
        src = self.get_config_by_id(config_id=src_id, user_id=self.user_id)
        if src is None:
            raise SchemaError(f"config {src_id} not found")
        row = self.create_config(
            name=new_name,
            params=src.get("params") or {},
            strategy_id=src.get("strategy_id"),
            mode=src.get("mode", "backtest"),
        )
        return row

    def rename_config(self, *, config_id, new_name: str) -> dict:
        from datetime import datetime, timezone

        new_name = (new_name or "").strip()
        if not new_name:
            raise ConfigNameConflict("config name must not be empty")
        existing = self.get_config_by_name(new_name)
        if existing is not None and str(existing["id"]) != str(config_id):
            raise ConfigNameConflict(f"config name '{new_name}' is already in use")
        body = {"name": new_name, "updated_at": datetime.now(timezone.utc).isoformat()}
        try:
            response = (
                self._client.table("configs")
                .update(body)
                .eq("id", str(config_id))
                .eq("user_id", self.user_id)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"rename_config failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("rename_config returned no row")
        self._journal_config_event("renamed", new_name)
        return response.data[0]

    def get_active_config(self):
        try:
            response = (
                self._client.table("configs")
                .select("*")
                .eq("user_id", self.user_id)
                .eq("is_active", True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_active_config failed: {exc}") from exc
        return response.data[0] if response.data else None

    def set_active_config(self, *, config_id) -> dict:
        """Make `config_id` the active config. Clears the prior active first so
        the one-active-per-user index never sees two active rows."""
        try:
            self._client.table("configs").update({"is_active": False}).eq(
                "user_id", self.user_id
            ).eq("is_active", True).execute()
            response = (
                self._client.table("configs")
                .update({"is_active": True})
                .eq("id", str(config_id))
                .eq("user_id", self.user_id)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"set_active_config failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("set_active_config returned no row")
        self._journal_config_event("activated", response.data[0].get("name", ""))
        return response.data[0]

    def delete_config(self, *, config_id) -> None:
        """Delete a config. Refuses the last remaining config; if the deleted
        one was active, promotes another to active. Referencing runs keep their
        snapshot (config_id -> NULL via the FK)."""
        configs = self.list_configs(user_id=self.user_id)
        if len(configs) <= 1:
            raise LastConfigError("cannot delete your only remaining config")
        target = next((c for c in configs if str(c["id"]) == str(config_id)), None)
        if target is None:
            raise SchemaError(f"config {config_id} not found")
        was_active = bool(target.get("is_active"))
        try:
            self._client.table("configs").delete().eq("id", str(config_id)).eq(
                "user_id", self.user_id
            ).execute()
        except Exception as exc:
            raise CloudPushError(f"delete_config failed: {exc}") from exc
        if was_active:
            remaining = [c for c in configs if str(c["id"]) != str(config_id)]
            self.set_active_config(config_id=remaining[0]["id"])
        self._journal_config_event("deleted", target.get("name", ""))

    def list_presets(self) -> list[dict]:
        from intraday_trade_spy.config_presets import load_presets

        return load_presets()

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
            # Feature 014 (FR-008): hide study children — a study can spawn
            # hundreds of child runs; they're reached via their study, never
            # listed here. Dedup-referenced standalone runs keep study_id NULL.
            .is_("study_id", "null")
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

    def update_run_favorite(self, *, run_id, user_id, is_favorite: bool) -> dict:
        try:
            response = (
                self._client.table("runs")
                .update({"is_favorite": is_favorite})
                .eq("id", str(run_id))
                .eq("user_id", str(user_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_run_favorite failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("update_run_favorite returned no row")
        return response.data[0]

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
        """Shared OHLC bars within a date range (range_end inclusive).

        Multi-year reads can return 100k+ rows, far past PostgREST's default
        1000-row cap (Feature 009 / FR-011). Primary path is a single psycopg
        query over SUPABASE_DB_URL (fast, uncapped); if that's unavailable we
        fall back to a paginated PostgREST read so no rows are silently dropped.
        """
        import os
        from datetime import date, timedelta

        end_exclusive = (date.fromisoformat(range_end) + timedelta(days=1)).isoformat()
        db_url = os.environ.get("SUPABASE_DB_URL")
        if db_url:
            return self._list_bars_pg(db_url, range_start, end_exclusive)
        return self._list_bars_rest(range_start, end_exclusive)

    def _list_bars_pg(self, db_url: str, range_start: str, end_exclusive: str):
        sql = (
            "SELECT bar_start, open, high, low, close, volume, source "
            "FROM public.bars WHERE bar_start >= %s AND bar_start < %s "
            "ORDER BY bar_start ASC"
        )
        try:
            import psycopg

            with psycopg.connect(db_url) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, (range_start, end_exclusive))
                    out = []
                    for bar_start, o, h, lo, c, vol, source in cur.fetchall():
                        out.append(
                            {
                                "bar_start": bar_start.isoformat(),
                                "open": float(o),
                                "high": float(h),
                                "low": float(lo),
                                "close": float(c),
                                "volume": int(vol),
                                "source": source,
                            }
                        )
                    return out
        except Exception as exc:
            raise CloudPushError(f"list_bars (pg) failed: {exc}") from exc

    def _list_bars_rest(self, range_start: str, end_exclusive: str):
        """Paginated PostgREST fallback — pages of 1000 until a short page."""
        page = 1000
        offset = 0
        out: list[dict] = []
        try:
            while True:
                response = (
                    self._client.table("bars")
                    .select("bar_start,open,high,low,close,volume,source")
                    .gte("bar_start", range_start)
                    .lt("bar_start", end_exclusive)
                    .order("bar_start", desc=False)
                    .range(offset, offset + page - 1)
                    .execute()
                )
                batch = response.data or []
                out.extend(batch)
                if len(batch) < page:
                    break
                offset += page
        except Exception as exc:
            raise CloudPushError(f"list_bars failed: {exc}") from exc
        return out

    def bars_coverage(self) -> dict:
        """Return the earliest and latest cached bar_start, or {earliest: None, latest: None}.
        Two cheap targeted queries instead of MIN/MAX (PostgREST doesn't expose aggregates by default)."""
        try:
            earliest = (
                self._client.table("bars")
                .select("bar_start")
                .order("bar_start", desc=False)
                .limit(1)
                .execute()
            )
            latest = (
                self._client.table("bars")
                .select("bar_start")
                .order("bar_start", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"bars_coverage failed: {exc}") from exc
        e_rows = earliest.data or []
        l_rows = latest.data or []
        return {
            "earliest": e_rows[0]["bar_start"] if e_rows else None,
            "latest": l_rows[0]["bar_start"] if l_rows else None,
        }

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

    def bars_present_session_dates(self, *, range_start: str, range_end: str) -> list[str]:
        """Distinct ET session-days with ≥1 cached bar in [range_start, range_end].

        Uses a direct psycopg aggregate over SUPABASE_DB_URL (R8) rather than
        pulling ~100k rows through PostgREST just to count distinct days.
        range_end is inclusive.
        """
        from datetime import date, timedelta

        end_exclusive = (date.fromisoformat(range_end) + timedelta(days=1)).isoformat()
        sql = (
            "SELECT DISTINCT (bar_start AT TIME ZONE 'America/New_York')::date AS d "
            "FROM public.bars WHERE bar_start >= %s AND bar_start < %s ORDER BY d"
        )
        try:
            from intraday_trade_spy.storage.db_pool import get_pool

            with get_pool().connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(sql, (range_start, end_exclusive))
                    return [r[0].isoformat() for r in cur.fetchall()]
        except CloudPushError:
            raise
        except Exception as exc:
            raise CloudPushError(f"bars_present_session_dates failed: {exc}") from exc

    # ---------- Feature 013: cache stats + lineage ----------

    def bars_monthly_aggregate(self) -> dict:
        """Per-ET-month cache stats + whole-cache totals in one round trip
        (Feature 013 US2; research D1/D2 — R8 direct-psycopg aggregate).

        Returns {"months": {"YYYY-MM": {"bars", "session_dates", "sources"}},
                 "totals": {"bars", "sessions", "earliest", "latest",
                            "last_updated", "sources"}}.
        """
        per_day_sql = (
            "SELECT (bar_start AT TIME ZONE 'America/New_York')::date AS d, "
            "       count(*) AS bars, array_agg(DISTINCT source) AS sources "
            "FROM public.bars GROUP BY d ORDER BY d"
        )
        totals_sql = "SELECT count(*), max(created_at) FROM public.bars"
        try:
            from intraday_trade_spy.storage.db_pool import get_pool

            with get_pool().connection() as conn, conn.cursor() as cur:
                cur.execute(per_day_sql)
                days = cur.fetchall()
                cur.execute(totals_sql)
                total_bars, last_created = cur.fetchone()
        except CloudPushError:
            raise
        except Exception as exc:
            raise CloudPushError(f"bars_monthly_aggregate failed: {exc}") from exc

        months: dict[str, dict] = {}
        all_sources: set[str] = set()
        for d, bars, sources in days:
            key = f"{d.year:04d}-{d.month:02d}"
            m = months.setdefault(key, {"bars": 0, "session_dates": [], "sources": set()})
            m["bars"] += int(bars)
            m["session_dates"].append(d.isoformat())
            m["sources"].update(sources or [])
            all_sources.update(sources or [])
        for m in months.values():
            m["sources"] = sorted(m["sources"])

        return {
            "months": months,
            "totals": {
                "bars": int(total_bars or 0),
                "sessions": len(days),
                "earliest": days[0][0].isoformat() if days else None,
                "latest": days[-1][0].isoformat() if days else None,
                "last_updated": last_created.isoformat() if last_created else None,
                "sources": sorted(all_sources),
            },
        }

    def list_backfill_jobs(self, *, limit: int) -> list[dict]:
        """The user's most recent backfill jobs, newest first (Feature 013 US1)."""
        try:
            response = (
                self._client.table("backfill_jobs")
                .select("*")
                .eq("user_id", self.user_id)
                .order("created_at", desc=True)
                .limit(int(limit))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"list_backfill_jobs failed: {exc}") from exc
        return response.data or []

    def runs_count(self) -> int:
        """Count of the user's persisted runs (Feature 013 US4, research D4)."""
        try:
            response = (
                self._client.table("runs")
                .select("id", count="exact")
                .eq("user_id", self.user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"runs_count failed: {exc}") from exc
        return response.count or 0

    def studies_count(self) -> int:
        """Count of the user's validation studies (Feature 013 US4)."""
        try:
            response = (
                self._client.table("validation_studies")
                .select("id", count="exact")
                .eq("user_id", self.user_id)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"studies_count failed: {exc}") from exc
        return response.count or 0

    def latest_run_at(self):
        """started_at of the user's most recent run, or None (Feature 013 US4)."""
        try:
            response = (
                self._client.table("runs")
                .select("started_at")
                .eq("user_id", self.user_id)
                .order("started_at", desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"latest_run_at failed: {exc}") from exc
        return response.data[0]["started_at"] if response.data else None

    # ---------- Feature 009: backfill_jobs ----------

    def insert_backfill_job(
        self,
        *,
        job_id,
        range_start,
        range_end,
        source: str = "alpaca",
        windows_total: int = 0,
    ) -> str:
        body = {
            "id": str(job_id),
            "user_id": self.user_id,
            "status": "queued",
            "source": source,
            "range_start": str(range_start),
            "range_end": str(range_end),
            "windows_total": int(windows_total),
        }
        try:
            response = self._client.table("backfill_jobs").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"insert_backfill_job failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("insert_backfill_job returned no row")
        return response.data[0]["id"]

    def update_backfill_job(
        self,
        *,
        job_id,
        status: str | None = None,
        windows_done: int | None = None,
        bars_added: int | None = None,
        gap_session_dates: list | None = None,
        failure_reason: str | None = None,
    ) -> None:
        from datetime import datetime, timezone

        body: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
        if status is not None:
            body["status"] = status
        if windows_done is not None:
            body["windows_done"] = int(windows_done)
        if bars_added is not None:
            body["bars_added"] = int(bars_added)
        if gap_session_dates is not None:
            body["gap_session_dates"] = list(gap_session_dates)
        if failure_reason is not None:
            body["failure_reason"] = failure_reason[:500]
        try:
            (
                self._client.table("backfill_jobs")
                .update(body)
                .eq("id", str(job_id))
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_backfill_job failed: {exc}") from exc

    def get_backfill_job(self, *, job_id, user_id):
        try:
            response = (
                self._client.table("backfill_jobs")
                .select("*")
                .eq("id", str(job_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_backfill_job failed: {exc}") from exc
        return response.data[0] if response.data else None

    def count_active_backfills(self, *, user_id, stale_after_minutes: int) -> int:
        """Count non-terminal backfill jobs that are NOT stale (C1).

        A job whose process died leaves a stuck `running` row; excluding rows
        whose `updated_at` is older than the TTL keeps a crash from blocking
        the per-user cap forever.
        """
        from datetime import datetime, timedelta, timezone

        cutoff = (
            datetime.now(timezone.utc) - timedelta(minutes=stale_after_minutes)
        ).isoformat()
        try:
            response = (
                self._client.table("backfill_jobs")
                .select("id", count="exact")
                .eq("user_id", str(user_id))
                .in_("status", ["queued", "running"])
                .gte("updated_at", cutoff)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"count_active_backfills failed: {exc}") from exc
        return response.count or 0

    # ---------- Feature 011: validation studies ----------

    def insert_validation_study(
        self,
        *,
        study_id,
        kind: str,
        params: dict,
        progress_total: int = 0,
    ) -> str:
        """Insert a validation_studies row in status='queued'."""
        body = {
            "id": str(study_id),
            "user_id": self.user_id,
            "kind": kind,
            "status": "queued",
            "params": params or {},
            "progress_total": int(progress_total),
        }
        try:
            response = self._client.table("validation_studies").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"insert_validation_study failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("insert_validation_study returned no row")
        return response.data[0]["id"]

    def update_validation_study(
        self,
        *,
        study_id,
        status: str | None = None,
        progress_completed: int | None = None,
        result: dict | None = None,
        failure_reason: str | None = None,
    ) -> None:
        """Update a study's status / progress / result. Stamps status_updated_at
        whenever status changes (powers the stale-study sweep)."""
        from datetime import datetime, timezone

        body: dict = {}
        if status is not None:
            body["status"] = status
            body["status_updated_at"] = datetime.now(timezone.utc).isoformat()
        if progress_completed is not None:
            body["progress_completed"] = int(progress_completed)
        if result is not None:
            body["result"] = result
        if failure_reason is not None:
            body["failure_reason"] = failure_reason[:1000]
        if not body:
            return
        try:
            (
                self._client.table("validation_studies")
                .update(body)
                .eq("id", str(study_id))
                .eq("user_id", self.user_id)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_validation_study failed: {exc}") from exc

    def get_validation_study(self, *, study_id, user_id):
        """Fetch a study row, or None if not found / owned by another user."""
        try:
            response = (
                self._client.table("validation_studies")
                .select("*")
                .eq("id", str(study_id))
                .eq("user_id", str(user_id))
                .limit(1)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_validation_study failed: {exc}") from exc
        return response.data[0] if response.data else None

    def list_validation_studies(self, *, user_id, limit: int, cursor: str | None):
        """List a user's studies newest-first. Returns a page with .studies +
        .next_cursor (same cursor scheme as list_runs)."""
        from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

        q = (
            self._client.table("validation_studies")
            .select("*")
            .eq("user_id", str(user_id))
            .order("created_at", desc=True)
            .order("id", desc=True)
            .limit(limit + 1)
        )
        decoded = decode_cursor(cursor)
        if decoded is not None:
            created_at_str, _ = decoded
            q = q.lt("created_at", created_at_str)
        try:
            response = q.execute()
        except Exception as exc:
            raise CloudPushError(f"list_validation_studies failed: {exc}") from exc

        rows = response.data or []
        next_cursor = None
        if len(rows) > limit:
            rows = rows[:limit]
            last = rows[-1]
            next_cursor = encode_cursor(last["created_at"], last["id"])

        class _Page:
            pass

        page = _Page()
        page.studies = rows
        page.next_cursor = next_cursor
        return page

    def list_runs_by_study(self, *, study_id, user_id) -> list[dict]:
        """All child runs of a study, ordered by window then segment (for
        aggregation and drill-down)."""
        try:
            response = (
                self._client.table("runs")
                .select("*")
                .eq("study_id", str(study_id))
                .eq("user_id", str(user_id))
                .order("window_index", desc=False)
                .order("segment", desc=False)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"list_runs_by_study failed: {exc}") from exc
        return response.data or []

    # ---------- Feature 011: lockbox ledger (US4) ----------

    def append_lockbox_row(
        self,
        *,
        ledger_id,
        lockbox_start,
        lockbox_end,
        config_fingerprint: str,
        result: dict,
        state: str,
        override: bool = False,
        run_id=None,
    ) -> str:
        """Append-only insert into lockbox_ledger. Never updates an existing row
        (a spent result is immutable)."""
        body = {
            "id": str(ledger_id),
            "user_id": self.user_id,
            "lockbox_start": str(lockbox_start),
            "lockbox_end": str(lockbox_end),
            "config_fingerprint": config_fingerprint,
            "result": result or {},
            "state": state,
            "override": bool(override),
        }
        if run_id is not None:
            body["run_id"] = str(run_id)
        try:
            response = self._client.table("lockbox_ledger").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"append_lockbox_row failed: {exc}") from exc
        if not response.data:
            raise CloudPushError("append_lockbox_row returned no row")
        return response.data[0]["id"]

    def get_lockbox_ledger(self, *, user_id, lockbox_start, lockbox_end) -> list[dict]:
        """All ledger rows for a (user, lockbox range), oldest first. The lockbox
        state is derived from these (validation.lockbox.derive_state)."""
        try:
            response = (
                self._client.table("lockbox_ledger")
                .select("*")
                .eq("user_id", str(user_id))
                .eq("lockbox_start", str(lockbox_start))
                .eq("lockbox_end", str(lockbox_end))
                .order("created_at", desc=False)
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"get_lockbox_ledger failed: {exc}") from exc
        return response.data or []

    def insert_journal_event(
        self,
        *,
        event_id,
        occurred_at,
        kind: str,
        message: str,
        severity: str = "info",
        details: dict | None = None,
        run_id=None,
    ) -> str:
        """Insert a standalone journal_events row (e.g. a lockbox spend/burn —
        constitution VII / FR-023). run_id is optional (nullable for lifecycle)."""
        body = {
            "id": str(event_id),
            "user_id": self.user_id,
            "occurred_at": occurred_at,
            "kind": kind,
            "severity": severity,
            "message": message,
            "details": details or {},
        }
        if run_id is not None:
            body["run_id"] = str(run_id)
        try:
            response = self._client.table("journal_events").insert(body).execute()
        except Exception as exc:
            raise CloudPushError(f"insert_journal_event failed: {exc}") from exc
        return response.data[0]["id"] if response.data else str(event_id)

    def sweep_stale_studies(self, *, max_age_minutes: int = 15) -> int:
        """Transition validation studies stuck in 'running' past the TTL to
        'failed' (crash recovery). Mirrors sweep_stale_runs."""
        from datetime import datetime, timedelta, timezone

        threshold = (
            datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        ).isoformat()
        try:
            stale = (
                self._client.table("validation_studies")
                .select("id")
                .eq("status", "running")
                .lt("status_updated_at", threshold)
                .execute()
            )
            ids = [row["id"] for row in (stale.data or [])]
            for sid in ids:
                (
                    self._client.table("validation_studies")
                    .update({
                        "status": "failed",
                        "status_updated_at": datetime.now(timezone.utc).isoformat(),
                        "failure_reason": "Study interrupted by service restart",
                    })
                    .eq("id", sid)
                    .execute()
                )
            return len(ids)
        except Exception as exc:
            raise CloudPushError(f"sweep_stale_studies failed: {exc}") from exc

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

    # ---------- Feature 016: insights aggregates (R4 — db_pool psycopg) ----------

    @staticmethod
    def _insights_fingerprint(rows: list) -> str:
        """Deterministic snapshot identity over the contributing rows. Pins
        Claude analyses (idempotency) and signals staleness to the UI."""
        import hashlib
        import json

        if not rows:
            return "empty"
        blob = json.dumps(rows, sort_keys=True, default=str, separators=(",", ":"))
        return hashlib.sha256(blob.encode()).hexdigest()[:16]

    def insights_edge_timeseries(self, *, config_name: str | None = None) -> dict:
        """One point per OOS child run across the archive, computed FROM THE
        TRADES TABLE (not summary jsonb) and restricted to provably-OOS rows
        (segment='validation'); user-scoped in SQL (FR-005/FR-016)."""
        sql = (
            "SELECT r.id, r.study_id, r.window_index, "
            "       s.params->>'config_name' AS config_name, "
            "       r.range_start, r.range_end, "
            "       count(t.pnl) AS trades, "
            "       coalesce(sum(t.pnl), 0) AS net_pnl, "
            "       avg(t.pnl) AS expectancy_dollars, "
            "       avg(t.r_multiple) AS expectancy_r, "
            "       stddev_samp(t.pnl) AS pnl_std, "
            # 016-polish: account size per point — $ values are NOT comparable
            # across configs run at different account sizes ($2.5M vs $1k).
            "       (r.config_snapshot->'risk'->>'account_value')::float AS account_value, "
            "       r.created_at "
            "FROM public.runs r "
            "JOIN public.validation_studies s ON s.id = r.study_id "
            "LEFT JOIN public.trades t ON t.run_id = r.id "
            "WHERE r.user_id = %s AND r.segment = 'validation' "
        )
        params: list = [self.user_id]
        if config_name is not None:
            sql += "AND s.params->>'config_name' = %s "
            params.append(config_name)
        sql += (
            "GROUP BY r.id, r.study_id, r.window_index, s.params->>'config_name', "
            "         r.range_start, r.range_end, r.config_snapshot, r.created_at "
            "ORDER BY r.range_start, config_name"
        )
        try:
            from intraday_trade_spy.storage.db_pool import get_pool

            with get_pool().connection() as conn, conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        except CloudPushError:
            raise
        except Exception as exc:
            raise CloudPushError(f"insights_edge_timeseries failed: {exc}") from exc

        points = [
            {
                "run_id": str(r[0]),
                "study_id": str(r[1]),
                "window_index": r[2],
                "config_name": r[3],
                "range_start": str(r[4]),
                "range_end": str(r[5]),
                "trades": int(r[6] or 0),
                "net_pnl": float(r[7] or 0.0),
                "expectancy_dollars": float(r[8]) if r[8] is not None else None,
                "expectancy_r": float(r[9]) if r[9] is not None else None,
                "pnl_std": float(r[10]) if r[10] is not None else None,
                "account_value": float(r[11]) if r[11] is not None else None,
            }
            for r in rows
        ]
        return {
            "points": points,
            "snapshot_fingerprint": self._insights_fingerprint([list(map(str, r)) for r in rows]),
        }

    def insights_config_distribution(self) -> dict:
        """Per-config distribution of per-window OOS outcomes (FR-006), with
        016-polish enrichment: R quartiles (cross-config comparable), win rate,
        profit factor, account size, and each config's latest pooled-gate
        verdict (lateral against validation_studies)."""
        sql = (
            "WITH per_window AS ("
            "  SELECT s.params->>'config_name' AS config_name, r.id, "
            "         coalesce(sum(t.pnl), 0) AS window_pnl, "
            "         avg(t.pnl) AS window_expectancy, "
            "         avg(t.r_multiple) AS window_expectancy_r, "
            "         count(t.pnl) AS trades "
            "  FROM public.runs r "
            "  JOIN public.validation_studies s ON s.id = r.study_id "
            "  LEFT JOIN public.trades t ON t.run_id = r.id "
            "  WHERE r.user_id = %s AND r.segment = 'validation' "
            "  GROUP BY config_name, r.id"
            "), per_config_trades AS ("
            "  SELECT s.params->>'config_name' AS config_name, "
            "         avg((t.pnl > 0)::int)::float AS win_rate, "
            "         sum(t.pnl) FILTER (WHERE t.pnl > 0) AS gross_win, "
            "         abs(sum(t.pnl) FILTER (WHERE t.pnl < 0)) AS gross_loss, "
            "         max((r.config_snapshot->'risk'->>'account_value')::float) AS account_value "
            "  FROM public.runs r "
            "  JOIN public.validation_studies s ON s.id = r.study_id "
            "  LEFT JOIN public.trades t ON t.run_id = r.id "
            "  WHERE r.user_id = %s AND r.segment = 'validation' "
            "  GROUP BY config_name"
            "), per_config AS ("
            "  SELECT config_name, count(*) AS windows, "
            "         count(*) FILTER (WHERE window_pnl > 0) AS windows_positive, "
            "         percentile_cont(0.25) WITHIN GROUP (ORDER BY window_pnl) AS pnl_q25, "
            "         percentile_cont(0.50) WITHIN GROUP (ORDER BY window_pnl) AS pnl_q50, "
            "         percentile_cont(0.75) WITHIN GROUP (ORDER BY window_pnl) AS pnl_q75, "
            "         percentile_cont(0.25) WITHIN GROUP (ORDER BY window_expectancy) AS exp_q25, "
            "         percentile_cont(0.50) WITHIN GROUP (ORDER BY window_expectancy) AS exp_q50, "
            "         percentile_cont(0.75) WITHIN GROUP (ORDER BY window_expectancy) AS exp_q75, "
            "         percentile_cont(0.25) WITHIN GROUP (ORDER BY window_expectancy_r) AS r_q25, "
            "         percentile_cont(0.50) WITHIN GROUP (ORDER BY window_expectancy_r) AS r_q50, "
            "         percentile_cont(0.75) WITHIN GROUP (ORDER BY window_expectancy_r) AS r_q75, "
            "         sum(trades) AS total_trades "
            "  FROM per_window GROUP BY config_name"
            ") "
            "SELECT c.config_name, c.windows, c.windows_positive, "
            "       c.pnl_q25, c.pnl_q50, c.pnl_q75, "
            "       c.exp_q25, c.exp_q50, c.exp_q75, "
            "       c.r_q25, c.r_q50, c.r_q75, "
            "       c.total_trades, t.win_rate, "
            "       t.gross_win / nullif(t.gross_loss, 0) AS profit_factor, "
            "       t.account_value, gate.g, gate.sid "
            "FROM per_config c "
            "LEFT JOIN per_config_trades t ON t.config_name = c.config_name "
            "LEFT JOIN LATERAL ("
            "  SELECT s2.result->'pooled_gate' AS g, s2.id::text AS sid "
            "  FROM public.validation_studies s2 "
            "  WHERE s2.user_id = %s AND s2.params->>'config_name' = c.config_name "
            "    AND s2.result ? 'pooled_gate' "
            "  ORDER BY s2.result->'pooled_gate'->>'computed_at' DESC NULLS LAST "
            "  LIMIT 1"
            ") gate ON true "
            "ORDER BY c.config_name"
        )
        try:
            from intraday_trade_spy.storage.db_pool import get_pool

            with get_pool().connection() as conn, conn.cursor() as cur:
                cur.execute(sql, [self.user_id, self.user_id, self.user_id])
                rows = cur.fetchall()
        except CloudPushError:
            raise
        except Exception as exc:
            raise CloudPushError(f"insights_config_distribution failed: {exc}") from exc

        def _gate_fields(g: dict | None, sid) -> dict:
            ci = (g or {}).get("expectancy_dollars_ci") or {}
            return {
                "gate_passed": (g or {}).get("passed"),
                "gate_ci_low": ci.get("low"),
                "gate_ci_high": ci.get("high"),
                "gate_computed_at": (g or {}).get("computed_at"),
                "gate_study_id": str(sid) if sid is not None else None,
            }

        out = [
            {
                "config_name": r[0],
                "windows": int(r[1] or 0),
                "windows_positive": int(r[2] or 0),
                "pnl_q25": float(r[3]) if r[3] is not None else None,
                "pnl_q50": float(r[4]) if r[4] is not None else None,
                "pnl_q75": float(r[5]) if r[5] is not None else None,
                "expectancy_q25": float(r[6]) if r[6] is not None else None,
                "expectancy_q50": float(r[7]) if r[7] is not None else None,
                "expectancy_q75": float(r[8]) if r[8] is not None else None,
                "r_q25": float(r[9]) if r[9] is not None else None,
                "r_q50": float(r[10]) if r[10] is not None else None,
                "r_q75": float(r[11]) if r[11] is not None else None,
                "total_trades": int(r[12] or 0),
                "win_rate": float(r[13]) if r[13] is not None else None,
                "profit_factor": float(r[14]) if r[14] is not None else None,
                "account_value": float(r[15]) if r[15] is not None else None,
                **_gate_fields(r[16], r[17]),
            }
            for r in rows
        ]
        return {
            "rows": out,
            "snapshot_fingerprint": self._insights_fingerprint([list(map(str, r)) for r in rows]),
        }

    # ---------- Feature 016: Claude analyses + settings (PostgREST) ----------

    def insert_insight_analysis(
        self, *, user_id=None, scope: str, scope_id: str | None,
        payload_hash: str, model: str, analysis: dict,
    ) -> dict | None:
        """Store one immutable advisory analysis row."""
        try:
            response = (
                self._client.table("insight_analyses")
                .insert({
                    "user_id": str(user_id or self.user_id),
                    "scope": scope,
                    "scope_id": scope_id,
                    "payload_hash": payload_hash,
                    "model": model,
                    "analysis": analysis,
                })
                .execute()
            )
            return response.data[0] if response.data else None
        except Exception as exc:
            raise CloudPushError(f"insert_insight_analysis failed: {exc}") from exc

    def get_latest_insight_analysis(
        self, *, user_id=None, scope: str, scope_id=None
    ) -> dict | None:
        """Newest stored analysis for a scope (None if never generated)."""
        try:
            q = (
                self._client.table("insight_analyses")
                .select("*")
                .eq("user_id", str(user_id or self.user_id))
                .eq("scope", scope)
            )
            q = q.eq("scope_id", str(scope_id)) if scope_id is not None else q.is_("scope_id", "null")
            response = q.order("created_at", desc=True).limit(1).execute()
            return response.data[0] if response.data else None
        except Exception as exc:
            raise CloudPushError(f"get_latest_insight_analysis failed: {exc}") from exc

    def get_insight_settings(self, *, user_id=None) -> dict:
        """The analysis feature's switch; lazily upserts the enabled default."""
        uid = str(user_id or self.user_id)
        try:
            response = (
                self._client.table("insight_settings").select("*").eq("user_id", uid).execute()
            )
            if response.data:
                return response.data[0]
            inserted = (
                self._client.table("insight_settings")
                .upsert({"user_id": uid, "claude_enabled": True, "disabled_reason": None})
                .execute()
            )
            return inserted.data[0] if inserted.data else {"claude_enabled": True, "disabled_reason": None}
        except Exception as exc:
            raise CloudPushError(f"get_insight_settings failed: {exc}") from exc

    def update_insight_settings(
        self, *, user_id=None, claude_enabled: bool, disabled_reason: str | None
    ) -> None:
        """Flip the switch (manual toggle, or the billing auto-pause)."""
        uid = str(user_id or self.user_id)
        try:
            (
                self._client.table("insight_settings")
                .upsert({
                    "user_id": uid,
                    "claude_enabled": claude_enabled,
                    "disabled_reason": disabled_reason,
                })
                .execute()
            )
        except Exception as exc:
            raise CloudPushError(f"update_insight_settings failed: {exc}") from exc
