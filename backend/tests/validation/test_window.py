"""T025 — walk-forward window enumeration (Feature 011, FR-007/FR-009).

Windows roll through the train+validation pool only; none may enter the lockbox.
Boundaries use inclusive start / exclusive end (slice as start <= session_date < end).
"""

from datetime import date

from intraday_trade_spy.config import SplitWindowConfig, WalkForwardConfig, load_config
from intraday_trade_spy.validation.split import segments
from intraday_trade_spy.validation.window import Window, enumerate_windows


def _cfg():
    from pathlib import Path

    return load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")


def test_default_rolling_enumeration():
    segs = segments(_cfg())
    wf = WalkForwardConfig()  # rolling 12/6/6
    windows = enumerate_windows(segs.train_validation, wf)

    # Pool 2018-01-01..2024-12-31, rolling 12mo train / 6mo step / 6mo OOS.
    assert len(windows) == 12
    first = windows[0]
    assert first.index == 0
    assert first.train_start == date(2018, 1, 1)
    assert first.train_end == date(2019, 1, 1)      # exclusive
    assert first.oos_start == date(2019, 1, 1)
    assert first.oos_end == date(2019, 7, 1)         # exclusive

    last = windows[-1]
    assert last.oos_end == date(2025, 1, 1)          # exactly the lockbox boundary

    # Monotonic, contiguous IS→OOS, and OOS never reaches the lockbox.
    for w in windows:
        assert w.oos_start == w.train_end
        assert w.oos_end <= date(2025, 1, 1)         # lockbox starts 2025-01-01


def test_rolling_train_window_is_fixed_length():
    pool = SplitWindowConfig(start=date(2018, 1, 1), end=date(2024, 12, 31))
    wf = WalkForwardConfig(mode="rolling", train_months=12, step_months=6, validation_months=6)
    windows = enumerate_windows(pool, wf)
    # Every rolling train window spans exactly 12 months.
    for w in windows:
        assert (w.train_end.year - w.train_start.year) * 12 + (
            w.train_end.month - w.train_start.month
        ) == 12


def test_anchored_train_window_grows():
    pool = SplitWindowConfig(start=date(2018, 1, 1), end=date(2021, 12, 31))
    wf = WalkForwardConfig(mode="anchored", train_months=12, step_months=12, validation_months=12)
    windows = enumerate_windows(pool, wf)
    assert all(w.train_start == date(2018, 1, 1) for w in windows)  # anchored start
    # Train end advances each step.
    ends = [w.train_end for w in windows]
    assert ends == sorted(ends) and len(set(ends)) == len(ends)


def test_no_window_exceeds_pool():
    pool = SplitWindowConfig(start=date(2020, 1, 1), end=date(2021, 12, 31))
    wf = WalkForwardConfig(mode="rolling", train_months=12, step_months=6, validation_months=6)
    windows = enumerate_windows(pool, wf)
    pool_end_excl = date(2022, 1, 1)
    assert all(w.oos_end <= pool_end_excl for w in windows)
    assert all(isinstance(w, Window) for w in windows)
