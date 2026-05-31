"""_is_transient_error tests (T059a — covers analyze finding D2)."""

from __future__ import annotations

import pytest


def test_connection_error_is_transient():
    from intraday_trade_spy.data.downloader import _is_transient_error

    assert _is_transient_error(ConnectionError("refused")) is True


def test_os_error_is_transient():
    from intraday_trade_spy.data.downloader import _is_transient_error

    assert _is_transient_error(OSError("interrupted")) is True


def test_value_error_is_not_transient():
    from intraday_trade_spy.data.downloader import _is_transient_error

    assert _is_transient_error(ValueError("invalid date range")) is False


def test_type_error_is_not_transient():
    from intraday_trade_spy.data.downloader import _is_transient_error

    assert _is_transient_error(TypeError("bad arg")) is False


def test_no_bars_fetched_is_not_transient():
    from intraday_trade_spy.data.downloader import NoBarsFetchedError, _is_transient_error

    assert _is_transient_error(NoBarsFetchedError("empty result")) is False


def test_httpx_429_is_transient():
    import httpx

    from intraday_trade_spy.data.downloader import _is_transient_error

    response = httpx.Response(status_code=429, request=httpx.Request("GET", "https://test"))
    exc = httpx.HTTPStatusError("rate limited", request=response.request, response=response)
    assert _is_transient_error(exc) is True


def test_httpx_500_is_transient():
    import httpx

    from intraday_trade_spy.data.downloader import _is_transient_error

    response = httpx.Response(status_code=500, request=httpx.Request("GET", "https://test"))
    exc = httpx.HTTPStatusError("server error", request=response.request, response=response)
    assert _is_transient_error(exc) is True


def test_httpx_404_is_not_transient():
    import httpx

    from intraday_trade_spy.data.downloader import _is_transient_error

    response = httpx.Response(status_code=404, request=httpx.Request("GET", "https://test"))
    exc = httpx.HTTPStatusError("not found", request=response.request, response=response)
    assert _is_transient_error(exc) is False


def test_httpx_timeout_is_transient():
    import httpx

    from intraday_trade_spy.data.downloader import _is_transient_error

    assert _is_transient_error(httpx.TimeoutException("timed out")) is True


def test_generic_exception_is_not_transient():
    """Unknown exception classes → don't retry (be conservative)."""
    from intraday_trade_spy.data.downloader import _is_transient_error

    class UnknownError(Exception):
        pass

    assert _is_transient_error(UnknownError("???")) is False
