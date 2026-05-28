from intraday_trade_spy.models import Bar, Position, TradePlan


class PaperBroker:
    def simulate_entry(self, plan: TradePlan, *, next_bar: Bar) -> Position:
        assert plan.quantity > 0
        return Position(
            plan=plan,
            entry_timestamp=next_bar.timestamp,
            entry_price=next_bar.open,
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
            return position.model_copy(
                update=dict(
                    exit_timestamp=bar.timestamp,
                    exit_price=stop,
                    exit_reason="stop",
                    realized_pnl=(stop - position.entry_price) * position.plan.quantity,
                    realized_r=-1.0,
                    same_bar_tiebreak="stop_first",
                )
            )
        if hit_stop:
            return position.model_copy(
                update=dict(
                    exit_timestamp=bar.timestamp,
                    exit_price=stop,
                    exit_reason="stop",
                    realized_pnl=(stop - position.entry_price) * position.plan.quantity,
                    realized_r=-1.0,
                )
            )
        if hit_target:
            entry = position.entry_price
            risk_per_share = entry - stop
            realized_r = (target - entry) / risk_per_share if risk_per_share > 0 else 0.0
            return position.model_copy(
                update=dict(
                    exit_timestamp=bar.timestamp,
                    exit_price=target,
                    exit_reason="target",
                    realized_pnl=(target - entry) * position.plan.quantity,
                    realized_r=realized_r,
                )
            )
        return position

    def force_flat(self, position: Position, next_bar: Bar) -> Position:
        if position.exit_timestamp is not None:
            return position
        entry = position.entry_price
        stop = position.plan.signal.stop_loss
        risk_per_share = entry - stop
        realized_r = (
            (next_bar.open - entry) / risk_per_share if risk_per_share > 0 else 0.0
        )
        return position.model_copy(
            update=dict(
                exit_timestamp=next_bar.timestamp,
                exit_price=next_bar.open,
                exit_reason="force_flat",
                realized_pnl=(next_bar.open - entry) * position.plan.quantity,
                realized_r=realized_r,
            )
        )
