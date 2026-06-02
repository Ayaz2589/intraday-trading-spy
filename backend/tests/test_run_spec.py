from intraday_trade_spy.run_spec import compute_spec_hash


def _hash(**over):
    base = dict(
        strategy_id="11111111-1111-1111-1111-111111111111",
        params={"risk": {"account_value": 25000}, "strategy": {"opening_range": {"minutes": 15}}},
        symbol="SPY",
        range_start="2026-04-01",
        range_end="2026-04-05",
    )
    base.update(over)
    return compute_spec_hash(**base)


def test_identical_specs_produce_the_same_hash():
    assert _hash() == _hash()


def test_param_key_order_does_not_matter():
    a = _hash(params={"a": 1, "b": 2})
    b = _hash(params={"b": 2, "a": 1})
    assert a == b


def test_different_params_change_the_hash():
    assert _hash(params={"risk": {"account_value": 25000}}) != _hash(
        params={"risk": {"account_value": 50000}}
    )


def test_different_range_changes_the_hash():
    assert _hash(range_end="2026-04-05") != _hash(range_end="2026-04-04")
    assert _hash(range_start="2026-04-01") != _hash(range_start="2026-04-02")


def test_different_symbol_changes_the_hash():
    assert _hash(symbol="SPY") != _hash(symbol="QQQ")


def test_returns_hex_sha256():
    h = _hash()
    assert isinstance(h, str) and len(h) == 64
    int(h, 16)  # valid hex
