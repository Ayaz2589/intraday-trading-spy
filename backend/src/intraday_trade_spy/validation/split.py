"""Train / validation / lockbox split discipline (Feature 011, FR-001..003).

The lockbox is the most-recent slice, held out and never evaluated by
walk-forward or sensitivity studies. `assert_no_lockbox_overlap` is the
code-level guard that enforces "no self-deception" rather than relying on
operator discipline — only the explicit one-shot lockbox path may touch
lockbox-dated bars.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from intraday_trade_spy.config import Config, SplitWindowConfig


@dataclass(frozen=True)
class Segments:
    train: SplitWindowConfig
    validation: SplitWindowConfig
    lockbox: SplitWindowConfig

    @property
    def train_validation(self) -> SplitWindowConfig:
        """The combined pool walk-forward/sensitivity studies may use
        (train.start → validation.end). The lockbox is excluded by
        construction."""
        return SplitWindowConfig(start=self.train.start, end=self.validation.end)


def segments(cfg: Config) -> Segments:
    split = cfg.validation.split
    return Segments(train=split.train, validation=split.validation, lockbox=split.lockbox)


def _intersects(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    """Inclusive interval intersection: [a_start, a_end] ∩ [b_start, b_end]."""
    return a_start <= b_end and b_start <= a_end


def assert_no_lockbox_overlap(
    range_start: date, range_end: date, segs: Segments
) -> None:
    """Raise if [range_start, range_end] intersects the lockbox segment. Called
    by every non-lockbox study before any evaluation runs (FR-003)."""
    lb = segs.lockbox
    if _intersects(range_start, range_end, lb.start, lb.end):
        raise ValueError(
            f"Requested range {range_start}..{range_end} intersects the held-out "
            f"lockbox segment {lb.start}..{lb.end}. Only the explicit one-shot "
            f"lockbox test may evaluate lockbox-dated bars."
        )
