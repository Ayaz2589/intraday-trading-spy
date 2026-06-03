"""NYSE trading-session calendar (Feature 009).

Provides the "expected sessions" denominator for per-regime data-coverage
completeness. Uses the real XNYS exchange calendar (holidays, half-days count
as one session-day) rather than a naive weekday count.
"""

from __future__ import annotations

from datetime import date


def expected_session_count(
    start: date, end: date, *, today: date | None = None
) -> int:
    """Number of NYSE regular trading days in [start, end].

    A window extending past `today` counts only the elapsed portion (you can't
    have cached bars for sessions that haven't happened). Returns 0 for an
    entirely-future or empty window.
    """
    from datetime import date as _date

    today = today or _date.today()
    eff_end = min(end, today)
    if eff_end < start:
        return 0

    import pandas_market_calendars as mcal

    schedule = mcal.get_calendar("XNYS").schedule(
        start_date=start.isoformat(), end_date=eff_end.isoformat()
    )
    return int(len(schedule.index))
