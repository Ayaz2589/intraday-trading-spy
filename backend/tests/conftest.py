import socket
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_csv_path() -> Path:
    return FIXTURES / "spy_5m_sample.csv"


@pytest.fixture
def adversarial_future_leak_csv_path() -> Path:
    return FIXTURES / "adversarial_future_leak.csv"


@pytest.fixture
def default_config_path() -> Path:
    return Path(__file__).parent.parent / "config" / "config.yaml"


@pytest.fixture(autouse=True)
def _block_network(request, monkeypatch):
    """Constitution v1.1.0 + Feature 002 SC-005: any test not marked `slow`
    MUST NOT touch the network. We patch socket.socket itself; the only
    way past this fixture is to mark a test with @pytest.mark.slow OR
    @pytest.mark.api (FastAPI TestClient uses socket.socket() for
    in-process thread sync, not for actual network calls)."""
    if request.node.get_closest_marker("slow") or request.node.get_closest_marker(
        "api"
    ):
        return

    def _blocked(*args, **kwargs):
        raise RuntimeError(
            "network access blocked in offline test (constitution v1.1.0 SC-005)"
        )

    monkeypatch.setattr(socket, "socket", _blocked)


def _synth_yf_df(start: str, n_bars: int = 78) -> pd.DataFrame:
    """Mimic yfinance.download() output for one ~6.5h session: DatetimeIndex
    in UTC, columns Open/High/Low/Close/Adj Close/Volume. Bars are aligned
    to 09:30 ET on the start date (handles EST/EDT correctly)."""
    et_open = pd.Timestamp(f"{start} 09:30", tz="America/New_York")
    utc_open = et_open.tz_convert("UTC")
    idx = pd.date_range(start=utc_open, periods=n_bars, freq="5min", tz="UTC")
    rng = np.random.default_rng(seed=42)
    base = 525.0
    closes = base + rng.normal(0, 0.1, size=n_bars).cumsum()
    df = pd.DataFrame(
        {
            "Open": closes - 0.05,
            "High": closes + 0.10,
            "Low": closes - 0.10,
            "Close": closes,
            "Adj Close": closes,
            "Volume": (1_000_000 + rng.integers(0, 500_000, size=n_bars)).astype(int),
        },
        index=idx,
    )
    df.index.name = "Datetime"
    return df


@pytest.fixture
def mock_yfinance_download():
    """Return a factory that produces a yfinance.download mock for a given
    date range. Tests use this to inject deterministic synthetic data into
    the Downloader without touching the network."""

    def _factory(start: str, end: str = None, n_bars: int = 78):
        df = _synth_yf_df(start, n_bars)

        def _mock(tickers, interval, start, end, auto_adjust=False, progress=False, **kwargs):
            return df

        return _mock

    return _factory
