from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from pathlib import Path

from intraday_trade_spy.broker.paper import PaperBroker
from intraday_trade_spy.clock import MarketClock
from intraday_trade_spy.config import Config
from intraday_trade_spy.data.bars import BarIterator
from intraday_trade_spy.data.indicators import attach_indicators, snapshot_from_row
from intraday_trade_spy.data.loader import load_bars
from intraday_trade_spy.journal.logger import JournalLogger
from intraday_trade_spy.models import BacktestRun, JournalEntry, SignalStatus, TradePlan
from intraday_trade_spy.risk.manager import RiskManager
from intraday_trade_spy.risk.state import RiskState
from intraday_trade_spy.strategy.vwap_pullback import VwapPullbackLong


@dataclass
class BacktestResult:
    journal_rows: list[JournalEntry]
    summary: object
    run: BacktestRun


class BacktestEngine:
    def __init__(self, cfg: Config) -> None:
        self.cfg = cfg
        self.clock = MarketClock(
            session_start=time.fromisoformat(cfg.market.session_start),
            session_end=time.fromisoformat(cfg.market.session_end),
            no_new_trades_after=time.fromisoformat(cfg.market.no_new_trades_after),
            force_flat_time=time.fromisoformat(cfg.market.force_flat_time),
        )
        self.strategy = VwapPullbackLong(cfg.strategy.vwap_pullback)
        self.risk = RiskManager(cfg, self.clock)
        self.broker = PaperBroker(
            fees_per_share=cfg.broker.fees_per_share,
            slippage_per_share=cfg.broker.slippage_per_share,
        )

    def run(self, *, csv_path: Path, output_dir: Path | None = None) -> BacktestResult:
        """CSV entry point. Fingerprints the file bytes (unchanged behavior) and
        runs the in-memory engine."""
        from intraday_trade_spy.data.fingerprint import fingerprint_csv

        df = load_bars(csv_path, market=self.cfg.market)
        return self._run_loaded(df, fingerprint=fingerprint_csv(csv_path))

    def run_df(self, df) -> BacktestResult:
        """Feature 011 (FR-024): run over a pre-loaded, date-sliced bar frame
        (post-`load_bars`). The validation engine parses the full history once
        and slices per window, calling this instead of re-reading a CSV per
        evaluation. Behavior-neutral twin of `run` — see tests/validation/
        test_engine_run_df.py — with a content-based fingerprint."""
        from intraday_trade_spy.data.fingerprint import fingerprint_df

        return self._run_loaded(df, fingerprint=fingerprint_df(df))

    def _run_loaded(self, df, *, fingerprint) -> BacktestResult:
        from intraday_trade_spy.backtest.manifest import build_run_from_fingerprint
        from intraday_trade_spy.backtest.metrics import compute_summary

        started = datetime.now(UTC)
        df = attach_indicators(df, or_minutes=self.cfg.strategy.opening_range.minutes)
        bars = list(BarIterator(df))
        rows = df.to_dict("records")
        state = RiskState(
            session_date=bars[0].session_date,
            account_value=self.cfg.risk.account_value,
        )
        log = JournalLogger()

        for idx, bar in enumerate(bars):
            prior_lockout = state.daily_lockout_active
            state.roll_to_session(bar.session_date)
            snap = snapshot_from_row(rows[idx])

            # 1) Manage open position with current bar (stop / target).
            if state.open_position is not None:
                state.open_position = self.broker.simulate_bar(state.open_position, bar)
                if state.open_position.exit_timestamp is not None:
                    self._log_exit(log, state.open_position, snap)
                    self._apply_exit_to_state(state, state.open_position)
                    state.open_position = None

            # 2) Force-flat if cutoff reached and position still open.
            # Constitution: no overnight positions. If the next bar is in a
            # different session (or there is no next bar), exit at the current
            # bar's close. Otherwise honor FR-011 and exit at next bar's open.
            if (
                self.clock.is_force_flat(bar.timestamp)
                and state.open_position is not None
            ):
                next_bar = bars[idx + 1] if idx + 1 < len(bars) else None
                if next_bar is None or next_bar.session_date != bar.session_date:
                    # Synthesize a same-session exit at this bar's close.
                    exit_bar = bar.model_copy(update={"open": bar.close})
                else:
                    exit_bar = next_bar
                state.open_position = self.broker.force_flat(state.open_position, exit_bar)
                self._log_exit(log, state.open_position, snap)
                self._apply_exit_to_state(state, state.open_position)
                state.open_position = None

            # 3) Emit lockout row when daily_lockout flips on (FR-012).
            if state.daily_lockout_active and not prior_lockout:
                log.log(
                    status=SignalStatus.LOCKOUT,
                    timestamp=bar.timestamp,
                    vwap=snap.vwap,
                    or_high=snap.or_high,
                    or_low=snap.or_low,
                    distance_from_vwap_pct=snap.distance_from_vwap_pct,
                    prior_bar_close=snap.prior_bar_close,
                    reason="Daily loss limit reached; trading locked for the rest of the session",
                )

            # 4) Evaluate strategy if no open position.
            if state.open_position is None:
                sig = self.strategy.evaluate(bar, snap)
                if sig is not None:
                    self._log_signal(log, sig, snap, SignalStatus.EMITTED)
                    decision = self.risk.validate(sig, state)
                    if decision.approved and idx + 1 < len(bars):
                        self._log_signal(log, sig, snap, SignalStatus.APPROVED, decision=decision)
                        next_bar = bars[idx + 1]
                        plan = TradePlan(
                            signal=sig,
                            quantity=decision.quantity,
                            planned_risk_dollars=decision.planned_risk_dollars,
                        )
                        state.open_position = self.broker.simulate_entry(plan, next_bar=next_bar)
                        state.trades_taken_today += 1
                        self._log_signal(
                            log, sig, snap, SignalStatus.EXECUTED,
                            decision=decision,
                            actual_entry=state.open_position.entry_price,
                        )
                    elif not decision.approved:
                        self._log_signal(
                            log, sig, snap, SignalStatus.REJECTED,
                            rejection_check=decision.reason,
                        )

        ended = datetime.now(UTC)
        summary = compute_summary(
            log.rows(),
            account_value=self.cfg.risk.account_value,
            metrics_config=self.cfg.metrics,
        )
        run = build_run_from_fingerprint(
            data_fingerprint=fingerprint, cfg=self.cfg, summary=summary,
            started=started, ended=ended,
        )
        return BacktestResult(journal_rows=log.rows(), summary=summary, run=run)

    def _log_signal(
        self, log, sig, snap, status,
        *, decision=None, actual_entry=None, rejection_check=None,
    ):
        approved_qty = decision.quantity if decision and decision.approved else None
        approved_risk = (
            decision.planned_risk_dollars if decision and decision.approved else None
        )
        log.log(
            status=status,
            timestamp=sig.timestamp,
            setup=sig.setup,
            direction=sig.direction,
            planned_entry=sig.planned_entry,
            stop_loss=sig.stop_loss,
            take_profit=sig.take_profit,
            quantity=approved_qty,
            planned_risk_dollars=approved_risk,
            actual_entry=actual_entry,
            vwap=snap.vwap,
            or_high=snap.or_high,
            or_low=snap.or_low,
            distance_from_vwap_pct=snap.distance_from_vwap_pct,
            prior_bar_close=snap.prior_bar_close,
            reason=sig.reason,
            rejection_check=rejection_check,
        )

    def _log_exit(self, log, pos, snap):
        status = (
            SignalStatus.FORCE_FLAT if pos.exit_reason == "force_flat" else SignalStatus.EXITED
        )
        log.log(
            status=status,
            timestamp=pos.exit_timestamp,
            setup=pos.plan.signal.setup,
            direction=pos.plan.signal.direction,
            planned_entry=pos.plan.signal.planned_entry,
            stop_loss=pos.plan.signal.stop_loss,
            take_profit=pos.plan.signal.take_profit,
            quantity=pos.plan.quantity,
            planned_risk_dollars=pos.plan.planned_risk_dollars,
            actual_entry=pos.entry_price,
            actual_exit=pos.exit_price,
            exit_reason=pos.exit_reason,
            realized_pnl=pos.realized_pnl,
            realized_r=pos.realized_r,
            gross_pnl=pos.gross_pnl,
            fees=pos.fees,
            slippage_cost=pos.slippage_cost,
            vwap=snap.vwap,
            or_high=snap.or_high,
            or_low=snap.or_low,
            distance_from_vwap_pct=snap.distance_from_vwap_pct,
            prior_bar_close=snap.prior_bar_close,
            reason=f"Exit via {pos.exit_reason}",
            same_bar_tiebreak=pos.same_bar_tiebreak,
        )

    def _apply_exit_to_state(self, state: RiskState, pos):
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
