"""Feature 009 US3 — NYSE expected-session calendar (TDD)."""

from __future__ import annotations

from datetime import date

from intraday_trade_spy.data.market_calendar import expected_session_count


def test_known_window_session_count():
    # 2024-01-01 (holiday) ..07: trading days are Jan 2,3,4,5 = 4 sessions.
    assert expected_session_count(date(2024, 1, 1), date(2024, 1, 7)) == 4


def test_full_year_2022():
    assert expected_session_count(date(2022, 1, 1), date(2022, 12, 31)) == 251


def test_future_window_counts_only_to_today():
    # A regime window extending past `today` counts only the elapsed portion.
    today = date(2024, 1, 7)
    n = expected_session_count(date(2024, 1, 1), date(2024, 12, 31), today=today)
    assert n == 4  # same as the Jan 1–7 window


def test_entirely_future_window_is_zero():
    today = date(2024, 1, 1)
    assert expected_session_count(date(2025, 1, 1), date(2025, 12, 31), today=today) == 0
