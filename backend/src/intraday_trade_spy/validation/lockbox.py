"""One-shot lockbox gate (Feature 011, FR-017..019).

Pure state machine that makes self-deception structurally hard:
  * first run on the held-out lockbox → spend it (recorded immutably);
  * re-running the IDENTICAL frozen config → idempotent (return the record);
  * a DIFFERENT config → blocked by default;
  * the only way through → a deliberate, recorded override→burn (the lockbox is
    then permanently contaminated).

State for a (user, lockbox range) is derived from the append-only ledger rows;
this module never mutates a recorded result.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

from intraday_trade_spy.run_spec import compute_spec_hash


def freeze_fingerprint(
    *, strategy_id, params: dict, symbol: str, lockbox_start: date, lockbox_end: date
) -> str:
    """Deterministic identity of 'this exact config against this exact lockbox'.
    Reuses the run dedup hash so it is stable across key order / number form."""
    return compute_spec_hash(
        strategy_id=strategy_id,
        params=params,
        symbol=symbol,
        range_start=lockbox_start,
        range_end=lockbox_end,
    )


@dataclass(frozen=True)
class LockboxDecision:
    action: Literal["allow", "idempotent", "block", "burn"]
    state: str | None              # 'spent' (allow) | 'burned' (burn); else None
    existing_row: dict | None      # the row to return for an idempotent re-run


def decide_lockbox_action(
    rows: list[dict], fingerprint: str, *, override: bool
) -> LockboxDecision:
    """Decide what a lockbox run should do given the existing ledger rows."""
    if not rows:
        return LockboxDecision(action="allow", state="spent", existing_row=None)

    matching = [r for r in rows if r.get("config_fingerprint") == fingerprint]
    if matching:
        latest = sorted(matching, key=lambda r: r.get("created_at") or "")[-1]
        return LockboxDecision(action="idempotent", state=None, existing_row=latest)

    if override:
        return LockboxDecision(action="burn", state="burned", existing_row=None)
    return LockboxDecision(action="block", state=None, existing_row=None)


def derive_state(rows: list[dict]) -> str:
    """Current lockbox status for a (user, range): unspent → spent → burned
    (burned is terminal / contaminated)."""
    if not rows:
        return "unspent"
    if any(r.get("state") == "burned" for r in rows):
        return "burned"
    return "spent"
