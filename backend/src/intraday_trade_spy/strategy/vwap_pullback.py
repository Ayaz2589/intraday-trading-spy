from intraday_trade_spy.config import VwapPullbackConfig
from intraday_trade_spy.models import Bar, Direction, IndicatorSnapshot, Signal, WindowSkip


class VwapPullbackLong:
    def __init__(self, cfg: VwapPullbackConfig) -> None:
        self.cfg = cfg

    def evaluate(
        self, bar: Bar, snap: IndicatorSnapshot, minutes_since_open: int
    ) -> Signal | WindowSkip | None:
        """Detect a pullback setup. Tri-state (Feature 020): None = no valid
        setup; WindowSkip = a fully-valid setup outside the entry window
        (journal-only — the engine records it, nothing trades); Signal = a
        valid in-window setup. Detection rules are unchanged from pre-020;
        the window check sits between validity and Signal construction so
        skips are only ever REAL setups."""
        if not snap.or_complete:
            return None
        if bar.close <= snap.vwap:
            return None
        if snap.distance_from_vwap_pct > self.cfg.max_distance_from_vwap_pct:
            return None
        if snap.prior_bar_close is None or bar.close <= snap.prior_bar_close:
            return None
        stop = bar.low * (1 - self.cfg.stop.buffer_pct / 100)
        risk_per_share = bar.close - stop
        if risk_per_share <= 0:
            return None

        window = self.cfg.entry_window
        if not (window.start_minutes_after_open <= minutes_since_open
                < window.end_minutes_after_open):
            return WindowSkip(
                timestamp=bar.timestamp,
                reason=(
                    f"Valid setup at minute {minutes_since_open} outside entry "
                    f"window [{window.start_minutes_after_open}, "
                    f"{window.end_minutes_after_open})"
                ),
                start_minutes_after_open=window.start_minutes_after_open,
                end_minutes_after_open=window.end_minutes_after_open,
            )

        target = bar.close + self.cfg.target.risk_reward * risk_per_share
        return Signal(
            symbol="SPY",
            setup="vwap_pullback_long",
            direction=Direction.LONG,
            timestamp=bar.timestamp,
            planned_entry=bar.close,
            stop_loss=stop,
            take_profit=target,
            reason="Close above prior bar high and above VWAP after pullback within threshold",
        )
