"""Typed error response tests (T018)."""

from __future__ import annotations

import pytest
from fastapi import HTTPException


def test_raise_unauthorized():
    from intraday_trade_spy.api.errors import raise_unauthorized

    with pytest.raises(HTTPException) as exc_info:
        raise_unauthorized()
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail["error"] == "missing_or_invalid_token"


def test_raise_not_found():
    from intraday_trade_spy.api.errors import raise_not_found

    with pytest.raises(HTTPException) as exc_info:
        raise_not_found()
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail["error"] == "not_found"


def test_raise_config_not_found_includes_name():
    from intraday_trade_spy.api.errors import raise_config_not_found

    with pytest.raises(HTTPException) as exc_info:
        raise_config_not_found("default")
    assert exc_info.value.detail["error"] == "config_not_found"
    assert "default" in exc_info.value.detail["message"]


def test_raise_concurrent_cap_includes_metadata():
    from intraday_trade_spy.api.errors import raise_concurrent_cap

    with pytest.raises(HTTPException) as exc_info:
        raise_concurrent_cap(active=5, cap=5)
    assert exc_info.value.status_code == 429
    assert exc_info.value.detail["error"] == "concurrent_run_cap_exceeded"
    assert exc_info.value.detail["active_runs"] == 5
    assert exc_info.value.detail["cap"] == 5


def test_raise_invalid_cursor():
    from intraday_trade_spy.api.errors import raise_invalid_cursor

    with pytest.raises(HTTPException) as exc_info:
        raise_invalid_cursor()
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail["error"] == "invalid_cursor"


def test_raise_db_unreachable():
    from intraday_trade_spy.api.errors import raise_db_unreachable

    with pytest.raises(HTTPException) as exc_info:
        raise_db_unreachable()
    assert exc_info.value.status_code == 503
    assert exc_info.value.detail["error"] == "db_unreachable"
