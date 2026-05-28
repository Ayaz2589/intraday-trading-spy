from intraday_trade_spy.config import VwapPullbackConfig
from intraday_trade_spy.models import Bar, Direction, IndicatorSnapshot, Signal


class VwapPullbackLong:
    def __init__(self, cfg: VwapPullbackConfig) -> None:
        self.cfg = cfg

    def evaluate(self, bar: Bar, snap: IndicatorSnapshot) -> Signal | None:
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
