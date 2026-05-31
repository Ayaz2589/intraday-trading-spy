"""JWKS cache tests (T011)."""

from __future__ import annotations

from unittest import mock

import pytest


def test_get_jwks_caches_within_ttl():
    from intraday_trade_spy.auth.jwks import get_jwks, _CACHE

    _CACHE.clear()
    with mock.patch("intraday_trade_spy.auth.jwks._fetch_jwks") as fetch:
        fetch.return_value = {"keys": [{"kid": "abc", "kty": "RSA"}]}
        get_jwks("https://test.supabase.co")
        get_jwks("https://test.supabase.co")
        assert fetch.call_count == 1


def test_get_jwks_refetches_after_ttl(monkeypatch):
    from intraday_trade_spy.auth import jwks
    from intraday_trade_spy.auth.jwks import get_jwks

    jwks._CACHE.clear()
    with mock.patch("intraday_trade_spy.auth.jwks._fetch_jwks") as fetch:
        fetch.return_value = {"keys": [{"kid": "k1"}]}
        get_jwks("https://test.supabase.co")
        # Force TTL expiry by mutating the cache's stored timestamp
        entry = jwks._CACHE["https://test.supabase.co"]
        jwks._CACHE["https://test.supabase.co"] = (entry[0] - jwks._TTL_SECONDS - 1, entry[1])
        get_jwks("https://test.supabase.co")
        assert fetch.call_count == 2


def test_get_jwks_returns_stale_on_network_failure_with_warning(caplog):
    from intraday_trade_spy.auth import jwks
    from intraday_trade_spy.auth.jwks import get_jwks

    jwks._CACHE.clear()
    with mock.patch("intraday_trade_spy.auth.jwks._fetch_jwks") as fetch:
        fetch.return_value = {"keys": [{"kid": "first"}]}
        first = get_jwks("https://test.supabase.co")
        # Force TTL expiry
        entry = jwks._CACHE["https://test.supabase.co"]
        jwks._CACHE["https://test.supabase.co"] = (entry[0] - jwks._TTL_SECONDS - 1, entry[1])
        # Network now fails
        fetch.side_effect = OSError("network down")
        with caplog.at_level("WARNING"):
            second = get_jwks("https://test.supabase.co")
        assert second == first  # served from stale cache
        assert any("network down" in record.message or "stale" in record.message.lower()
                   for record in caplog.records)


def test_get_jwks_raises_on_network_failure_with_no_cache():
    from intraday_trade_spy.auth import jwks
    from intraday_trade_spy.auth.jwks import JWKSFetchError, get_jwks

    jwks._CACHE.clear()
    with mock.patch("intraday_trade_spy.auth.jwks._fetch_jwks") as fetch:
        fetch.side_effect = OSError("network down")
        with pytest.raises(JWKSFetchError):
            get_jwks("https://test.supabase.co")
