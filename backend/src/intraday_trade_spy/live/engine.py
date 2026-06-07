"""Feature 021 (research.md R3/R4) — the live paper-trading engine.

The same contract a backtest runs — strategy suggests → risk approves →
broker executes → journal logs everything — driven by live bars instead of
a CSV. Entries are bracket orders (protection rests broker-side); exits
arrive as fill events. Sizing uses the CONFIG account_value (spec
Clarification #2) so the forward record stays comparable to the archive.

This module is deliberately synchronous and event-driven (on_five_minute_bar
/ on_order_update / on_tick) so the whole decision surface tests offline;
the asyncio wiring that pumps real streams into it lives in the API layer.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.config import Config
from intraday_trade_spy.live.journal import LiveJournal
from intraday_trade_spy.live.session_state import SessionState
from intraday_trade_spy.models import (
    Bar,
    IndicatorSnapshot,
    Position,
    Signal,
    TradePlan,
    WindowSkip,
)
from intraday_trade_spy.risk.manager import RiskManager
from intraday_trade_spy.risk.state import RiskState
from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong

ET = ZoneInfo("America/New_York")

_EXIT_REASON = {"take_profit": "target", "stop_loss": "stop"}


class LiveSessionEngine:
    def __init__(self, *, cfg: Config, session_id: str, storage: Any,
                 broker: Any, clock: MarketClock | None = None) -> None:
        self.cfg = cfg
        self.session_id = session_id
        self.storage = storage
        self.broker = broker
        self.clock = clock or MarketClock(
            session_start=time.fromisoformat(cfg.market.session_start),
            session_end=time.fromisoformat(cfg.market.session_end),
            no_new_trades_after=time.fromisoformat(cfg.market.no_new_trades_after),
            force_flat_time=time.fromisoformat(cfg.market.force_flat_time),
        )
        self.strategy = VwapPullbackLong(cfg.strategy.vwap_pullback)
        self.risk = RiskManager(cfg, self.clock)
        self.journal = LiveJournal(storage, session_id=session_id)
        self.session_state = SessionState(
            or_minutes=cfg.strategy.opening_range.minutes
        )
        self.state: RiskState | None = None
        self._stop_requested = False
        self._entries_paused = False
        self._pause_reason: str | None = None
        self._force_flatted_day: date | None = None
        self._last_data_at: datetime | None = None
        self._entry: dict | None = None       # submitted/partial entry context
        self._close_reason = "force_flat"     # reason for the next close fill
        self._order_seq = 0

    # ---- lifecycle ---------------------------------------------------------------

    def request_stop(self, *, reason: str) -> None:
        """FR-006: block new entries immediately; exits keep managing
        broker-side. The router owns the session row flip + journal."""
        self._stop_requested = True
        self._stop_reason = reason

    # ---- bar flow ------------------------------------------------------------------

    def on_five_minute_bar(self, bar: Bar) -> None:
        self._last_data_at = bar.timestamp
        self._roll_day(bar)
        snap = self.session_state.append(bar)

        if self._entries_paused:
            if self._pause_reason == "reconcile_mismatch":
                # Drift never auto-resumes — the operator must acknowledge
                # (FR-016). Data keeps flowing; entries stay blocked.
                return
            # A stale-data pause ends with fresh data, but the resuming bar
            # itself never trades — its session frame may be missing bars.
            self._set_pause(False, None, timestamp=bar.timestamp,
                            trading_day=bar.session_date)
            return
        if self._stop_requested or self._entry is not None:
            return
        self._evaluate(bar, snap)

    def _roll_day(self, bar: Bar) -> None:
        if self.state is None:
            self.state = RiskState(
                session_date=bar.session_date,
                account_value=self.cfg.risk.account_value,
            )
        elif bar.session_date != self.state.session_date:
            self.state.roll_to_session(bar.session_date)
            self._force_flatted_day = None
            self.journal.lifecycle(
                "day_rolled", timestamp=bar.timestamp,
                trading_day=bar.session_date,
            )

    def _evaluate(self, bar: Bar, snap: IndicatorSnapshot) -> None:
        minutes = self.clock.minutes_since_open(bar.timestamp)
        out = self.strategy.evaluate(bar, snap, minutes)
        if out is None:
            return
        common = {
            "vwap": snap.vwap, "or_high": snap.or_high, "or_low": snap.or_low,
            "distance_from_vwap_pct": snap.distance_from_vwap_pct,
            "prior_bar_close": snap.prior_bar_close,
        }
        if isinstance(out, WindowSkip):
            self.journal.signal(
                "skipped_window", timestamp=bar.timestamp,
                trading_day=bar.session_date, reason=out.reason, **common,
            )
            return
        sig: Signal = out
        self.journal.signal(
            "emitted", timestamp=sig.timestamp, trading_day=bar.session_date,
            setup=sig.setup, direction=sig.direction.value,
            planned_entry=sig.planned_entry, stop_loss=sig.stop_loss,
            take_profit=sig.take_profit, reason=sig.reason, **common,
        )
        decision = self.risk.validate(sig, self.state)
        if not decision.approved:
            self.journal.signal(
                "rejected", timestamp=sig.timestamp,
                trading_day=bar.session_date,
                planned_entry=sig.planned_entry, stop_loss=sig.stop_loss,
                take_profit=sig.take_profit,
                reason=decision.reason, rejection_check=decision.reason,
                **common,
            )
            return
        self.journal.signal(
            "approved", timestamp=sig.timestamp, trading_day=bar.session_date,
            planned_entry=sig.planned_entry, stop_loss=sig.stop_loss,
            take_profit=sig.take_profit, quantity=decision.quantity,
            planned_risk_dollars=decision.planned_risk_dollars, **common,
        )
        self._submit_entry(sig, decision.quantity,
                           decision.planned_risk_dollars, bar)

    def _submit_entry(self, sig: Signal, qty: int, risk_dollars: float,
                      bar: Bar) -> None:
        from intraday_trade_spy.live.alpaca_broker import BrokerRejection

        self._order_seq += 1
        client_order_id = f"its-{self.session_id[:8]}-{self._order_seq}"
        try:
            order = self.broker.submit_bracket(
                qty=qty, stop_loss=sig.stop_loss,
                take_profit=sig.take_profit, client_order_id=client_order_id,
            )
        except BrokerRejection as exc:
            self.journal.lifecycle(
                "broker_reject", timestamp=sig.timestamp,
                trading_day=bar.session_date, reason=str(exc),
            )
            return
        self.storage.insert_paper_order(
            session_id=self.session_id, broker_order_id=order["broker_order_id"],
            client_order_id=client_order_id, leg="entry", origin="strategy",
            side="buy", qty=qty, limit_price=None, stop_price=None,
            status=order["status"], raw=order,
        )
        for leg in order.get("legs", []):
            leg_name = "take_profit" if leg["type"] == "limit" else "stop_loss"
            self.storage.insert_paper_order(
                session_id=self.session_id,
                broker_order_id=leg["broker_order_id"],
                client_order_id=client_order_id, leg=leg_name,
                origin="strategy", side="sell", qty=qty,
                limit_price=sig.take_profit if leg_name == "take_profit" else None,
                stop_price=sig.stop_loss if leg_name == "stop_loss" else None,
                status=leg["status"], raw=leg,
            )
        leg_map = {order["broker_order_id"]: "entry"}
        for leg in order.get("legs", []):
            leg_map[leg["broker_order_id"]] = (
                "take_profit" if leg["type"] == "limit" else "stop_loss"
            )
        self._entry = {
            "signal": sig, "qty": qty, "risk_dollars": risk_dollars,
            "origin": "strategy",
            "entry_order_id": order["broker_order_id"],
            "entry_price": None, "entry_time": None, "filled_qty": 0,
            "leg_map": leg_map,
        }
        self.state.trades_taken_today += 1

    # ---- order updates ---------------------------------------------------------------

    def on_order_update(self, update: dict) -> None:
        self.storage.update_paper_order(
            broker_order_id=update["broker_order_id"],
            status=update["status"],
            filled_qty=int(update.get("filled_qty") or 0),
            filled_avg_price=update.get("filled_avg_price"),
            raw={k: str(v) for k, v in update.items()},
        )
        leg = update.get("leg") or self._resolve_leg(update["broker_order_id"])
        if leg and "leg" not in update:
            update = {**update, "leg": leg}
        status = update.get("status")
        if leg == "entry" and status in ("filled", "partially_filled"):
            self._on_entry_fill(update)
        elif leg in ("take_profit", "stop_loss", "close") and status == "filled":
            self._on_exit_fill(update)

    def _on_entry_fill(self, update: dict) -> None:
        if self._entry is None:
            return
        sig: Signal = self._entry["signal"]
        ts = update["timestamp"]
        self._entry.update(
            entry_price=float(update["filled_avg_price"]),
            entry_time=ts,
            filled_qty=int(update["filled_qty"]),
        )
        self.state.open_position = Position(
            plan=TradePlan(signal=sig, quantity=self._entry["qty"],
                           planned_risk_dollars=self._entry["risk_dollars"]),
            entry_timestamp=ts,
            entry_price=self._entry["entry_price"],
        )
        if update["status"] == "filled":
            self.journal.signal(
                "executed", timestamp=ts, trading_day=self._day(ts),
                actual_entry=self._entry["entry_price"],
                quantity=self._entry["filled_qty"],
                stop_loss=sig.stop_loss, take_profit=sig.take_profit,
                reason="entry filled",
            )

    def _on_exit_fill(self, update: dict) -> None:
        if self._entry is None or self._entry["entry_price"] is None:
            return
        sig: Signal = self._entry["signal"]
        ts = update["timestamp"]
        exit_price = float(update["filled_avg_price"])
        entry_price = self._entry["entry_price"]
        qty = self._entry["filled_qty"] or self._entry["qty"]
        reason = _EXIT_REASON.get(update["leg"], self._close_reason)
        risk_per_share = entry_price - sig.stop_loss
        realized_r = ((exit_price - entry_price) / risk_per_share
                      if risk_per_share > 0 else 0.0)
        gross = (exit_price - entry_price) * qty
        self.storage.insert_paper_trade(
            session_id=self.session_id, trading_day=self._day(ts),
            origin=self._entry["origin"], qty=qty,
            entry_time=self._entry["entry_time"], exit_time=ts,
            entry_price=entry_price, exit_price=exit_price,
            stop_loss=sig.stop_loss, take_profit=sig.take_profit,
            exit_reason=reason, gross_pnl=gross, realized_r=realized_r,
        )
        self.journal.signal(
            "force_flat" if reason == "force_flat" else "exited",
            timestamp=ts, trading_day=self._day(ts),
            actual_entry=entry_price, actual_exit=exit_price,
            exit_reason=reason if reason in ("stop", "target", "force_flat") else None,
            realized_pnl=gross, realized_r=realized_r, quantity=qty,
            reason=f"exit via {reason}",
        )
        self._apply_exit_to_state(gross, ts)
        self._entry = None
        self._close_reason = "force_flat"
        if self.state:
            self.state.open_position = None

    def _apply_exit_to_state(self, realized_pnl: float, ts: datetime) -> None:
        """Mirror of the backtest engine's exit application — same daily
        loss, cooldown, consecutive-loss, and lockout semantics."""
        state = self.state
        state.daily_realized_pnl += realized_pnl
        if realized_pnl < 0:
            state.consecutive_losses += 1
            state.cooldown_until = ts + timedelta(
                minutes=self.cfg.risk.cooldown_after_loss_minutes
            )
        else:
            state.consecutive_losses = 0
        max_loss = -state.account_value * self.cfg.risk.max_daily_loss_pct / 100
        if state.daily_realized_pnl <= max_loss and not state.daily_lockout_active:
            state.daily_lockout_active = True
            self.journal.signal(
                "lockout", timestamp=ts, trading_day=self._day(ts),
                reason="daily loss limit reached",
            )

    # ---- clock ticks -----------------------------------------------------------------

    def on_tick(self, now: datetime) -> None:
        self._check_stale(now)
        self._check_force_flat(now)

    def _check_stale(self, now: datetime) -> None:
        if (self._entries_paused or self._stop_requested
                or self._last_data_at is None
                or not self.clock.is_market_open(now)):
            return
        gap = (now - self._last_data_at).total_seconds()
        if gap > self.cfg.paper.stale_data_seconds:
            self._set_pause(True, "stale_data", timestamp=now,
                            trading_day=self._day(now), gap_seconds=int(gap))

    def _check_force_flat(self, now: datetime) -> None:
        from intraday_trade_spy.live.alpaca_broker import BrokerRejection

        if not self.clock.is_force_flat(now):
            return
        today = self._day(now)
        if self._force_flatted_day == today or self._entry is None:
            return
        self._force_flatted_day = today
        self._close_reason = "force_flat"
        try:
            self.broker.flatten()
        except BrokerRejection as exc:
            self.journal.lifecycle(
                "broker_reject", timestamp=now, trading_day=today,
                reason=f"force-flat failed: {exc}",
            )

    def _set_pause(self, paused: bool, reason: str | None, *,
                   timestamp: datetime, trading_day: date,
                   kind: str | None = None, **ctx: Any) -> None:
        self._entries_paused = paused
        self._pause_reason = reason
        self.storage.set_paper_session_pause(
            session_id=self.session_id, paused=paused, reason=reason,
        )
        self.journal.lifecycle(
            kind or ("safety_pause" if paused else "safety_resume"),
            timestamp=timestamp, trading_day=trading_day,
            reason=reason, **ctx,
        )

    # ---- reconcile (FR-016: broker is truth) -------------------------------------

    def reconcile(self, now: datetime) -> None:
        """Compare the engine's position belief against the broker. Drift
        pauses new entries until the operator acknowledges — never silently
        'fixed'."""
        if self._entries_paused and self._pause_reason == "reconcile_mismatch":
            return
        broker_pos = self.broker.get_position()
        engine_open = self._entry is not None and self._entry["entry_price"] is not None
        broker_open = broker_pos is not None
        if engine_open == broker_open:
            return
        self._set_pause(
            True, "reconcile_mismatch", timestamp=now,
            trading_day=self._day(now), kind="reconcile_mismatch",
            engine_open=engine_open,
            broker_qty=(broker_pos or {}).get("qty"),
        )

    def acknowledge_reconcile(self, now: datetime) -> None:
        if not (self._entries_paused and self._pause_reason == "reconcile_mismatch"):
            return
        self._set_pause(False, None, timestamp=now,
                        trading_day=self._day(now), kind="reconcile_ack")

    def _resolve_leg(self, broker_order_id: str) -> str | None:
        if self._entry is None:
            return None
        mapped = self._entry.get("leg_map", {}).get(broker_order_id)
        if mapped:
            return mapped
        # a flatten/manual close is the only other order we ever place while
        # an entry context exists
        return "close"

    @staticmethod
    def _day(ts: datetime) -> date:
        return ts.astimezone(ET).date()
