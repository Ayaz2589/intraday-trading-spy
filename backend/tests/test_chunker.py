from datetime import date, timedelta

from intraday_trade_spy.data.downloader import MAX_CHUNK_DAYS, iter_windows


def test_single_window_when_range_fits():
    windows = iter_windows(date(2026, 4, 1), date(2026, 5, 1), MAX_CHUNK_DAYS)
    assert windows == [(date(2026, 4, 1), date(2026, 5, 1))]


def test_consecutive_non_overlapping_windows():
    windows = iter_windows(date(2026, 1, 1), date(2026, 4, 1), 60)
    assert len(windows) == 2
    assert windows[0][1] < windows[1][0]
    assert windows[0][0] == date(2026, 1, 1)
    assert windows[-1][1] == date(2026, 4, 1)


def test_window_for_single_day():
    windows = iter_windows(date(2026, 4, 1), date(2026, 4, 1), 60)
    assert windows == [(date(2026, 4, 1), date(2026, 4, 1))]


def test_120_day_range_produces_two_windows():
    windows = iter_windows(date(2026, 1, 1), date(2026, 1, 1) + timedelta(days=119), 60)
    assert len(windows) == 2
    assert windows[0][1] + timedelta(days=1) == windows[1][0]
