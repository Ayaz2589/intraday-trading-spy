"""T011 — train/validation/lockbox split discipline (Feature 011, FR-001..003).

The lockbox is the most-recent slice and is never touched by walk-forward or
sensitivity studies. `assert_no_lockbox_overlap` is the code-level guard that
makes self-deception structurally hard.
"""

from datetime import date

import pytest

from intraday_trade_spy.config import load_config
from intraday_trade_spy.validation.split import Segments, assert_no_lockbox_overlap, segments


def _cfg():
    from pathlib import Path

    return load_config(
        Path(__file__).resolve().parents[2] / "config" / "config.yaml"
    )


def test_segments_from_config():
    segs = segments(_cfg())
    assert isinstance(segs, Segments)
    assert segs.train.start == date(2018, 1, 1)
    assert segs.validation.end == date(2024, 12, 31)
    assert segs.lockbox.start == date(2025, 1, 1)
    # Lockbox is the most recent slice.
    assert segs.lockbox.start > segs.validation.end
    assert segs.validation.start > segs.train.end


def test_train_validation_pool_span():
    segs = segments(_cfg())
    pool = segs.train_validation
    assert pool.start == date(2018, 1, 1)
    assert pool.end == date(2024, 12, 31)
    # The pool must end strictly before the lockbox begins.
    assert pool.end < segs.lockbox.start


def test_assert_no_lockbox_overlap_passes_for_train_validation():
    segs = segments(_cfg())
    # A range wholly inside train+validation is fine.
    assert_no_lockbox_overlap(date(2018, 1, 1), date(2024, 12, 31), segs)


@pytest.mark.parametrize(
    "start,end",
    [
        (date(2025, 1, 1), date(2025, 6, 30)),   # wholly inside lockbox
        (date(2024, 6, 1), date(2025, 3, 1)),    # straddles into lockbox
        (date(2026, 1, 1), date(2026, 12, 31)),  # wholly inside lockbox (later)
        (date(2024, 12, 31), date(2027, 1, 1)),  # spans across the whole lockbox
    ],
)
def test_assert_no_lockbox_overlap_raises_on_intersection(start, end):
    segs = segments(_cfg())
    with pytest.raises(ValueError, match="lockbox"):
        assert_no_lockbox_overlap(start, end, segs)


def test_assert_no_lockbox_overlap_boundary_before_is_ok():
    segs = segments(_cfg())
    # Ends the day before the lockbox starts — no intersection.
    assert_no_lockbox_overlap(date(2023, 1, 1), date(2024, 12, 31), segs)
