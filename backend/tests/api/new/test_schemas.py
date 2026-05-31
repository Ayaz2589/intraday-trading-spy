"""api/schemas.py tests (T024a — covers analyze finding D1)."""

from __future__ import annotations

from datetime import date

import pytest


def test_start_backtest_request_requires_config_name():
    from intraday_trade_spy.api.schemas import StartBacktestRequest

    with pytest.raises(ValueError):
        StartBacktestRequest()


def test_start_backtest_request_rejects_symbol():
    """Constitution I: no symbol field allowed."""
    from intraday_trade_spy.api.schemas import StartBacktestRequest

    with pytest.raises(ValueError):
        StartBacktestRequest(config_name="default", symbol="QQQ")


def test_start_backtest_request_rejects_direction():
    """Constitution II: no direction field allowed."""
    from intraday_trade_spy.api.schemas import StartBacktestRequest

    with pytest.raises(ValueError):
        StartBacktestRequest(config_name="default", direction="SHORT")


def test_start_backtest_request_rejects_live_auto_enabled():
    """Constitution V: no live_auto_enabled field allowed."""
    from intraday_trade_spy.api.schemas import StartBacktestRequest

    with pytest.raises(ValueError):
        StartBacktestRequest(config_name="default", live_auto_enabled=True)


def test_start_backtest_request_accepts_optional_data_csv_path():
    from intraday_trade_spy.api.schemas import StartBacktestRequest

    req = StartBacktestRequest(config_name="default", data_csv_path="data/raw/spy.csv")
    assert req.data_csv_path == "data/raw/spy.csv"


def test_start_data_download_request_rejects_end_before_start():
    from intraday_trade_spy.api.schemas import StartDataDownloadRequest

    with pytest.raises(ValueError):
        StartDataDownloadRequest(start_date=date(2026, 5, 10), end_date=date(2026, 5, 1))


def test_start_data_download_request_rejects_range_over_60_days():
    from intraday_trade_spy.api.schemas import StartDataDownloadRequest

    with pytest.raises(ValueError):
        StartDataDownloadRequest(start_date=date(2026, 1, 1), end_date=date(2026, 4, 1))


def test_health_response_constrained():
    from intraday_trade_spy.api.schemas import HealthResponse

    HealthResponse(status="ok", db="ok")
    HealthResponse(status="ok", db="unreachable")
    with pytest.raises(ValueError):
        HealthResponse(status="degraded", db="ok")


def test_list_responses_carry_next_cursor():
    from intraday_trade_spy.api.schemas import (
        JournalListResponse,
        RunListResponse,
        SignalListResponse,
        TradeListResponse,
    )

    # next_cursor optional and defaults to None
    for cls in [RunListResponse, TradeListResponse, SignalListResponse, JournalListResponse]:
        # Construct with empty list; default key
        key = list(cls.model_fields.keys())[0]  # 'runs' / 'trades' / 'signals' / 'events'
        instance = cls(**{key: []})
        assert instance.next_cursor is None
