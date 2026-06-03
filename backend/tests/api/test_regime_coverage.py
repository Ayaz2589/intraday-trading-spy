"""Feature 009 US3 — regime coverage computation (pure, TDD)."""

from __future__ import annotations

from datetime import date

from intraday_trade_spy.api.coverage import regime_coverage
from intraday_trade_spy.config import RegimeWindow

REGIMES = [
    RegimeWindow(name="A", start=date(2022, 1, 1), end=date(2022, 12, 31)),
    RegimeWindow(name="B", start=date(2023, 1, 1), end=date(2023, 12, 31)),
]


def test_covered_when_at_or_above_threshold():
    # A: 100/100 present → covered. B: 89/100 → not covered (threshold 90).
    expected = {("2022-01-01", "2022-12-31"): 100, ("2023-01-01", "2023-12-31"): 100}
    present = {("2022-01-01", "2022-12-31"): list(range(100)), ("2023-01-01", "2023-12-31"): list(range(89))}

    def exp(s, e):
        return expected[(s.isoformat(), e.isoformat())]

    def pres(s, e):
        return present[(s.isoformat(), e.isoformat())]

    rows = regime_coverage(
        regimes=REGIMES, threshold_pct=90, present_provider=pres, expected_provider=exp
    )
    a, b = rows
    assert a["name"] == "A" and a["completeness_pct"] == 100.0 and a["covered"] is True
    assert b["completeness_pct"] == 89.0 and b["covered"] is False


def test_boundary_exactly_threshold_is_covered():
    def exp(s, e):
        return 100

    def pres(s, e):
        return list(range(90))  # exactly 90%

    rows = regime_coverage(
        regimes=REGIMES[:1], threshold_pct=90, present_provider=pres, expected_provider=exp
    )
    assert rows[0]["covered"] is True
    assert rows[0]["completeness_pct"] == 90.0


def test_zero_expected_no_divide_by_zero():
    def exp(s, e):
        return 0

    def pres(s, e):
        return []

    rows = regime_coverage(
        regimes=REGIMES[:1], threshold_pct=90, present_provider=pres, expected_provider=exp
    )
    assert rows[0]["completeness_pct"] == 0.0
    assert rows[0]["covered"] is False
    assert rows[0]["expected_sessions"] == 0
