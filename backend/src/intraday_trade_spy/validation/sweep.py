"""Parameter-sensitivity sweep (Feature 011, FR-010..012).

Evaluates a human-specified grid of knob values and reports the metric at each
grid point as a surface, so a robust plateau is distinguishable from a fragile
spike. Grids are explicit value lists (no auto-ranging — parameter research
stays manual, Principle II). 1-D and 2-D grids only (the UI renders up to 2-D).

The per-point evaluation is injected (`evaluate(coords) -> result`) so the grid
enumeration + surface aggregation are unit-testable without bars or a database;
the orchestrator's evaluator applies the knob overrides to the config and runs
`engine.run_df` over the chosen segment slice.
"""

from __future__ import annotations

import itertools
from collections.abc import Callable

from intraday_trade_spy.models import SensitivityPoint, SensitivitySurface


class GridSpecError(ValueError):
    """Raised for an invalid grid (not 1-2 knobs, or an empty value list)."""


def _validate_grid(grid: list[dict]) -> None:
    if not (1 <= len(grid) <= 2):
        raise GridSpecError(
            f"sensitivity grid must specify 1 or 2 knobs, got {len(grid)} "
            "(>=3-D surfaces are not supported)"
        )
    for axis in grid:
        if not axis.get("values"):
            raise GridSpecError(f"knob {axis.get('knob')!r} has an empty value list")


def grid_points(grid: list[dict]) -> list[dict]:
    """Cartesian product of the axes → list of {knob: value} coordinate dicts."""
    _validate_grid(grid)
    knobs = [axis["knob"] for axis in grid]
    value_lists = [axis["values"] for axis in grid]
    return [dict(zip(knobs, combo)) for combo in itertools.product(*value_lists)]


def planned_evaluations(grid: list[dict]) -> int:
    return len(grid_points(grid))


def dotted_to_nested(coords: dict) -> dict:
    """Expand {"a.b.c": v} dotted config paths into nested dicts for deep-merge
    over a base config's params."""
    out: dict = {}
    for path, value in coords.items():
        node = out
        parts = path.split(".")
        for key in parts[:-1]:
            node = node.setdefault(key, {})
        node[parts[-1]] = value
    return out


def run_sensitivity(
    *,
    grid: list[dict],
    metric: str,
    segment: str,
    evaluate: Callable[[dict], object],
) -> SensitivitySurface:
    knobs = [axis["knob"] for axis in grid]
    axes = {axis["knob"]: list(axis["values"]) for axis in grid}
    points: list[SensitivityPoint] = []
    for coords in grid_points(grid):
        result = evaluate(coords)
        s = result.summary
        points.append(
            SensitivityPoint(
                coords=coords,
                metric=getattr(s, metric, None),
                trade_count=s.total_trades,
                low_confidence=s.low_confidence,
                run_id=result.run.run_id,
            )
        )
    return SensitivitySurface(
        metric_name=metric, knobs=knobs, axes=axes, points=points, segment=segment
    )
