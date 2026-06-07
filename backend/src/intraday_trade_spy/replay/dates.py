"""Feature 022 — replayable-date discovery (research.md R5).

A date is replayable iff it is an XNYS trading day AND we hold stored bars for
it. Reuses the data-foundation coverage primitives verbatim — no new
completeness math."""

from __future__ import annotations

from datetime import date

from intraday_trade_spy.data.market_calendar import expected_session_dates


def list_replayable_dates(
    storage, *, range_start: str, range_end: str
) -> list[str]:
    """ISO session dates (newest first) that have stored bars AND are real
    NYSE trading days within [range_start, range_end] (inclusive)."""
    present = set(
        storage.bars_present_session_dates(
            range_start=range_start, range_end=range_end
        )
    )
    expected = {
        d.isoformat()
        for d in expected_session_dates(
            date.fromisoformat(range_start), date.fromisoformat(range_end)
        )
    }
    return sorted(present & expected, reverse=True)
