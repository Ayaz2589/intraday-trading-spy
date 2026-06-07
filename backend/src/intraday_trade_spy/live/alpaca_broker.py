"""Feature 021 (research.md R2) — the Alpaca PAPER trading wrapper.

Constitution V: this module is the ONLY place a trading client is
constructed, and it is paper-pinned — `paper=True` is hard-coded and a
non-paper base URL refuses to construct. Entries are bracket orders so the
protective stop and target rest broker-side from acceptance (SC-002); a
dead backend can never leave a position unprotected.
"""

from __future__ import annotations

import os
from typing import Any

from alpaca.trading.client import TradingClient
from alpaca.trading.enums import OrderClass, OrderSide, QueryOrderStatus, TimeInForce
from alpaca.trading.requests import (
    GetOrdersRequest,
    MarketOrderRequest,
    StopLossRequest,
    TakeProfitRequest,
)


class BrokerRejection(Exception):
    """The brokerage refused an instruction; .args[0] carries its reason.
    Journaled by the caller — never swallowed (spec edge cases)."""


def _assert_paper(client: Any) -> None:
    # alpaca-py stores _base_url as the BaseURL enum (str() is
    # 'BaseURL.TRADING_PAPER'); injected fakes use plain URL strings.
    # Normalize via .value when present, then case-insensitive match.
    raw = getattr(client, "_base_url", "")
    base = str(getattr(raw, "value", raw)).lower()
    if "paper" not in base:
        raise RuntimeError(
            f"trading endpoint is not the paper API ({base or 'unknown'}) — "
            "live trading is disabled by constitution V; refusing to construct"
        )


class AlpacaPaperBroker:
    """Thin, injectable wrapper. All methods raise BrokerRejection on broker
    errors so the engine can journal them and continue."""

    def __init__(self, *, trading_client: Any | None = None) -> None:
        if trading_client is None:
            key = os.environ.get("ALPACA_API_KEY")
            secret = os.environ.get("ALPACA_SECRET_KEY")
            if not key or not secret:
                raise RuntimeError(
                    "ALPACA_API_KEY / ALPACA_SECRET_KEY not set — cannot start "
                    "paper trading"
                )
            trading_client = TradingClient(key, secret, paper=True)
        _assert_paper(trading_client)
        self._client = trading_client

    # ---- orders ---------------------------------------------------------------

    def submit_bracket(
        self, *, qty: int, stop_loss: float, take_profit: float,
        client_order_id: str,
    ) -> dict:
        """Market entry + broker-side stop & target (one bracket order).
        No stop or no target = no trade — enforced here as well as upstream."""
        if not stop_loss or not take_profit:
            raise ValueError("bracket requires BOTH stop_loss and take_profit")
        req = MarketOrderRequest(
            symbol="SPY",
            qty=qty,
            side=OrderSide.BUY,
            time_in_force=TimeInForce.DAY,
            order_class=OrderClass.BRACKET,
            take_profit=TakeProfitRequest(limit_price=round(take_profit, 2)),
            stop_loss=StopLossRequest(stop_price=round(stop_loss, 2)),
            client_order_id=client_order_id,
        )
        try:
            order = self._client.submit_order(req)
        except Exception as exc:
            raise BrokerRejection(str(exc)) from exc
        return {
            "broker_order_id": str(order.id),
            "status": str(order.status),
            "legs": [
                {"broker_order_id": str(leg.id), "type": str(leg.type),
                 "status": str(leg.status)}
                for leg in (order.legs or [])
            ],
        }

    def flatten(self) -> dict | None:
        """Force-flat: cancel everything open, then close any position.
        Returns the close order info, or None when already flat."""
        try:
            self._client.cancel_orders()
        except Exception as exc:
            raise BrokerRejection(f"cancel failed: {exc}") from exc
        if self.get_position() is None:
            return None
        try:
            order = self._client.close_position("SPY")
        except Exception as exc:
            raise BrokerRejection(f"close failed: {exc}") from exc
        return {"broker_order_id": str(order.id), "status": str(order.status)}

    # ---- reads (broker is truth — research.md R5) -------------------------------

    def get_position(self) -> dict | None:
        try:
            pos = self._client.get_open_position("SPY")
        except Exception:
            return None  # Alpaca raises when there is no position
        return {
            "qty": int(float(pos.qty)),
            "avg_entry": float(pos.avg_entry_price),
            "unrealized_pnl": float(pos.unrealized_pl),
        }

    def get_open_orders(self) -> list[dict]:
        try:
            orders = self._client.get_orders(
                filter=GetOrdersRequest(status=QueryOrderStatus.OPEN)
            )
        except Exception as exc:
            raise BrokerRejection(f"orders read failed: {exc}") from exc
        return [
            {
                "broker_order_id": str(o.id),
                "status": str(o.status),
                "side": str(getattr(o, "side", "")),
                "qty": int(float(getattr(o, "qty", 0) or 0)),
                "limit_price": _f(getattr(o, "limit_price", None)),
                "stop_price": _f(getattr(o, "stop_price", None)),
                "type": str(getattr(o, "type", "")),
            }
            for o in orders or []
        ]

    def get_account(self) -> dict:
        try:
            acct = self._client.get_account()
        except Exception as exc:
            raise BrokerRejection(f"account read failed: {exc}") from exc
        return {
            "equity": float(acct.equity),
            "buying_power": float(acct.buying_power),
        }


def _f(v: Any) -> float | None:
    return None if v is None else float(v)
