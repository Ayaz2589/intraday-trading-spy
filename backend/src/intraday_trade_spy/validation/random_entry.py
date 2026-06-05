"""Random-entry permutation null (Feature 011, FR-014).

Builds the null distribution for "could random entries under identical
exit/risk/cost rules have produced this?" Per iteration it greedily samples
non-overlapping LONG entries at eligible bars (respecting the clock's
no-new-trades cutoff and one-position-at-a-time), reuses the PaperBroker for the
exact stop/target/force-flat + slippage/fee logic, and totals the net PnL.

The stop distance, risk:reward, and quantity are passed in (the significance
caller derives them from the observed trades so the null's risk profile matches
the real trades — isolating *entry timing* as the thing under test). All
randomness flows from a seeded numpy Generator → reproducible verdicts.
"""

from __future__ import annotations

import numpy as np

from intraday_trade_spy.models import Bar, Direction, Signal, TradePlan


def _simulate_random_trade(
    bars: list[Bar], entry_idx: int, *, broker, stop_distance: float,
    risk_reward: float, quantity: float,
) -> tuple[float, int]:
    """Enter LONG at the next bar's open, exit via the broker's stop/target/
    force-flat (same session only). Returns (net_pnl, exit_bar_index)."""
    if entry_idx + 1 >= len(bars):
        return 0.0, entry_idx
    entry_bar = bars[entry_idx]
    next_bar = bars[entry_idx + 1]
    entry_price = next_bar.open
    stop = entry_price - stop_distance
    target = entry_price + risk_reward * stop_distance
    sig = Signal(
        symbol="SPY", setup="vwap_pullback_long", direction=Direction.LONG,
        timestamp=entry_bar.timestamp, planned_entry=entry_price,
        stop_loss=stop, take_profit=target, reason="random_entry_null",
    )
    plan = TradePlan(signal=sig, quantity=quantity, planned_risk_dollars=stop_distance * quantity)
    pos = broker.simulate_entry(plan, next_bar=next_bar)

    j = entry_idx + 1
    last_same = j
    while j < len(bars) and bars[j].session_date == next_bar.session_date:
        pos = broker.simulate_bar(pos, bars[j])
        last_same = j
        if pos.exit_timestamp is not None:
            return pos.realized_pnl or 0.0, j
        j += 1
    # Open at session end → force-flat at the last same-session bar.
    pos = broker.force_flat(pos, bars[last_same])
    return pos.realized_pnl or 0.0, last_same


def random_entry_null(
    *,
    bars: list[Bar],
    clock,
    broker,
    n_trades: int,
    stop_distance: float,
    risk_reward: float,
    quantity: float,
    iterations: int,
    seed: int,
) -> list[float]:
    """Return `iterations` total-net-PnL samples from the random-entry null."""
    if n_trades <= 0 or not bars:
        return [0.0] * iterations

    # The observed risk profile arrives as a MEDIAN (extract_trade_stats), so
    # an even trade count can yield a fractional share quantity (e.g. 40.5) —
    # TradePlan.quantity is an integer. Quantize to whole shares, minimum 1.
    quantity = max(1, int(round(quantity)))

    eligible = [
        i for i, b in enumerate(bars[:-1]) if clock.allow_new_trades(b.timestamp)
    ]
    if not eligible:
        return [0.0] * iterations

    rng = np.random.default_rng(seed)
    totals: list[float] = []
    for _ in range(iterations):
        total = 0.0
        last_exit = -1
        for _trade in range(n_trades):
            candidates = [i for i in eligible if i > last_exit]
            if not candidates:
                break
            entry_idx = int(rng.choice(candidates))
            pnl, exit_idx = _simulate_random_trade(
                bars, entry_idx, broker=broker, stop_distance=stop_distance,
                risk_reward=risk_reward, quantity=quantity,
            )
            total += pnl
            last_exit = exit_idx
        totals.append(total)
    return totals
