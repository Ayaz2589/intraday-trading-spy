"""T107 (Phase 7 / US5): opt-in integration test that hits real yfinance.

Run with: pytest -m slow
Skipped by default. Requires internet.

Parametrized over 3 independent date ranges per spec SC-003.
"""
from datetime import date, timedelta
from pathlib import Path

import pytest

# Soft-import Feature 001 modules. If unavailable, the test is collected but
# skipped at runtime; the spec's H1 prerequisite is documented in tasks.md.
pytest.importorskip("intraday_trade_spy.data.loader")
pytest.importorskip("intraday_trade_spy.config")

from intraday_trade_spy.config import MarketConfig
from intraday_trade_spy.data.downloader import Downloader, DownloadRequest
from intraday_trade_spy.data.loader import load_bars

pytestmark = pytest.mark.slow


def _market():
    return MarketConfig(
        symbol="SPY",
        session_start="09:30:00",
        session_end="16:00:00",
        no_new_trades_after="15:30:00",
        force_flat_time="15:55:00",
    )


def _ranges():
    end = date.today() - timedelta(days=1)
    return [
        (end - timedelta(days=2), end),                              # last 3 days
        (end - timedelta(days=30), end - timedelta(days=27)),        # ~1 month back
        (end - timedelta(days=120), end - timedelta(days=117)),      # ~4 months back
    ]


@pytest.mark.parametrize("start,end", _ranges())
def test_real_yfinance_fetch_loads_via_feature_001(tmp_path: Path, start: date, end: date):
    out = tmp_path / f"spy_real_{start}_{end}.csv"
    d = Downloader(data_source="yfinance")
    req = DownloadRequest(start=start, end=end, out=out)
    m = d.fetch(req)
    assert m.bar_count > 0
    df = load_bars(out, market=_market())
    assert len(df) == m.bar_count
