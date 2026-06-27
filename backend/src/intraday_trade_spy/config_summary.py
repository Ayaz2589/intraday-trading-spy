"""Feature 025 — human-readable config summaries.

A pure, deterministic, TOTAL derivation of "what this config does" from its
``params`` JSON, so the cryptic auto-generated config names (e.g.
``auto09-c3-buffer_pct0.2``) become self-explanatory in the UI.

Design notes:
- Read-only: this never writes, and never reads ``name`` or the provenance
  ``description`` field (Feature 017/018). It looks only at ``params``.
- Wording reuses ``validation/knobs.py::KNOB_REGISTRY`` labels so summary text
  cannot drift from the rest of the product (FR-004). The "all-day" entry-window
  threshold is derived from the registry bounds — no literal session length.
- Total: any malformed/partial/empty params yield at least the strategy family
  ("VWAP pullback"); the function never raises (FR-007).
"""

from __future__ import annotations

from dataclasses import dataclass

from intraday_trade_spy.validation.knobs import KNOB_REGISTRY

# v1 has exactly one strategy family.
_FAMILY = "VWAP pullback"

# Registry paths the summary reads (kept in display order).
_DIST = "strategy.vwap_pullback.max_distance_from_vwap_pct"
_BUFFER = "strategy.vwap_pullback.stop.buffer_pct"
_RR = "strategy.vwap_pullback.target.risk_reward"
_OR = "strategy.opening_range.minutes"
_WIN_START = "strategy.vwap_pullback.entry_window.start_minutes_after_open"
_WIN_END = "strategy.vwap_pullback.entry_window.end_minutes_after_open"


@dataclass(frozen=True)
class ConfigHighlight:
    """One salient parameter, rendered for humans."""

    label: str
    value: str


@dataclass(frozen=True)
class ConfigSummary:
    """The derived, never-persisted view of a config's behaviour."""

    summary: str
    highlights: list[ConfigHighlight]


def _num(x: float) -> str:
    """Format a number without trailing zeros: 2.0->'2', 1.5->'1.5', 15->'15'."""
    f = float(x)
    if f == int(f):
        return str(int(f))
    return f"{f:g}"


def _get(params: object, path: str):
    """Safely read a dotted path out of nested dicts. None if any hop missing."""
    node: object = params
    for key in path.split("."):
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def _as_number(value: object) -> float | None:
    """Coerce to float only for real numbers (not bools); else None."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return float(value)


def summarize_config(params: object) -> ConfigSummary:
    """Derive a one-line summary + ordered highlights from a config's params.

    Pure, deterministic, and total — see module docstring.
    """
    phrases: list[str] = []
    highlights: list[ConfigHighlight] = []

    # 1. max distance from VWAP — "≤0.5% from VWAP"
    dist = _as_number(_get(params, _DIST))
    if dist is not None:
        phrases.append(f"≤{_num(dist)}% from VWAP")
        highlights.append(ConfigHighlight(KNOB_REGISTRY[_DIST].label, f"≤{_num(dist)}%"))

    # 2. stop buffer — "0.2% stop buffer"
    buffer = _as_number(_get(params, _BUFFER))
    if buffer is not None:
        phrases.append(f"{_num(buffer)}% stop buffer")
        highlights.append(ConfigHighlight(KNOB_REGISTRY[_BUFFER].label, f"{_num(buffer)}%"))

    # 3. risk:reward — "2:1 R:R"
    rr = _as_number(_get(params, _RR))
    if rr is not None:
        phrases.append(f"{_num(rr)}:1 R:R")
        highlights.append(ConfigHighlight(KNOB_REGISTRY[_RR].label, f"{_num(rr)}:1 R:R"))

    # 4. opening range — "15-min opening range"
    orm = _as_number(_get(params, _OR))
    if orm is not None:
        phrases.append(f"{_num(orm)}-min opening range")
        highlights.append(ConfigHighlight(KNOB_REGISTRY[_OR].label, f"{_num(orm)} min"))

    # 5. entry window — "all-day entry" or "entry 60–300 min".
    # Present iff the entry_window object exists; missing bounds default to the
    # registry's full-window bounds (no literal session length).
    win = _get(params, "strategy.vwap_pullback.entry_window")
    if isinstance(win, dict):
        lo_bound = KNOB_REGISTRY[_WIN_START].min
        hi_bound = KNOB_REGISTRY[_WIN_END].max
        start = _as_number(_get(params, _WIN_START))
        end = _as_number(_get(params, _WIN_END))
        start = lo_bound if start is None else start
        end = hi_bound if end is None else end
        if start <= lo_bound and end >= hi_bound:
            phrases.append("all-day entry")
            highlights.append(ConfigHighlight("entry window", "all-day"))
        else:
            rng = f"{_num(start)}–{_num(end)} min"
            phrases.append(f"entry {rng}")
            highlights.append(ConfigHighlight("entry window", rng))

    summary = " · ".join([_FAMILY, *phrases]) if phrases else _FAMILY
    return ConfigSummary(summary=summary, highlights=highlights)
