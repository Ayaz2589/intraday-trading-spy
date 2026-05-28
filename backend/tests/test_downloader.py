from datetime import date, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
import pytest
from pydantic import ValidationError

from intraday_trade_spy.data.downloader import (
    MAX_5M_HISTORY_DAYS,
    MAX_CHUNK_DAYS,
    RETRY_BACKOFF_SECONDS,
    RETRY_MAX_ATTEMPTS,
    Downloader,
    DownloadRequest,
    FetchResult,
    OutputExistsError,
)

ET = ZoneInfo("America/New_York")


class _Yfinance429(Exception):
    """Stand-in for a yfinance HTTP 429."""


def _today():
    return date.today()


# ---- T074: module constants ----

def test_constants_have_expected_values():
    assert MAX_CHUNK_DAYS == 60
    assert MAX_5M_HISTORY_DAYS == 730
    assert RETRY_BACKOFF_SECONDS == 5
    assert RETRY_MAX_ATTEMPTS == 2


# ---- T076: DownloadRequest ----

def test_download_request_accepts_valid():
    req = DownloadRequest(
        start=date(2026, 4, 1), end=date(2026, 5, 1), out=Path("/tmp/x.csv")
    )
    assert req.timeframe == "5m"
    assert req.force is False
    assert req.show_progress is True


def test_rejects_start_after_end():
    with pytest.raises(ValidationError):
        DownloadRequest(start=date(2026, 5, 1), end=date(2026, 4, 1), out=Path("/tmp/x.csv"))


def test_rejects_future_start():
    future = _today() + timedelta(days=1)
    with pytest.raises(ValidationError):
        DownloadRequest(start=future, end=future, out=Path("/tmp/x.csv"))


def test_rejects_range_older_than_history_limit():
    old = _today() - timedelta(days=800)
    with pytest.raises(ValidationError, match="730"):
        DownloadRequest(start=old, end=old, out=Path("/tmp/x.csv"))


def test_rejects_invalid_timeframe():
    with pytest.raises(ValidationError):
        DownloadRequest(
            start=date(2026, 4, 1),
            end=date(2026, 5, 1),
            out=Path("/tmp/x.csv"),
            timeframe="1d",
        )


# ---- T078: FetchResult ----

def test_fetch_result_holds_dataframe():
    df = pd.DataFrame({"x": [1, 2, 3]})
    r = FetchResult(
        raw_df=df,
        requested_start=date(2026, 4, 1),
        requested_end=date(2026, 4, 3),
        fetched_bar_count=3,
    )
    assert r.fetched_bar_count == 3
    assert r.was_retried is False


# ---- T084: Downloader happy path under mocked yfinance ----

def test_fetch_writes_csv_and_manifest(tmp_path, mock_yfinance_download):
    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)
    out = tmp_path / "spy.csv"
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out)
    d = Downloader(download_fn=mock_fn, data_source="mock")
    manifest = d.fetch(req)
    assert out.exists()
    assert (tmp_path / "spy.csv.fetch.yaml").exists()
    assert manifest.bar_count == 78
    assert manifest.data_source == "mock"
    content = out.read_text().splitlines()
    assert content[0] == "symbol,timestamp,open,high,low,close,volume"
    assert content[1].startswith("SPY,2026-04-01T09:30:00-04:00,")


# ---- T085b: retry on 429 ----

def test_retries_once_on_429_then_succeeds(tmp_path, monkeypatch, mock_yfinance_download):
    slept = []
    monkeypatch.setattr("intraday_trade_spy.data.downloader._time.sleep", lambda s: slept.append(s))
    good = mock_yfinance_download(start="2026-04-01", n_bars=78)
    calls = {"n": 0}

    def _flaky(**kw):
        calls["n"] += 1
        if calls["n"] == 1:
            raise _Yfinance429("429 Too Many Requests")
        return good(**kw)

    d = Downloader(download_fn=_flaky, data_source="mock")
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=tmp_path / "spy.csv")
    manifest = d.fetch(req)
    assert calls["n"] == 2
    assert slept == [RETRY_BACKOFF_SECONDS]
    assert manifest.bar_count == 78


def test_fails_fast_on_second_429(tmp_path, monkeypatch):
    monkeypatch.setattr("intraday_trade_spy.data.downloader._time.sleep", lambda s: None)

    def _always_429(**kw):
        raise _Yfinance429("429 Too Many Requests")

    d = Downloader(download_fn=_always_429, data_source="mock")
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=tmp_path / "spy.csv")
    with pytest.raises(_Yfinance429):
        d.fetch(req)


# ---- T086: normalizer renames + adds symbol ----

def test_normalize_renames_and_adds_symbol(mock_yfinance_download):
    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=10)
    raw = mock_fn(tickers="SPY", interval="5m", start="2026-04-01", end="2026-04-02")
    d = Downloader(download_fn=mock_fn, data_source="mock")
    norm = d._normalize(raw)
    assert list(norm.columns) == ["symbol", "timestamp", "open", "high", "low", "close", "volume"]
    assert (norm["symbol"] == "SPY").all()
    assert str(norm["timestamp"].dt.tz) == "America/New_York"


# ---- T087b: pre-market / after-hours filter (M3) ----

def test_normalize_filters_pre_market_and_after_hours():
    idx = pd.DatetimeIndex(
        [
            pd.Timestamp("2026-04-01 12:00:00", tz="UTC"),  # 08:00 ET — pre-market
            pd.Timestamp("2026-04-01 13:30:00", tz="UTC"),  # 09:30 ET — in-session
            pd.Timestamp("2026-04-01 20:30:00", tz="UTC"),  # 16:30 ET — after-hours
        ],
        name="Datetime",
    )
    raw = pd.DataFrame(
        {
            "Open": [1, 1, 1], "High": [1, 1, 1], "Low": [1, 1, 1],
            "Close": [1, 1, 1], "Adj Close": [1, 1, 1], "Volume": [100, 100, 100],
        },
        index=idx,
    )
    d = Downloader(download_fn=lambda **kw: raw, data_source="mock")
    norm = d._normalize(raw)
    times = norm["timestamp"].dt.time.tolist()
    assert pd.Timestamp("09:30").time() in times
    assert pd.Timestamp("08:00").time() not in times
    assert pd.Timestamp("16:30").time() not in times


# ---- T087c: intra-chunk dedupe (M2) ----

def test_normalize_dedupes_duplicate_timestamps_within_chunk():
    ts = pd.Timestamp("2026-04-01 13:30:00", tz="UTC")  # 09:30 ET
    idx = pd.DatetimeIndex([ts, ts], name="Datetime")
    raw = pd.DataFrame(
        {
            "Open": [1, 2], "High": [1, 2], "Low": [1, 2],
            "Close": [1, 2], "Adj Close": [1, 2], "Volume": [100, 200],
        },
        index=idx,
    )
    d = Downloader(download_fn=lambda **kw: raw, data_source="mock")
    norm = d._normalize(raw)
    assert len(norm) == 1
    assert norm.iloc[0]["open"] == 1  # kept the first


# ---- T088: glitch dropper ----

def test_drop_glitches_counts_and_drops():
    d = Downloader(download_fn=lambda **kw: pd.DataFrame(), data_source="mock")
    df = pd.DataFrame(
        {
            "symbol": ["SPY"] * 4,
            "timestamp": pd.date_range("2026-04-01 09:30", periods=4, freq="5min", tz=ET),
            "open": [1, 1, 1, 1], "high": [1, 1, 1, 1], "low": [1, 1, 1, 1], "close": [1, 1, 1, 1],
            "volume": [100, np.nan, 0, 200],
        }
    )
    dropped = d._drop_glitches(df)
    assert dropped == 2
    assert len(df) == 2


# ---- T090: CSV writer determinism + format ----

def test_csv_format_and_determinism(tmp_path):
    from datetime import datetime
    d = Downloader(download_fn=lambda **kw: pd.DataFrame(), data_source="mock")
    df = pd.DataFrame(
        {
            "symbol": ["SPY", "SPY"],
            "timestamp": [
                datetime(2026, 4, 1, 9, 30, tzinfo=ET),
                datetime(2026, 4, 1, 9, 35, tzinfo=ET),
            ],
            "open": [524.1234, 524.5678],
            "high": [524.5, 524.7],
            "low": [524.0, 524.4],
            "close": [524.45, 524.55],
            "volume": [100, 200],
        }
    )
    p1 = tmp_path / "a.csv"
    p2 = tmp_path / "b.csv"
    d._write_csv(df, p1)
    d._write_csv(df, p2)
    assert p1.read_bytes() == p2.read_bytes()
    first_data_line = p1.read_text().splitlines()[1]
    assert "524.1234" in first_data_line
    assert b"\r\n" not in p1.read_bytes()


# ---- T092: sha256 round-trip ----

def test_sha256_matches_file_bytes(tmp_path):
    import hashlib
    p = tmp_path / "x.txt"
    p.write_bytes(b"hello")
    d = Downloader(download_fn=lambda **kw: None, data_source="mock")
    assert d._sha256(p) == hashlib.sha256(b"hello").hexdigest()


# ---- T098: two-chunk concat ----

def test_two_chunks_concatenate_without_duplicates(tmp_path, mock_yfinance_download):
    mock_a = mock_yfinance_download(start="2026-03-01", n_bars=78)
    mock_b = mock_yfinance_download(start="2026-05-01", n_bars=78)
    calls = {"n": 0}

    def _double_mock(**kw):
        calls["n"] += 1
        return mock_a(**kw) if calls["n"] == 1 else mock_b(**kw)

    d = Downloader(download_fn=_double_mock, data_source="mock")
    out = tmp_path / "spy.csv"
    # 60 days, then 1 more day → forces 2 chunks
    req = DownloadRequest(start=date(2026, 3, 1), end=date(2026, 5, 1), out=out)
    manifest = d.fetch(req)
    assert calls["n"] == 2
    assert manifest.bar_count == 156
    lines = out.read_text().splitlines()[1:]
    timestamps = [line.split(",")[1] for line in lines]
    assert len(timestamps) == len(set(timestamps))


# ---- T103: manifest contents after a real (mocked) fetch ----

def test_manifest_contents_after_fetch(tmp_path, mock_yfinance_download):
    import hashlib

    import yaml as _yaml

    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)
    out = tmp_path / "spy.csv"
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out)
    d = Downloader(download_fn=mock_fn, data_source="mock")
    m = d.fetch(req)
    data = _yaml.safe_load((out.parent / "spy.csv.fetch.yaml").read_text())
    assert set(data.keys()) == {
        "bar_count", "data_source", "fetched_at", "gap_session_dates",
        "output_path", "output_sha256", "requested_end", "requested_start",
        "requested_timeframe", "session_count", "yfinance_version",
    }
    assert data["bar_count"] == m.bar_count
    assert data["data_source"] == "mock"
    computed = hashlib.sha256(out.read_bytes()).hexdigest()
    assert data["output_sha256"] == computed


# ---- T105: byte-identical reproducibility (CSV + manifest minus fetched_at) ----

def test_two_runs_byte_identical_csv_and_manifest(tmp_path, mock_yfinance_download):
    import yaml as _yaml

    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)
    out1 = tmp_path / "a.csv"
    out2 = tmp_path / "b.csv"
    d = Downloader(download_fn=mock_fn, data_source="mock")
    d.fetch(DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out1))
    d.fetch(DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out2))
    assert out1.read_bytes() == out2.read_bytes()
    m1 = _yaml.safe_load((tmp_path / "a.csv.fetch.yaml").read_text())
    m2 = _yaml.safe_load((tmp_path / "b.csv.fetch.yaml").read_text())
    for m in (m1, m2):
        m.pop("fetched_at")
        m.pop("output_path")  # paths differ by design (a.csv vs b.csv)
    assert m1 == m2


# ---- Internal SPY-only check (US3 / T102) ----

def test_internal_call_uses_spy(tmp_path, mock_yfinance_download):
    seen = {}
    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)

    def _capture(**kw):
        seen.update(kw)
        return mock_fn(**kw)

    d = Downloader(download_fn=_capture, data_source="mock")
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=tmp_path / "x.csv")
    d.fetch(req)
    assert seen["tickers"] == "SPY"


# ---- Output-exists guard ----

def test_raises_output_exists_without_force(tmp_path, mock_yfinance_download):
    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)
    out = tmp_path / "spy.csv"
    out.write_text("pre-existing")
    d = Downloader(download_fn=mock_fn, data_source="mock")
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out)
    with pytest.raises(OutputExistsError):
        d.fetch(req)


def test_force_overwrites_existing_output(tmp_path, mock_yfinance_download):
    mock_fn = mock_yfinance_download(start="2026-04-01", n_bars=78)
    out = tmp_path / "spy.csv"
    out.write_text("pre-existing")
    d = Downloader(download_fn=mock_fn, data_source="mock")
    req = DownloadRequest(start=date(2026, 4, 1), end=date(2026, 4, 1), out=out, force=True)
    d.fetch(req)
    assert out.read_text() != "pre-existing"
