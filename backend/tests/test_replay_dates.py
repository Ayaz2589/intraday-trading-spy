"""Feature 022 (T008) — replayable-date discovery."""

from unittest import mock

from intraday_trade_spy.replay.dates import list_replayable_dates


def test_intersects_present_with_trading_days_newest_first():
    storage = mock.MagicMock()
    # 2026-05-25 is a Monday (Memorial Day holiday); 26/27/28 are trading days;
    # 2026-05-30 is a Saturday. Present set includes a holiday + a weekend that
    # must be filtered out by the XNYS calendar.
    storage.bars_present_session_dates.return_value = [
        "2026-05-25", "2026-05-26", "2026-05-27", "2026-05-28", "2026-05-30",
    ]
    out = list_replayable_dates(
        storage, range_start="2026-05-01", range_end="2026-05-31"
    )
    assert out == ["2026-05-28", "2026-05-27", "2026-05-26"]


def test_empty_when_no_present_bars():
    storage = mock.MagicMock()
    storage.bars_present_session_dates.return_value = []
    assert list_replayable_dates(
        storage, range_start="2026-05-01", range_end="2026-05-31"
    ) == []
