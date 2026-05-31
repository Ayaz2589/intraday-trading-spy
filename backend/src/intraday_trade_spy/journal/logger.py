"""In-memory journal logger.

Constitution VII: single sink for trade-lifecycle events. The cloud sink is an
OPTIONAL second destination for cloud-push lifecycle events specifically — see
log_cloud_event(). Trade-lifecycle events still flow through log() into the
local in-memory list; the cloud-side trade-lifecycle persistence happens via
the atomic push_run() RPC in storage/push.py (which writes the journal_events
table inside the same transaction).
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional
from uuid import UUID, uuid4

from intraday_trade_spy.models import JournalEntry


CloudEventKind = Literal["cloud_push_success", "cloud_push_failure"]


class JournalLogger:
    """In-memory journal + optional Supabase journal_events sink for cloud-push events."""

    def __init__(self, supabase_client: Optional["object"] = None) -> None:
        self._rows: list[JournalEntry] = []
        self._cloud_events: list[dict] = []
        self._supabase_client = supabase_client

    def log(self, **fields: Any) -> JournalEntry:
        """Existing in-memory log — unchanged behavior."""
        entry = JournalEntry(row_seq=len(self._rows), **fields)
        self._rows.append(entry)
        return entry

    def rows(self) -> list[JournalEntry]:
        return list(self._rows)

    def cloud_events(self) -> list[dict]:
        """Cloud-push lifecycle events recorded by log_cloud_event()."""
        return list(self._cloud_events)

    def log_cloud_event(
        self,
        *,
        kind: CloudEventKind,
        user_id: UUID,
        message: str,
        run_id: Optional[UUID] = None,
        details: Optional[dict] = None,
    ) -> None:
        """Record a cloud-push lifecycle event.

        Always appends to the local in-memory cloud-events list. If a
        supabase_client is configured, ALSO INSERTs one row into the cloud
        journal_events table. The insert is best-effort: a cloud-side failure
        when logging a cloud-push failure must not raise (we've already failed
        once; the local record is what matters).
        """
        event = {
            "id": str(uuid4()),
            "run_id": str(run_id) if run_id else None,
            "user_id": str(user_id),
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "kind": kind,
            "severity": "info" if kind == "cloud_push_success" else "warning",
            "message": message,
            "details": details or {},
        }
        self._cloud_events.append(event)

        if self._supabase_client is None:
            return

        try:
            self._supabase_client._client.table("journal_events").insert(event).execute()
        except Exception:
            # Best effort: a cloud failure when recording a cloud event is
            # noise; the local record is authoritative.
            pass
