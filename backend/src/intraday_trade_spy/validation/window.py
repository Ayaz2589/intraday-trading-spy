"""Walk-forward window enumeration (Feature 011, FR-007/FR-009).

Rolls a window through a (train+validation) pool. Each window has a training
(in-sample) span and the immediately-following untouched out-of-sample span.
Boundaries are inclusive-start / exclusive-end dates so a slice is
``start <= session_date < end`` with no overlap between adjacent OOS windows.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

from intraday_trade_spy.config import SplitWindowConfig, WalkForwardConfig


@dataclass(frozen=True)
class Window:
    index: int
    train_start: date  # inclusive
    train_end: date    # exclusive (== oos_start)
    oos_start: date    # inclusive
    oos_end: date      # exclusive


def enumerate_windows(pool: SplitWindowConfig, wf: WalkForwardConfig) -> list[Window]:
    """Enumerate walk-forward windows over ``pool``. A window is kept only while
    its out-of-sample span fits entirely within the pool, so no window ever
    reaches beyond ``pool.end`` (and therefore never into the lockbox)."""
    pool_end_excl = pool.end + timedelta(days=1)
    windows: list[Window] = []
    i = 0
    while True:
        if wf.mode == "anchored":
            train_start = pool.start
            train_end = pool.start + relativedelta(
                months=wf.train_months + i * wf.step_months
            )
        else:  # rolling
            train_start = pool.start + relativedelta(months=i * wf.step_months)
            train_end = train_start + relativedelta(months=wf.train_months)

        oos_start = train_end
        oos_end = oos_start + relativedelta(months=wf.validation_months)
        if oos_end > pool_end_excl:
            break
        windows.append(
            Window(
                index=i,
                train_start=train_start,
                train_end=train_end,
                oos_start=oos_start,
                oos_end=oos_end,
            )
        )
        i += 1
    return windows
