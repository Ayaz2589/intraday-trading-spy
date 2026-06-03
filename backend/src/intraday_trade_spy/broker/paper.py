from intraday_trade_spy.models import Bar, Position, TradePlan


class PaperBroker:
    """In-process fill simulator.

    Feature 010 (honest backtest): trading costs are applied to every fill.
    Slippage is a fixed adverse amount per share baked into the fill *price*
    (a long pays up on entry, sells down on exit). Fees are a flat per-share
    charge on both sides. ``realized_pnl`` is the NET figure; ``gross_pnl`` /
    ``fees`` / ``slippage_cost`` break it down for the journal (constitution
    VII). Costs default to zero so a zero-cost baseline is one flag away.
    """

    def __init__(
        self, *, fees_per_share: float = 0.0, slippage_per_share: float = 0.0
    ) -> None:
        self.fees_per_share = fees_per_share
        self.slippage_per_share = slippage_per_share

    def simulate_entry(self, plan: TradePlan, *, next_bar: Bar) -> Position:
        assert plan.quantity > 0
        # Adverse slippage: a long pays UP to get filled.
        return Position(
            plan=plan,
            entry_timestamp=next_bar.timestamp,
            entry_price=next_bar.open + self.slippage_per_share,
        )

    def _close(
        self, position: Position, *, exit_timestamp, raw_level: float,
        exit_reason: str, same_bar_tiebreak: str = "none",
    ) -> Position:
        qty = position.plan.quantity
        entry = position.entry_price
        stop = position.plan.signal.stop_loss
        # Adverse slippage: a long sells DOWN.
        exit_price = raw_level - self.slippage_per_share
        risk_per_share = entry - stop
        realized_r = (exit_price - entry) / risk_per_share if risk_per_share > 0 else 0.0
        gross_pnl = (exit_price - entry) * qty
        fees = self.fees_per_share * qty * 2  # entry + exit
        slippage_cost = self.slippage_per_share * qty * 2  # reporting; already in prices
        net_pnl = gross_pnl - fees
        return position.model_copy(
            update=dict(
                exit_timestamp=exit_timestamp,
                exit_price=exit_price,
                exit_reason=exit_reason,
                realized_pnl=net_pnl,
                realized_r=realized_r,
                gross_pnl=gross_pnl,
                fees=fees,
                slippage_cost=slippage_cost,
                same_bar_tiebreak=same_bar_tiebreak,
            )
        )

    def simulate_bar(self, position: Position, bar: Bar) -> Position:
        if position.exit_timestamp is not None:
            return position
        stop = position.plan.signal.stop_loss
        target = position.plan.signal.take_profit
        hit_stop = bar.low <= stop
        hit_target = bar.high >= target

        if hit_stop and hit_target:
            # Conservative for long: stop fills first (FR-009).
            return self._close(
                position, exit_timestamp=bar.timestamp, raw_level=stop,
                exit_reason="stop", same_bar_tiebreak="stop_first",
            )
        if hit_stop:
            return self._close(
                position, exit_timestamp=bar.timestamp, raw_level=stop,
                exit_reason="stop",
            )
        if hit_target:
            return self._close(
                position, exit_timestamp=bar.timestamp, raw_level=target,
                exit_reason="target",
            )
        return position

    def force_flat(self, position: Position, next_bar: Bar) -> Position:
        if position.exit_timestamp is not None:
            return position
        return self._close(
            position, exit_timestamp=next_bar.timestamp, raw_level=next_bar.open,
            exit_reason="force_flat",
        )
