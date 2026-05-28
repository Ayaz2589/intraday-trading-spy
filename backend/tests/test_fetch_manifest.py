from datetime import UTC, date, datetime

from intraday_trade_spy.data.downloader import FetchManifest


def test_manifest_round_trip():
    m = FetchManifest(
        fetched_at=datetime(2026, 5, 28, 17, 42, 11, tzinfo=UTC),
        yfinance_version="1.4.1",
        requested_start=date(2026, 4, 1),
        requested_end=date(2026, 5, 28),
        requested_timeframe="5m",
        output_path="data/raw/x.csv",
        bar_count=8190,
        session_count=42,
        gap_session_dates=[date(2026, 4, 3), date(2026, 4, 4)],
        output_sha256="c" * 64,
        data_source="yfinance",
    )
    assert m.bar_count == 8190
    assert m.data_source == "yfinance"
    assert len(m.output_sha256) == 64
    assert m.gap_session_dates == [date(2026, 4, 3), date(2026, 4, 4)]
