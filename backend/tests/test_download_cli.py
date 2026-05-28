import subprocess
import sys

import pandas as pd


def _patch_yf(monkeypatch, n_bars: int = 78, start: str = "2026-04-01T13:30:00Z"):
    """Patch yfinance.download to return a deterministic synthetic df."""
    idx = pd.date_range(start=start, periods=n_bars, freq="5min", tz="UTC")
    df = pd.DataFrame(
        {
            "Open": 1, "High": 1, "Low": 1, "Close": 1,
            "Adj Close": 1, "Volume": [100] * n_bars,
        },
        index=idx,
    )
    df.index.name = "Datetime"
    monkeypatch.setattr("yfinance.download", lambda **kw: df)


def test_cli_end_to_end_under_mock(tmp_path, monkeypatch):
    _patch_yf(monkeypatch)
    from intraday_trade_spy.cli.download_spy_data import main

    out = tmp_path / "spy.csv"
    rc = main(["--start", "2026-04-01", "--end", "2026-04-01", "--out", str(out)])
    assert rc == 0
    assert out.exists()
    assert (out.parent / "spy.csv.fetch.yaml").exists()


def test_cli_help_does_not_list_symbol_flag():
    result = subprocess.run(
        [sys.executable, "-m", "intraday_trade_spy.cli.download_spy_data", "--help"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
    help_text = result.stdout.lower()
    assert "--symbol" not in help_text
    assert "--ticker" not in help_text
    assert "--instrument" not in help_text


def test_cli_exits_2_when_output_exists_without_force(tmp_path, monkeypatch):
    _patch_yf(monkeypatch)
    from intraday_trade_spy.cli.download_spy_data import main

    out = tmp_path / "spy.csv"
    out.write_text("pre-existing")
    rc = main(["--start", "2026-04-01", "--end", "2026-04-01", "--out", str(out)])
    assert rc == 2


def test_cli_exits_4_when_yfinance_returns_zero_rows(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "yfinance.download",
        lambda **kw: pd.DataFrame(columns=["Open", "High", "Low", "Close", "Adj Close", "Volume"]),
    )
    from intraday_trade_spy.cli.download_spy_data import main

    out = tmp_path / "spy.csv"
    rc = main(["--start", "2026-04-01", "--end", "2026-04-01", "--out", str(out)])
    assert rc == 4


def test_cli_prints_progress_for_chunked_request(tmp_path, monkeypatch, capsys):
    """T099/T100 (Phase 4 / US2): chunked requests print 'Fetching chunk i/n' lines."""
    from zoneinfo import ZoneInfo

    import pandas as pd

    ET = ZoneInfo("America/New_York")

    def _et_open(date_str: str, n_bars: int = 78) -> pd.DataFrame:
        et_open = pd.Timestamp(f"{date_str} 09:30", tz=ET)
        utc_open = et_open.tz_convert("UTC")
        idx = pd.date_range(start=utc_open, periods=n_bars, freq="5min", tz="UTC")
        df = pd.DataFrame(
            {
                "Open": 1, "High": 1, "Low": 1, "Close": 1,
                "Adj Close": 1, "Volume": [100] * n_bars,
            },
            index=idx,
        )
        df.index.name = "Datetime"
        return df

    df_a = _et_open("2026-03-15")
    df_b = _et_open("2026-05-15")
    calls = {"n": 0}

    def _mock(**kw):
        calls["n"] += 1
        return df_a if calls["n"] == 1 else df_b

    monkeypatch.setattr("yfinance.download", _mock)
    from intraday_trade_spy.cli.download_spy_data import main

    out = tmp_path / "spy.csv"
    rc = main(["--start", "2026-03-15", "--end", "2026-05-15", "--out", str(out)])
    assert rc == 0
    captured = capsys.readouterr().out.lower()
    assert "chunk 1" in captured
    assert "chunk 2" in captured


def test_cli_no_progress_suppresses_chunk_lines(tmp_path, monkeypatch, capsys):
    """T094c (M1): --no-progress suppresses the per-chunk progress + resolved-range line."""
    from zoneinfo import ZoneInfo

    import pandas as pd

    ET = ZoneInfo("America/New_York")
    et_open = pd.Timestamp("2026-04-01 09:30", tz=ET).tz_convert("UTC")
    idx = pd.date_range(start=et_open, periods=78, freq="5min", tz="UTC")
    df = pd.DataFrame(
        {
            "Open": 1, "High": 1, "Low": 1, "Close": 1,
            "Adj Close": 1, "Volume": [100] * 78,
        },
        index=idx,
    )
    df.index.name = "Datetime"
    monkeypatch.setattr("yfinance.download", lambda **kw: df)
    from intraday_trade_spy.cli.download_spy_data import main

    out = tmp_path / "spy.csv"
    rc = main(
        ["--start", "2026-04-01", "--end", "2026-04-01", "--out", str(out), "--no-progress"]
    )
    assert rc == 0
    captured = capsys.readouterr().out
    assert "Resolved range" not in captured
    assert "chunk" not in captured.lower()


def test_socket_is_blocked_by_default():
    """T106 (Phase 7 / US5): the autouse fixture in conftest.py blocks socket access."""
    import socket

    import pytest

    with pytest.raises(RuntimeError, match="network access blocked"):
        socket.socket()
