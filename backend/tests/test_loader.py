import pytest

from intraday_trade_spy.config import MarketConfig
from intraday_trade_spy.data.bars import BarIterator
from intraday_trade_spy.data.fingerprint import fingerprint_csv
from intraday_trade_spy.data.loader import load_bars


def _market():
    return MarketConfig(
        symbol="SPY",
        session_start="09:30:00",
        session_end="16:00:00",
        no_new_trades_after="15:30:00",
        force_flat_time="15:55:00",
    )


def test_load_normalizes_to_et_and_filters_session(sample_csv_path):
    df = load_bars(sample_csv_path, market=_market())
    assert len(df) == 234
    assert str(df["timestamp"].dt.tz) == "America/New_York"
    assert df["symbol"].unique().tolist() == ["SPY"]


def test_load_rejects_non_spy(tmp_path):
    bad = tmp_path / "qqq.csv"
    bad.write_text(
        "symbol,timestamp,open,high,low,close,volume\n"
        "QQQ,2026-05-28T09:30:00-04:00,1,1,1,1,1\n"
    )
    with pytest.raises(ValueError, match="SPY"):
        load_bars(bad, market=_market())


def test_bar_iterator_yields_typed_bars(sample_csv_path):
    df = load_bars(sample_csv_path, market=_market())
    bars = list(BarIterator(df))
    assert len(bars) == 234
    assert all(b.symbol == "SPY" for b in bars)
    assert all(bars[i].timestamp < bars[i + 1].timestamp for i in range(len(bars) - 1))


def test_fingerprint_stable(sample_csv_path):
    fp1 = fingerprint_csv(sample_csv_path)
    fp2 = fingerprint_csv(sample_csv_path)
    assert fp1 == fp2
    assert len(fp1.sha256) == 64
    assert fp1.bar_count == 234
    assert fp1.session_count == 3
