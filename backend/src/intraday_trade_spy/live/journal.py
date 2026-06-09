"""Feature 021 (constitution VII) — the live journal writer.

One sink for every live trade-lifecycle event, mirroring journal/logger.py's
role in backtests: signal events reuse the backtest taxonomy (SignalStatus)
so the forward record reads in the same vocabulary; lifecycle events cover
the live loop itself. Rows are append-only (paper_events, per-session seq
assigned in SQL)."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from intraday_trade_spy.models import SignalStatus

SIGNAL_KINDS = frozenset(s.value for s in SignalStatus)

LIFECYCLE_KINDS = frozenset({
    "session_started", "session_stopped", "session_interrupted", "armed",
    "day_rolled", "data_gap", "safety_pause", "safety_resume",
    "reconcile_mismatch", "reconcile_ack", "broker_reject",
    # Feature 023 — pre-open warmup: data flowing before the open (dropped,
    # never traded) and the at-start warmup-backfill outcome.
    "pre_open", "warmup",
})


class LiveJournal:
    def __init__(self, storage: Any, *, session_id: str) -> None:
        self._storage = storage
        self._session_id = session_id

    def _append(self, kind: str, timestamp: datetime, trading_day: date,
                fields: dict) -> int:
        payload = {k: v for k, v in fields.items() if v is not None}
        return self._storage.append_paper_event(
            session_id=self._session_id,
            trading_day=trading_day,
            timestamp=timestamp,
            kind=kind,
            payload=payload,
        )

    def signal(self, status: str, *, timestamp: datetime, trading_day: date,
               **fields: Any) -> int:
        """A signal-taxonomy event (emitted/approved/rejected/executed/
        exited/force_flat/lockout/skipped_window) with JournalEntry-shaped
        fields in the payload."""
        if status not in SIGNAL_KINDS:
            raise ValueError(f"unknown signal status: {status!r}")
        return self._append(status, timestamp, trading_day, fields)

    def lifecycle(self, kind: str, *, timestamp: datetime, trading_day: date,
                  **context: Any) -> int:
        """A live-loop lifecycle event (session/data/safety/reconcile)."""
        if kind not in LIFECYCLE_KINDS:
            raise ValueError(f"unknown lifecycle kind: {kind!r}")
        return self._append(kind, timestamp, trading_day, context)
