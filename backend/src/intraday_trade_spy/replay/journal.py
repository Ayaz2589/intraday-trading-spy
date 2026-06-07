"""Feature 022 — in-memory replay journal.

Append-only, ephemeral. Emits events shaped EXACTLY like the live `paper_events`
row (`seq` / `trading_day` / `timestamp` / `kind` / `payload`) so the frontend
`LiveJournalTable` consumes them unchanged. Reuses the live `kind` vocabulary.
Nothing is persisted — the journal lives only for the duration of the replay."""

from __future__ import annotations

from datetime import date, datetime


class ReplayJournal:
    def __init__(self) -> None:
        self._events: list[dict] = []
        self._seq = 0

    def emit(
        self, kind: str, *, timestamp: datetime, trading_day: date, **payload
    ) -> int:
        """Append one event; return its sequence number (monotonic from 1)."""
        self._seq += 1
        self._events.append(
            {
                "seq": self._seq,
                "trading_day": trading_day.isoformat(),
                "timestamp": timestamp.isoformat(),
                "kind": kind,
                "payload": payload,
            }
        )
        return self._seq

    def events(self, since_seq: int = 0) -> list[dict]:
        """Events with seq > since_seq, in order (incremental polling cursor)."""
        return [e for e in self._events if e["seq"] > since_seq]

    @property
    def last_seq(self) -> int:
        return self._seq
