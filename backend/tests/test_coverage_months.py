"""T010/T018 — pure month-stats derivation for the cache heatmap (Feature 013).

`month_stats` turns the raw per-month aggregate + an injected expected-sessions
provider into the heatmap rows. Pure logic, fake providers — no DB, no
calendar dependency (same injection style as `regime_coverage`). The
holiday-vs-gap distinction (FR-007) and the missing_dates⇔partial invariant
live here.
"""

from __future__ import annotations

from datetime import date

from intraday_trade_spy.api.coverage import month_stats

# Fake NYSE: weekdays are sessions, except a fixed "holiday" — 2026-01-01.
HOLIDAY = date(2026, 1, 1)


def fake_expected(start: date, end: date) -> list[date]:
    from datetime import timedelta

    out = []
    d = start
    while d <= end:
        if d.weekday() < 5 and d != HOLIDAY:
            out.append(d)
        d += timedelta(days=1)
    return out


def _raw(month: str, dates: list[date], bars_per_session: int = 78, sources=("alpaca",)):
    return {
        month: {
            "bars": bars_per_session * len(dates),
            "session_dates": [d.isoformat() for d in dates],
            "sources": list(sources),
        }
    }


def _run(months_raw, earliest, latest, today):
    return month_stats(
        months_raw=months_raw,
        earliest=earliest,
        latest=latest,
        expected_dates_provider=fake_expected,
        today=today,
    )


def test_complete_month_has_no_missing_dates():
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    rows = _run(_raw("2026-01", jan), jan[0], jan[-1], today=date(2026, 2, 15))
    row = next(r for r in rows if r["month"] == "2026-01")
    assert row["state"] == "complete"
    assert row["missing_dates"] == []
    assert row["sessions_present"] == row["sessions_expected"] == len(jan)


def test_removed_session_is_listed_as_missing_and_month_is_partial():
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    gap = jan[5]
    present = [d for d in jan if d != gap]
    rows = _run(_raw("2026-01", present), present[0], present[-1], today=date(2026, 2, 15))
    row = next(r for r in rows if r["month"] == "2026-01")
    assert row["state"] == "partial"
    assert row["missing_dates"] == [gap.isoformat()]


def test_market_holiday_is_never_listed_as_missing():
    # 2026-01-01 is a weekday holiday in the fake calendar: absent from the
    # cache AND absent from expected — it must not appear as a gap (FR-007).
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    assert HOLIDAY not in jan  # sanity: provider excludes it
    rows = _run(_raw("2026-01", jan), jan[0], jan[-1], today=date(2026, 2, 15))
    row = next(r for r in rows if r["month"] == "2026-01")
    assert HOLIDAY.isoformat() not in row["missing_dates"]
    assert row["state"] == "complete"


def test_zero_bar_month_inside_span_is_partial_with_all_sessions_missing():
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    mar = fake_expected(date(2026, 3, 1), date(2026, 3, 31))
    raw = {**_raw("2026-01", jan), **_raw("2026-03", mar)}  # no February at all
    rows = _run(raw, jan[0], mar[-1], today=date(2026, 4, 15))
    feb = next(r for r in rows if r["month"] == "2026-02")
    feb_expected = fake_expected(date(2026, 2, 1), date(2026, 2, 28))
    assert feb["state"] == "partial"
    assert feb["missing_dates"] == [d.isoformat() for d in feb_expected]
    assert feb["sessions_present"] == 0 and feb["bars"] == 0


def test_months_after_latest_are_future_and_never_missing():
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    rows = _run(_raw("2026-01", jan), jan[0], jan[-1], today=date(2026, 4, 15))
    feb = next(r for r in rows if r["month"] == "2026-02")
    mar = next(r for r in rows if r["month"] == "2026-03")
    assert feb["state"] == "future" and mar["state"] == "future"
    assert feb["missing_dates"] == [] and mar["missing_dates"] == []


def test_current_month_is_judged_only_to_today_and_marked_current():
    today = date(2026, 1, 9)  # Friday in week 2
    elapsed = fake_expected(date(2026, 1, 1), today)
    rows = _run(_raw("2026-01", elapsed), elapsed[0], elapsed[-1], today=today)
    row = next(r for r in rows if r["month"] == "2026-01")
    assert row["state"] == "current"
    assert row["sessions_expected"] == len(elapsed)  # not the full month
    assert row["missing_dates"] == []  # in-progress months don't accuse


def test_months_ascend_from_earliest_to_current_month_inclusive():
    nov = fake_expected(date(2025, 11, 1), date(2025, 11, 30))
    rows = _run(_raw("2025-11", nov), nov[0], nov[-1], today=date(2026, 1, 9))
    assert [r["month"] for r in rows] == ["2025-11", "2025-12", "2026-01"]


def test_empty_cache_yields_no_rows():
    assert _run({}, None, None, today=date(2026, 1, 9)) == []


def test_invariant_missing_dates_nonempty_iff_partial():
    jan = fake_expected(date(2026, 1, 1), date(2026, 1, 31))
    present = jan[:-2]  # two gaps at the end of the month
    raw = {**_raw("2026-01", present)}
    rows = _run(raw, jan[0], jan[-1], today=date(2026, 3, 15))
    for r in rows:
        assert (len(r["missing_dates"]) > 0) == (r["state"] == "partial"), r


def test_real_calendar_expected_session_dates_excludes_new_years_day():
    # The thin real-calendar provider (used by the endpoint) must exclude
    # actual NYSE holidays — 2026-01-01 — while including normal weekdays.
    from intraday_trade_spy.data.market_calendar import expected_session_dates

    days = expected_session_dates(date(2026, 1, 1), date(2026, 1, 9))
    assert date(2026, 1, 1) not in days
    assert date(2026, 1, 2) in days
