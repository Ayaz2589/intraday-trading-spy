"""Feature 021 T045 — the constitution's required gates, consolidated.

- The paper broker's bracket exits are mutually exclusive (one fill cancels
  the other) — REQUIRED gate, constitution IV. Live, this is Alpaca's OCO
  semantics; here we prove the ENGINE never double-counts: after one
  protective leg fills, the other leg's (stale) fill event cannot produce a
  second trade.
- Non-SPY/short orders are structurally impossible (constitution I/II).
- The live-money path is unreachable with default config (constitution V).
"""

from __future__ import annotations

from zoneinfo import ZoneInfo

import pytest
from tests.live.test_engine import _bar, _engine, _walk_to_signal

ET = ZoneInfo("America/New_York")


def test_bracket_exits_are_mutually_exclusive_in_the_engine():
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    # stop leg fills...
    eng.on_order_update({"broker_order_id": "ord-1-sl", "leg": "stop_loss",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 524.50,
                         "timestamp": _bar(10, 0).timestamp})
    # ...then a stale fill event for the OTHER leg arrives anyway
    eng.on_order_update({"broker_order_id": "ord-1-tp", "leg": "take_profit",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 527.00,
                         "timestamp": _bar(10, 5).timestamp})
    assert len(storage.trades) == 1  # exactly one exit — never both


def test_bracket_request_is_long_spy_only():
    """Constitution I/II at the broker boundary: the bracket builder only
    ever produces a BUY on SPY — there is no parameter to say otherwise."""
    import inspect

    from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker

    sig = inspect.signature(AlpacaPaperBroker.submit_bracket)
    assert "symbol" not in sig.parameters
    assert "side" not in sig.parameters
    src = inspect.getsource(AlpacaPaperBroker.submit_bracket)
    assert 'symbol="SPY"' in src
    assert "OrderSide.BUY" in src


def test_live_money_path_unreachable_with_default_config():
    """Constitution V: live_auto_enabled is Literal[False] in config; the
    only trading-client construction site is paper-pinned."""
    from pathlib import Path

    from pydantic import ValidationError

    from intraday_trade_spy.config import BrokerConfig, load_config

    cfg = load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")
    assert cfg.broker.live_auto_enabled is False
    with pytest.raises(ValidationError):
        BrokerConfig(live_auto_enabled=True)

    # the single construction site hard-codes paper=True (source-verified,
    # the same style as the CLI's never-reads-service-role test)
    import inspect

    from intraday_trade_spy.live import alpaca_broker

    src = inspect.getsource(alpaca_broker)
    assert "TradingClient(key, secret, paper=True)" in src
    assert src.count("TradingClient(") <= 2  # import + the one call site


def test_engine_journals_every_outcome_kind():
    """Constitution VII smoke: a full life-cycle leaves emitted/approved/
    executed/exited rows — no silent outcomes."""
    eng, storage, broker = _engine()
    _walk_to_signal(eng)
    qty = broker.brackets[0]["qty"]
    eng.on_order_update({"broker_order_id": "ord-1", "leg": "entry",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 525.80,
                         "timestamp": _bar(9, 50).timestamp})
    eng.on_order_update({"broker_order_id": "ord-1-tp", "leg": "take_profit",
                         "status": "filled", "filled_qty": qty,
                         "filled_avg_price": 528.00,
                         "timestamp": _bar(11, 0).timestamp})
    kinds = storage.kinds()
    for expected in ("emitted", "approved", "executed", "exited"):
        assert expected in kinds, f"missing journal kind {expected}"
