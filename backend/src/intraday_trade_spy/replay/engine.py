"""Feature 022 — the replay engine (research.md R1, R6).

Drives the SAME primitives a backtest uses — `VwapPullbackLong.evaluate` →
`RiskManager.validate` → `PaperBroker` (honest-cost fills) — reproducing
`backtest/engine.py::_run_loaded`'s per-index loop body so automation-only
replay is byte-faithful to a backtest of the same date/config (SC-004). Adds
manual-order intake (filled at the next bar's open, no-look-ahead) and an
end-of-session safety flatten so early-close days never carry a position
overnight (no-overnight constitution rule).

Bars are revealed one index at a time by the runner (`step()`); the full day is
loaded up front and indicators are computed over it exactly as the backtest
does (VWAP is session-anchored, so a single-day frame is identical)."""

from __future__ import annotations

from datetime import datetime, time, timedelta

import pandas as pd

from intraday_trade_spy.broker.paper import PaperBroker
from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.config import Config, MarketConfig
from intraday_trade_spy.data.bars import BarIterator
from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
from intraday_trade_spy.models import (
    Direction,
    Position,
    Signal,
    TradePlan,
    WindowSkip,
)
from intraday_trade_spy.replay.journal import ReplayJournal
from intraday_trade_spy.risk.manager import RiskManager
from intraday_trade_spy.risk.state import RiskState
from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong


def _clock_from_cfg(market: MarketConfig) -> MarketClock:
    return MarketClock(
        session_start=time.fromisoformat(market.session_start),
        session_end=time.fromisoformat(market.session_end),
        no_new_trades_after=time.fromisoformat(market.no_new_trades_after),
        force_flat_time=time.fromisoformat(market.force_flat_time),
    )


def df_from_bar_rows(rows: list[dict], *, market: MarketConfig) -> pd.DataFrame:
    """Build a session-filtered, ET-localized, chronologically sorted bar frame
    from `storage.list_bars` dicts — the streaming twin of `data/loader.load_bars`
    (which reads a CSV). `rows` carry `bar_start` (ISO, UTC) + OHLCV."""
    if not rows:
        return pd.DataFrame(
            columns=[
                "symbol", "timestamp", "open", "high", "low", "close",
                "volume", "session_date",
            ]
        )
    df = pd.DataFrame(rows)
    df["symbol"] = "SPY"
    df["timestamp"] = pd.to_datetime(df["bar_start"], utc=True).dt.tz_convert(
        "America/New_York"
    )
    session_start = pd.to_datetime(market.session_start).time()
    session_end = pd.to_datetime(market.session_end).time()
    mask = (df["timestamp"].dt.time >= session_start) & (
        df["timestamp"].dt.time < session_end
    )
    df = df.loc[mask].copy()
    df["session_date"] = df["timestamp"].dt.date
    df = df.sort_values("timestamp", kind="mergesort").reset_index(drop=True)
    return df[
        ["symbol", "timestamp", "open", "high", "low", "close", "volume", "session_date"]
    ]


def load_session_df(storage, session_date, *, market: MarketConfig) -> pd.DataFrame:
    """Load one session's bars from storage and shape them for the engine."""
    iso = session_date.isoformat() if hasattr(session_date, "isoformat") else str(
        session_date
    )
    rows = storage.list_bars(range_start=iso, range_end=iso)
    df = df_from_bar_rows(rows, market=market)
    return df[df["session_date"].astype(str) == iso].reset_index(drop=True)


class ReplayEngine:
    """One session's replay. Construct with a single-day bar frame (post
    `df_from_bar_rows`/`load_bars`). `step()` processes the next bar."""

    def __init__(
        self,
        *,
        cfg: Config,
        df: pd.DataFrame,
        journal: ReplayJournal | None = None,
        automation: bool = False,
    ) -> None:
        if df is None or len(df) == 0:
            raise ValueError("replay requires at least one bar for the session")
        self.cfg = cfg
        self.clock = _clock_from_cfg(cfg.market)
        self.strategy = VwapPullbackLong(cfg.strategy.vwap_pullback)
        self.risk = RiskManager(cfg, self.clock)
        self.broker = PaperBroker(
            fees_per_share=cfg.broker.fees_per_share,
            slippage_per_share=cfg.broker.slippage_per_share,
        )
        self.journal = journal or ReplayJournal()
        self.automation = automation

        df = attach_indicators(df, or_minutes=cfg.strategy.opening_range.minutes)
        self._bars = list(BarIterator(df))
        self._rows = df.to_dict("records")
        self._idx = 0
        self.state = RiskState(
            session_date=self._bars[0].session_date,
            account_value=cfg.risk.account_value,
        )
        self.trades: list[Position] = []
        self._pending_manual: TradePlan | None = None
        self._pending_close = False

    # ---- pacing helpers (used by the runner) --------------------------------

    @property
    def bars_total(self) -> int:
        return len(self._bars)

    @property
    def delivered(self) -> int:
        return self._idx

    def has_next(self) -> bool:
        return self._idx < len(self._bars)

    def last_bar(self):
        """The most recently revealed bar (None before the first step)."""
        return self._bars[self._idx - 1] if self._idx > 0 else None

    def next_bar_time(self) -> datetime | None:
        return self._bars[self._idx].timestamp if self.has_next() else None

    def session_open_time(self) -> datetime:
        return self._bars[0].timestamp

    def session_close_time(self) -> datetime:
        """Real session close — the last bar's end (start + 5m)."""
        return self._bars[-1].timestamp + timedelta(minutes=5)

    def step(self) -> bool:
        """Process the next bar. Returns True if more bars remain after it."""
        if not self.has_next():
            return False
        self._process_index(self._idx)
        self._idx += 1
        return self.has_next()

    # ---- manual order intake (US2) ------------------------------------------

    def submit_manual(
        self, *, stop_loss: float, take_profit: float, price: float, now: datetime
    ) -> dict:
        """Validate a manual buy against current state; queue it to fill at the
        next bar's open if approved. `price` is the last revealed close (sizing
        anchor). No stop = no trade — rejections are journaled (SC-006)."""
        day = self._current_trading_day()
        try:
            sig = Signal(
                symbol="SPY",
                setup="vwap_pullback_long",
                direction=Direction.LONG,
                timestamp=now,
                planned_entry=price,
                stop_loss=stop_loss,
                take_profit=take_profit,
                reason="manual order",
            )
        except ValueError as exc:
            self.journal.emit(
                "rejected", timestamp=now, trading_day=day,
                origin="manual", rejection_check="invalid_levels", reason=str(exc),
            )
            return {"approved": False, "reason": f"invalid_levels: {exc}"}

        if self._pending_manual is not None:
            return {"approved": False, "reason": "a manual order is already pending"}
        decision = self.risk.validate(sig, self.state)
        if not decision.approved:
            self.journal.emit(
                "rejected", timestamp=now, trading_day=day, origin="manual",
                rejection_check=decision.reason, reason=decision.reason,
                planned_entry=price, stop_loss=stop_loss, take_profit=take_profit,
            )
            return {"approved": False, "reason": decision.reason}
        self._pending_manual = TradePlan(
            signal=sig,
            quantity=decision.quantity,
            planned_risk_dollars=decision.planned_risk_dollars,
        )
        self.journal.emit(
            "approved", timestamp=now, trading_day=day, origin="manual",
            quantity=decision.quantity, planned_entry=price,
            stop_loss=stop_loss, take_profit=take_profit,
            reason="manual order approved; fills at next bar open",
        )
        return {"approved": True, "reason": "approved", "quantity": decision.quantity}

    def close_manual(self) -> dict:
        """Request a flatten of the open position at the next bar's open."""
        if self.state.open_position is None:
            return {"accepted": False, "reason": "no open position"}
        self._pending_close = True
        return {"accepted": True}

    # ---- per-bar body (parity with backtest/engine.py::_run_loaded) ---------

    def _process_index(self, idx: int) -> None:
        bar = self._bars[idx]
        snap = snapshot_from_row(self._rows[idx])
        state = self.state
        prior_lockout = state.daily_lockout_active
        state.roll_to_session(bar.session_date)

        # 0) Fill a pending manual entry decided on the prior bar — at THIS
        #    bar's open (no-look-ahead), mirroring the automated next-bar fill.
        if self._pending_manual is not None and state.open_position is None:
            plan = self._pending_manual
            self._pending_manual = None
            state.open_position = self.broker.simulate_entry(plan, next_bar=bar)
            state.trades_taken_today += 1
            self._journal_executed(plan.signal, snap, state.open_position, "manual")
        elif self._pending_manual is not None:
            self._pending_manual = None  # position opened meanwhile — drop

        # 1) Manage open position with the current bar (stop / target).
        if state.open_position is not None:
            state.open_position = self.broker.simulate_bar(state.open_position, bar)
            if state.open_position.exit_timestamp is not None:
                self._on_exit(state.open_position, snap)

        # 1b) Manual close request — flatten at this bar's open.
        if self._pending_close and state.open_position is not None:
            self._pending_close = False
            pos = self.broker.force_flat(state.open_position, bar)
            self._on_exit(pos, snap, manual=True)

        # 2) Force-flat at the cutoff (no overnight positions).
        if self.clock.is_force_flat(bar.timestamp) and state.open_position is not None:
            next_bar = self._bars[idx + 1] if idx + 1 < len(self._bars) else None
            if next_bar is None or next_bar.session_date != bar.session_date:
                exit_bar = bar.model_copy(update={"open": bar.close})
            else:
                exit_bar = next_bar
            pos = self.broker.force_flat(state.open_position, exit_bar)
            self._on_exit(pos, snap)

        # 2b) End-of-session safety flatten (analyze finding C1): on an
        #     early-close day the static 15:55 cutoff is never reached, so a
        #     position open at the day's LAST bar must still be flattened at the
        #     close. No-op on normal days (already flat after step 2).
        last_of_session = idx + 1 >= len(self._bars) or (
            self._bars[idx + 1].session_date != bar.session_date
        )
        if last_of_session and state.open_position is not None:
            exit_bar = bar.model_copy(update={"open": bar.close})
            pos = self.broker.force_flat(state.open_position, exit_bar)
            self._on_exit(pos, snap)

        # 3) Lockout row when the daily lockout flips on.
        if state.daily_lockout_active and not prior_lockout:
            self.journal.emit(
                "lockout", timestamp=bar.timestamp, trading_day=bar.session_date,
                reason="Daily loss limit reached; trading locked for the session",
                vwap=snap.vwap,
            )

        # 4) Automation: evaluate the strategy if flat.
        if self.automation and state.open_position is None:
            self._evaluate_automation(idx, bar, snap)

    def _evaluate_automation(self, idx, bar, snap) -> None:
        sig = self.strategy.evaluate(
            bar, snap, self.clock.minutes_since_open(bar.timestamp)
        )
        if isinstance(sig, WindowSkip):
            self.journal.emit(
                "skipped_window", timestamp=sig.timestamp,
                trading_day=bar.session_date, origin="strategy", reason=sig.reason,
                vwap=snap.vwap,
            )
            return
        if sig is None:
            return
        self.journal.emit(
            "emitted", timestamp=sig.timestamp, trading_day=bar.session_date,
            origin="strategy", setup=sig.setup, planned_entry=sig.planned_entry,
            stop_loss=sig.stop_loss, take_profit=sig.take_profit, reason=sig.reason,
            vwap=snap.vwap,
        )
        decision = self.risk.validate(sig, self.state)
        if decision.approved and idx + 1 < len(self._bars):
            self.journal.emit(
                "approved", timestamp=sig.timestamp, trading_day=bar.session_date,
                origin="strategy", quantity=decision.quantity,
                planned_entry=sig.planned_entry, reason="approved",
            )
            next_bar = self._bars[idx + 1]
            plan = TradePlan(
                signal=sig,
                quantity=decision.quantity,
                planned_risk_dollars=decision.planned_risk_dollars,
            )
            self.state.open_position = self.broker.simulate_entry(
                plan, next_bar=next_bar
            )
            self.state.trades_taken_today += 1
            self._journal_executed(sig, snap, self.state.open_position, "strategy")
        elif not decision.approved:
            self.journal.emit(
                "rejected", timestamp=sig.timestamp, trading_day=bar.session_date,
                origin="strategy", rejection_check=decision.reason,
                reason=decision.reason, planned_entry=sig.planned_entry,
            )

    # ---- exits + state bookkeeping (parity with backtest) -------------------

    def _on_exit(self, pos: Position, snap, *, manual: bool = False) -> None:
        kind = "force_flat" if pos.exit_reason == "force_flat" else "exited"
        self.journal.emit(
            kind, timestamp=pos.exit_timestamp,
            trading_day=self._current_trading_day(),
            origin="manual" if manual else "strategy",
            setup=pos.plan.signal.setup, quantity=pos.plan.quantity,
            actual_entry=pos.entry_price, actual_exit=pos.exit_price,
            exit_reason=("manual" if manual else pos.exit_reason),
            realized_pnl=pos.realized_pnl, realized_r=pos.realized_r,
            gross_pnl=pos.gross_pnl, fees=pos.fees, slippage_cost=pos.slippage_cost,
            same_bar_tiebreak=pos.same_bar_tiebreak,
            reason=("Manual close" if manual else f"Exit via {pos.exit_reason}"),
            vwap=snap.vwap,
        )
        self._apply_exit_to_state(pos)
        self.trades.append(pos)
        self.state.open_position = None

    def _apply_exit_to_state(self, pos: Position) -> None:
        state = self.state
        state.daily_realized_pnl += pos.realized_pnl
        if pos.realized_pnl < 0:
            state.consecutive_losses += 1
            state.cooldown_until = pos.exit_timestamp + timedelta(
                minutes=self.cfg.risk.cooldown_after_loss_minutes
            )
        else:
            state.consecutive_losses = 0
        max_loss = -state.account_value * self.cfg.risk.max_daily_loss_pct / 100
        if state.daily_realized_pnl <= max_loss:
            state.daily_lockout_active = True

    def _journal_executed(self, sig, snap, pos, origin: str) -> None:
        self.journal.emit(
            "executed", timestamp=pos.entry_timestamp,
            trading_day=self._current_trading_day(), origin=origin,
            setup=sig.setup, quantity=pos.plan.quantity,
            planned_entry=sig.planned_entry, actual_entry=pos.entry_price,
            stop_loss=sig.stop_loss, take_profit=sig.take_profit,
            reason=sig.reason, vwap=snap.vwap,
        )

    def _current_trading_day(self):
        idx = min(self._idx, len(self._bars) - 1)
        return self._bars[idx].session_date

    # ---- chart data ----------------------------------------------------------

    def delivered_bars(self, since: str | None = None) -> list[dict]:
        """Revealed bars (with VWAP) for the chart, optionally since an ISO ts."""
        out = []
        for i in range(self._idx):
            row = self._rows[i]
            t = row["timestamp"]
            t_iso = t.isoformat() if hasattr(t, "isoformat") else str(t)
            if since is not None and t_iso <= since:
                continue
            vwap = row.get("vwap")
            out.append(
                {
                    "t": t_iso,
                    "o": float(row["open"]),
                    "h": float(row["high"]),
                    "l": float(row["low"]),
                    "c": float(row["close"]),
                    "v": int(row["volume"]),
                    "vwap": None if vwap is None or pd.isna(vwap) else float(vwap),
                }
            )
        return out

    def position_levels(self) -> dict | None:
        pos = self.state.open_position
        if pos is None:
            return None
        return {
            "entry": pos.entry_price,
            "stop": pos.plan.signal.stop_loss,
            "target": pos.plan.signal.take_profit,
        }
