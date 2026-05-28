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
