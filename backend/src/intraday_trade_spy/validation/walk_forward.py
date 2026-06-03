"""Walk-forward orchestration + aggregation (Feature 011, FR-007/FR-008).

Evaluates a single config across rolling train/out-of-sample windows and reports
in-sample vs out-of-sample metrics side by side, plus the OOS−IS gap (a large
gap signals overfitting). The lockbox is never touched: windows come from the
train+validation pool and `assert_no_lockbox_overlap` guards the pool.

The per-window evaluation is injected (`evaluate`) so the aggregation is unit-
testable without bars or a database; production passes `engine.run_df`.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import date

import pandas as pd

from intraday_trade_spy.config import WalkForwardConfig
from intraday_trade_spy.models import (
    WalkForwardResult,
    WalkForwardWindowResult,
    WindowMetrics,
)
from intraday_trade_spy.validation.split import Segments, assert_no_lockbox_overlap
from intraday_trade_spy.validation.window import enumerate_windows

# Metrics compared across windows (and averaged in the rollups).
_GAP_METRICS = [
    "expectancy_dollars",
    "expectancy_r",
    "win_rate",
    "profit_factor",
    "sharpe",
    "total_net_pnl_dollars",
]


def _slice(df: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    """Whole-session slice [start, end) by ET session_date."""
    mask = (df["session_date"] >= start) & (df["session_date"] < end)
    return df.loc[mask].reset_index(drop=True)


def _window_metrics(result, *, segment: str, start: date, end: date) -> WindowMetrics:
    s = result.summary
    return WindowMetrics(
        segment=segment,
        range_start=start,
        range_end=end,
        run_id=result.run.run_id,
        total_trades=s.total_trades,
        expectancy_dollars=s.expectancy_dollars,
        expectancy_r=s.expectancy_r,
        win_rate=s.win_rate,
        profit_factor=s.profit_factor,
        sharpe=s.sharpe,
        total_net_pnl_dollars=s.total_net_pnl_dollars,
        low_confidence=s.low_confidence,
    )


def _gap(oos: WindowMetrics, ins: WindowMetrics) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for m in _GAP_METRICS:
        a, b = getattr(oos, m), getattr(ins, m)
        out[m] = (a - b) if (a is not None and b is not None) else None
    return out


def _mean_of(values: list[float | None]) -> float | None:
    present = [v for v in values if v is not None]
    return (sum(present) / len(present)) if present else None


def run_walk_forward(
    *,
    df: pd.DataFrame,
    segments: Segments,
    wf: WalkForwardConfig,
    evaluate: Callable[[pd.DataFrame], object],
) -> WalkForwardResult:
    pool = segments.train_validation
    # Hard guard: the walk-forward pool must never reach into the lockbox.
    assert_no_lockbox_overlap(pool.start, pool.end, segments)

    windows = enumerate_windows(pool, wf)
    results: list[WalkForwardWindowResult] = []
    for w in windows:
        ins = _window_metrics(
            evaluate(_slice(df, w.train_start, w.train_end)),
            segment="train",
            start=w.train_start,
            end=w.train_end,
        )
        oos = _window_metrics(
            evaluate(_slice(df, w.oos_start, w.oos_end)),
            segment="validation",
            start=w.oos_start,
            end=w.oos_end,
        )
        results.append(
            WalkForwardWindowResult(
                window_index=w.index, in_sample=ins, out_of_sample=oos, gap=_gap(oos, ins)
            )
        )

    mean_oos = {
        m: _mean_of([getattr(r.out_of_sample, m) for r in results]) for m in _GAP_METRICS
    }
    mean_gap = {m: _mean_of([r.gap[m] for r in results]) for m in _GAP_METRICS}
    return WalkForwardResult(
        mode=wf.mode,
        train_months=wf.train_months,
        step_months=wf.step_months,
        validation_months=wf.validation_months,
        windows=results,
        mean_oos=mean_oos,
        mean_gap=mean_gap,
    )
