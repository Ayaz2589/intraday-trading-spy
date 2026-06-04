"""NYSE trading-session calendar (Feature 009).

Provides the "expected sessions" denominator for per-regime data-coverage
completeness. Uses the real XNYS exchange calendar (holidays, half-days count
as one session-day) rather than a naive weekday count.
"""

from __future__ import annotations

from datetime import date


def expected_session_dates(
    start: date, end: date, *, today: date | None = None
) -> list[date]:
    """The NYSE regular trading days in [start, end], as dates (Feature 013).

    Holidays and weekends are excluded by the real XNYS calendar; half-days
    count as one session. A window extending past `today` includes only the
    elapsed portion. Returns [] for an entirely-future or empty window.
    """
    from datetime import date as _date

    today = today or _date.today()
    eff_end = min(end, today)
    if eff_end < start:
        return []

    import pandas_market_calendars as mcal

    schedule = mcal.get_calendar("XNYS").schedule(
        start_date=start.isoformat(), end_date=eff_end.isoformat()
    )
    return [ts.date() for ts in schedule.index]


def expected_session_count(
    start: date, end: date, *, today: date | None = None
) -> int:
    """Number of NYSE regular trading days in [start, end] (Feature 009)."""
    return len(expected_session_dates(start, end, today=today))
