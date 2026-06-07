"""Feature 019 T017 — the campaign cycle engine (spec FR-007..FR-013).

Every collaborator is stubbed; the engine's verdict logic, budget, bar
tightening, gather-once termination (analyze G1), provenance, journaling,
and the governance invariants (zero lockbox writes SC-003, no analyst calls
C2, no broker paths C1) are asserted here.
"""

from __future__ import annotations

import inspect

from intraday_trade_spy.research import campaign as campaign_mod
from intraday_trade_spy.research.campaign import (
    Collaborators,
    DataUnavailable,
    run_campaign,
)

USER = "11111111-1111-1111-1111-111111111111"


class FakeStorage:
    """Records every storage interaction; anything not modeled raises so the
    engine cannot quietly grow new dependencies (and can NEVER reach lockbox
    methods — SC-003 asserts on the recorded names)."""

    def __init__(self, *, family_counts=None):
        self.called = []
        self.campaign = None
        self.cycles = []
        self.trials = []
        self.journal = []
        self.configs = {"default": {"id": "cfg-0", "name": "default"}}
        self.family_counts = family_counts or {}
        self.halt = None

    def _rec(self, name):
        self.called.append(name)

    def get_research_campaign(self, *, campaign_id):
        self._rec("get_research_campaign")
        return dict(self.campaign)

    def append_campaign_cycle(self, *, campaign_id, cycle_entry):
        self._rec("append_campaign_cycle")
        self.cycles.append(cycle_entry)

    def halt_research_campaign(self, *, campaign_id, status, verdict, verdict_detail):
        self._rec("halt_research_campaign")
        assert self.halt is None, "verdict must be written exactly once"
        self.halt = {"status": status, "verdict": verdict, "detail": verdict_detail}

    def count_family_trials(self, *, strategy_id, family):
        self._rec("count_family_trials")
        return self.family_counts.get(family, 0)

    def insert_recommendation_trial(self, **kw):
        self._rec("insert_recommendation_trial")
        self.trials.append(kw)

    def insert_journal_event(self, **kw):
        self._rec("insert_journal_event")
        self.journal.append(kw)

    def get_config_by_name(self, name):
        self._rec("get_config_by_name")
        return self.configs.get(name)


def _campaign_row(*, budget=4, cancel=False):
    return {
        "id": "c-1",
        "seq": 1,
        "strategy_id": "s-1",
        "starting_config_id": "cfg-0",
        "starting_config_name": "default",
        "budget": budget,
        "status": "running",
        "cancel_requested": cancel,
        "thresholds": {"base_alpha": 0.05},
        "cycles": [],
    }


def _knob_delta(value=2.5, knob="strategy.vwap_pullback.target.risk_reward",
                already_tried=None):
    return {
        "klass": "knob_delta",
        "score": 1.0,
        "changes": [{"knob_path": knob, "value": value}],
        "already_tried": already_tried,
        "narrative_hint": "neighborhood looks better",
    }


class Collab:
    """Configurable stub collaborators recording every call."""

    def __init__(self, *, gate_results=None, candidates=None, data_error=None):
        self.calls = []
        self.gate_results = list(gate_results or [])
        self.candidates = list(candidates or [])
        self.data_error = data_error
        self.created = []

    def as_collaborators(self):
        return Collaborators(
            ensure_data=self._ensure_data,
            run_walk_forward=self._run_wf,
            pooled_gate=self._gate,
            next_candidates=self._next,
            run_gather_study=self._gather,
            create_config=self._create,
        )

    def _ensure_data(self):
        self.calls.append(("data",))
        if self.data_error:
            raise self.data_error
        return {"backfill_job_id": None}

    def _run_wf(self, config_name):
        self.calls.append(("study", config_name))
        return f"study-{config_name}"

    def _gate(self, *, study_id, level, bar):
        self.calls.append(("gate", study_id, round(level, 6), bar["k"]))
        if self.gate_results:
            return self.gate_results.pop(0)
        return {"passed": False, "ci_low": -0.5, "ci_high": 1.5}

    def _next(self, config_name):
        self.calls.append(("candidates", config_name))
        if self.candidates:
            return self.candidates.pop(0)
        return []

    def _gather(self, prescription):
        self.calls.append(("gather", prescription))
        return "study-gather"

    def _create(self, name, changes):
        self.calls.append(("create", name))
        row = {"id": f"cfg-{name}", "name": name}
        self.created.append(row)
        return row


def _run(storage, collab, *, budget=4):
    storage.campaign = _campaign_row(budget=budget)
    return run_campaign(
        storage=storage,
        campaign=storage.campaign,
        base_alpha=0.05,
        collab=collab.as_collaborators(),
    )


# ---- verdicts -----------------------------------------------------------------


def test_gate_pass_halts_ready_for_lockbox_naming_the_candidate():
    storage = FakeStorage()
    collab = Collab(gate_results=[{"passed": True, "ci_low": 0.2, "ci_high": 2.0}])
    _run(storage, collab)
    assert storage.halt["verdict"] == "ready_for_lockbox"
    assert storage.halt["status"] == "halted"
    assert storage.halt["detail"]["candidate"] == "default"
    assert storage.trials == []  # the starting config is not a trial


def test_starting_config_gates_at_k1_even_with_prior_unrelated_trials():
    storage = FakeStorage(family_counts={"some.other.family": 9})
    collab = Collab(gate_results=[{"passed": True, "ci_low": 0.2, "ci_high": 2.0}])
    _run(storage, collab)
    gate_calls = [c for c in collab.calls if c[0] == "gate"]
    assert gate_calls[0][3] == 1            # k = 1
    assert gate_calls[0][2] == 0.95         # level = 1 - 0.05/1


def test_stop_tuning_candidate_halts_with_the_engines_rationale():
    storage = FakeStorage()
    collab = Collab(candidates=[[{"klass": "stop_tuning", "changes": [],
                                  "narrative_hint": "no family shows deployable edge"}]])
    _run(storage, collab)
    assert storage.halt["verdict"] == "stop_tuning"
    assert "deployable edge" in storage.halt["detail"]["reason"]


def test_budget_exhausted_after_n_candidates():
    storage = FakeStorage()
    collab = Collab(candidates=[[_knob_delta(2.5)], [_knob_delta(3.0)], [_knob_delta(1.5)]])
    _run(storage, collab, budget=2)
    assert storage.halt["verdict"] == "budget_exhausted"
    assert len(storage.trials) == 2          # SC-002: at most N trials
    assert len(collab.created) == 2


def test_budget_zero_evaluates_the_starting_config_only():
    storage = FakeStorage()
    collab = Collab(candidates=[[_knob_delta(2.5)]])
    _run(storage, collab, budget=0)
    assert storage.halt["verdict"] == "budget_exhausted"
    assert storage.trials == [] and collab.created == []
    assert len([c for c in collab.calls if c[0] == "study"]) == 1


def test_cancel_requested_halts_cancelled_at_the_stage_boundary():
    storage = FakeStorage()
    collab = Collab()
    storage.campaign = _campaign_row()

    original = storage.get_research_campaign

    def cancel_after_first_read(*, campaign_id):
        row = original(campaign_id=campaign_id)
        storage.campaign["cancel_requested"] = True  # operator cancels mid-flight
        return row

    storage.get_research_campaign = cancel_after_first_read
    run_campaign(storage=storage, campaign=storage.campaign, base_alpha=0.05,
                 collab=collab.as_collaborators())
    assert storage.halt["verdict"] == "cancelled"


def test_data_unavailable_halts_failed_with_the_reason():
    storage = FakeStorage()
    collab = Collab(data_error=DataUnavailable("backfill failed: provider outage"))
    _run(storage, collab)
    assert storage.halt["verdict"] == "failed"
    assert "provider outage" in storage.halt["detail"]["reason"]


def test_stage_exception_fails_soft_with_reason():
    storage = FakeStorage()
    collab = Collab()
    collab._run_wf = lambda name: (_ for _ in ()).throw(RuntimeError("study blew up"))
    storage.campaign = _campaign_row()
    run_campaign(storage=storage, campaign=storage.campaign, base_alpha=0.05,
                 collab=collab.as_collaborators())
    assert storage.halt["verdict"] == "failed"
    assert "study blew up" in storage.halt["detail"]["reason"]


# ---- candidate selection -------------------------------------------------------


def test_knob_delta_creates_config_ledger_row_and_next_cycle_uses_tightened_bar():
    storage = FakeStorage(
        family_counts={"strategy.vwap_pullback.target.risk_reward": 2}
    )
    collab = Collab(
        gate_results=[
            {"passed": False, "ci_low": -0.5, "ci_high": 1.5},  # cycle 1: default
            {"passed": True, "ci_low": 0.1, "ci_high": 2.0},    # cycle 2: candidate
        ],
        candidates=[[_knob_delta(2.5)]],
    )
    _run(storage, collab)
    # trial row carries provenance (FR-010)
    assert len(storage.trials) == 1
    trial = storage.trials[0]
    assert trial["campaign_id"] == "c-1"
    assert trial["cycle"] == 1
    assert trial["family"] == "strategy.vwap_pullback.target.risk_reward"
    assert trial["source"] == "deterministic"
    # next cycle studies the new candidate at the tightened bar (k = 1 + 2)
    gate_calls = [c for c in collab.calls if c[0] == "gate"]
    assert gate_calls[1][3] == 3
    assert gate_calls[1][2] == round(1 - 0.05 / 3, 6)
    assert storage.halt["verdict"] == "ready_for_lockbox"
    assert storage.halt["detail"]["candidate"] == "auto01-c1-risk_reward2.5"


def test_duplicate_candidates_are_skipped_for_the_next_ranked_one():
    storage = FakeStorage()
    storage.configs["auto01-c1-risk_reward2.5"] = {"id": "x", "name": "auto01-c1-risk_reward2.5"}
    collab = Collab(candidates=[[
        _knob_delta(2.5),                                   # name collision → skip
        _knob_delta(0.2, knob="risk.max_risk_per_trade_pct", already_tried="aggressive"),
        _knob_delta(3.0),                                   # the one it should take
    ]])
    _run(storage, collab)
    assert [r["name"] for r in collab.created] == ["auto01-c1-risk_reward3"]


def test_all_duplicates_halts_stop_tuning_no_novel_candidates():
    storage = FakeStorage()
    collab = Collab(candidates=[[_knob_delta(2.5, already_tried="wf-rr3")]])
    _run(storage, collab)
    assert storage.halt["verdict"] == "stop_tuning"
    assert storage.halt["detail"]["reason"] == "no_novel_candidates"


def test_no_candidates_at_all_halts_stop_tuning():
    storage = FakeStorage()
    collab = Collab(candidates=[[]])
    _run(storage, collab)
    assert storage.halt["verdict"] == "stop_tuning"


# ---- gather-evidence (analyze G1) ------------------------------------------------


def test_gather_with_prescription_runs_once_then_repeat_halts():
    gather = {"klass": "gather_evidence", "changes": [],
              "study": {"kind": "sensitivity",
                        "knob": "strategy.vwap_pullback.target.risk_reward"},
              "narrative_hint": "no sweep exists"}
    storage = FakeStorage()
    collab = Collab(candidates=[[dict(gather)], [dict(gather)]])
    _run(storage, collab)
    gathers = [c for c in collab.calls if c[0] == "gather"]
    assert len(gathers) == 1                              # once per family
    assert storage.halt["verdict"] == "stop_tuning"       # the repeat halts (G1)
    assert storage.halt["detail"]["reason"] == "no_novel_candidates"


def test_gather_without_machine_prescription_halts_with_the_hint():
    storage = FakeStorage()
    collab = Collab(candidates=[[{
        "klass": "gather_evidence", "changes": [],
        "narrative_hint": "run a sensitivity study before trusting any knob delta",
    }]])
    _run(storage, collab)
    assert storage.halt["verdict"] == "stop_tuning"
    assert "sensitivity study" in storage.halt["detail"]["hint"]
    assert [c for c in collab.calls if c[0] == "gather"] == []


# ---- governance invariants -------------------------------------------------------


def test_zero_lockbox_writes_across_every_scenario():
    scenarios = [
        Collab(gate_results=[{"passed": True, "ci_low": 0.2, "ci_high": 2.0}]),
        Collab(candidates=[[_knob_delta(2.5)], [_knob_delta(3.0)]]),
        Collab(data_error=DataUnavailable("no data")),
        Collab(candidates=[[]]),
    ]
    for collab in scenarios:
        storage = FakeStorage()
        _run(storage, collab, budget=1)
        assert not any("lockbox" in name.lower() for name in storage.called)
        assert not any("ledger" in name.lower() for name in storage.called)


def test_every_stage_transition_is_journaled():
    storage = FakeStorage()
    collab = Collab(gate_results=[{"passed": True, "ci_low": 0.2, "ci_high": 2.0}])
    _run(storage, collab)
    kinds = [e.get("kind") for e in storage.journal]
    assert kinds and all(k == "campaign" for k in kinds)
    messages = " ".join(e.get("message", "") for e in storage.journal)
    for word in ("data", "study", "gate", "ready_for_lockbox"):
        assert word in messages


def test_cycles_record_the_bar_applied_and_stage_outcomes():
    storage = FakeStorage()
    collab = Collab(gate_results=[{"passed": True, "ci_low": 0.2, "ci_high": 2.0}])
    _run(storage, collab)
    assert len(storage.cycles) == 1
    entry = storage.cycles[0]
    assert entry["cycle"] == 1
    stages = {s["stage"]: s for s in entry["stages"]}
    assert stages["gate"]["detail"]["k"] == 1
    assert stages["gate"]["detail"]["level"] == 0.95
    assert stages["gate"]["detail"]["ci_low"] == 0.2


def test_engine_source_has_no_analyst_or_broker_paths():
    source = inspect.getsource(campaign_mod).lower()
    for forbidden in ("claude", "analyst", "anthropic", "broker", "live_auto"):
        assert forbidden not in source, f"engine must not reference {forbidden!r}"
