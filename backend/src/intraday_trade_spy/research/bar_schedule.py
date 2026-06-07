"""The tightened gate bar (Feature 019, FR-009 / research.md R4).

Bonferroni on the pooled-gate CI level: a campaign cycle gates its candidate
at level 1 - base_alpha/k, where k is the knob family's recorded trial count
(1 + matching trial-ledger rows). Ledger rows are never deleted, so k is
non-decreasing per family and the bar can only tighten (SC-006). Both k and
the level are recorded wherever a verdict is — any decision is recomputable
(SC-005).
"""

from __future__ import annotations


def bar_level(k: int, *, base_alpha: float) -> float:
    """CI level for the family's k-th trial: 1 - base_alpha/k."""
    if k < 1:
        raise ValueError(f"trial count k must be >= 1, got {k}")
    return 1.0 - base_alpha / k


def family_key(changes: list[dict]) -> str:
    """Sorted comma-joined knob paths changed vs the campaign's starting
    config. The starting config itself (no changes) keys the empty family."""
    return ",".join(sorted(c["knob_path"] for c in changes))


def k_for(storage, *, strategy_id, family: str) -> int:
    """1 + the ledger's recorded trial count for this family. The empty
    family (the operator's own starting config) is always k=1 and never
    queries the ledger — evaluating your own config is not a trial."""
    if not family:
        return 1
    return 1 + int(storage.count_family_trials(strategy_id=strategy_id, family=family))
