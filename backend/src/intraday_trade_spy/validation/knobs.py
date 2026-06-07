"""The knob registry (Feature 017) — THE single source of truth for which
config knobs an advisory suggestion may reference and what a draft may
prefill. Seeded with the 8 operator-exposed knobs (research R9).

sanitize_changes() never trusts model output: off-registry paths and
out-of-bounds values are dropped here, BEFORE the analysis is stored
(FR-002/SC-002). Defensive and total — malformed input yields [], never an
exception. Enforcement never relies on the model following the prompt
(FR-010)."""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from intraday_trade_spy.models import ConfigChange


@dataclass(frozen=True)
class KnobSpec:
    path: str
    label: str
    min: float
    max: float
    kind: Literal["float", "int"]


_SPECS = [
    KnobSpec("risk.account_value", "account value ($)", 100, 10_000_000, "float"),
    KnobSpec("risk.max_risk_per_trade_pct", "max risk per trade (%)", 0.01, 10, "float"),
    KnobSpec("risk.max_position_value_pct", "max position value (% of account)", 1, 1000, "float"),
    KnobSpec("risk.max_consecutive_losses", "max consecutive losses", 1, 10, "int"),
    KnobSpec("strategy.opening_range.minutes", "opening range (minutes)", 5, 60, "int"),
    KnobSpec("strategy.vwap_pullback.target.risk_reward", "risk:reward target", 0.5, 10, "float"),
    KnobSpec("strategy.vwap_pullback.stop.buffer_pct", "stop buffer (%)", 0.0, 1.0, "float"),
    KnobSpec(
        "strategy.vwap_pullback.max_distance_from_vwap_pct",
        "max distance from VWAP (%)", 0.01, 2.0, "float",
    ),
    # Feature 020: the entry window — searchable like any knob so the
    # 09:4x-loss hypothesis is judged by the validation machinery.
    KnobSpec(
        "strategy.vwap_pullback.entry_window.start_minutes_after_open",
        "entry window start (min after open)", 0, 390, "int",
    ),
    KnobSpec(
        "strategy.vwap_pullback.entry_window.end_minutes_after_open",
        "entry window end (min after open)", 0, 390, "int",
    ),
]

KNOB_REGISTRY: dict[str, KnobSpec] = {s.path: s for s in _SPECS}


def sanitize_changes(raw: object) -> list[ConfigChange]:
    """Keep only changes that name a registered knob with an in-bounds value.
    int-kind knobs coerce via round() THEN bounds-check (analyze A1).
    Total: any malformed shape contributes nothing; never raises."""
    out: list[ConfigChange] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if not isinstance(item, dict):
            continue
        path = item.get("knob_path")
        value = item.get("value")
        if not isinstance(path, str) or path not in KNOB_REGISTRY:
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            continue
        if math.isnan(value) or math.isinf(value):
            continue
        spec = KNOB_REGISTRY[path]
        v = float(round(value)) if spec.kind == "int" else float(value)
        if not (spec.min <= v <= spec.max):
            continue
        out.append(ConfigChange(knob_path=path, value=v))
    return out


def registry_prompt_section() -> str:
    """The system prompt's tunable-knob section, rendered FROM the registry so
    prompt and enforcement cannot drift (research R5)."""
    lines = [
        "Tunable knobs (the ONLY knobs you may reference in",
        "suggested_config_changes; values must stay within the stated bounds —",
        "anything else is discarded):",
    ]
    for s in _SPECS:
        lines.append(f"- {s.path} — {s.label}; bounds [{s.min}, {s.max}] ({s.kind})")
    lines.append(
        "Express an experiment as suggested_config_changes ONLY when it is a "
        "change to these knobs; otherwise leave the list empty and describe "
        "it in how_to_test."
    )
    return "\n".join(lines)
