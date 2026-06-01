"""GET /api/bars/coverage tests."""

from __future__ import annotations

import pytest


pytestmark = pytest.mark.api


def test_bars_coverage_empty_cache(unit_client, stub_storage_client):
    stub_storage_client.bars_coverage.return_value = {"earliest": None, "latest": None}
    r = unit_client.get("/api/bars/coverage")
    assert r.status_code == 200
    body = r.json()
    assert body == {"earliest": None, "latest": None}


def test_bars_coverage_populated(unit_client, stub_storage_client):
    stub_storage_client.bars_coverage.return_value = {
        "earliest": "2026-04-01T13:30:00+00:00",
        "latest": "2026-05-28T19:55:00+00:00",
    }
    r = unit_client.get("/api/bars/coverage")
    assert r.status_code == 200
    body = r.json()
    assert body["earliest"] == "2026-04-01"
    assert body["latest"] == "2026-05-28"


def test_bars_refresh_rejects_days_back_out_of_range(unit_client):
    r = unit_client.post("/api/bars/refresh", json={"days_back": 0})
    assert r.status_code == 422  # Pydantic ge=1
    r2 = unit_client.post("/api/bars/refresh", json={"days_back": 61})
    assert r2.status_code == 422  # Pydantic le=60


def test_bars_refresh_calls_downloader(unit_client, stub_storage_client, monkeypatch, tmp_path):
    """Smoke: the route resolves and short-circuits on NoBarsFetchedError without raising."""
    from intraday_trade_spy.api.routers import bars as bars_router

    class FakeDownloader:
        def fetch(self, req):
            # Touch the path so the cleanup branch doesn't error.
            req.out.write_text("symbol,timestamp,open,high,low,close,volume\n")

    monkeypatch.setattr(bars_router, "_parse_csv", lambda p: [])
    monkeypatch.setattr(
        "intraday_trade_spy.data.downloader.Downloader",
        lambda: FakeDownloader(),
    )
    r = unit_client.post("/api/bars/refresh", json={"days_back": 5})
    assert r.status_code == 200
    assert r.json()["inserted"] == 0
