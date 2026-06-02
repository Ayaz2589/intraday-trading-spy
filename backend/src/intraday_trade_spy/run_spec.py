"""Backtest *spec* hashing for deduplication.

A run's "spec" is everything that determines its result EXCEPT the bar data:
the strategy, the config params (knobs), the symbol, and the date range. Two
runs with the same spec and the same `data_fingerprint` (a hash of the bars)
are true duplicates. The spec hash is computed at request time (the params are
known before the run executes); the data fingerprint is added at finalize.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any


def compute_spec_hash(
    *,
    strategy_id: Any,
    params: dict,
    symbol: str,
    range_start: Any,
    range_end: Any,
) -> str:
    """Stable sha256 hex digest of the run spec. Insensitive to dict key order."""
    payload = {
        "strategy_id": str(strategy_id),
        "symbol": symbol,
        "range_start": str(range_start),
        "range_end": str(range_end),
        "params": params or {},
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
