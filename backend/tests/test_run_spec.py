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


# --- Robustness: semantically-identical configs must hash the same ---------
# These guard against the dedup bug where two "same knobs" runs slipped past
# dedup because their raw param dicts differed only in optional-field presence
# or number representation. The spec hash normalizes params through the Config
# models, so such no-op differences collapse to the same hash.


def test_optional_field_presence_does_not_change_hash():
    # `slim` omits an optional risk knob; `full` sets it to its model default.
    # After normalization (defaults filled) the two are identical.
    slim = {"risk": {"account_value": 25000}, "strategy": {}}
    full = {"risk": {"account_value": 25000, "cooldown_after_loss_minutes": 30}, "strategy": {}}
    assert _hash(params=slim) == _hash(params=full)


def test_number_representation_does_not_change_hash():
    # int vs float for the same numeric knob must not matter.
    assert _hash(params={"risk": {"account_value": 25000}}) == _hash(
        params={"risk": {"account_value": 25000.0}}
    )


def test_default_substructure_presence_does_not_change_hash():
    # `b` spells out a nested default (risk_reward=2.0); `a` omits it.
    a = {"strategy": {"opening_range": {"minutes": 15}}}
    b = {"strategy": {"opening_range": {"minutes": 15}, "vwap_pullback": {"target": {"risk_reward": 2.0}}}}
    assert _hash(params=a) == _hash(params=b)


def test_per_run_path_fields_do_not_change_hash():
    # data.csv_path / output_dir vary per run and must be excluded from the spec.
    a = {"risk": {"account_value": 25000}, "data": {"csv_path": "/runs/abc.csv", "output_dir": "/runs/abc"}}
    b = {"risk": {"account_value": 25000}, "data": {"csv_path": "/runs/xyz.csv", "output_dir": "/runs/xyz"}}
    assert _hash(params=a) == _hash(params=b)


def test_real_strategy_knob_change_still_changes_hash():
    a = {"strategy": {"vwap_pullback": {"target": {"risk_reward": 2.0}}}}
    b = {"strategy": {"vwap_pullback": {"target": {"risk_reward": 3.0}}}}
    assert _hash(params=a) != _hash(params=b)
