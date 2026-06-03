"""T059 — one-shot lockbox state machine + freeze fingerprint (FR-017..019).

The state machine is the structural anti-self-deception guard: spend once;
re-running the identical frozen config is idempotent; a different config is
blocked by default; the only way through is a deliberate, recorded
override→burn. Pure logic — fully unit-testable.
"""

from datetime import date

from intraday_trade_spy.validation.lockbox import (
    decide_lockbox_action,
    derive_state,
    freeze_fingerprint,
)


def test_freeze_fingerprint_deterministic_and_range_sensitive():
    base = dict(strategy_id="vwap_pullback_long", params={"risk": {"max_risk_per_trade_pct": 0.1}}, symbol="SPY")
    fp1 = freeze_fingerprint(**base, lockbox_start=date(2025, 1, 1), lockbox_end=date(2026, 12, 31))
    fp2 = freeze_fingerprint(**base, lockbox_start=date(2025, 1, 1), lockbox_end=date(2026, 12, 31))
    assert fp1 == fp2
    # Different config → different fingerprint.
    fp3 = freeze_fingerprint(strategy_id="vwap_pullback_long", params={"risk": {"max_risk_per_trade_pct": 0.2}},
                             symbol="SPY", lockbox_start=date(2025, 1, 1), lockbox_end=date(2026, 12, 31))
    assert fp3 != fp1


def test_decide_allow_first_when_unspent():
    d = decide_lockbox_action([], "fpA", override=False)
    assert d.action == "allow" and d.state == "spent"


def test_decide_idempotent_same_fingerprint():
    rows = [{"config_fingerprint": "fpA", "state": "spent", "created_at": "2026-06-03T10:00:00Z", "result": {"x": 1}}]
    d = decide_lockbox_action(rows, "fpA", override=False)
    assert d.action == "idempotent"
    assert d.existing_row["result"] == {"x": 1}


def test_decide_block_different_fingerprint_no_override():
    rows = [{"config_fingerprint": "fpA", "state": "spent", "created_at": "2026-06-03T10:00:00Z"}]
    d = decide_lockbox_action(rows, "fpB", override=False)
    assert d.action == "block" and d.state is None


def test_decide_burn_different_fingerprint_with_override():
    rows = [{"config_fingerprint": "fpA", "state": "spent", "created_at": "2026-06-03T10:00:00Z"}]
    d = decide_lockbox_action(rows, "fpB", override=True)
    assert d.action == "burn" and d.state == "burned"


# --- run_lockbox orchestration (state machine + persist + journal) ---

from pathlib import Path  # noqa: E402
from types import SimpleNamespace  # noqa: E402

import pytest  # noqa: E402

from intraday_trade_spy.config import load_config  # noqa: E402

_CFG = load_config(Path(__file__).resolve().parents[2] / "config" / "config.yaml")


class _FakeStorage:
    """Tracks ledger appends and returns them on get; per-name config params."""

    def __init__(self, params_by_name):
        self.params_by_name = params_by_name
        self.rows = []
        self.journal = []

    def get_config_by_name(self, name):
        p = self.params_by_name.get(name)
        return {"params": p} if p is not None else None

    def get_lockbox_ledger(self, *, user_id, lockbox_start, lockbox_end):
        return list(self.rows)

    def append_lockbox_row(self, *, ledger_id, lockbox_start, lockbox_end,
                           config_fingerprint, result, state, override=False, run_id=None):
        self.rows.append({
            "config_fingerprint": config_fingerprint, "state": state,
            "override": override, "result": result,
            "created_at": f"t{len(self.rows)}", "run_id": run_id,
        })
        return str(ledger_id)

    def insert_journal_event(self, **kw):
        self.journal.append(kw)
        return "jid"


class _FakeEngine:
    def run_df(self, _df):
        summary = SimpleNamespace(model_dump=lambda mode="json": {"total_net_pnl_dollars": 42.0})
        return SimpleNamespace(summary=summary, run=SimpleNamespace(run_id="lockrun"))


def _run(storage, name, override=False):
    from intraday_trade_spy.api.validation_lifecycle import run_lockbox

    return run_lockbox(
        user_id="u1", config_name=name, override=override, storage=storage,
        base_cfg=_CFG, _df=object(), _engine=_FakeEngine(),
    )


def test_run_lockbox_first_spend_records_and_journals():
    storage = _FakeStorage({"A": {"risk": {"max_risk_per_trade_pct": 0.1}}})
    out = _run(storage, "A")
    assert out["state"] == "spent" and out["contaminated"] is False
    assert out["summary"]["total_net_pnl_dollars"] == 42.0
    assert len(storage.rows) == 1
    assert storage.journal and storage.journal[0]["details"]["event"] == "lockbox_spent"


def test_run_lockbox_same_config_is_idempotent():
    storage = _FakeStorage({"A": {"risk": {"max_risk_per_trade_pct": 0.1}}})
    _run(storage, "A")
    out = _run(storage, "A")  # same config again
    assert out["state"] == "spent"
    assert len(storage.rows) == 1  # no second row written


def test_run_lockbox_different_config_blocked():
    storage = _FakeStorage({
        "A": {"risk": {"max_risk_per_trade_pct": 0.1}},
        "B": {"risk": {"max_risk_per_trade_pct": 0.2}},
    })
    _run(storage, "A")
    from intraday_trade_spy.api.validation_lifecycle import LockboxAlreadySpent

    with pytest.raises(LockboxAlreadySpent):
        _run(storage, "B")
    assert len(storage.rows) == 1  # blocked run wrote nothing


def test_run_lockbox_override_burns():
    storage = _FakeStorage({
        "A": {"risk": {"max_risk_per_trade_pct": 0.1}},
        "B": {"risk": {"max_risk_per_trade_pct": 0.2}},
    })
    _run(storage, "A")
    out = _run(storage, "B", override=True)
    assert out["state"] == "burned" and out["contaminated"] is True
    assert len(storage.rows) == 2
    assert storage.journal[-1]["details"]["event"] == "lockbox_burned"
    assert storage.journal[-1]["severity"] == "warning"


def test_derive_state():
    assert derive_state([]) == "unspent"
    assert derive_state([{"config_fingerprint": "fpA", "state": "spent", "created_at": "t"}]) == "spent"
    assert derive_state([
        {"config_fingerprint": "fpA", "state": "spent", "created_at": "t1"},
        {"config_fingerprint": "fpB", "state": "burned", "created_at": "t2"},
    ]) == "burned"  # burned is terminal/contaminated
