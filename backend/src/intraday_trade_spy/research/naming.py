"""Deterministic auto-config names (Feature 019, research.md R5).

auto{seq:02d}-c{cycle}-{leaf}{value:g}[-{leaf}{value:g}…] — sortable,
self-describing in the configs list, and stable across recomputes. Multi-knob
candidates join their (path-sorted) leaf+value pairs with '-'.
"""

from __future__ import annotations


def candidate_name(*, seq: int, cycle: int, changes: list[dict]) -> str:
    parts = [
        f"{c['knob_path'].rsplit('.', 1)[-1]}{c['value']:g}"
        for c in sorted(changes, key=lambda c: c["knob_path"])
    ]
    return f"auto{seq:02d}-c{cycle}-" + "-".join(parts)
