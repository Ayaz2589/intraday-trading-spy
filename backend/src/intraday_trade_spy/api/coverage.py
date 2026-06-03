"""Per-regime coverage computation (Feature 009 US3).

Pure logic: given regimes + a threshold + providers for expected and present
session counts, produce the coverage rows the API surfaces. Kept provider-
injectable so it's testable without a DB or a calendar dependency.
"""

from __future__ import annotations

from collections.abc import Callable

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
