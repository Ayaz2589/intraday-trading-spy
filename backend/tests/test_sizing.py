from intraday_trade_spy.risk.sizing import position_size


def test_position_size_basic():
    assert position_size(account=1000, risk_pct=1.0, entry=500.0, stop=499.0) == 10


def test_position_size_zero_when_stop_at_entry():
    assert position_size(account=1000, risk_pct=1.0, entry=500.0, stop=500.0) == 0


def test_position_size_zero_when_stop_above_entry():
    assert position_size(account=1000, risk_pct=1.0, entry=500.0, stop=501.0) == 0


def test_position_size_floors():
    # max_risk = 10, risk_per_share = 1.5 → 10 / 1.5 = 6.67 → 6
    assert position_size(account=1000, risk_pct=1.0, entry=100.0, stop=98.5) == 6
