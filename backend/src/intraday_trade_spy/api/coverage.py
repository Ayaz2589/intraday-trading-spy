"""Per-regime coverage computation (Feature 009 US3) and per-month cache
stats for the completeness heatmap (Feature 013 US2/US3).

Pure logic: given providers for expected and present sessions, produce the
rows the API surfaces. Kept provider-injectable so it's testable without a DB
or a calendar dependency.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

from intraday_trade_spy.config import RegimeWindow


def regime_coverage(
    *,
    regimes: list[RegimeWindow],
    threshold_pct: float,
    present_provider: Callable,
    expected_provider: Callable,
) -> list[dict]:
    """One coverage row per regime.

    - `expected_provider(start, end)` -> int expected NYSE sessions.
    - `present_provider(start, end)` -> iterable of present session-days.
    A regime is `covered` when completeness ≥ threshold_pct (and expected > 0).
    """
    rows: list[dict] = []
    for r in regimes:
        expected = int(expected_provider(r.start, r.end))
        present = len(list(present_provider(r.start, r.end)))
        pct = round(present / expected * 100, 1) if expected > 0 else 0.0
        rows.append(
            {
                "name": r.name,
                "start": r.start,
                "end": r.end,
                "expected_sessions": expected,
                "present_sessions": present,
                "completeness_pct": pct,
                "covered": expected > 0 and pct >= threshold_pct,
            }
        )
    return rows


def _month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _month_bounds(key: str) -> tuple[date, date]:
    """First and last calendar day of a 'YYYY-MM' month."""
    year, month = int(key[:4]), int(key[5:7])
    first = date(year, month, 1)
    last = (
        date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    )
    from datetime import timedelta

    return first, last - timedelta(days=1)


def _iter_month_keys(start: date, end: date) -> list[str]:
    keys: list[str] = []
    y, m = start.year, start.month
    while (y, m) <= (end.year, end.month):
        keys.append(f"{y:04d}-{m:02d}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return keys


def month_stats(
    *,
    months_raw: dict[str, dict],
    earliest: date | None,
    latest: date | None,
    expected_dates_provider: Callable[[date, date], list[date]],
    today: date,
) -> list[dict]:
    """Heatmap rows from the earliest cached month through the current month
    (Feature 013 FR-005..FR-009; rules in specs/013 research D3).

    - `months_raw`: "YYYY-MM" -> {"bars", "session_dates" (ISO), "sources"}.
    - States: `current` (this month, judged only to `today`, never accused of
      missing days), `future` (after the latest cached month — not cached,
      never "missing"), else `complete`/`partial` with `missing_dates` =
      expected − present. The provider excludes holidays/half-days, so every
      listed missing date is a genuine gap (FR-007).
    """
    if earliest is None or latest is None:
        return []

    current_key = _month_key(today)
    latest_key = _month_key(latest)
    rows: list[dict] = []
    for key in _iter_month_keys(earliest, today):
        raw = months_raw.get(key) or {"bars": 0, "session_dates": [], "sources": []}
        present_dates = set(raw.get("session_dates") or [])
        first, last = _month_bounds(key)

        if key == current_key:
            expected = [d.isoformat() for d in expected_dates_provider(first, today)]
            rows.append(
                {
                    "month": key,
                    "state": "current",
                    "sessions_present": len(present_dates & set(expected)),
                    "sessions_expected": len(expected),
                    "bars": int(raw.get("bars") or 0),
                    "sources": list(raw.get("sources") or []),
                    "missing_dates": [],  # in-progress months don't accuse
                }
            )
        elif key > latest_key:
            rows.append(
                {
                    "month": key,
                    "state": "future",
                    "sessions_present": 0,
                    "sessions_expected": 0,
                    "bars": 0,
                    "sources": [],
                    "missing_dates": [],
                }
            )
        else:
            expected = [d.isoformat() for d in expected_dates_provider(first, last)]
            missing = sorted(set(expected) - present_dates)
            rows.append(
                {
                    "month": key,
                    "state": "complete" if not missing else "partial",
                    "sessions_present": len(present_dates & set(expected)),
                    "sessions_expected": len(expected),
                    "bars": int(raw.get("bars") or 0),
                    "sources": list(raw.get("sources") or []),
                    "missing_dates": missing,
                }
            )
    return rows
