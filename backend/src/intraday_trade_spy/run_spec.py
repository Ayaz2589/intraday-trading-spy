"""Backtest *spec* hashing for deduplication.

A run's "spec" is everything that determines its result EXCEPT the bar data:
the strategy, the config knobs (risk + strategy), the symbol, and the date
range. Two runs with the same spec and the same `data_fingerprint` (a hash of
the bars) are true duplicates. The spec hash is computed at request time (the
params are known before the run executes); the data fingerprint is added at
finalize.

The knobs are normalized through the project's `RiskConfig` / `StrategyConfig`
models BEFORE hashing. The raw config row is mutable and re-saved on every run,
so two "same knobs" runs can carry param dicts that differ only in:
  * optional-field presence (a knob omitted vs. spelled out at its default),
  * number representation (``25000`` int vs. ``25000.0`` float),
  * per-run noise (``data.csv_path`` / ``output_dir``), or key order.
Normalizing fills defaults, coerces types, and drops everything outside the
user-editable knobs, so semantically-identical configs collapse to one hash —
which is what makes dedup actually fire. (See run_spec tests.)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from pydantic import BaseModel

from intraday_trade_spy.config import RiskConfig, StrategyConfig


def _canonical_subconfig(model: type[BaseModel], value: Any) -> Any:
    """Validate a knob sub-dict through its model (filling defaults / coercing
    types) and return a canonical, JSON-safe dict. Falls back to the raw value
    on an unexpected shape so a malformed config never breaks run creation."""
    if not isinstance(value, dict):
        value = {}
    try:
        return model.model_validate(value).model_dump(mode="json")
    except Exception:
        return value


def compute_spec_hash(
    *,
    strategy_id: Any,
    params: dict,
    symbol: str,
    range_start: Any,
    range_end: Any,
) -> str:
    """Stable sha256 hex digest of the run spec. Insensitive to dict key order,
    optional-field presence, number representation, and per-run path noise."""
    p = params or {}
    payload = {
        "strategy_id": str(strategy_id),
        "symbol": symbol,
        "range_start": str(range_start),
        "range_end": str(range_end),
        "risk": _canonical_subconfig(RiskConfig, p.get("risk")),
        "strategy": _canonical_subconfig(StrategyConfig, p.get("strategy")),
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
