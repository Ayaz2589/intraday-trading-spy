"""T027/T029 — walk-forward orchestration + aggregation (Feature 011, FR-007/008).

The aggregation logic (per-window IS/OOS metrics, the OOS−IS gap, and the
mean_oos / mean_gap rollups) is unit-tested with an INJECTED evaluator, so it is
verifiable without bars or a database. The evaluator is `engine.run_df` in
production (test_engine_run_df.py covers that wiring).
"""

from datetime import date
from types import SimpleNamespace

import pandas as pd

from intraday_trade_spy.config import SplitWindowConfig, WalkForwardConfig
from intraday_trade_spy.models import (
    WalkForwardResult,
    WalkForwardWindowResult,
    WindowMetrics,
)
from intraday_trade_spy.validation.split import Segments
from intraday_trade_spy.validation.walk_forward import run_walk_forward


def _fake(run_id, *, exp_d, exp_r, wr, pf, sharpe, net, n, low=False):
    summary = SimpleNamespace(
        total_trades=n,
        expectancy_dollars=exp_d,
        expectancy_r=exp_r,
        win_rate=wr,
        profit_factor=pf,
        sharpe=sharpe,
        total_net_pnl_dollars=net,
        low_confidence=low,
    )
    return SimpleNamespace(summary=summary, run=SimpleNamespace(run_id=run_id))


def _segments():
    # Pool 2020 (train+validation); lockbox is later and untouched.
    return Segments(
        train=SplitWindowConfig(start=date(2020, 1, 1), end=date(2020, 9, 30)),
        validation=SplitWindowConfig(start=date(2020, 10, 1), end=date(2020, 12, 31)),
        lockbox=SplitWindowConfig(start=date(2025, 1, 1), end=date(2026, 12, 31)),
    )


def test_models_construct():
    wm = WindowMetrics(
        segment="train", range_start=date(2020, 1, 1), range_end=date(2020, 7, 1),
        run_id="r1", total_trades=10, expectancy_dollars=1.0, expectancy_r=0.1,
        win_rate=0.5, profit_factor=1.2, sharpe=0.3, total_net_pnl_dollars=10.0,
        low_confidence=False,
    )
    wr = WalkForwardWindowResult(window_index=0, in_sample=wm, out_of_sample=wm, gap={"sharpe": 0.0})
    res = WalkForwardResult(
        mode="rolling", train_months=6, step_months=3, validation_months=3,
        windows=[wr], mean_oos={"sharpe": 0.3}, mean_gap={"sharpe": 0.0},
    )
    assert res.windows[0].in_sample.run_id == "r1"


def test_run_walk_forward_aggregates_gap_and_means():
    wf = WalkForwardConfig(mode="rolling", train_months=6, step_months=3, validation_months=3)
    # Canned IS0, OOS0, IS1, OOS1 (2 windows over the 2020 pool).
    seq = iter([
        _fake("is0", exp_d=3.0, exp_r=0.10, wr=0.50, pf=1.5, sharpe=1.0, net=300, n=100),
        _fake("oos0", exp_d=1.0, exp_r=0.03, wr=0.45, pf=1.1, sharpe=0.4, net=100, n=50),
        _fake("is1", exp_d=2.0, exp_r=0.08, wr=0.48, pf=1.3, sharpe=0.8, net=200, n=80),
        _fake("oos1", exp_d=0.0, exp_r=0.00, wr=0.40, pf=None, sharpe=0.2, net=0, n=20, low=True),
    ])
    df = pd.DataFrame({"session_date": pd.Series([], dtype="object")})

    res = run_walk_forward(df=df, segments=_segments(), wf=wf, evaluate=lambda _slice: next(seq))

    assert isinstance(res, WalkForwardResult)
    assert len(res.windows) == 2

    w0 = res.windows[0]
    assert w0.in_sample.segment == "train" and w0.out_of_sample.segment == "validation"
    assert w0.in_sample.run_id == "is0" and w0.out_of_sample.run_id == "oos0"
    # gap = OOS − IS
    assert w0.gap["expectancy_dollars"] == -2.0
    assert round(w0.gap["sharpe"], 6) == -0.6

    w1 = res.windows[1]
    assert w1.out_of_sample.low_confidence is True
    # profit_factor None on OOS1 → gap None (graceful).
    assert w1.gap["profit_factor"] is None

    # Means over OOS windows; None values are skipped.
    assert res.mean_oos["expectancy_dollars"] == 0.5     # (1.0 + 0.0)/2
    assert res.mean_gap["expectancy_dollars"] == -2.0    # (-2.0 + -2.0)/2
    # mean_oos profit_factor averages only the non-None (1.1) → 1.1
    assert round(res.mean_oos["profit_factor"], 6) == 1.1
