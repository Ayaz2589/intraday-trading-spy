"""Feature 021 T009 — Alpaca paper broker wrapper (research.md R2).

Constitution V: the trading client is paper-pinned — a non-paper endpoint
refuses to construct (the live path is unreachable). Entries are bracket
orders carrying stop + target from acceptance. All tests run against a
faked TradingClient — no network, no real alpaca client.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest import mock

import pytest

PAPER_URL = "https://paper-api.alpaca.markets"
LIVE_URL = "https://api.alpaca.markets"


class FakeTradingClient:
    def __init__(self, base_url=PAPER_URL):
        self._base_url = base_url
        self.submitted = []
        self.cancelled = False
        self.closed = False
        self._position = None
        self._orders = []
        self._account = SimpleNamespace(equity="100231.55", buying_power="400000")

    def submit_order(self, req):
        self.submitted.append(req)
        return SimpleNamespace(
            id="ord-1", status="accepted", client_order_id=req.client_order_id,
            legs=[
                SimpleNamespace(id="ord-1-tp", type="limit", status="held"),
                SimpleNamespace(id="ord-1-sl", type="stop", status="held"),
            ],
        )

    def get_open_position(self, symbol):
        if self._position is None:
            raise RuntimeError("position does not exist")
        return self._position

    def close_position(self, symbol):
        self.closed = True
        return SimpleNamespace(id="ord-close", status="accepted")

    def cancel_orders(self):
        self.cancelled = True
        return [SimpleNamespace(id="ord-1-tp"), SimpleNamespace(id="ord-1-sl")]

    def get_orders(self, filter=None):
        return self._orders

    def get_account(self):
        return self._account


def _broker(client=None):
    from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker

    return AlpacaPaperBroker(trading_client=client or FakeTradingClient())


# ---- constitution V: the live path is unreachable ------------------------------

def test_non_paper_endpoint_refuses_to_construct():
    from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker

    with pytest.raises(RuntimeError, match="paper"):
        AlpacaPaperBroker(trading_client=FakeTradingClient(base_url=LIVE_URL))


def test_internal_construction_is_paper_pinned(monkeypatch):
    """When no client is injected, TradingClient is built with paper=True."""
    from intraday_trade_spy.live import alpaca_broker as mod

    captured = {}

    class Ctor:
        def __init__(self, key, secret, paper):
            captured["paper"] = paper
            self._base_url = PAPER_URL if paper else LIVE_URL

    monkeypatch.setenv("ALPACA_API_KEY", "k")
    monkeypatch.setenv("ALPACA_SECRET_KEY", "s")
    monkeypatch.setattr(mod, "TradingClient", Ctor)
    mod.AlpacaPaperBroker()
    assert captured["paper"] is True


def test_missing_credentials_raise():
    from intraday_trade_spy.live.alpaca_broker import AlpacaPaperBroker

    with mock.patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError, match="ALPACA"):
            AlpacaPaperBroker()


# ---- bracket entries (constitution III / SC-002) --------------------------------

def test_submit_bracket_carries_stop_and_target():
    client = FakeTradingClient()
    b = _broker(client)
    out = b.submit_bracket(qty=12, stop_loss=524.20, take_profit=526.90,
                           client_order_id="its-1")
    req = client.submitted[0]
    assert req.symbol == "SPY" and int(req.qty) == 12
    assert str(req.side).lower().endswith("buy")
    assert str(req.order_class).lower().endswith("bracket")
    assert float(req.take_profit.limit_price) == 526.90
    assert float(req.stop_loss.stop_price) == 524.20
    assert out["broker_order_id"] == "ord-1"
    assert {leg["type"] for leg in out["legs"]} == {"limit", "stop"}


def test_submit_bracket_requires_both_protective_levels():
    b = _broker()
    with pytest.raises(ValueError):
        b.submit_bracket(qty=1, stop_loss=None, take_profit=526.9,
                         client_order_id="x")
    with pytest.raises(ValueError):
        b.submit_bracket(qty=1, stop_loss=524.2, take_profit=None,
                         client_order_id="x")


def test_broker_rejection_surfaces_with_reason():
    from intraday_trade_spy.live.alpaca_broker import BrokerRejection

    client = FakeTradingClient()

    def boom(req):
        raise RuntimeError("insufficient buying power")

    client.submit_order = boom
    b = _broker(client)
    with pytest.raises(BrokerRejection, match="buying power"):
        b.submit_bracket(qty=10_000_000, stop_loss=1.0, take_profit=2.0,
                         client_order_id="x")


# ---- reads + flatten -------------------------------------------------------------

def test_get_position_none_when_flat():
    assert _broker().get_position() is None


def test_get_position_normalizes_fields():
    client = FakeTradingClient()
    client._position = SimpleNamespace(
        qty="12", avg_entry_price="525.10", unrealized_pl="14.40",
    )
    pos = _broker(client).get_position()
    assert pos == {"qty": 12, "avg_entry": 525.10, "unrealized_pnl": 14.40}


def test_flatten_cancels_then_closes():
    client = FakeTradingClient()
    client._position = SimpleNamespace(qty="12", avg_entry_price="525.10",
                                       unrealized_pl="0")
    b = _broker(client)
    b.flatten()
    assert client.cancelled is True
    assert client.closed is True


def test_flatten_when_flat_only_cancels():
    client = FakeTradingClient()
    b = _broker(client)
    b.flatten()
    assert client.cancelled is True
    assert client.closed is False


def test_get_account_equity():
    assert _broker().get_account()["equity"] == 100231.55


def test_real_alpaca_enum_base_url_is_recognized_as_paper():
    """alpaca-py's TradingClient._base_url is the BaseURL.TRADING_PAPER enum
    (str() = 'BaseURL.TRADING_PAPER'), not a URL string — the guard must
    accept it (live verification 2026-06-07 caught this)."""
    from enum import Enum

    class BaseURL(Enum):
        TRADING_PAPER = "https://paper-api.alpaca.markets"
        TRADING = "https://api.alpaca.markets"

    client = FakeTradingClient(base_url=BaseURL.TRADING_PAPER)
    _broker(client)  # must construct

    with pytest.raises(RuntimeError, match="paper"):
        _broker(FakeTradingClient(base_url=BaseURL.TRADING))
